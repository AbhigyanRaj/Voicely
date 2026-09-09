import { chunkText, DEFAULTS, FIRST_CLAUSE } from '../../src/services/textChunker.js';

describe('textChunker', () => {
  describe('the regression it exists to fix', () => {
    // The conversational prompt asks for 8-15 word replies, so this shape is the
    // common case. With no punctuation and no length fallback it used to reach TTS
    // only after the whole LLM stream ended.
    const reply = 'Hi Steve how are you doing today';

    it('emits a clause for a punctuation-free reply before flush', () => {
      const { clauses } = chunkText(reply);
      expect(clauses.length).toBeGreaterThan(0);
    });

    it('emits it much sooner still under first-clause config', () => {
      const { clauses } = chunkText('Hi Steve how are', FIRST_CLAUSE);
      expect(clauses).toEqual(['Hi Steve how are']);
    });

    it('holds a buffer that is still too short to split', () => {
      expect(chunkText('Hi Steve how').clauses).toEqual([]);
    });
  });

  describe('punctuation boundaries', () => {
    it('splits on a comma followed by a space', () => {
      expect(chunkText('Hello there, how are you')).toEqual({
        clauses: ['Hello there,'],
        remainder: 'how are you',
      });
    });

    it('splits on punctuation at the end of the buffer', () => {
      // The old regex required trailing whitespace, so a chunk arriving as
      // exactly "Hello there," waited a whole token before synthesizing.
      expect(chunkText('Hello there,').clauses).toEqual(['Hello there,']);
      expect(chunkText('Yes I can.').clauses).toEqual(['Yes I can.']);
    });

    it('keeps a punctuation run with its clause', () => {
      expect(chunkText('Really?! I had no idea').clauses).toEqual(['Really?!']);
    });

    it('drains every complete clause in one pass', () => {
      expect(chunkText('One. Two. Three')).toEqual({
        clauses: ['One.', 'Two.'],
        remainder: 'Three',
      });
    });

    it('splits on the Devanagari danda', () => {
      expect(chunkText('नमस्ते। और आप').clauses).toEqual(['नमस्ते।']);
    });

    it('leaves commas alone when not splitting on clauses', () => {
      expect(chunkText('Hello there, how are', { splitOnClause: false }).clauses).toEqual([]);
    });
  });

  describe('does not split inside a word', () => {
    it.each([
      ['a decimal', 'It costs 3.5 dollars'],
      ['a thousands separator', 'About 1,000 calls'],
      ['a time', 'Call at 10:30 today'],
      ['an abbreviation', 'Tell Mr. Smith we did'],
      ['a trailing abbreviation', 'Please ask Dr.'],
      ['an initial', 'Ask J. Smith about'],
    ])('holds %s', (_label, buffer) => {
      expect(chunkText(buffer).clauses).toEqual([]);
    });
  });

  describe('fallbacks', () => {
    it('splits after a connective', () => {
      expect(chunkText('I checked the account and it looks fine')).toEqual({
        clauses: ['I checked the account and'],
        remainder: 'it looks fine ',
      });
    });

    it('will not strand a trailing connective', () => {
      expect(chunkText('I checked your account and').clauses).toEqual([]);
    });

    it('splits on a Hindi connective', () => {
      const { clauses } = chunkText('मैं आपकी मदद कर सकता हूं और यह ठीक है');
      expect(clauses).toEqual(['मैं आपकी मदद कर सकता हूं और']);
    });

    it('caps a long punctuation-free run', () => {
      const { clauses, remainder } = chunkText(
        'one two three four five six seven eight nine ten'
      );
      expect(clauses[0].split(' ')).toHaveLength(DEFAULTS.capWords);
      expect(remainder.trim()).toBe('eight nine ten');
    });

    it('prefers punctuation over the length fallbacks', () => {
      // Long enough to trip the cap, but the comma is the better break.
      const { clauses } = chunkText('one two, three four five six seven eight');
      expect(clauses).toEqual(['one two,']);
    });
  });

  describe('edges', () => {
    it.each([
      ['empty string', ''],
      ['undefined', undefined],
      ['whitespace only', '   '],
    ])('survives %s', (_label, buffer) => {
      expect(chunkText(buffer).clauses).toEqual([]);
    });

    it('never loses characters', () => {
      const buffer = 'Sure thing. I can help with that, absolutely';
      const { clauses, remainder } = chunkText(buffer);
      const roundTrip = [...clauses, remainder].join(' ').replace(/\s+/g, ' ').trim();
      expect(roundTrip).toBe(buffer.replace(/\s+/g, ' ').trim());
    });
  });
});
