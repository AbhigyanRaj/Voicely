import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import CartesiaService from './cartesiaService.js';
import logger from '../utils/logger.js';
import { t } from '../config/callStrings.js';

/**
 * Pre-synthesized session openers.
 *
 * The sandbox used to open in silence: the visitor clicked Start and had to work
 * out that it was their turn. The obvious fix -- ask the LLM for a greeting -- is
 * the wrong one here, because it puts an LLM round trip *and* a TTS round trip in
 * front of the first word the visitor ever hears, which is precisely the moment
 * the product is being judged on latency. `startGreeting()` in
 * streamingCallHandler still does it that way and is deliberately not used.
 *
 * Instead the opener is a fixed line per agent, synthesized once and held in
 * memory. Replaying it costs a buffer slice, so the agent speaks essentially the
 * instant the session is ready.
 */

// Audio is handed to the client in slices rather than one large frame. The
// client schedules each against its own AudioContext clock, so playback starts
// as soon as the first slice lands instead of waiting for the whole utterance.
const SLICE_MS = 250;

// Bounded so a long tail of custom agent names cannot grow this without limit.
// Each entry is a few hundred KB of PCM; 32 is a couple of tens of megabytes at
// the very worst, and demo agents never fall out because they are re-warmed.
const MAX_ENTRIES = 32;

/** @type {Map<string, {buffer: Buffer, encoding: string, sampleRate: number}>} */
const cache = new Map();
/** @type {Map<string, Promise<object|null>>} */
const inFlight = new Map();

const keyFor = (voiceId, language, isWebCall, text) =>
  `${voiceId}|${language}|${isWebCall ? 'web' : 'tel'}|${text}`;

/**
 * Where openers survive a restart.
 *
 * An in-memory cache alone re-synthesizes the whole set on every boot, and in
 * development nodemon reboots on every file save -- which is how a day's editing
 * quietly spent a Cartesia plan's credits on audio that had already been
 * generated dozens of times. The same applies in production across deploys and
 * instance restarts. The openers are fixed strings, so the audio is worth
 * keeping.
 */
const DISK_CACHE_DIR =
  process.env.GREETING_CACHE_DIR || path.join(os.tmpdir(), 'voicely-greetings');

const diskNameFor = (key) => `${crypto.createHash('sha1').update(key).digest('hex')}.bin`;

/** Metadata travels in the filename so a clip is never decoded as the wrong format. */
const diskPathFor = (key, encoding, sampleRate) =>
  path.join(DISK_CACHE_DIR, `${encoding}-${sampleRate}-${diskNameFor(key)}`);

async function readFromDisk(key, encoding, sampleRate) {
  try {
    const buffer = await fs.readFile(diskPathFor(key, encoding, sampleRate));
    return buffer.length > 0 ? { buffer, encoding, sampleRate } : null;
  } catch {
    return null;
  }
}

async function writeToDisk(key, entry) {
  try {
    await fs.mkdir(DISK_CACHE_DIR, { recursive: true });
    // Write then rename, so a crash mid-write cannot leave a truncated clip that
    // would be served as valid audio forever after.
    const target = diskPathFor(key, entry.encoding, entry.sampleRate);
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, entry.buffer);
    await fs.rename(temp, target);
  } catch (err) {
    logger.debug(`Could not persist greeting to disk: ${err.message}`);
  }
}

/**
 * The opener for a session.
 *
 * Deliberately free of the caller's name: including it would key the cache by
 * name, so the first visitor called anything new would pay full synthesis --
 * exactly the wait this exists to remove. The agent learns the name from the
 * system prompt and uses it from turn one onward.
 *
 * @param {object} module   the resolved demo agent or Module document
 * @param {string} gender   voice gender, which selects the persona's name
 */
export function greetingTextFor(module, gender = 'Female', language = 'en-US') {
  if (typeof module?.getGreeting === 'function') return module.getGreeting(gender);
  // A custom agent that defines no opener still needs one in the right language;
  // this used to be an English sentence regardless of how the call was conducted.
  return t('genericGreeting', module?.selectedLanguage || language);
}

async function synthesize(voiceId, language, isWebCall, text, apiKey) {
  const cartesia = new CartesiaService(apiKey);
  const started = Date.now();

  const buffer = isWebCall
    ? await cartesia.synthesizePCM(text, language, voiceId, 24000)
    : await cartesia.synthesizeMulaw(text, language, voiceId);

  if (!buffer || buffer.length === 0) return null;

  const entry = {
    buffer,
    encoding: isWebCall ? 'pcm_f32le' : 'mulaw',
    sampleRate: isWebCall ? 24000 : 8000,
  };
  logger.info(`Greeting synthesized in ${Date.now() - started}ms (${buffer.length}B): "${text}"`);
  return entry;
}

/**
 * The cached audio for an opener, synthesizing it on first use.
 *
 * Concurrent callers for the same opener share one synthesis rather than each
 * paying for their own -- four visitors arriving together on a cold process
 * would otherwise make four identical Cartesia requests.
 *
 * @returns {Promise<{buffer: Buffer, encoding: string, sampleRate: number}|null>}
 */
export async function getGreetingAudio({ voiceId, language = 'en', isWebCall = true, text, apiKey = null }) {
  if (!text || !voiceId) return null;
  const key = keyFor(voiceId, language, isWebCall, text);

  const cached = cache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const encoding = isWebCall ? 'pcm_f32le' : 'mulaw';
  const sampleRate = isWebCall ? 24000 : 8000;

  const promise = readFromDisk(key, encoding, sampleRate)
    .then((onDisk) => onDisk || synthesize(voiceId, language, isWebCall, text, apiKey)
      .then(async (entry) => {
        if (entry) await writeToDisk(key, entry);
        return entry;
      }))
    .then((entry) => {
      if (entry) {
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, entry);
      }
      return entry;
    })
    .catch((err) => {
      // A greeting is a nicety. Losing it must not take the session with it.
      logger.warn(`Greeting synthesis failed: ${err.message}`);
      return null;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/**
 * Split cached audio into client-sized frames.
 *
 * Slices land on a whole sample so a frame never cuts a float or a mu-law byte
 * in half, which would decode as a click.
 */
export function sliceGreeting(entry) {
  if (!entry) return [];
  const bytesPerSample = entry.encoding === 'pcm_f32le' ? 4 : 1;
  const sliceBytes = Math.max(
    bytesPerSample,
    Math.round((entry.sampleRate * SLICE_MS) / 1000) * bytesPerSample
  );

  const frames = [];
  for (let offset = 0; offset < entry.buffer.length; offset += sliceBytes) {
    frames.push({
      payload: entry.buffer.subarray(offset, offset + sliceBytes).toString('base64'),
      encoding: entry.encoding,
      sampleRate: entry.sampleRate,
    });
  }
  return frames;
}

/**
 * Synthesize the demo agents' openers ahead of any traffic, so the first visitor
 * of a cold process gets the same instant greeting as the hundredth.
 *
 * Strictly one at a time. Firing all four at once trips Cartesia's concurrency
 * limit -- two on the current plan -- and the 429s do not stop at the prewarm:
 * they are the same quota a live session's TTS is drawing on. Nothing is waiting
 * on this, so serial costs nothing worth having.
 *
 * Only the gender the given voice implies is warmed; the persona's name follows
 * the voice, so the other half would never be played for this voice anyway.
 * Failures are ignored -- getGreetingAudio synthesizes on demand regardless.
 */
export async function prewarmGreetings({ gender = 'Female', apiKey = null } = {}) {
  if (!process.env.CARTESIA_API_KEY && !apiKey) return;
  const { DEMO_AGENTS, getDemoAgentModule } = await import('../config/demoAgents.js');
  const { resolveLanguage } = await import('../config/languages.js');

  // Scenario x language: a visitor can reach any combination, so warm the ones
  // they are most likely to try rather than every cell of the grid. Warming all
  // of them would be dozens of synthesis calls on every boot.
  const ids = Object.keys(DEMO_AGENTS);
  const languages = (process.env.PREWARM_LANGUAGES || 'hi,en-US').split(',');
  const pairs = ids.flatMap(id => languages.map(language => ({ id, language })));

  let warmed = 0;
  for (const { id, language } of pairs) {
    const agent = getDemoAgentModule(id, gender, language);
    const lang = resolveLanguage(language);
    const entry = await getGreetingAudio({
      voiceId: agent.voiceId || lang.voiceId,
      language: lang.ttsLang,
      isWebCall: true,
      text: greetingTextFor(agent, gender, language),
      apiKey,
    }).catch(() => null);
    if (entry) warmed += 1;
  }

  logger.info(`Greeting cache warmed: ${warmed}/${pairs.length} openers ready`);
}

/** Test seam: clears memory only, leaving the disk cache alone. */
export const _resetGreetingCache = () => {
  cache.clear();
  inFlight.clear();
};

export { DISK_CACHE_DIR };

export default { greetingTextFor, getGreetingAudio, sliceGreeting, prewarmGreetings };
