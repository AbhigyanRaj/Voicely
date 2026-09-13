import { jest } from '@jest/globals';
import BargeInDetector from '../../src/services/bargeInDetector.js';
import { sliceGreeting } from '../../src/services/greetingCache.js';

/**
 * The seams between the pieces, which unit tests each side of miss.
 *
 * The greeting bug this was written for: greeting frames are sent straight to
 * the socket rather than through the TTS 'audio' handler, so the detector was
 * never told the agent was speaking and the opening line -- the longest single
 * utterance of the session -- could not be interrupted at all.
 */

const GREETING = {
  buffer: Buffer.alloc(24000 * 4 * 4), // 4 seconds of 24kHz float PCM
  encoding: 'pcm_f32le',
  sampleRate: 24000,
};

describe('greeting playback accounting', () => {
  it('leaves the agent marked as speaking for the length of the clip', () => {
    const detector = new BargeInDetector();
    const now = 1000;

    for (const frame of sliceGreeting(GREETING)) {
      detector.noteAgentAudio(
        Buffer.byteLength(frame.payload, 'base64'), frame.encoding, frame.sampleRate, now
      );
    }

    // Four seconds of audio went out at t=1000.
    expect(detector.isAgentSpeaking(2000)).toBe(true);
    expect(detector.isAgentSpeaking(4900)).toBe(true);
    expect(detector.isAgentSpeaking(5100)).toBe(false);
    detector.dispose();
  });

  it('lets the user interrupt the greeting once it is accounted for', () => {
    const detector = new BargeInDetector();
    for (const frame of sliceGreeting(GREETING)) {
      detector.noteAgentAudio(
        Buffer.byteLength(frame.payload, 'base64'), frame.encoding, frame.sampleRate, 1000
      );
    }

    const verdict = detector.evaluate(
      { text: 'sorry can I stop you there', confidence: 0.9 },
      { isGreeting: true, now: 2000 }
    );
    expect(verdict.barge).toBe(true);
    detector.dispose();
  });

  it('cannot be interrupted when the frames are not accounted for', () => {
    // The bug, pinned: without noteAgentAudio the detector sees an idle agent
    // and every interrupt during the opener is discarded.
    const detector = new BargeInDetector();
    const verdict = detector.evaluate(
      { text: 'sorry can I stop you there', confidence: 0.9 },
      { isGreeting: true, now: 2000 }
    );
    expect(verdict).toEqual({ barge: false, reason: 'agent_idle' });
    detector.dispose();
  });

  it('slices a four-second greeting into frames the socket can carry', () => {
    const frames = sliceGreeting(GREETING);
    expect(frames.length).toBeGreaterThan(4);
    for (const frame of frames) {
      // Each frame stays well under any practical WebSocket frame limit.
      expect(frame.payload.length).toBeLessThan(64 * 1024);
      expect(frame.encoding).toBe('pcm_f32le');
      expect(frame.sampleRate).toBe(24000);
    }
  });
});

describe('reply playback accounting', () => {
  it('matches the duration of the audio actually sent', () => {
    const detector = new BargeInDetector();
    // Ten 100ms clauses, as the TTS path emits them.
    const clause = Buffer.alloc(2400 * 4).toString('base64');
    for (let i = 0; i < 10; i++) {
      detector.noteAgentAudio(Buffer.byteLength(clause, 'base64'), 'pcm_f32le', 24000, 1000 + i);
    }
    // One second of audio, queued back to back.
    expect(detector.isAgentSpeaking(1900)).toBe(true);
    expect(detector.isAgentSpeaking(2100)).toBe(false);
    detector.dispose();
  });
});
