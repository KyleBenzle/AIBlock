import { ProviderError, RESPONSE_SCHEMA, SYSTEM_PROMPT, parseClassification, validateEndpoint, type Provider, type ProviderConfig, type ProviderResult } from './types';

/** OpenAI Chat Completions protocol; also used for xAI and generic compatible servers. */
export class OpenAICompatibleProvider implements Provider {
  constructor(
    private cfg: ProviderConfig,
    private structured: 'json_schema' | 'json_object' = 'json_object',
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  async classifyText(text: string, signal?: AbortSignal): Promise<ProviderResult> {
    const base = validateEndpoint(this.cfg.endpoint);
    if (!base) throw new ProviderError('Invalid endpoint (HTTPS required except localhost)');
    if (!this.cfg.model) throw new ProviderError('Model not configured');
    const url = base.href.replace(/\/+$/, '') + '/chat/completions';
    const body = {
      model: this.cfg.model,
      temperature: 0,
      max_tokens: 150,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Passage:\n"""\n${text}\n"""` },
      ],
      response_format:
        this.structured === 'json_schema'
          ? { type: 'json_schema', json_schema: { name: 'ai_detection', strict: true, schema: RESPONSE_SCHEMA } }
          : { type: 'json_object' },
    };
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {}) },
      body: JSON.stringify(body),
      credentials: 'omit',
      signal,
    });
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`);
    const data: any = await res.json();
    const classification = parseClassification(data?.choices?.[0]?.message?.content);
    if (!classification) throw new ProviderError('Invalid model response');
    const tokens = Number(data?.usage?.total_tokens) || Math.ceil((SYSTEM_PROMPT.length + text.length) / 4) + 60;
    return { classification, tokens };
  }
}
