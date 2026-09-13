/**
 * Functional end-to-end check for the sandbox features.
 *
 * Run with the backend up:  node scripts/verify-sandbox-features.mjs
 *
 *
 * Covers what measure-sandbox-latency does not: that the opener plays, that a
 * deliberate interrupt is caught, that a live prompt change reaches the next
 * reply, and that a polite speaker (one who waits for the agent to finish) still
 * gets speculative prefill -- which the latency harness cannot show, because it
 * talks over the agent on every single turn.
 */
import fetch from 'node-fetch';
import WebSocket from 'ws';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
const BASE = 'http://localhost:5001/api/v1';
const RATE = 24000;
const CLIPS = path.join(os.tmpdir(), 'voicely-harness-clips');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const speak = async (text) => {
  const file = path.join(CLIPS, `${RATE}-${crypto.createHash('sha1').update(text).digest('hex')}.pcm`);
  const cached = await fsp.readFile(file).catch(() => null);
  if (cached?.length) return cached;
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { 'X-API-Key': process.env.CARTESIA_API_KEY, 'Cartesia-Version': '2024-06-10', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: 'sonic-3.5', transcript: text,
      voice: { mode: 'id', id: '47c38ca4-5f35-497b-b1a3-415245fb35e1' },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: RATE } }),
  });
  if (!res.ok) throw new Error(`Cartesia ${res.status}`);
  const pcm = Buffer.from(await res.arrayBuffer());
  await fsp.mkdir(CLIPS, { recursive: true }).catch(() => {});
  await fsp.writeFile(file, pcm).catch(() => {});
  return pcm;
};

const pass = (label, ok, detail = '') =>
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);

const main = async () => {
  const res = await fetch(`${BASE}/calls/browser-sandbox`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId: 'demo-agent-calm', customerName: 'Steve', ttsProvider: 'cartesia' }),
  });
  const { call } = await res.json();

  const ws = new WebSocket(`ws://localhost:5001/api/streams/browser?sampleRate=${RATE}`);
  ws.binaryType = 'arraybuffer';
  const live = new WebSocket(`ws://localhost:5001/live-call?callId=${call._id}`);

  const state = {
    ready: false, readyAt: 0, greetingAt: null, greetingBytes: 0,
    latencies: [], clears: 0, promptAcks: [], transcript: [], agentAudio: 0, turnsStarted: false,
  };

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.event === 'ready') { state.ready = true; state.readyAt = Date.now(); }
    else if (m.event === 'media') {
      const bytes = Buffer.from(m.media.payload, 'base64').length;
      state.agentAudio += bytes;
      if (!state.turnsStarted) {
        if (state.greetingAt === null) state.greetingAt = Date.now() - state.readyAt;
        state.greetingBytes += bytes;
      }
    }
    else if (m.event === 'turn_latency') state.latencies.push(m);
    else if (m.event === 'clear') state.clears++;
    else if (m.event === 'prompt_updated') state.promptAcks.push(m);
  });
  live.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.type === 'transcript_update' && m.isFinal) state.transcript.push(`${m.source}: ${m.text}`);
    if (m.type === 'connection_established' && m.history?.length) {
      for (const h of m.history) state.transcript.push(`${h.speaker === 'AI' ? 'ai' : 'user'}: ${h.text}`);
    }
  });

  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ event: 'start', start: { callSid: call.twilioCallSid, streamSid: 'e2e' } }));
  while (!state.ready) await sleep(20);
  await sleep(900);

  console.log('\n--- 1. the agent speaks first ---');
  pass('opener plays', state.greetingBytes > 0, `${state.greetingAt}ms after ready, ${state.greetingBytes}B`);
  pass('opener is instant', state.greetingAt !== null && state.greetingAt < 150, `${state.greetingAt}ms`);
  pass('opener reaches the transcript', state.transcript.some(t => t.startsWith('ai:')),
    state.transcript[0]?.slice(0, 60) ?? 'NONE');

  const playIn = async (pcm) => {
    const per = Math.round(RATE * 0.02) * 2;
    for (let o = 0; o + per <= pcm.length; o += per) { ws.send(pcm.subarray(o, o + per)); await sleep(20); }
  };

  console.log('\n--- 2. interrupting the agent ---');
  state.turnsStarted = true;
  const clearsBefore = state.clears;
  await playIn(await speak('Sorry, can I stop you there for a moment.'));
  await sleep(1500);
  pass('interrupt caught', state.clears > clearsBefore, `${state.clears - clearsBefore} clear sent`);

  console.log('\n--- 3. a polite speaker: wait for the agent to finish ---');
  // The latency harness talks over every reply, which aborts speculation each
  // time. This is how an actual user behaves.
  const before = (await (await fetch(`${BASE}/metrics`)).json()).counters;
  for (const line of ['We handle about two hundred customer calls every day.',
                      'Mostly we want to automate our outbound sales calls.']) {
    await sleep(6000);   // let the previous reply play out fully
    await playIn(await speak(line));
    await sleep(4000);
  }
  void before;
  console.log('  (adoption is asserted at the end, once every turn has run)');

  console.log('\n--- 4. latency reported per turn ---');
  pass('badges sent', state.latencies.length > 0, `${state.latencies.length} turns: ${state.latencies.map(l => l.ms + 'ms').join(', ')}`);
  pass('stage breakdown present', state.latencies.some(l => l.stages),
    JSON.stringify(state.latencies.find(l => l.stages)?.stages ?? null));
  pass('turn ids are distinct', new Set(state.latencies.map(l => l.turnId)).size === state.latencies.length);

  console.log('\n--- 5. editing the prompt mid-session ---');
  ws.send(JSON.stringify({ event: 'update_prompt',
    instruction: 'You are a pirate. Every reply must begin with the word Arrr.' }));
  await sleep(500);
  pass('server acknowledged', state.promptAcks.length > 0, JSON.stringify(state.promptAcks[0] ?? null));

  const linesBefore = state.transcript.length;
  await playIn(await speak('What does the pricing look like at our volume?'));
  await sleep(4000);
  const newAi = state.transcript.slice(linesBefore).filter(t => t.startsWith('ai:'));
  pass('next reply obeys the new persona', newAi.some(t => /arr/i.test(t)),
    newAi[0]?.slice(0, 70) ?? 'NO REPLY');

  ws.send(JSON.stringify({ event: 'stop' }));
  await sleep(1500);
  const final = await (await fetch(`${BASE}/metrics`)).json();
  console.log('\n--- 6. speculative prefill, over the whole session ---');
  const hits = final.counters['llm.speculation.hit'] || 0;
  const misses = final.counters['llm.speculation.miss'] || 0;
  pass('adopted on at least some turns', hits > 0,
    `${hits} hit / ${misses} miss (${Math.round(100 * hits / Math.max(1, hits + misses))}% adoption)`);

  const triggered = final.counters['barge_in.triggered'] || 0;
  const spurious = final.counters['barge_in.spurious'] || 0;
  pass('barge-in false positives stay low', spurious <= triggered / 2,
    `${triggered} triggered, ${spurious} spurious`);

  console.log('\n--- 7. cleanup ---');
  pass('no session state leaked', final.liveState.callStates === 0, JSON.stringify(final.liveState));
  console.log('\ncounters:', JSON.stringify(final.counters));
  console.log('\ntranscript:');
  for (const t of state.transcript) console.log('   ', t.slice(0, 100));

  ws.close(); live.close();
  process.exit(0);
};
main().catch(e => { console.error('e2e failed:', e.message); process.exit(1); });
