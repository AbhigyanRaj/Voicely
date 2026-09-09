import https from 'https';
import http from 'http';
import { URL } from 'url';
import { snapshot } from './latencyMetrics.js';

// Below this, the p50 is too noisy to quote as a real number.
const MIN_SAMPLES_FOR_MEASURED = 5;

/**
 * Perform a real-time network latency test to a provider's domain.
 * This measures the actual TCP/TLS handshake time from the backend server to the provider.
 * @param {string} domain 
 * @returns {Promise<number>} latency in ms
 */
const measureNetworkLatency = (domain) => {
  return new Promise((resolve) => {
    const start = Date.now();
    const parsedUrl = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
    const protocol = parsedUrl.protocol === 'http:' ? http : https;
    
    const req = protocol.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      method: 'HEAD',
      timeout: 3000 // 3 seconds timeout
    }, (res) => {
      // Don't wait for data, just the headers is enough to measure latency
      resolve(Date.now() - start);
    });

    req.on('error', () => {
      resolve(Date.now() - start); // If it fails, just return time taken to fail
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(3000);
    });

    req.end();
  });
};

const PROVIDER_DOMAINS = {
  'Deepgram': 'api.deepgram.com',
  'Google': 'speech.googleapis.com',
  'OpenAI': 'api.openai.com',
  'AssemblyAI': 'api.assemblyai.com',
  'Microsoft': 'cognitiveservices.azure.com',
  'Anthropic': 'api.anthropic.com',
  'Meta': 'api.groq.com',
  'Sarvam': 'api.sarvam.ai',
  'ElevenLabs': 'api.elevenlabs.io',
  'PlayHT': 'api.play.ht'
};

/**
 * Latency figure for a pipeline configuration.
 *
 * Prefers what the pipeline has actually done: the measured p50 of
 * `turn.mouth_to_ear` from real sessions. Falls back to a provider-ping estimate
 * only when no turns have been recorded yet.
 *
 * The previous version always returned the estimate -- provider ping RTTs summed
 * with a hardcoded per-model table times a magic 0.6 -- and reported it to users
 * as `actualLatency`, which measured nothing about the pipeline at all.
 *
 * @returns {Promise<{latencyMs: number, source: 'measured'|'estimated', samples: number}>}
 */
export const testPipelineLatency = async (pipelineConfig, optionsList) => {
  const measured = snapshot('turn.mouth_to_ear');
  if (measured && measured.count >= MIN_SAMPLES_FOR_MEASURED) {
    return {
      latencyMs: Math.round(measured.p50),
      source: 'measured',
      samples: measured.count,
      percentiles: {
        p50: measured.p50,
        p95: measured.p95,
        p99: measured.p99,
      },
    };
  }

  const estimate = await estimatePipelineLatency(pipelineConfig, optionsList);
  return { latencyMs: estimate, source: 'estimated', samples: measured?.count ?? 0 };
};

/** Ping-plus-table estimate. Only used before any real turn has been measured. */
const estimatePipelineLatency = async (pipelineConfig, optionsList) => {
  const { sttModel, llmModel, ttsModel } = pipelineConfig;
  
  // Find the selected models from the static options
  const stt = optionsList.stt.find(m => m.id === sttModel);
  const llm = optionsList.llm.find(m => m.id === llmModel);
  const tts = optionsList.tts.find(m => m.id === ttsModel);

  const providersToPing = [stt?.provider, llm?.provider, tts?.provider].filter(Boolean);
  
  let networkLatency = 0;

  // Ping them in parallel
  const pingPromises = providersToPing.map(provider => {
    const domain = PROVIDER_DOMAINS[provider];
    if (domain) {
      return measureNetworkLatency(domain);
    }
    return Promise.resolve(50); // Default network latency if domain unknown
  });

  const latencies = await Promise.all(pingPromises);
  
  // Sum up network latencies
  networkLatency = latencies.reduce((a, b) => a + b, 0);

  // The actual latency is the processing time of the models (baseline) + the real network latency
  // The baseline processing times: STT (~200ms), LLM (~300ms), TTS (~250ms)
  // We'll calculate a dynamic processing time based on the model's reported estimated latency, 
  // replacing the static network assumption with our real measurement.
  
  const estimatedProcessingLatency = (stt?.latency || 300) + (llm?.latency || 400) + (tts?.latency || 300);
  
  // The final real-time tested latency
  const actualLatency = networkLatency + (estimatedProcessingLatency * 0.6); // 60% is processing, 40% was estimated network

  return Math.round(actualLatency);
};
