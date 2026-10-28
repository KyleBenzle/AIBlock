export const CATEGORIES = ['text', 'image', 'video', 'audio', 'advertisement', 'search'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  text: 'Text',
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
  advertisement: 'AI Ads',
  search: 'Search AI answers',
};

/** 1 Labeled Only, 2 Low, 3 Balanced, 4 High, 5 Maximum */
export type Sensitivity = 1 | 2 | 3 | 4 | 5;

export const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  1: 'Labeled Only',
  2: 'Low',
  3: 'Balanced',
  4: 'High',
  5: 'Maximum',
};

export type Evidence = {
  source: string; // detector id; evidence from the same source is treated as correlated
  type: string;
  score: number; // 0–100 engineering suspicion score, NOT a calibrated probability
  reason: string;
  /** Explicit, trusted AI label or generator signature. Required for "Labeled Only". */
  explicit?: boolean;
};

export type Detection = {
  category: Category;
  evidence: Evidence[];
  score: number;
  inconclusive: boolean;
};

export type Rule = {
  id: string;
  domains: string[]; // e.g. "google.*", "*.example.com", "example.com"; empty = all sites
  category: Category;
  selector: string;
  /** Optional regex (case-insensitive) the matched element's own short text must satisfy. */
  textPattern?: string;
  score: number;
  reason: string;
  enabled: boolean;
  /** Selector passed to closest() to pick the element that gets removed. */
  removalTarget?: string;
  /** Marks a rule that matches a visible, explicit AI label. */
  explicit?: boolean;
};

export type RemovalMode = 'hide' | 'placeholder';

export type SiteOverride = {
  sensitivity?: Sensitivity;
  categories?: Partial<Record<Category, boolean>>;
};

export type ProviderKind = 'openai' | 'xai' | 'openai-compatible' | 'ollama';

export type AiSettings = {
  enabled: boolean;
  consent: boolean;
  provider: ProviderKind;
  endpoint: string;
  model: string;
  categories: Partial<Record<Category, boolean>>; // currently only text is implemented
  maxRequestsPerMinute: number;
  maxRequestsPerDay: number;
  maxCharsPerItem: number;
  dailyTokenBudget: number;
  costPerMillionTokens: number; // user-provided, for estimates
  cacheDays: number;
  minTextLength: number;
};

export type DetectionMethods = {
  labels: boolean;
  rules: boolean;
  metadata: boolean;
  urls: boolean;
  heuristics: boolean;
};

export type Settings = {
  enabled: boolean;
  sensitivity: Sensitivity;
  categories: Record<Category, boolean>;
  removalMode: RemovalMode;
  siteMode: 'all' | 'listedOnly';
  allowlist: string[]; // never filter
  blocklist: string[]; // filter only these when siteMode = listedOnly
  siteOverrides: Record<string, SiteOverride>;
  methods: DetectionMethods;
  disabledRules: string[];
  userRules: Rule[];
  falsePositives: string[]; // fingerprints marked "not AI" by the user
  theme: 'system' | 'light' | 'dark';
  /** Redirect Google searches to the Web-only results view (udm=14), which has no AI Overview. */
  googleWebOnly: boolean;
  ai: AiSettings;
};

export type BlockedRecord = {
  time: number;
  host: string;
  category: Category;
  score: number;
  reasons: string[];
  snippet: string;
};

export type ClassifyResult = { ok: true; evidence: Evidence | null } | { ok: false; error: string };
