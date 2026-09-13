import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const synthesizePCM = jest.fn();
const synthesizeMulaw = jest.fn();

jest.unstable_mockModule('../../src/services/cartesiaService.js', () => ({
  default: class {
    constructor() {
      this.synthesizePCM = synthesizePCM;
      this.synthesizeMulaw = synthesizeMulaw;
    }
  },
}));

// Isolate the disk cache: without this, entries persist across test runs and a
// later run serves audio the current run never asked for.
process.env.GREETING_CACHE_DIR = path.join(os.tmpdir(), `voicely-greetings-test-${process.pid}`);

const { greetingTextFor, getGreetingAudio, sliceGreeting, _resetGreetingCache, DISK_CACHE_DIR } =
  await import('../../src/services/greetingCache.js');
const { getDemoAgentModule, DEMO_AGENTS } = await import('../../src/config/demoAgents.js');

const VOICE = '79a125e8-cd45-4c13-8a67-188112f4dd22';

beforeEach(async () => {
  _resetGreetingCache();
  await fs.rm(DISK_CACHE_DIR, { recursive: true, force: true });
  synthesizePCM.mockReset();
  synthesizeMulaw.mockReset();
});

afterAll(async () => {
  await fs.rm(DISK_CACHE_DIR, { recursive: true, force: true });
});

describe('greetingTextFor', () => {
  it('gives every scenario a usable opener in both genders', () => {
    for (const id of Object.keys(DEMO_AGENTS)) {
      for (const gender of ['Female', 'Male']) {
        for (const lang of ['hi', 'ta', 'en-US']) {
          const text = greetingTextFor(getDemoAgentModule(id, gender, lang), gender);
          expect(text.length).toBeGreaterThan(15);
        }
      }
    }
  });

  it('reads the opener the assembled agent carries', () => {
    // greetingTextFor delegates to the agent's own getGreeting, which
    // getDemoAgentModule has already resolved for the requested language. The
    // language is a PARAMETER now -- it used to be baked into the agent id, which
    // is what made picking a language do nothing.
    const hi = getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'hi');
    expect(greetingTextFor(hi, 'Female')).toBe(hi.greeting);
    expect(greetingTextFor(hi, 'Female')).toContain(hi.personaName);

    const ta = getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'ta');
    expect(greetingTextFor(ta, 'Female')).not.toBe(greetingTextFor(hi, 'Female'));
  });

  it('omits the caller name, so the cache key does not depend on it', () => {
    const text = greetingTextFor(getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'hi'), 'Female');
    // Naming the caller would key the cache by name, so the first visitor called
    // anything new would pay full synthesis -- the exact wait this removes.
    expect(text).not.toMatch(/Abhigyan|Steve/);
    // And no unsubstituted template placeholder leaked into the line.
    expect(text).not.toMatch(/[{}$]/);
  });

  it('gives a custom agent with no opener one in the right language', () => {
    // This used to be an English sentence naming the module, spoken at the top of
    // a Hindi call.
    const hindi = greetingTextFor({ name: 'Acme Roofing' }, 'Female', 'hi');
    expect(hindi).toMatch(/[ऀ-ॿ]/);

    const tamil = greetingTextFor({ name: 'Acme Roofing' }, 'Female', 'ta');
    expect(tamil).toMatch(/[஀-௿]/);

    expect(greetingTextFor({ name: 'Acme Roofing' }, 'Female', 'en-US')).toMatch(/^[\x00-\x7F\s]+$/);
  });
});

describe('getGreetingAudio', () => {
  it('synthesizes once and serves every later request from memory', async () => {
    synthesizePCM.mockResolvedValue(Buffer.alloc(4800 * 4));

    const first = await getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' });
    const second = await getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' });

    expect(synthesizePCM).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first.encoding).toBe('pcm_f32le');
    expect(first.sampleRate).toBe(24000);
  });

  it('collapses concurrent callers onto one synthesis', async () => {
    let release;
    synthesizePCM.mockReturnValue(new Promise(r => { release = () => r(Buffer.alloc(64)); }));

    const all = Promise.all([
      getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' }),
      getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' }),
      getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' }),
    ]);
    release();
    const [a, b, c] = await all;

    expect(synthesizePCM).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('keys on the voice, so two voices do not share one recording', async () => {
    synthesizePCM.mockResolvedValue(Buffer.alloc(64));
    await getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' });
    await getGreetingAudio({ voiceId: 'other-voice', text: 'Hi there.' });
    expect(synthesizePCM).toHaveBeenCalledTimes(2);
  });

  it('returns null rather than throwing when synthesis fails', async () => {
    synthesizePCM.mockRejectedValue(new Error('Cartesia 503'));
    await expect(getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' })).resolves.toBeNull();
  });

  it('does not cache a failure', async () => {
    synthesizePCM.mockRejectedValueOnce(new Error('transient'));
    synthesizePCM.mockResolvedValueOnce(Buffer.alloc(64));

    expect(await getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' })).toBeNull();
    expect(await getGreetingAudio({ voiceId: VOICE, text: 'Hi there.' })).not.toBeNull();
  });

  it('uses mulaw for a telephony session', async () => {
    synthesizeMulaw.mockResolvedValue(Buffer.alloc(160));
    const entry = await getGreetingAudio({ voiceId: VOICE, text: 'Hi there.', isWebCall: false });
    expect(entry.encoding).toBe('mulaw');
    expect(entry.sampleRate).toBe(8000);
    expect(synthesizePCM).not.toHaveBeenCalled();
  });
});

describe('sliceGreeting', () => {
  it('splits on whole samples, so no frame cuts a float in half', () => {
    // 1 second of 24kHz float PCM.
    const entry = { buffer: Buffer.alloc(24000 * 4), encoding: 'pcm_f32le', sampleRate: 24000 };
    const frames = sliceGreeting(entry);

    expect(frames.length).toBeGreaterThan(1);
    for (const frame of frames) {
      expect(Buffer.from(frame.payload, 'base64').length % 4).toBe(0);
    }
  });

  it('loses no audio across the split', () => {
    const buffer = Buffer.alloc(24000 * 4);
    for (let i = 0; i < buffer.length; i++) buffer[i] = i % 251;
    const frames = sliceGreeting({ buffer, encoding: 'pcm_f32le', sampleRate: 24000 });

    const rejoined = Buffer.concat(frames.map(f => Buffer.from(f.payload, 'base64')));
    expect(rejoined.equals(buffer)).toBe(true);
  });

  it('handles audio shorter than one slice', () => {
    const frames = sliceGreeting({ buffer: Buffer.alloc(400), encoding: 'pcm_f32le', sampleRate: 24000 });
    expect(frames).toHaveLength(1);
  });

  it('returns nothing for missing audio', () => {
    expect(sliceGreeting(null)).toEqual([]);
  });
});

describe('surviving a restart', () => {
  it('reuses audio from disk instead of paying for it again', async () => {
    const audio = Buffer.alloc(4800 * 4, 7);
    synthesizePCM.mockResolvedValue(audio);

    // First process: synthesizes and persists.
    const first = await getGreetingAudio({ voiceId: VOICE, text: 'Restart test.' });
    expect(first.buffer.equals(audio)).toBe(true);
    expect(synthesizePCM).toHaveBeenCalledTimes(1);

    // A restart drops the in-memory cache but not the file.
    _resetGreetingCache();

    const second = await getGreetingAudio({ voiceId: VOICE, text: 'Restart test.' });
    expect(synthesizePCM).toHaveBeenCalledTimes(1);
    expect(second.buffer.equals(audio)).toBe(true);
    expect(second.encoding).toBe('pcm_f32le');
    expect(second.sampleRate).toBe(24000);
  });

  it('does not serve one encoding as another', async () => {
    synthesizePCM.mockResolvedValue(Buffer.alloc(64, 1));
    synthesizeMulaw.mockResolvedValue(Buffer.alloc(64, 2));

    await getGreetingAudio({ voiceId: VOICE, text: 'Same line.', isWebCall: true });
    _resetGreetingCache();

    // Same text and voice, different transport: must not reuse the PCM clip.
    const tel = await getGreetingAudio({ voiceId: VOICE, text: 'Same line.', isWebCall: false });
    expect(tel.encoding).toBe('mulaw');
    expect(synthesizeMulaw).toHaveBeenCalledTimes(1);
  });
});


describe('language in the cache key', () => {
  it('never serves one language\'s recording for another', async () => {
    // Same text, same voice, different language: Cartesia pronounces these
    // differently, so they are different recordings.
    synthesizePCM.mockResolvedValueOnce(Buffer.alloc(64, 1));
    synthesizePCM.mockResolvedValueOnce(Buffer.alloc(64, 2));

    const hi = await getGreetingAudio({ voiceId: VOICE, language: 'hi', text: 'same text' });
    const ta = await getGreetingAudio({ voiceId: VOICE, language: 'ta', text: 'same text' });

    expect(synthesizePCM).toHaveBeenCalledTimes(2);
    expect(hi.buffer.equals(ta.buffer)).toBe(false);
  });

  it('passes the language through to the synthesizer', async () => {
    synthesizePCM.mockResolvedValue(Buffer.alloc(64));
    await getGreetingAudio({ voiceId: VOICE, language: 'mr', text: 'marathi line' });
    // Cartesia infers pronunciation from this, not from the script of the text.
    expect(synthesizePCM).toHaveBeenCalledWith('marathi line', 'mr', VOICE, 24000);
  });
});
