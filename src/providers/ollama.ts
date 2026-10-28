import { ProviderError, RESPONSE_SCHEMA, SYSTEM_PROMPT, parseClassification, validateEndpoint, type Provider, type ProviderConfig, type ProviderResult } from './types';

export const OLLAMA_DEFAULTS = { endpoint: 'http://localhost:11434', model: 'llama3.2' };

/** Ollama native /api/chat with JSON-schema constrained output. */
export class OllamaProvider implements Provider {
  constructor(private cfg: ProviderConfig, private fetchFn: typeof fetch = (...a) => fetch(...a)) {}

  async classifyText(text: string, signal?: AbortSignal): Promise<ProviderResult> {
    const base = validateEndpoint(this.cfg.endpoint);
    if (!base) throw new ProviderError('Invalid endpoint');
    const res = await this.fetchFn(base.href.replace(/\/+$/, '') + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.cfg.model,
        stream: false,
        format: RESPONSE_SCHEMA,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Passage:\n"""\n${text}\n"""` },
        ],
      }),
      credentials: 'omit',
      signal,
    });
    if (res.status === 403) throw new ProviderError('HTTP 403 — set OLLAMA_ORIGINS=chrome-extension://* on the Ollama server');
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`);
    const data: any = await res.json();
    const classification = parseClassification(data?.message?.content);
    if (!classification) throw new ProviderError('Invalid model response');
    return { classification, tokens: (Number(data?.prompt_eval_count) || 0) + (Number(data?.eval_count) || 0) };
  }
}
