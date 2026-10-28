import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AiService } from '../src/core/ai-service';
import { createProvider } from '../src/providers';
import { parseClassification, validateEndpoint } from '../src/providers/types';
import { sanitizeSettings } from '../src/storage/settings';

const TEXT = 'Lorem ipsum dolor sit amet. '.repeat(30);
const okResponse = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { total_tokens: 300 } }), { status: 200 });

function service(fetchImpl: typeof fetch) {
  fakeBrowser.reset();
  return new AiService({
    area: fakeBrowser.storage.local as any,
    getKey: async () => 'sk-test',
    makeProvider: (s, key) => createProvider({ ...s.ai, apiKey: key }, fetchImpl),
  });
}
const on = (patch: object = {}) => sanitizeSettings({ ai: { enabled: true, consent: true, ...patch } });

describe('AI providers', () => {
  it('never sends content when disabled or without consent', async () => {
    const f = vi.fn();
    const svc = service(f as any);
    expect((await svc.classify(sanitizeSettings({}), TEXT, 'a.com')).ok).toBe(false);
    expect((await svc.classify(sanitizeSettings({ ai: { enabled: true, consent: false } }), TEXT, 'a.com')).ok).toBe(false);
    expect((await svc.classify(on(), TEXT, 'mail.google.com')).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('returns validated evidence and caches repeated content', async () => {
    const f = vi.fn(async () => okResponse({ category: 'text', ai_score: 80, reasoning: 'generic', inconclusive: false }));
    const svc = service(f as any);
    const r = await svc.classify(on(), TEXT, 'a.com');
    expect(r).toMatchObject({ ok: true, evidence: { source: 'ai-provider', score: 80 } });
    await svc.classify(on(), TEXT, 'a.com');
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as any).Authorization).toBe('Bearer sk-test');
  });

  it('rejects invalid model output and survives provider failures', async () => {
    const svc = service((async () => okResponse({ ai_score: 'high' })) as any);
    expect(await svc.classify(on(), TEXT, 'a.com')).toMatchObject({ ok: false });
    const svc2 = service((async () => new Response('nope', { status: 500 })) as any);
    expect(await svc2.classify(on(), TEXT, 'a.com')).toMatchObject({ ok: false, error: 'HTTP 500' });
    const svc3 = service((async () => { throw new TypeError('network'); }) as any);
    expect(await svc3.classify(on(), TEXT, 'a.com')).toMatchObject({ ok: false });
  });

  it('inconclusive results are not evidence', async () => {
    const svc = service((async () => okResponse({ category: 'text', ai_score: 60, reasoning: '', inconclusive: true })) as any);
    expect(await svc.classify(on(), TEXT, 'a.com')).toEqual({ ok: true, evidence: null });
  });

  it('enforces rate and budget limits', async () => {
    const f = vi.fn(async () => okResponse({ category: 'text', ai_score: 10, reasoning: '', inconclusive: false }));
    const svc = service(f as any);
    const s = on({ maxRequestsPerMinute: 1 });
    await svc.classify(s, TEXT, 'a.com');
    expect(await svc.classify(s, TEXT + ' different', 'a.com')).toMatchObject({ ok: false, error: 'Rate limit (per minute)' });
    const svc2 = service(f as any);
    expect(await svc2.classify(on({ dailyTokenBudget: 1000, maxCharsPerItem: 20000 }), 'x '.repeat(3000), 'a.com')).toMatchObject({ ok: false });
  });

  it('uses Ollama native API', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ message: { content: '{"category":"text","ai_score":40,"reasoning":"","inconclusive":false}' } })));
    const r = await createProvider({ provider: 'ollama', endpoint: 'http://localhost:11434', model: 'llama3.2' }, f as any).classifyText(TEXT);
    expect(r.classification.score).toBe(40);
    expect((f.mock.calls[0] as any)[0]).toBe('http://localhost:11434/api/chat');
  });

  it('validates endpoints and responses', () => {
    expect(validateEndpoint('http://example.com')).toBeNull();
    expect(validateEndpoint('http://localhost:1234/v1')).not.toBeNull();
    expect(validateEndpoint('https://user:pw@x.com')).toBeNull();
    expect(parseClassification('{"ai_score":101,"inconclusive":false}')).toBeNull();
    expect(parseClassification('```json\n{"ai_score":5,"inconclusive":false}\n```')?.score).toBe(5);
  });
});
