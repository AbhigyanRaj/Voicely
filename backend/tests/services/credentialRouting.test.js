import { readFileSync } from 'fs';
import path from 'path';

/**
 * A credential must only ever be sent to the vendor it was issued for.
 *
 * The previous implementation resolved each slot with a positional `||` cascade,
 * so on the default pipeline selection a user's Sarvam key was sent to
 * api.cartesia.ai, an OpenAI key could land in a Google URL query string, and an
 * Anthropic key could be sent to api.groq.com as a bearer token.
 *
 * These assertions are deliberately source-level: the resolution happens inside a
 * WebSocket connection handler that is impractical to instantiate, and the
 * property worth protecting is structural.
 */
const source = readFileSync(
  path.resolve('src/websocket/developerStreamServer.js'),
  'utf8'
);

describe('BYOK credential routing', () => {
  it('does not resolve any slot with a cross-vendor fallback chain', () => {
    // e.g. getDecryptedKey('OpenAI') || getDecryptedKey('Google')
    const crossVendorCascade = /getDecryptedKey\(\s*['"][^'"]+['"]\s*\)\s*\|\|\s*getDecryptedKey\(/;
    expect(source).not.toMatch(crossVendorCascade);
  });

  it('routes the LLM credential through the same mapping that picks the endpoint', () => {
    // One helper decides the vendor; both resolution and routing must use it.
    expect(source).toMatch(/const llmProviderFor\s*=/);
    expect(source).toMatch(/llmProviderFor\(developerKey\.pipelineConfig\.llmModel\)/);
    expect(source).toMatch(/const provider = llmProviderFor\(llmModel\)/);
  });

  it('never substitutes the platform Groq key on a non-Groq endpoint', () => {
    // The Groq branch used to read `apiKey || process.env.GROQ_API_KEY`, which
    // meant a request to OpenAI or Google could carry the platform's own key.
    expect(source).not.toMatch(/apiKey \|\| process\.env\.GROQ_API_KEY/);
  });

  it('refuses the session when the selected model has no matching credential', () => {
    expect(source).toMatch(/missing_credential/);
  });

  it('maps each LLM vendor to exactly one credential name', () => {
    const block = source.match(/const LLM_CREDENTIAL_NAME = \{[^}]+\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/openai:\s*'OpenAI'/);
    expect(block[0]).toMatch(/gemini:\s*'Google'/);
    // 'Groq' was collected by the dashboard and never looked up.
    expect(block[0]).toMatch(/groq:\s*'Groq'/);
  });
});
