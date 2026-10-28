import { CATEGORIES, type Category, type Rule, type Sensitivity, type Settings } from '../types';
import { validateRule } from '../core/rule-engine';

export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 3,
  categories: { text: true, image: true, video: true, audio: true, advertisement: true, search: true },
  removalMode: 'hide',
  siteMode: 'all',
  allowlist: [],
  blocklist: [],
  siteOverrides: {},
  methods: { labels: true, rules: true, metadata: true, urls: true, heuristics: true },
  disabledRules: [],
  userRules: [],
  falsePositives: [],
  theme: 'system',
  googleWebOnly: false,
  ai: {
    enabled: false,
    consent: false,
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    categories: { text: true },
    maxRequestsPerMinute: 10,
    maxRequestsPerDay: 200,
    maxCharsPerItem: 2000,
    dailyTokenBudget: 100000,
    costPerMillionTokens: 0.15,
    cacheDays: 7,
    minTextLength: 400,
  },
};

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const strArr = (v: unknown, max = 1000): string[] =>
  Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.length < 500).slice(0, max) : [];
const num = (v: unknown, def: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const isSens = (v: unknown): v is Sensitivity => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;

function cats(v: unknown, def: Partial<Record<Category, boolean>>): Partial<Record<Category, boolean>> {
  const out: Partial<Record<Category, boolean>> = {};
  for (const c of CATEGORIES) {
    if (isObj(v) && typeof v[c] === 'boolean') out[c] = v[c];
    else if (def[c] !== undefined) out[c] = def[c];
  }
  return out;
}

/** Validates untrusted settings data (storage, imports) and fills defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const r = isObj(raw) ? raw : {};
  const ai = isObj(r.ai) ? r.ai : {};
  const overrides: Settings['siteOverrides'] = {};
  if (isObj(r.siteOverrides)) {
    for (const [host, o] of Object.entries(r.siteOverrides).slice(0, 1000)) {
      if (!isObj(o)) continue;
      overrides[normalizeHost(host)] = {
        ...(isSens(o.sensitivity) ? { sensitivity: o.sensitivity } : {}),
        ...(isObj(o.categories) ? { categories: cats(o.categories, {}) } : {}),
      };
    }
  }
  const userRules: Rule[] = Array.isArray(r.userRules)
    ? r.userRules.map((x: unknown) => validateRule(x)).filter((x: Rule | null): x is Rule => !!x).slice(0, 500)
    : [];
  return {
    enabled: bool(r.enabled, d.enabled),
    sensitivity: isSens(r.sensitivity) ? r.sensitivity : d.sensitivity,
    categories: cats(r.categories, d.categories) as Record<Category, boolean>,
    removalMode: r.removalMode === 'placeholder' ? 'placeholder' : 'hide',
    siteMode: r.siteMode === 'listedOnly' ? 'listedOnly' : 'all',
    allowlist: strArr(r.allowlist).map(normalizeHost),
    blocklist: strArr(r.blocklist).map(normalizeHost),
    siteOverrides: overrides,
    methods: {
      labels: bool(r.methods?.labels, true),
      rules: bool(r.methods?.rules, true),
      metadata: bool(r.methods?.metadata, true),
      urls: bool(r.methods?.urls, true),
      heuristics: bool(r.methods?.heuristics, true),
    },
    disabledRules: strArr(r.disabledRules),
    userRules,
    falsePositives: strArr(r.falsePositives, 5000),
    googleWebOnly: bool(r.googleWebOnly, false),
    theme: r.theme === 'light' || r.theme === 'dark' ? r.theme : 'system',
    ai: {
      enabled: bool(ai.enabled, false),
      consent: bool(ai.consent, false),
      provider: ['openai', 'xai', 'openai-compatible', 'ollama'].includes(ai.provider) ? ai.provider : d.ai.provider,
      endpoint: typeof ai.endpoint === 'string' && ai.endpoint.length < 500 ? ai.endpoint : d.ai.endpoint,
      model: typeof ai.model === 'string' && ai.model.length < 200 ? ai.model : d.ai.model,
      categories: cats(ai.categories, d.ai.categories),
      maxRequestsPerMinute: num(ai.maxRequestsPerMinute, d.ai.maxRequestsPerMinute, 1, 600),
      maxRequestsPerDay: num(ai.maxRequestsPerDay, d.ai.maxRequestsPerDay, 1, 100000),
      maxCharsPerItem: num(ai.maxCharsPerItem, d.ai.maxCharsPerItem, 200, 20000),
      dailyTokenBudget: num(ai.dailyTokenBudget, d.ai.dailyTokenBudget, 1000, 100_000_000),
      costPerMillionTokens: num(ai.costPerMillionTokens, d.ai.costPerMillionTokens, 0, 1000),
      cacheDays: num(ai.cacheDays, d.ai.cacheDays, 0, 90),
      minTextLength: num(ai.minTextLength, d.ai.minTextLength, 50, 10000),
    },
  };
}

export function normalizeHost(h: string): string {
  return h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

/** True if host equals or is a subdomain of an entry in list. */
export function hostInList(host: string, list: string[]): boolean {
  const h = normalizeHost(host);
  return list.some((e) => {
    const n = normalizeHost(e);
    return !!n && (h === n || h.endsWith('.' + n));
  });
}

export type EffectiveSettings = Settings & { active: boolean };

/** Resolves global settings plus site lists/overrides for one host. */
export function effectiveSettings(s: Settings, host: string): EffectiveSettings {
  const h = normalizeHost(host);
  let active = s.enabled && !hostInList(h, s.allowlist);
  if (s.siteMode === 'listedOnly' && !hostInList(h, s.blocklist)) active = false;
  const key = Object.keys(s.siteOverrides).find((k) => h === k || h.endsWith('.' + k));
  const o = key ? s.siteOverrides[key] : undefined;
  return {
    ...s,
    active,
    sensitivity: o?.sensitivity ?? s.sensitivity,
    categories: { ...s.categories, ...(o?.categories ?? {}) },
  };
}

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export async function loadSettings(area: StorageArea): Promise<Settings> {
  const r = await area.get(SETTINGS_KEY);
  return sanitizeSettings(r[SETTINGS_KEY]);
}

export async function saveSettings(area: StorageArea, s: Settings): Promise<void> {
  await area.set({ [SETTINGS_KEY]: sanitizeSettings(s) });
}

export async function updateSettings(area: StorageArea, fn: (s: Settings) => Settings | void): Promise<Settings> {
  const cur = await loadSettings(area);
  const next = fn(cur) ?? cur;
  await saveSettings(area, next);
  return next;
}
