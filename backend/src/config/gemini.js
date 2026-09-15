import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import https from 'https';
import { record, count } from '../utils/latencyMetrics.js';
import logger from '../utils/logger.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Keep-alive so a turn doesn't start with a DNS + TCP + TLS handshake. The
// Cartesia service has had this for a while; the LLM path never did, and it is
// on the critical path of every single turn.
const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 50 });

// Warm the socket at startup so the first turn of the first call isn't the one
// that pays for the handshake.
fetch('https://api.groq.com/', { agent: httpsAgent }).catch(() => {});

// Cache Gemini model handles. A fresh client and model handle were built for
// every utterance.
const geminiModelCache = new Map();
const getGeminiModel = (apiKey, modelName) => {
  const cacheKey = `${apiKey}:${modelName}`;
  let model = geminiModelCache.get(cacheKey);
  if (!model) {
    model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
    geminiModelCache.set(cacheKey, model);
  }
  return model;
};

// Groq model selection.
//
// The code used to pin `llama-3.3-70b-versatile` here and in every analysis
// call. Groq has since decommissioned it -- and `llama-3.1-8b-instant` -- so
// both now return 404 model_not_found, which took the conversational pipeline
// and all post-call analysis down completely.
//
// This has now happened twice. `qwen/qwen3.6-27b` went the same way on
// 2026-09-16: every turn 404'd, so every turn fell through to the "didn't catch
// that" fallback and the call was unusable while STT and TTS were both fine.
// Hence the env override and the startup check in assertModelsAvailable() --
// the next decommissioning should be a loud warning at boot, not a dead call.
//
// Measured TTFT over the models the account can currently reach:
//   qwen/qwen3.8-27b     209ms   (with reasoning_effort 'none')
//   groq/compound-mini   906ms
//   openai/gpt-oss-20b   spends its first tokens on a reasoning channel
//
// `reasoning_effort: 'none'` matters: without it qwen streams a <think> block,
// which would be fed straight to TTS and spoken aloud.
const REALTIME_LLM_MODEL = process.env.GROQ_REALTIME_MODEL || 'qwen/qwen3.8-27b';
const REALTIME_REASONING_EFFORT = 'none';

// Post-call analysis. Latency is irrelevant here, but it has to return
// parseable JSON, which this model does.
export const ANALYSIS_LLM_MODEL = process.env.GROQ_ANALYSIS_MODEL || 'qwen/qwen3.8-27b';

/**
 * Check at boot that the pinned models still exist.
 *
 * A decommissioned model is invisible until the first turn of the first call,
 * where it surfaces as a spoken apology rather than an error anyone sees. One
 * GET at startup turns that into a log line before a borrower is on the phone.
 * Never throws: a provider blip must not stop the server from booting.
 */
export const assertModelsAvailable = async () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      logger.warn(`Could not verify Groq models (HTTP ${res.status}); continuing`);
      return;
    }
    const available = new Set(((await res.json()).data || []).map(m => m.id));
    for (const model of new Set([REALTIME_LLM_MODEL, ANALYSIS_LLM_MODEL])) {
      if (available.has(model)) {
        logger.info(`Groq model ${model}: available`);
      } else {
        logger.error(
          `Groq model ${model} is NOT available to this key -- every turn will ` +
          `404 and callers will hear the "didn't catch that" fallback. ` +
          `Set GROQ_REALTIME_MODEL / GROQ_ANALYSIS_MODEL to one of: ` +
          `${[...available].filter(m => !m.startsWith('whisper')).join(', ')}`
        );
      }
    }
  } catch (err) {
    logger.warn(`Could not verify Groq models (${err.message}); continuing`);
  }
};

/**
 * Universal fallback handler for Gemini generative API requests.
 * Automatically rotates between next-gen, standard, and legacy models on both v1beta and v1 endpoints
 * to safeguard against 404 Model Not Found and 429 Quota Exceeded exceptions.
 */
const callGenerativeMethodWithFallback = async (methodType, options, ...args) => {
  // Ordered sequence of fallback models - gemini-2.0-flash-lite is optimized for real-time voice latency
  const models = ["gemini-2.0-flash-lite", "gemini-flash-latest", "gemini-2.0-flash", "gemini-2.5-flash"];
  let lastError = null;

  // Try v1beta endpoints first (usually best for experimental real-time/TTS/lite models)
  for (const modelName of models) {
    try {
      logger.debug(`Attempting Gemini call with model: ${modelName} using apiVersion: v1beta...`);
      const modelInstance = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
      
      if (methodType === 'generateContentStream') {
        const result = await modelInstance.generateContentStream(...args);
        return { result, modelUsed: modelName };
      } else {
        const result = await modelInstance.generateContent(...args);
        return { result, modelUsed: modelName };
      }
    } catch (err) {
      logger.warn(`Gemini call failed for model ${modelName} on v1beta: ${err.message}`);
      if (err.message?.includes('429') || err.message?.toLowerCase()?.includes('quota')) {
        logger.error(`[CRITICAL] Gemini API Key Quota Exceeded (429) for model ${modelName}. Failing fast.`);
        throw err;
      }
      lastError = err;
      continue;
    }
  }

  // Fallback to standard v1 endpoints if all v1beta queries fail or hit quota limitations
  for (const modelName of ["gemini-flash-latest", "gemini-2.0-flash-lite"]) {
    try {
      logger.debug(`Fallback: Attempting Gemini call with model: ${modelName} on apiVersion: v1...`);
      const modelInstance = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1' });
      if (methodType === 'generateContentStream') {
        const result = await modelInstance.generateContentStream(...args);
        return { result, modelUsed: modelName };
      } else {
        const result = await modelInstance.generateContent(...args);
        return { result, modelUsed: modelName };
      }
    } catch (err) {
      logger.warn(`Gemini call failed for model ${modelName} on v1: ${err.message}`);
      if (err.message?.includes('429') || err.message?.toLowerCase()?.includes('quota')) {
        logger.error(`[CRITICAL] Gemini API Key Quota Exceeded (429) for model ${modelName} on v1. Failing fast.`);
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError;
};

/**
 * Utility to parse chat history string into structured OpenAI/Groq messages format
 */
export const parseChatHistoryToMessages = (systemPrompt, chatHistory) => {
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  if (!chatHistory || chatHistory.trim() === '') {
    return messages;
  }

  const lines = chatHistory.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('AI:')) {
      messages.push({ role: 'assistant', content: trimmed.replace('AI:', '').trim() });
    } else if (trimmed.startsWith('User:')) {
      messages.push({ role: 'user', content: trimmed.replace('User:', '').trim() });
    } else if (trimmed.startsWith('[NEW CALL STARTED') || trimmed.startsWith('[PREVIOUS CONVERSATION CONTEXT]')) {
      messages.push({ role: 'system', content: trimmed });
    } else if (trimmed !== '') {
      messages.push({ role: 'user', content: trimmed });
    }
  }

  return messages;
};

/**
 * Stream a conversational reply.
 *
 * @param {string}   systemPrompt
 * @param {string}   chatHistory
 * @param {Function} onChunk       called with each text delta
 * @param {string?}  llmApiKey
 * @param {AbortSignal?} signal    aborts an in-flight generation. Used by
 *   speculative prefill, which starts generating against a partial transcript
 *   and abandons the attempt when a newer partial supersedes it.
 */
/**
 * How long Groq says to wait, from its own 429 body.
 *
 * It states the figure precisely -- "Please try again in 840ms" -- so there is no
 * need to guess a backoff. Capped, because a turn the user is waiting through is
 * only worth so much silence -- but the cap is generous, since a two-second reply
 * still answers the question and a dropped turn never does.
 */
const MAX_RETRY_WAIT_MS = 2000;

export function parseRetryAfterMs(errorText = '') {
  const ms = errorText.match(/try again in ([\d.]+)ms/i);
  if (ms) return Math.min(MAX_RETRY_WAIT_MS, Math.ceil(parseFloat(ms[1])));
  const secs = errorText.match(/try again in ([\d.]+)s/i);
  if (secs) {
    const wait = Math.ceil(parseFloat(secs[1]) * 1000);
    return wait <= MAX_RETRY_WAIT_MS ? wait : null;
  }
  return null;
}

const generateConversationalResponseStreamOnce = async (systemPrompt, chatHistory, onChunk, llmApiKey = null, signal = null) => {
  const apiKey = llmApiKey || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
  const isGroq = apiKey && apiKey.startsWith('gsk_');
  
  if (!isGroq) {
    // Gemini Implementation
    const model = getGeminiModel(apiKey, 'gemini-2.0-flash-lite');

    // The system prompt goes in once. parseChatHistoryToMessages already emits it
    // as the leading message, and this branch used to *also* prepend it as a
    // "SYSTEM INSTRUCTION:" turn -- roughly 1.5KB of duplicate prefill on every
    // request.
    const messages = parseChatHistoryToMessages(systemPrompt, chatHistory);
    const geminiMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const start = performance.now();
    let sawFirstChunk = false;

    try {
      const result = await model.generateContentStream({
        contents: geminiMessages,
        systemInstruction: systemPrompt
          ? { role: 'system', parts: [{ text: systemPrompt }] }
          : undefined,
        // The Groq branch has always capped at 150; this one was uncapped, so a
        // rambling reply could stream well past what the prompt asks for.
        generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
      });

      let fullText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText && !sawFirstChunk) {
          sawFirstChunk = true;
          const ttft = performance.now() - start;
          record('llm.provider_ttft.gemini', ttft);
          logger.info(`[LATENCY TIMER] Gemini First Chunk received in ${ttft.toFixed(1)}ms`);
        }
        fullText += chunkText;
        if (onChunk) onChunk(chunkText);
      }
      record('llm.provider_total.gemini', performance.now() - start);
      return fullText;
    } catch (error) {
      logger.error('Gemini conversational stream error', error);
      throw error;
    }
  }

  // Groq Implementation
  const start = performance.now();
  logger.info(`[LATENCY TIMER] Groq Stream Query started (Model: ${REALTIME_LLM_MODEL})`);

  try {
    const messages = parseChatHistoryToMessages(systemPrompt, chatHistory);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      agent: httpsAgent,
      signal: signal || undefined,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: REALTIME_LLM_MODEL,
        messages: messages,
        stream: true,
        max_tokens: 150,
        temperature: 0.7,
        reasoning_effort: REALTIME_REASONING_EFFORT
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Groq API Error Response:', errorText);
      const err = new Error(`Groq API Error: ${response.status} - ${errorText}`);
      // Tagged so callers can tell a transient rate limit apart from a real
      // failure: the first costs a short wait, the second costs the turn.
      err.status = response.status;
      err.retryAfterMs = response.status === 429 ? parseRetryAfterMs(errorText) : null;
      throw err;
    }

    return new Promise((resolve, reject) => {
      let fullText = '';
      let isFirstChunk = true;
      let buffer = '';

      const onAbort = () => {
        response.body.destroy();
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }

      response.body.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const cleanedLine = line.trim();
          if (!cleanedLine) continue;
          if (cleanedLine === 'data: [DONE]') continue;

          if (cleanedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(cleanedLine.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                if (isFirstChunk) {
                  isFirstChunk = false;
                  const firstChunkDuration = performance.now() - start;
                  record('llm.provider_ttft.groq', firstChunkDuration);
                  logger.info(`[LATENCY TIMER] Groq First Chunk received in ${firstChunkDuration.toFixed(1)}ms!`);
                }
                fullText += content;
                if (onChunk) onChunk(content);
              }
            } catch (e) {}
          }
        }
      });

      response.body.on('end', () => {
        // Process remaining buffer
        if (buffer.startsWith('data: ')) {
          try {
            const data = JSON.parse(buffer.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              if (onChunk) onChunk(content);
            }
          } catch (e) {}
        }
        const totalDuration = performance.now() - start;
        record('llm.provider_total.groq', totalDuration);
        logger.info(`[LATENCY TIMER] Groq full stream complete in ${totalDuration.toFixed(1)}ms [Length: ${fullText.length}]`);
        resolve(fullText.trim());
      });

      response.body.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    logger.error('Groq conversational stream error', error);
    throw error;
  }
};

/**
 * One conversational turn, retried once if the provider says to.
 *
 * Groq's free tier caps input tokens per minute, and speculative prefill spends
 * roughly three full-context requests per turn, so a brisk conversation reaches
 * the ceiling. The 429 body names the wait precisely -- usually under a second --
 * and without this retry the whole turn was lost: the caller logged the error,
 * swallowed it, and the user got silence with no explanation.
 *
 * Only retried when the provider both asked for it and named a short wait. An
 * aborted request is never retried: something newer has superseded it.
 */
export const generateConversationalResponseStream = async (
  systemPrompt, chatHistory, onChunk, llmApiKey = null, signal = null, onRateLimit = null
) => {
  try {
    return await generateConversationalResponseStreamOnce(
      systemPrompt, chatHistory, onChunk, llmApiKey, signal
    );
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) throw err;
    if (err?.status !== 429) throw err;
    // Even one we cannot wait out is a signal to stop spending tokens we do not
    // have, so the callback fires before the decision not to retry.
    if (!err.retryAfterMs) { onRateLimit?.(err); throw err; }

    count('llm.rate_limited');
    logger.warn(`Provider rate limited; retrying once in ${err.retryAfterMs}ms`);
    onRateLimit?.(err);
    await new Promise((resolve) => setTimeout(resolve, err.retryAfterMs));
    if (signal?.aborted) {
      const aborted = new Error('aborted');
      aborted.name = 'AbortError';
      throw aborted;
    }

    const result = await generateConversationalResponseStreamOnce(
      systemPrompt, chatHistory, onChunk, llmApiKey, signal
    );
    count('llm.rate_limit_recovered');
    return result;
  }
};

export const transcribeAudio = async (audioBuffer) => {
  try {
    logger.debug('Gemini configuration: Transcription mode active');
    return "Transcription is captured in real-time during the call via Twilio speech recognition";
  } catch (error) {
    logger.error('Transcription error', error);
    throw error;
  }
};

const MAX_ANALYSIS_TOKENS = 640;

/**
 * Analysis is batch work, so it can wait where a live turn cannot.
 *
 * It runs at the END of a call, by which point the conversation has already
 * spent the minute's token budget -- which made the single most valuable output
 * of the whole system the one most likely to be starved by a rate limit. A live
 * turn can only afford ~2s of silence; nobody is listening to this one, so it
 * backs off properly and gets the answer.
 */
const ANALYSIS_RETRIES = 3;
const ANALYSIS_BACKOFF_MS = [4000, 12000, 25000];

export const callGroqChatCompletion = async (messages, modelName = ANALYSIS_LLM_MODEL) => {
  let lastError = null;

  for (let attempt = 0; attempt <= ANALYSIS_RETRIES; attempt++) {
    try {
      return await callGroqChatCompletionOnce(messages, modelName);
    } catch (err) {
      lastError = err;
      const rateLimited = err?.status === 429 || /rate.?limit/i.test(err?.message || '');
      // A per-day cap does not clear in twenty-five seconds. Waiting it out just
      // delays the same failure and holds the session open while doing it, so a
      // daily limit fails immediately and visibly instead.
      const dailyCap = /per day|\bTPD\b|tokens per day/i.test(err?.message || '');
      if (dailyCap) {
        count('analysis.daily_quota_exhausted');
        logger.error('Provider daily token quota is exhausted; analysis cannot run until it resets');
        throw err;
      }
      if (!rateLimited || attempt === ANALYSIS_RETRIES) throw err;

      const wait = ANALYSIS_BACKOFF_MS[attempt];
      count('analysis.rate_limited');
      logger.warn(`Analysis rate limited; retrying in ${wait / 1000}s (attempt ${attempt + 1}/${ANALYSIS_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  throw lastError;
};

const callGroqChatCompletionOnce = async (messages, modelName = ANALYSIS_LLM_MODEL) => {
  // 1024 exactly hit Groq's free-tier output ceiling (OTPM 1000), so any request
  // that asked for the maximum was rejected outright before generating a token.
  // The analyses here return a small JSON object; 640 is comfortably above what
  // any of them produce and comfortably under the cap.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured in environment");
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: 0.2,
      max_tokens: MAX_ANALYSIS_TOKENS,
      reasoning_effort: 'none'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`Groq Chat API Error [${response.status}]:`, errorText);
    const err = new Error(`Groq API Error: ${response.status} - ${errorText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
};

export const generateSummary = async (text) => {
  try {
    const messages = [
      { role: 'user', content: `You are a helpful assistant that summarizes call transcripts and extracts key insights. Please summarize this call transcript and extract key insights: ${text}` }
    ];
    return await callGroqChatCompletion(messages, ANALYSIS_LLM_MODEL);
  } catch (error) {
    logger.error('Summary generation error via Groq', error);
    throw error;
  }
};

/**
 * Extract structured answers from transcript
 */
export const extractAnswersJSON = async (chatHistory, questions) => {
  try {
    const prompt = `You are a data extraction assistant. Based on this phone call transcript, extract the user's answers to the following questions.
    
    --- TRANSCRIPT ---
    ${chatHistory}
    
    --- QUESTIONS ---
    ${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
    
    Return a strictly valid JSON object where the keys are the exact questions as strings, and the values are the user's extracted answers. If a question was not answered or wasn't reached, set the value to "Not answered". Do NOT include Markdown blocks like \`\`\`json. Return only the raw JSON string.`;

    const messages = [{ role: 'user', content: prompt }];
    let responseText = await callGroqChatCompletion(messages, ANALYSIS_LLM_MODEL);

    // Strip markdown formatting if LLM included it despite instructions
    responseText = responseText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    return JSON.parse(responseText);
  } catch (error) {
    logger.error('Data extraction error via Groq (JSON parsing or API issue)', error);
    return {};
  }
};

/**
 * Evaluate loan application based on responses
 */
export const evaluateLoanApplication = async (applicationData) => {
  const prompt = `
Loan Application Evaluation for Indian Market:
Applicant Profile: ${JSON.stringify(applicationData, null, 2)}

Decisioning Criteria:
1. Age: >=18 years
2. Minimum monthly income: 25,000
3. CIBIL Score: Above 600
4. Loan-to-income ratio: Max 4x annual income

Based on the above criteria, respond with exactly one of these three options:
YES (if application meets all criteria)
NO (if application clearly fails criteria)
INVESTIGATION_REQUIRED (if more information needed)

You are a loan decisioning expert. Respond only with YES, NO, or INVESTIGATION_REQUIRED.
`;

  try {
    const messages = [{ role: 'user', content: prompt }];
    return await callGroqChatCompletion(messages, ANALYSIS_LLM_MODEL);
  } catch (error) {
    logger.error('Loan evaluation error via Groq', error);
    return "INVESTIGATION_REQUIRED";
  }
};

/**
 * Analyze customer response using Gemini AI
 */
export const evaluateCreditCardApplication = async (applicationData) => {
  const prompt = `
Credit Card Application Evaluation for Indian Market:
Applicant Profile: ${JSON.stringify(applicationData, null, 2)}

Decisioning Criteria:
1. Age: 18-60 years range
2. Minimum annual income: 3,00,000
3. CIBIL Score: Above 700
4. No recent payment defaults
5. Stable employment

Based on the above criteria, respond with exactly one of these three options:
YES (if application meets all criteria)
NO (if application clearly fails criteria)
INVESTIGATION_REQUIRED (if more information needed)

You are a credit card decisioning expert. Respond only with YES, NO, or INVESTIGATION_REQUIRED.
`;

  try {
    const messages = [{ role: 'user', content: prompt }];
    return await callGroqChatCompletion(messages, ANALYSIS_LLM_MODEL);
  } catch (error) {
    logger.error('Credit card evaluation error via Groq', error);
    return "INVESTIGATION_REQUIRED";
  }
};

/**
 * Analyze customer response using Gemini AI
 */
export const analyzeResponseWithGemini = async (prompt) => {
  try {
    const messages = [{ role: 'user', content: prompt }];
    return await callGroqChatCompletion(messages, ANALYSIS_LLM_MODEL);
  } catch (error) {
    logger.error('Groq analysis error', error);
    throw error;
  }
};

/**
 * Generate predefined questions for loan applications
 */
export const generateLoanQuestions = () => {
  return [
    "What is your current age?",
    "What is your monthly income in Indian Rupees?",
    "Are you a salaried employee, self-employed, or a business owner?",
    "In which city and state do you currently reside?",
    "What is your current occupation and industry?",
    "How much loan amount are you seeking in Indian Rupees?",
    "Do you have a CIBIL credit score?",
    "Are you a first-time loan applicant?",
    "Do you have any existing EMIs or loan commitments?",
    "What is the primary purpose of this loan?"
  ];
};

/**
 * Generate predefined questions for credit card applications
 */
export const generateCreditCardQuestions = () => {
  return [
    "What is your current age?",
    "What is your annual income in Indian Rupees?",
    "Are you employed in private sector, government, or self-employed?",
    "In which city do you currently work?",
    "Do you have any existing credit cards?",
    "What is your CIBIL credit score?",
    "Have you ever defaulted on any credit or loan payment?",
    "What is your typical monthly household expenditure?",
    "Do you have any existing loan EMIs?",
    "Are you a first-time credit card applicant?"
  ];
};

/**
 * Perform Industry-Grade Deep Analysis on call transcript
 */
/**
 * Outcomes a collections call can end in. Mirrors the `Outcome` union in
 * frontend/src/lib/collections.ts -- one vocabulary, both ends.
 */
export const COLLECTION_OUTCOMES = [
  'promise_to_pay', 'partial_promise', 'dispute', 'hardship',
  'callback', 'refused', 'wrong_number', 'no_answer',
];

/** Why the borrower has not paid. The thing a disposition code never tells you. */
export const NON_PAYMENT_REASONS = [
  'job_loss', 'medical', 'business_loss', 'dispute',
  'forgot', 'travelling', 'salary_delayed', 'other',
];

/**
 * Read a collections call and extract what it actually produced.
 *
 * This replaces a sales analysis -- intent tier, objections drawn from
 * Price/Timing/Trust/Authority/Competition, "did they schedule a site visit" --
 * which described a lead rather than a debt. A collections call has one job: find
 * out when the money is coming and why it has not. The fields below are what a
 * collections desk works from the next morning.
 *
 * `promisedOn` is resolved to an absolute date here rather than stored as
 * "next Tuesday", because it will be read days later when "next Tuesday" no
 * longer means anything.
 */
export const performDeepAnalysis = async (
  chatHistory, agentType, customerName, agentGoal, questions, options = {}
) => {
  const today = options.today || new Date().toISOString().slice(0, 10);
  const amountDue = options.amountDue ?? null;

  const prompt = `
You are analysing a debt collection call between an automated agent and a borrower named ${customerName}. The call may be in Hindi, Tamil, Telugu, Marathi, Bengali or English. Read it in whatever language it is in.

TODAY'S DATE: ${today}
${amountDue !== null ? `AMOUNT DUE: ${amountDue}` : ''}

TRANSCRIPT:
${chatHistory}

QUESTIONS THE AGENT WAS MEANT TO ASK:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return strictly valid JSON, no markdown:
{
  "outcome": one of ${JSON.stringify(COLLECTION_OUTCOMES)},
  "promisedOn": "YYYY-MM-DD or null",
  "promisedAmount": number or null,
  "reason": one of ${JSON.stringify(NON_PAYMENT_REASONS)} or null,
  "rightPartyContact": true | false,
  "escalate": true | false,
  "escalateReason": "one short line, or null",
  "borrowerQuote": "the borrower's own most informative sentence, verbatim, in the language they said it",
  "sentiment": "Cooperative" | "Anxious" | "Annoyed" | "Confused" | "Neutral",
  "summary": "two sentences for the collections desk",
  "stageAnalysis": {
    "questionsReached": number,
    "dropOffPoint": "the question where the call stalled, or null"
  }
}

Rules:
1. "promise_to_pay" only when they commit to paying the FULL amount and give a time. "partial_promise" when they commit to part of it. A vague "I'll try" is NOT a promise -- that is "callback" or "refused" depending on tone.
2. Resolve every date against TODAY'S DATE. "Next week" and "अगले हफ्ते" become an actual YYYY-MM-DD. If they named no time, promisedOn is null even when outcome is a promise.
3. "wrong_number" when the person says they are not the borrower and do not know them. If someone else answered but knows the borrower, that is "callback".
4. "rightPartyContact" is true only if the borrower confirmed their identity. Default false when unclear -- getting this wrong is a compliance problem, not a data problem.
5. "escalate" is true for: hardship, a disputed amount, a request to stop calling, any mention of legal action, or an abusive or distressed caller. When in doubt, escalate.
6. "hardship" outranks the others. If they mention lost work, illness or a family emergency, the outcome is "hardship" even if they also promised something.
7. "borrowerQuote" must be the borrower's words, not the agent's, and not translated.
8. Return ONLY raw JSON. No markdown code fences.
`;

  try {
    const messages = [{ role: 'user', content: prompt }];
    let responseText = await callGroqChatCompletion(messages, ANALYSIS_LLM_MODEL);
    responseText = responseText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    const parsed = JSON.parse(responseText);

    // The model is asked for a closed set; hold it to one rather than letting an
    // invented outcome reach the database and the UI's colour mapping.
    if (!COLLECTION_OUTCOMES.includes(parsed.outcome)) {
      logger.warn(`Analysis returned an unknown outcome "${parsed.outcome}"; recording as no_answer`);
      count('analysis.unknown_outcome');
      parsed.outcome = 'no_answer';
    }
    if (parsed.reason && !NON_PAYMENT_REASONS.includes(parsed.reason)) parsed.reason = 'other';
    if (parsed.promisedOn && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.promisedOn)) parsed.promisedOn = null;
    // Hardship and disputes are escalations whatever the model decided.
    if (parsed.outcome === 'hardship' || parsed.outcome === 'dispute') parsed.escalate = true;

    return parsed;
  } catch (error) {
    logger.error('Collections analysis failed', error);
    count('analysis.failed');
    return {
      outcome: 'no_answer',
      promisedOn: null,
      promisedAmount: null,
      reason: null,
      rightPartyContact: false,
      escalate: true,
      escalateReason: 'Analysis failed; a person should read this call.',
      borrowerQuote: null,
      sentiment: 'Neutral',
      summary: 'Analysis failed due to a technical error.',
      stageAnalysis: { questionsReached: 0, dropOffPoint: null },
    };
  }
};

/**
 * Specialized evaluations for different industry categories
 */

const evaluateRealEstateCall = async (data, transcript = "") => {
  const prompt = `
  Analyze this Real Estate lead profile: ${JSON.stringify(data, null, 2)}
  Context Transcript: ${transcript.substring(transcript.length - 1000)}

  Evaluate if the lead is a fit for a property viewing.
  Criteria:
  1. Have they specified an interest in property?
  2. Have they agreed to a follow-up or site visit?

  Provide decision: 
  YES (If they agreed to site visit or confirmed high intent)
  INTERESTED (If they asked questions but didn't confirm visit yet)
  NO (Invalid number, wrong person, or clearly not interested)

  Return ONLY the status string.
  `;
  return await analyzeResponseWithGemini(prompt);
};

const evaluateMedicalCall = async (data) => {
  const prompt = `
  Analyze this Medical Patient inquiry: ${JSON.stringify(data, null, 2)}
  Identify: Urgency, Specific symptoms mentioned, and Appointment availability.
  Provide decision: URGENT (Needs immediate callback), BOOKED (Appointment set), GENERAL_INQUIRY.
  Return ONLY the status.
  `;
  return await analyzeResponseWithGemini(prompt);
};

const evaluateEcomCall = async (data) => {
  const prompt = `
  Analyze this E-commerce customer interaction: ${JSON.stringify(data, null, 2)}
  Identify: Purchase intent, Product interest, or Feedback.
  Provide decision: PURCHASED, ABANDONED_CART (High intent but no buy), FEEDBACK_RECEIVED.
  Return ONLY the status.
  `;
  return await analyzeResponseWithGemini(prompt);
};

const evaluateSalesCall = async (data) => {
  const prompt = `
  Analyze this B2B/Startup Sales lead: ${JSON.stringify(data, null, 2)}
  Use BANT (Budget, Authority, Need, Timeline) framework.
  Provide decision: QUALIFIED (High intent), NURTURE (Needs more info), UNQUALIFIED.
  Return ONLY the status.
  `;
  return await analyzeResponseWithGemini(prompt);
};

/**
 * Evaluate application based on type and category
 */
export const evaluateApplication = async (applicationType, applicationData, category = 'startup', transcript = "") => {
  if (!applicationType || applicationType === 'custom') {
    switch (category) {
      case 'real_estate': return await evaluateRealEstateCall(applicationData, transcript);
      case 'medical': return await evaluateMedicalCall(applicationData);
      case 'ecommerce': return await evaluateEcomCall(applicationData);
      case 'startup': return await evaluateSalesCall(applicationData);
      default:
        const responses = Object.values(applicationData);
        const positiveKeywords = ['yes', 'yeah', 'sure', 'definitely', 'absolutely', 'interested', 'need', 'want', 'helpful', 'great', 'good'];
        const negativeKeywords = ['no', 'not', 'never', 'don\'t', 'won\'t', 'can\'t'];

        let positiveCount = 0;
        let negativeCount = 0;

        responses.forEach(response => {
          const lowerResponse = String(response).toLowerCase();
          if (positiveKeywords.some(word => lowerResponse.includes(word))) positiveCount++;
          if (negativeKeywords.some(word => lowerResponse.includes(word))) negativeCount++;
        });

        if (positiveCount > negativeCount && positiveCount > 0) return 'YES';
        if (negativeCount > positiveCount) return 'NO';
        return 'MAYBE';
    }
  }

  if (applicationType === 'loan') return await evaluateLoanApplication(applicationData);
  if (applicationType === 'credit_card') return await evaluateCreditCardApplication(applicationData);
  
  return 'INVESTIGATION_REQUIRED';
};

export default genAI;