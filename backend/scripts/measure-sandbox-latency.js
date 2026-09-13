/**
 * End-to-end latency harness for the Voice Sandbox.
 *
 * Drives real turns through the real pipeline: registers a sandbox call over
 * HTTP, opens the media WebSocket, and plays synthesized speech in as if it were
 * the microphone. Measures, from the client's side, the time between the last
 * frame of the user's utterance going out and the first frame of the agent's
 * reply coming back -- the number a user actually experiences.
 *
 * Usage:
 *   node scripts/measure-sandbox-latency.js [--port 5001] [--turns 6]
 *                                           [--protocol binary|json] [--label new]
 *
 *   --protocol binary  raw PCM16 frames at the context rate  (current client)
 *   --protocol json    base64 mu-law 8kHz inside a JSON envelope (old client)
 */
import fetch from 'node-fetch';
import WebSocket from 'ws';
import fsp from 'fs/promises';
import os from 'os';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const PORT = Number(argOf('port', 5001));
const TURNS = Number(argOf('turns', 6));
const PROTOCOL = argOf('protocol', 'binary');
const LANGUAGE = argOf('language', 'en-US');
const LABEL = argOf('label', PROTOCOL);
const BASE = `http://localhost:${PORT}/api/v1`;
const CAPTURE_RATE = PROTOCOL === 'json' ? 8000 : 24000;

/**
 * What a borrower says on a collections call, per language.
 *
 * The caller is voiced differently from the agent so nothing is ambiguous, and
 * the lines follow the shape of a real reminder call: confirm identity,
 * acknowledge the debt, name a date, close.
 */
const SCRIPTS = {
  hi: {
    // "Kabir", a male voice distinct from the agent's Ishani.
    callerVoice: 'cb9c954d-bcaa-43ed-82bf-aeb5e88a3cb5',
    moduleId: 'demo-agent-emi-reminder',
    lines: [
      'हाँ जी, रमेश बोल रहा हूँ।',
      'हाँ, मुझे पता है कि ईएमआई बाकी है।',
      'अठारह तारीख को सैलरी आएगी, तब कर दूंगा।',
      'पूरा अमाउंट एक साथ कर दूंगा।',
      'नहीं, और कोई दिक्कत नहीं है।',
      'ठीक है, धन्यवाद।',
      'हाँ, यही नंबर सही है।',
      'अच्छा ठीक है, नमस्ते।',
    ],
  },
  mr: {
    // "Suresh", distinct from the agent's Anika.
    callerVoice: 'f227bc18-3704-47fe-b759-8c78a450fdfa',
    moduleId: 'demo-agent-emi-reminder',
    lines: [
      'हो, मीच बोलतोय.',
      'हो, मला माहीत आहे की हप्ता बाकी आहे.',
      'अठरा तारखेला पगार होईल, तेव्हा भरतो.',
      'पूर्ण रक्कम एकदम भरतो.',
      'नाही, दुसरी काही अडचण नाही.',
      'ठीक आहे, धन्यवाद.',
    ],
  },
  ta: {
    // "Karthik", distinct from the agent's Janani.
    callerVoice: '19f28c21-ae34-499f-b64a-f7b09cd9b516',
    moduleId: 'demo-agent-emi-reminder',
    lines: [
      'ஆமா, நான் தான் பேசுறேன்.',
      'ஆமா, தவணை பாக்கி இருக்கு தெரியும்.',
      'பதினெட்டாம் தேதி சம்பளம் வரும், அப்போ கட்டிடுறேன்.',
      'முழு தொகையும் ஒரே தடவையா கட்டிடுறேன்.',
      'இல்ல, வேற பிரச்சனை எதுவும் இல்ல.',
      'சரி, நன்றி.',
    ],
  },
};

// Utterances a sales/support agent will actually answer, so the LLM produces a
// normal-length reply rather than a clarifying question.
const UTTERANCES = [
  'Hello, I run a small logistics startup in Bangalore.',
  'We handle about two hundred customer calls every day.',
  'Mostly we want to automate our outbound sales calls.',
  'What kind of response time can you actually deliver?',
  'That sounds reasonable for our team size.',
  'Okay, how do we get started with a trial?',
  'We use a standard CRM and would need integration.',
  'What does the pricing look like at our volume?',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const percentile = (sorted, p) => {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
};

const summarize = (label, values) => {
  if (values.length === 0) return `${label}: no samples`;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const f = (n) => (n === null ? '-' : `${Math.round(n)}ms`);
  return (
    `${label.padEnd(22)} n=${String(sorted.length).padStart(2)}  ` +
    `p50=${f(percentile(sorted, 50)).padStart(7)}  ` +
    `p95=${f(percentile(sorted, 95)).padStart(7)}  ` +
    `p100=${f(sorted[sorted.length - 1]).padStart(7)}  ` +
    `mean=${f(mean).padStart(7)}`
  );
};

const linearToMulaw = (sample) => {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
};

/**
 * Where synthesized test speech is kept between runs.
 *
 * The utterances are fixed, so re-synthesizing them on every run buys nothing
 * and costs Cartesia credits -- enough of them, across a day of runs, to exhaust
 * the plan and block the very measurements this script exists to take.
 */
const CLIP_CACHE_DIR = path.join(os.tmpdir(), 'voicely-harness-clips');

const clipPathFor = (text) =>
  path.join(
    CLIP_CACHE_DIR,
    `${CAPTURE_RATE}-${LANGUAGE}-${crypto.createHash('sha1').update(text).digest('hex')}.pcm`
  );

/** Synthesize an utterance to raw PCM16 at CAPTURE_RATE, to play in as the mic. */
const speak = async (text) => {
  const cached = await fsp.readFile(clipPathFor(text)).catch(() => null);
  if (cached && cached.length > 0) return cached;

  const key = process.env.CARTESIA_API_KEY;
  if (!key) throw new Error('CARTESIA_API_KEY required to synthesize test speech');

  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': key,
      'Cartesia-Version': '2024-06-10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-3.5',
      transcript: text,
      // A different voice from the agent's, so nothing is ambiguous.
      voice: { mode: 'id', id: SCRIPTS[LANGUAGE]?.callerVoice || '47c38ca4-5f35-497b-b1a3-415245fb35e1' },
      language: LANGUAGE.split('-')[0],
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: CAPTURE_RATE },
    }),
  });
  if (!res.ok) throw new Error(`Cartesia ${res.status}: ${await res.text()}`);
  const pcm = Buffer.from(await res.arrayBuffer());

  await fsp.mkdir(CLIP_CACHE_DIR, { recursive: true }).catch(() => {});
  await fsp.writeFile(clipPathFor(text), pcm).catch(() => {});
  return pcm;
};

const main = async () => {
  console.log(`\n=== Sandbox latency: ${LABEL} (${LANGUAGE}, ${PROTOCOL}, ${CAPTURE_RATE}Hz, port ${PORT}) ===\n`);

  process.stdout.write('loading test speech... ');
  const clips = [];
  let synthesized = 0;
  const script = (SCRIPTS[LANGUAGE]?.lines || UTTERANCES).slice(0, TURNS);
  for (const text of script) {
    const wasCached = await fsp.access(clipPathFor(text)).then(() => true, () => false);
    clips.push({ text, pcm: await speak(text) });
    if (!wasCached) synthesized += 1;
  }
  console.log(`${clips.length} utterances ready (${synthesized} newly synthesized, rest cached)`);

  const t0 = Date.now();
  const res = await fetch(`${BASE}/calls/browser-sandbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      moduleId: SCRIPTS[LANGUAGE]?.moduleId || 'demo-agent-emi-reminder',
      customerName: { hi: 'रमेश', mr: 'सुरेश', ta: 'கார்த்தி' }[LANGUAGE] || 'Harness',
      selectedLanguage: LANGUAGE,
      ttsProvider: 'cartesia',
      optimizeFor: 'latency',
    }),
  });
  if (!res.ok) throw new Error(`browser-sandbox ${res.status}: ${await res.text()}`);
  const { call } = await res.json();
  const httpMs = Date.now() - t0;

  const wsUrl =
    `ws://localhost:${PORT}/api/streams/browser` +
    (PROTOCOL === 'binary' ? `?sampleRate=${CAPTURE_RATE}` : '');
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  const turnLatencies = [];
  // What the server says each turn cost, as the sandbox UI now displays it.
  // Measured from a different origin than turnLatencies -- the server clock
  // starts when Deepgram finalizes, this harness's when it stops sending audio --
  // so they are reported side by side rather than checked against each other.
  const serverLatencies = [];
  let awaitingReply = null; // { sentAt, resolve }
  let ready = false;
  let readyMs = null;
  // The pre-synthesized opener: how long after `ready` its first frame lands,
  // and how much audio arrived before the first turn.
  let greetingFirstFrameMs = null;
  let greetingBytes = 0;
  let readyAt = null;
  let turnsStarted = false;
  const wsOpenAt = Date.now();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.event === 'ready') {
      ready = true;
      readyAt = Date.now();
      readyMs = readyAt - wsOpenAt;
    } else if (msg.event === 'media' && awaitingReply) {
      const elapsed = Date.now() - awaitingReply.sentAt;
      turnLatencies.push(elapsed);
      const pending = awaitingReply;
      awaitingReply = null;
      pending.resolve(elapsed);
    } else if (msg.event === 'media' && ready && !turnsStarted) {
      // Audio with no turn outstanding, before the first turn, is the opener.
      // The `turnsStarted` guard matters: once turns are running, every frame of
      // a reply after its first lands here too, and counting those as greeting
      // audio reported 3MB for a four-second clip.
      if (greetingFirstFrameMs === null) greetingFirstFrameMs = Date.now() - readyAt;
      greetingBytes += Buffer.from(msg.media.payload, 'base64').length;
    } else if (msg.event === 'turn_latency') {
      serverLatencies.push(msg.ms);
    } else if (msg.event === 'error') {
      console.error(`  server error: ${msg.message}`);
    }
  });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  ws.send(
    JSON.stringify({
      event: 'start',
      start: { callSid: call.twilioCallSid, streamSid: `harness_${Date.now()}` },
    })
  );

  const readyDeadline = Date.now() + 15000;
  while (!ready && Date.now() < readyDeadline) await sleep(25);
  if (!ready) throw new Error('server never sent `ready`');

  console.log(`session up: http=${httpMs}ms  ws+start->ready=${readyMs}ms`);

  // Give the opener a moment to arrive before talking over it, the way a user
  // would. Short enough that it does not distort the turn measurements below.
  await sleep(600);
  console.log(
    greetingFirstFrameMs === null
      ? 'greeting: NONE RECEIVED\n'
      : `greeting: first frame ${greetingFirstFrameMs}ms after ready, ${greetingBytes}B buffered\n`
  );

  const FRAME_MS = 20;
  const samplesPerFrame = Math.round((CAPTURE_RATE * FRAME_MS) / 1000);

  turnsStarted = true;
  for (const [index, clip] of clips.entries()) {
    process.stdout.write(`turn ${index + 1}/${clips.length}  "${clip.text.slice(0, 40)}..." `);

    // Play the utterance in at real time, one 20ms frame at a time.
    for (let offset = 0; offset + samplesPerFrame * 2 <= clip.pcm.length; offset += samplesPerFrame * 2) {
      const frame = clip.pcm.subarray(offset, offset + samplesPerFrame * 2);
      if (PROTOCOL === 'binary') {
        ws.send(frame);
      } else {
        const mulaw = Buffer.allocUnsafe(samplesPerFrame);
        for (let i = 0; i < samplesPerFrame; i++) mulaw[i] = linearToMulaw(frame.readInt16LE(i * 2));
        ws.send(
          JSON.stringify({ event: 'media', media: { payload: mulaw.toString('base64') } })
        );
      }
      await sleep(FRAME_MS);
    }

    // The clock starts the instant the user stops talking.
    const replyPromise = new Promise((resolve) => {
      awaitingReply = { sentAt: Date.now(), resolve };
    });

    // Keep feeding silence so the endpointer sees a real pause, not a dead socket.
    const silence = Buffer.alloc(samplesPerFrame * 2);
    let settled = false;
    replyPromise.then(() => { settled = true; });
    const silenceDeadline = Date.now() + 12000;
    while (!settled && Date.now() < silenceDeadline) {
      if (PROTOCOL === 'binary') {
        ws.send(silence);
      } else {
        ws.send(
          JSON.stringify({
            event: 'media',
            media: { payload: Buffer.alloc(samplesPerFrame, 0xff).toString('base64') },
          })
        );
      }
      await sleep(FRAME_MS);
    }

    if (settled) {
      console.log(`-> ${turnLatencies[turnLatencies.length - 1]}ms`);
    } else {
      console.log('-> TIMEOUT (no reply in 12s)');
      awaitingReply = null;
    }

    // Let the reply finish playing so the next turn isn't treated as a barge-in.
    await sleep(2500);
  }

  ws.send(JSON.stringify({ event: 'stop' }));
  await sleep(500);
  ws.close();

  console.log('\n--- client-observed, user stopped speaking -> first reply audio ---');
  console.log(summarize(`${LABEL} mouth-to-ear`, turnLatencies));
  console.log(`\ncold start (ws start -> ready): ${readyMs}ms   http register: ${httpMs}ms`);
  console.log(
    greetingFirstFrameMs === null
      ? 'greeting: not delivered'
      : `greeting: ${greetingFirstFrameMs}ms after ready (${greetingBytes}B)`
  );
  if (serverLatencies.length > 0) summarize('server-reported turn (badge)', serverLatencies);

  const metrics = await fetch(`http://localhost:${PORT}/api/v1/metrics`).then((r) => r.json());
  if (metrics.latency && Object.keys(metrics.latency).length > 0) {
    console.log('\n--- server-side stage breakdown (/api/v1/metrics) ---');
    for (const [name, snap] of Object.entries(metrics.latency)) {
      console.log(
        `${name.padEnd(30)} n=${String(snap.count).padStart(3)}  ` +
        `p50=${String(Math.round(snap.p50)).padStart(6)}ms  ` +
        `p95=${String(Math.round(snap.p95)).padStart(6)}ms  ` +
        `p99=${String(Math.round(snap.p99)).padStart(6)}ms  ` +
        `p100=${String(Math.round(snap.p100)).padStart(6)}ms`
      );
    }
  } else {
    console.log('\n(no server-side latency metrics — this build predates them)');
  }

  console.log(
    `\nJSON: ${JSON.stringify({ label: LABEL, protocol: PROTOCOL, readyMs, httpMs, greetingFirstFrameMs, turnLatencies, serverLatencies })}`
  );
  process.exit(0);
};

main().catch((err) => {
  console.error('\nharness failed:', err.message);
  process.exit(1);
});
