import StreamingCallHandler from '../../src/services/streamingCallHandler.js';

describe('speculative prefill', () => {
  describe('transcript normalization', () => {
    const norm = StreamingCallHandler._normalize;

    it('ignores the punctuation and casing a final transcript adds', () => {
      // This is the case the whole optimization rests on: Deepgram's last
      // interim result is the complete utterance, and the final only formats it.
      expect(norm('we handle about two hundred calls')).toBe(
        norm('We handle about two hundred calls.')
      );
    });

    it('collapses whitespace', () => {
      expect(norm('hello   there')).toBe(norm('hello there'));
    });

    it('does not treat a prefix as a match', () => {
      // Answering "we handle about two hundred" could say something quite
      // different from answering the full sentence, so this must not adopt.
      expect(norm('We handle about two hundred')).not.toBe(
        norm('We handle about two hundred calls every day')
      );
    });

    it('survives empty and missing input', () => {
      expect(norm('')).toBe('');
      expect(norm(undefined)).toBe('');
      expect(norm('!!!')).toBe('');
    });
  });
});
