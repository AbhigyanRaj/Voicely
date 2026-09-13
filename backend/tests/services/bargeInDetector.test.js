import { jest } from '@jest/globals';
import BargeInDetector, { frameRms, SPURIOUS_AFTER_MS } from '../../src/services/bargeInDetector.js';

/** One second of 24kHz float PCM is 96000 bytes; this is the frame the client sends. */
const speakFor = (detector, ms, now) =>
  detector.noteAgentAudio(Math.round((24000 * ms) / 1000) * 4, 'pcm_f32le', 24000, now);

/** A linear16 frame at a given amplitude, 0..1. */
const pcmFrame = (amplitude, samples = 480) => {
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(amplitude * 32767), i * 2);
  return buf;
};

const speech = { text: 'wait hold on a second', confidence: 0.95 };

let detector;
beforeEach(() => { detector = new BargeInDetector(); });
afterEach(() => detector.dispose());

describe('agent speaking window', () => {
  it('knows the agent is silent before any audio', () => {
    expect(detector.isAgentSpeaking(1000)).toBe(false);
  });

  it('tracks how long sent audio will take to play out', () => {
    speakFor(detector, 500, 1000);
    expect(detector.isAgentSpeaking(1400)).toBe(true);
    expect(detector.isAgentSpeaking(1600)).toBe(false);
  });

  it('queues consecutive frames rather than overlapping them', () => {
    // The client schedules each frame after the last, so five 100ms frames sent
    // back to back are half a second of audio, not 100ms.
    for (let i = 0; i < 5; i++) speakFor(detector, 100, 1000);
    expect(detector.isAgentSpeaking(1450)).toBe(true);
    expect(detector.isAgentSpeaking(1550)).toBe(false);
  });

  it('restarts from now once the queue has drained', () => {
    speakFor(detector, 100, 1000);
    speakFor(detector, 100, 5000);
    expect(detector.isAgentSpeaking(5050)).toBe(true);
    expect(detector.isAgentSpeaking(5150)).toBe(false);
  });

  it('computes mulaw duration at one byte per sample', () => {
    detector.noteAgentAudio(8000, 'mulaw', 8000, 1000);
    expect(detector.isAgentSpeaking(1900)).toBe(true);
    expect(detector.isAgentSpeaking(2100)).toBe(false);
  });
});

describe('the gate that matters most: the agent must be speaking', () => {
  it('refuses to barge in when nothing is playing', () => {
    // This is the whole spurious class under the old rule, which fired on any
    // interim of two characters regardless of what the agent was doing.
    expect(detector.evaluate(speech, { now: 1000 })).toEqual({ barge: false, reason: 'agent_idle' });
  });

  it('barges in on a decisive interim while the agent speaks', () => {
    speakFor(detector, 3000, 1000);
    expect(detector.evaluate(speech, { now: 1500 })).toEqual({ barge: true, reason: 'decisive' });
  });
});

describe('word count', () => {
  it.each(['uh', 'the', 'a', 'you', 'mm'])('ignores the single-word interim %p', (text) => {
    speakFor(detector, 3000, 1000);
    expect(detector.evaluate({ text, confidence: 0.9 }, { now: 1500 }).barge).toBe(false);
  });

  it('ignores an interim the old rule would have fired on', () => {
    speakFor(detector, 3000, 1000);
    // `"ok".trim().length > 1` was the entire previous condition.
    expect(detector.evaluate({ text: 'ok', confidence: 0.9 }, { now: 1500 }).barge).toBe(false);
  });

  it('holds a two-word interim until a second one agrees', () => {
    speakFor(detector, 3000, 1000);
    const first = detector.evaluate({ text: 'hold on', confidence: 0.9 }, { now: 1500 });
    expect(first).toEqual({ barge: false, reason: 'awaiting_confirmation' });

    const second = detector.evaluate({ text: 'hold on', confidence: 0.9 }, { now: 1650 });
    expect(second).toEqual({ barge: true, reason: 'sustained' });
  });

  it('forgets a stale two-word candidate', () => {
    speakFor(detector, 30000, 1000);
    detector.evaluate({ text: 'hold on', confidence: 0.9 }, { now: 1500 });
    // Well past the confirmation window: this is a new candidate, not a match.
    expect(detector.evaluate({ text: 'hold on', confidence: 0.9 }, { now: 9000 }).barge).toBe(false);
  });

  it('drops a pending candidate when the agent falls silent', () => {
    speakFor(detector, 200, 1000);
    detector.evaluate({ text: 'hold on', confidence: 0.9 }, { now: 1100 });
    detector.evaluate(speech, { now: 1500 });  // agent idle, clears the candidate
    speakFor(detector, 3000, 2000);
    expect(detector.evaluate({ text: 'hold on', confidence: 0.9 }, { now: 2100 }).barge).toBe(false);
  });
});

describe('confidence', () => {
  it('ignores a low-confidence interim', () => {
    speakFor(detector, 3000, 1000);
    expect(detector.evaluate({ text: 'wait hold on', confidence: 0.2 }, { now: 1500 }))
      .toEqual({ barge: false, reason: 'low_confidence' });
  });

  it('accepts an interim with no confidence reported', () => {
    speakFor(detector, 3000, 1000);
    expect(detector.evaluate({ text: 'wait hold on' }, { now: 1500 }).barge).toBe(true);
  });
});

describe('input energy', () => {
  it('ignores a transcript produced from near-silence', () => {
    speakFor(detector, 3000, 1000);
    detector.noteInputFrame(pcmFrame(0.001), 'linear16', 1400);
    expect(detector.evaluate(speech, { now: 1500 }))
      .toEqual({ barge: false, reason: 'below_noise_floor' });
  });

  it('accepts a transcript backed by real speech energy', () => {
    speakFor(detector, 3000, 1000);
    detector.noteInputFrame(pcmFrame(0.05), 'linear16', 1400);
    expect(detector.evaluate(speech, { now: 1500 }).barge).toBe(true);
  });

  it('ignores an energy reading too old to describe what is being said now', () => {
    speakFor(detector, 30000, 1000);
    detector.noteInputFrame(pcmFrame(0.001), 'linear16', 1000);
    expect(detector.evaluate(speech, { now: 5000 }).barge).toBe(true);
  });

  it('is not vetoed by the gap between two words', () => {
    // Measured against real speech, 20-30% of 20ms frames fall below the
    // threshold -- they are the pauses inside a sentence. Gating on the single
    // most recent frame rejected any interrupt whose transcript happened to land
    // in one of those gaps, which in practice was most of them.
    speakFor(detector, 5000, 1000);
    detector.noteInputFrame(pcmFrame(0.09), 'linear16', 1400);   // a word
    detector.noteInputFrame(pcmFrame(0.0005), 'linear16', 1420); // the gap after it
    detector.noteInputFrame(pcmFrame(0.0004), 'linear16', 1440);

    expect(detector.evaluate(speech, { now: 1450 }).barge).toBe(true);
  });

  it('still rejects a room that has been quiet for the whole window', () => {
    speakFor(detector, 5000, 1000);
    for (let t = 1200; t <= 1500; t += 20) detector.noteInputFrame(pcmFrame(0.001), 'linear16', t);
    expect(detector.evaluate(speech, { now: 1500 }).reason).toBe('below_noise_floor');
  });

  it('forgets speech energy once it falls out of the window', () => {
    speakFor(detector, 30000, 1000);
    detector.noteInputFrame(pcmFrame(0.09), 'linear16', 1000);
    for (let t = 1400; t <= 1700; t += 20) detector.noteInputFrame(pcmFrame(0.001), 'linear16', t);
    // The loud frame is well outside the window now.
    expect(detector.evaluate(speech, { now: 1700 }).reason).toBe('below_noise_floor');
  });

  it('keeps the window bounded when frames arrive faster than real time', () => {
    for (let i = 0; i < 5000; i++) detector.noteInputFrame(pcmFrame(0.05), 'linear16', 1000);
    expect(detector.rmsWindow.length).toBeLessThanOrEqual(64);
  });

  it('does not gate on energy for mulaw, which it cannot read', () => {
    speakFor(detector, 3000, 1000);
    detector.noteInputFrame(Buffer.alloc(160, 0xff), 'mulaw', 1400);
    expect(detector.evaluate(speech, { now: 1500 }).barge).toBe(true);
  });
});

describe('the greeting', () => {
  it('needs a decisive interrupt, not a backchannel', () => {
    speakFor(detector, 4000, 1000);
    // "yeah sure" over an introduction is agreement, not an interruption.
    expect(detector.evaluate({ text: 'yeah sure', confidence: 0.9 }, { isGreeting: true, now: 1500 }).barge)
      .toBe(false);
  });

  it('can still be genuinely interrupted', () => {
    speakFor(detector, 4000, 1000);
    expect(detector.evaluate(speech, { isGreeting: true, now: 1500 }).barge).toBe(true);
  });
});

describe('spurious accounting', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts a barge-in with no speech after it as spurious', () => {
    const onSpurious = jest.fn();
    const d = new BargeInDetector({ onSpurious });
    d.noteTriggered(1000);
    expect(d.triggered).toBe(1);

    jest.advanceTimersByTime(SPURIOUS_AFTER_MS + 10);
    expect(d.spurious).toBe(1);
    expect(onSpurious).toHaveBeenCalledTimes(1);
    d.dispose();
  });

  it('does not count one where the user simply kept talking', () => {
    const onSpurious = jest.fn();
    const d = new BargeInDetector({ onSpurious });
    d.noteTriggered(1000);

    // An interim transcript is enough: someone three seconds into a sentence has
    // no completed utterance to show yet, and is obviously still speaking.
    jest.advanceTimersByTime(800);
    d.noteSpeechConfirmed();
    jest.advanceTimersByTime(SPURIOUS_AFTER_MS + 10);

    expect(d.spurious).toBe(0);
    expect(onSpurious).not.toHaveBeenCalled();
    d.dispose();
  });

  it('does not count one the user followed through on', () => {
    const onSpurious = jest.fn();
    const d = new BargeInDetector({ onSpurious });
    d.noteTriggered(1000);
    d.noteSpeechConfirmed();

    jest.advanceTimersByTime(SPURIOUS_AFTER_MS + 10);
    expect(d.spurious).toBe(0);
    expect(onSpurious).not.toHaveBeenCalled();
    d.dispose();
  });

  it('stops the agent-speaking window when it fires', () => {
    const d = new BargeInDetector();
    speakFor(d, 5000, 1000);
    d.noteTriggered(1200);
    // The audio was cleared on the client, so it is no longer playing.
    expect(d.isAgentSpeaking(1300)).toBe(false);
    d.dispose();
  });

  it('leaves no timer behind after dispose', () => {
    const d = new BargeInDetector({ onSpurious: jest.fn() });
    d.noteTriggered(1000);
    d.dispose();
    jest.advanceTimersByTime(SPURIOUS_AFTER_MS + 10);
    expect(d.spurious).toBe(0);
  });
});

describe('frameRms', () => {
  it('reads the amplitude of a linear16 frame', () => {
    expect(frameRms(pcmFrame(0.5), 'linear16')).toBeCloseTo(0.5, 2);
  });

  it('reads silence as zero', () => {
    expect(frameRms(pcmFrame(0), 'linear16')).toBe(0);
  });

  it('declines encodings it cannot read', () => {
    expect(frameRms(pcmFrame(0.5), 'mulaw')).toBeNull();
  });

  it('declines a frame too short to hold a sample', () => {
    expect(frameRms(Buffer.alloc(1), 'linear16')).toBeNull();
    expect(frameRms(null, 'linear16')).toBeNull();
  });
});

describe('a realistic noisy room', () => {
  it('never fires on sixty seconds of room tone with the agent idle', () => {
    const d = new BargeInDetector();
    let fired = 0;
    // Deepgram emits short low-confidence interims from room tone. Under the old
    // rule every one of these -- any two characters -- interrupted the agent.
    const noise = ['uh', 'mm', 'the', 'a', 'you know', 'hm'];
    for (let t = 0; t < 60000; t += 200) {
      d.noteInputFrame(pcmFrame(0.002), 'linear16', t);
      if (d.evaluate({ text: noise[(t / 200) % noise.length], confidence: 0.4 }, { now: t }).barge) fired++;
    }
    expect(fired).toBe(0);
    d.dispose();
  });

  it('still catches a real interrupt within one interim', () => {
    const d = new BargeInDetector();
    speakFor(d, 5000, 1000);
    d.noteInputFrame(pcmFrame(0.06), 'linear16', 1500);
    expect(d.evaluate({ text: 'sorry can I stop you there', confidence: 0.93 }, { now: 1500 }).barge)
      .toBe(true);
    d.dispose();
  });
});
