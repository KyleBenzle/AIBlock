import { createProvider } from '../providers';
import type { Provider } from '../providers/types';
import { SENSITIVE_HOSTS } from '../messages';
import { hostInList } from '../storage/settings';
import type { ClassifyResult, Settings } from '../types';

type Area = { get(k: string): Promise<Record<string, any>>; set(i: Record<string, unknown>): Promise<void> };
type CacheEntry = { s: number; i: boolean; r: string; t: number };
export type Usage = { day: string; requests: number; tokens: number };

const CACHE_KEY = 'aiCache';
const USAGE_KEY = 'aiUsage';
const CACHE_MAX = 2000;

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

export async function getUsage(area: Area, now = Date.now()): Promise<Usage> {
  const u = (await area.get(USAGE_KEY))[USAGE_KEY] as Usage | undefined;
  return u && u.day === today(now) ? u : { day: today(now), requests: 0, tokens: 0 };
}

export class AiService {
  private minute: number[] = [];
  private inflight = new Map<string, Promise<ClassifyResult>>();

  constructor(
    private deps: {
      area: Area;
      getKey: (provider: string) => Promise<string | undefined>;
      now?: () => number;
      makeProvider?: (s: Settings, key?: string) => Provider;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  async classify(settings: Settings, rawText: string, host: string): Promise<ClassifyResult> {
    const ai = settings.ai;
    if (!ai.enabled || !ai.consent) return { ok: false, error: 'AI detection disabled or consent not given' };
    if (!ai.categories.text) return { ok: false, error: 'Text classification disabled' };
    if (typeof rawText !== 'string' || typeof host !== 'string') return { ok: false, error: 'Bad request' };
    if (hostInList(host, SENSITIVE_HOSTS)) return { ok: false, error: 'Sensitive site excluded' };
    const text = rawText.replace(/\s+/g, ' ').trim().slice(0, ai.maxCharsPerItem);
    if (text.length < Math.min(ai.minTextLength, 50)) return { ok: false, error: 'Text too short' };
    const hash = await sha256(`${ai.provider}|${ai.model}|${text}`);
    const pending = this.inflight.get(hash);
    if (pending) return pending;
    const p = this.run(settings, text, hash).finally(() => this.inflight.delete(hash));
    this.inflight.set(hash, p);
    return p;
  }

  private async run(settings: Settings, text: string, hash: string): Promise<ClassifyResult> {
    const ai = settings.ai;
    const now = this.now();
    const cache: Record<string, CacheEntry> = (await this.deps.area.get(CACHE_KEY))[CACHE_KEY] ?? {};
    const hit = cache[hash];
    if (hit && now - hit.t < ai.cacheDays * 864e5) return { ok: true, evidence: this.toEvidence(settings, hit) };

    this.minute = this.minute.filter((t) => now - t < 60_000);
    if (this.minute.length >= ai.maxRequestsPerMinute) return { ok: false, error: 'Rate limit (per minute)' };
    const usage = await getUsage(this.deps.area, now);
    if (usage.requests >= ai.maxRequestsPerDay) return { ok: false, error: 'Daily request limit reached' };
    const estimate = Math.ceil(text.length / 4) + 250;
    if (usage.tokens + estimate > ai.dailyTokenBudget) return { ok: false, error: 'Daily token budget reached' };

    this.minute.push(now);
    const key = await this.deps.getKey(ai.provider);
    if (!key && ai.provider !== 'ollama' && ai.provider !== 'openai-compatible') return { ok: false, error: 'API key missing' };
    const provider = this.deps.makeProvider?.(settings, key) ?? createProvider({ ...ai, apiKey: key });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const { classification, tokens } = await provider.classifyText(text, ctrl.signal);
      usage.requests++;
      usage.tokens += tokens || estimate;
      const entry: CacheEntry = { s: classification.score, i: classification.inconclusive, r: classification.reasoning, t: now };
      const fresh = (await this.deps.area.get(CACHE_KEY))[CACHE_KEY] ?? {};
      fresh[hash] = entry;
      const keys = Object.keys(fresh);
      if (keys.length > CACHE_MAX) {
        keys.sort((a, b) => fresh[a].t - fresh[b].t).slice(0, keys.length - CACHE_MAX).forEach((k) => delete fresh[k]);
      }
      await this.deps.area.set({ [USAGE_KEY]: usage, [CACHE_KEY]: fresh });
      return { ok: true, evidence: this.toEvidence(settings, entry) };
    } catch (e) {
      usage.requests++;
      await this.deps.area.set({ [USAGE_KEY]: usage });
      return { ok: false, error: e instanceof Error ? e.message : 'Provider error' };
    } finally {
      clearTimeout(timer);
    }
  }

  private toEvidence(s: Settings, c: CacheEntry) {
    if (c.i) return null; // inconclusive results are not evidence
    return {
      source: 'ai-provider',
      type: s.ai.provider,
      score: c.s,
      reason: `AI classifier (${s.ai.model}) scored ${c.s}${c.r ? ': ' + c.r : ''}`,
    };
  }
}
