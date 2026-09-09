/**
 * Shared clause splitter for the streaming TTS adapters.
 *
 * Four near-identical copies of this logic had drifted apart: the Deepgram and
 * Google adapters had length-based fallbacks, while Cartesia (the sandbox
 * default) and Sarvam had only a punctuation rule. Since the conversational
 * system prompt asks for 8-15 word replies, a typical answer -- "Hi Steve how
 * are you doing today" -- contains no internal punctuation, so nothing reached
 * TTS until the LLM stream ended and flush() fired. That serialized the LLM and
 * TTS stages that are supposed to overlap.
 *
 * Three tiers, in order of preference:
 *   1. punctuation  - the most natural prosody, so always preferred
 *   2. connective   - "and" / "but" / "कि" ... a real breath point
 *   3. word count   - a hard cap so we never wait on the LLM for a boundary
 */

// Words that end in a period without ending a sentence.
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc',
  'inc', 'ltd', 'no', 'fig', 'approx', 'dept', 'est',
]);

// Conjunctions that mark a natural pause, English plus common Hindi.
const CONNECTIVES = new Set([
  'and', 'but', 'or', 'so', 'because', 'however', 'although',
  'कि', 'और', 'तो', 'लेकिन', 'फिर',
]);

const SENTENCE_PUNCT = new Set(['.', '?', '!', ';', '।']);
const CLAUSE_PUNCT = new Set([',', ':']);

export const DEFAULTS = {
  // Include commas as boundaries. Shorter clauses reach TTS sooner but each
  // request loses a little cross-clause intonation.
  splitOnClause: true,
  // Emit a connective-split phrase once the buffer reaches this many words.
  connectiveMinWords: 5,
  // Never let the buffer grow past this without emitting something.
  //
  // 7 rather than the 8 the Deepgram adapter used, because the conversational
  // prompt asks for 8-15 word replies and the single most common shape --
  // "Hi Steve how are you doing today" -- is exactly 7 words with no
  // punctuation. At 8 that reply never tripped the cap and waited for flush().
  maxWords: 7,
  // Take the whole buffer when the cap trips. The old adapters kept one word
  // back, which bought nothing and delayed it by a token.
  capWords: 7,
  // Don't split before this word index; a 1-2 word fragment synthesizes badly.
  minLeadWords: 2,
};

/**
 * Tighter caps for the first clause of a turn, where time-to-first-audio is the
 * only thing that matters. Once audio is playing, its own duration buys enough
 * slack to prefer longer, better-sounding clauses.
 */
export const FIRST_CLAUSE = {
  connectiveMinWords: 3,
  maxWords: 4,
  capWords: 4,
  minLeadWords: 1,
};

const stripPunctuation = (word) => word.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

const isWhitespace = (char) => char !== undefined && /\s/.test(char);

/**
 * Would splitting at `punctStart` cut a decimal, a thousands separator, a time,
 * or an abbreviation? Those are inside a word, not between sentences.
 */
const isIntraWordPunctuation = (buffer, punctStart, punctEnd) => {
  const before = buffer[punctStart - 1];
  const after = buffer[punctEnd];

  // "3.5", "1,000", "10:30" -- digit on both sides of a single mark.
  if (punctEnd - punctStart === 1 && /\d/.test(before || '') && /\d/.test(after || '')) {
    return true;
  }

  // "Mr." / "Dr." -- look back at the word the mark is attached to.
  if (buffer[punctStart] === '.') {
    const precedingText = buffer.slice(0, punctStart);
    const lastWord = precedingText.split(/\s+/).pop() || '';
    if (ABBREVIATIONS.has(stripPunctuation(lastWord))) return true;
    // A single initial, as in "J. Smith".
    if (/^\p{Lu}$/u.test(lastWord)) return true;
  }

  return false;
};

/**
 * Split on punctuation boundaries.
 *
 * A boundary is punctuation followed by whitespace, or punctuation at the very
 * end of the buffer. Accepting end-of-buffer is what removes a whole token of
 * delay: the old regex required trailing whitespace, so a chunk arriving as
 * exactly "Hello," waited for the next token before anything could be
 * synthesized. The intra-word guard above is what makes that safe.
 */
const splitOnPunctuation = (buffer, options) => {
  const clauses = [];
  let clauseStart = 0;
  let i = 0;

  while (i < buffer.length) {
    const char = buffer[i];
    const isBoundaryChar =
      SENTENCE_PUNCT.has(char) || (options.splitOnClause && CLAUSE_PUNCT.has(char));

    if (!isBoundaryChar) {
      i += 1;
      continue;
    }

    // Consume a run such as "?!" or "..." so it stays with its clause.
    let punctEnd = i;
    while (
      punctEnd < buffer.length &&
      (SENTENCE_PUNCT.has(buffer[punctEnd]) ||
        (options.splitOnClause && CLAUSE_PUNCT.has(buffer[punctEnd])))
    ) {
      punctEnd += 1;
    }

    const atBufferEnd = punctEnd >= buffer.length;
    const followedBySpace = isWhitespace(buffer[punctEnd]);

    if ((!atBufferEnd && !followedBySpace) || isIntraWordPunctuation(buffer, i, punctEnd)) {
      i = punctEnd;
      continue;
    }

    const clause = buffer.slice(clauseStart, punctEnd).trim();
    if (clause.length > 0) clauses.push(clause);

    // Skip the whitespace that separated the clauses.
    let next = punctEnd;
    while (next < buffer.length && isWhitespace(buffer[next])) next += 1;
    clauseStart = next;
    i = next;
  }

  return { clauses, remainder: buffer.slice(clauseStart) };
};

const splitOnConnective = (buffer, options) => {
  const words = buffer.trim().split(/\s+/).filter(Boolean);
  if (words.length < options.connectiveMinWords) return null;

  const index = words.findIndex(
    (word, idx) => idx >= options.minLeadWords && CONNECTIVES.has(stripPunctuation(word))
  );
  // Splitting on a trailing connective would leave it stranded with no clause.
  if (index === -1 || index >= words.length - 1) return null;

  return {
    clauses: [words.slice(0, index + 1).join(' ')],
    remainder: words.slice(index + 1).join(' ') + ' ',
  };
};

const splitOnWordCap = (buffer, options) => {
  const words = buffer.trim().split(/\s+/).filter(Boolean);
  if (words.length < options.maxWords) return null;

  return {
    clauses: [words.slice(0, options.capWords).join(' ')],
    remainder: words.slice(options.capWords).join(' ') + ' ',
  };
};

/**
 * Pull every complete clause out of a streaming text buffer.
 *
 * @param {string} buffer   accumulated LLM text
 * @param {object} [config] overrides for DEFAULTS
 * @returns {{clauses: string[], remainder: string}} clauses ready to synthesize,
 *   and the text still waiting for a boundary
 */
export const chunkText = (buffer, config = {}) => {
  if (!buffer) return { clauses: [], remainder: '' };
  const options = { ...DEFAULTS, ...config };

  const punctuation = splitOnPunctuation(buffer, options);
  if (punctuation.clauses.length > 0) return punctuation;

  // Only reachable when the buffer holds no usable punctuation at all.
  return (
    splitOnConnective(buffer, options) ||
    splitOnWordCap(buffer, options) || { clauses: [], remainder: buffer }
  );
};

export default { chunkText, DEFAULTS, FIRST_CLAUSE };
