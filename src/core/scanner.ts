import type { BlockedRecord, Category, Evidence } from '../types';
import type { EffectiveSettings } from '../storage/settings';
import { evaluate, shouldBlock } from './decision-engine';
import { FilterEngine } from './filter-engine';
import { BUILTIN_RULES, rulesForHost } from './rule-engine';
import { collect } from './detectors/text-scan';
import { ruleDetector } from './detectors/rule-detector';
import { labelDetector } from './detectors/label-detector';
import { urlDetector } from './detectors/url-detector';
import { heuristicDetector } from './detectors/heuristic-detector';
import type { Candidate, ScanContext, ScanInput } from './detectors/types';

export function hashString(s: string): string {
  // FNV-1a 32-bit; used only for local de-duplication/fingerprints, not security.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function fingerprintOf(el: Element, given?: string): string {
  if (given) return 'u:' + hashString(given);
  return 't:' + hashString((el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300));
}

type Pending = { category: Category; evidence: Evidence[]; fingerprint?: string };

/** Runs detectors over DOM subtrees, aggregates evidence per element, decides and filters. */
export class Scanner {
  /** Evidence that arrived asynchronously (metadata, AI provider), kept across rescans. */
  private extra = new WeakMap<Element, Pending>();
  private ctx!: ScanContext;
  onBlocked?: (r: BlockedRecord) => void;
  onShadowRoot?: (r: ShadowRoot) => void;
  onScanned?: (input: ScanInput) => void;

  constructor(
    public engine: FilterEngine,
    private settings: () => EffectiveSettings,
    private host = location.hostname,
  ) {
    this.refresh();
  }

  refresh() {
    const s = this.settings();
    const host = this.host;
    this.ctx = {
      host,
      methods: s.methods,
      rules: s.methods.rules ? rulesForHost(host, [...BUILTIN_RULES, ...s.userRules], s.disabledRules) : [],
    };
  }

  scan(root: Element | Document | ShadowRoot) {
    const s = this.settings();
    if (!s.active) return;
    const input = collect(root);
    const cands: Candidate[] = [];
    const m = this.ctx.methods;
    if (m.rules) cands.push(...ruleDetector(input, this.ctx));
    if (m.labels) cands.push(...labelDetector(input, this.ctx));
    if (m.urls) cands.push(...urlDetector(input, this.ctx));
    if (m.heuristics) cands.push(...heuristicDetector(input, this.ctx));
    const grouped = new Map<Element, Pending>();
    for (const c of cands) {
      const g = grouped.get(c.target);
      if (!g) grouped.set(c.target, { category: c.category, evidence: [c.evidence], fingerprint: c.fingerprint });
      else {
        if (c.evidence.score > Math.max(...g.evidence.map((e) => e.score))) g.category = c.category;
        g.evidence.push(c.evidence);
        g.fingerprint ??= c.fingerprint;
      }
    }
    for (const [el, g] of grouped) this.decide(el, g);
    for (const sr of input.shadowRoots) {
      this.onShadowRoot?.(sr);
      this.scan(sr);
    }
    this.onScanned?.(input);
  }

  /** Adds asynchronous evidence for an element and re-evaluates it. */
  addEvidence(el: Element, category: Category, evidence: Evidence[]) {
    if (!evidence.length) return;
    const cur = this.extra.get(el);
    const merged: Pending = cur
      ? { ...cur, evidence: [...cur.evidence.filter((e) => !evidence.some((n) => n.source === e.source && n.type === e.type)), ...evidence] }
      : { category, evidence };
    this.extra.set(el, merged);
    if (this.settings().active) this.decide(el, { category, evidence: [] });
  }

  private decide(el: Element, g: Pending) {
    const s = this.settings();
    if (this.engine.isBlocked(el) || this.engine.isRevealed(el)) return;
    const extra = this.extra.get(el);
    const evidence = extra ? [...g.evidence, ...extra.evidence] : g.evidence;
    const category = g.evidence.length ? g.category : extra?.category ?? g.category;
    if (!s.categories[category]) return;
    const fp = fingerprintOf(el, g.fingerprint ?? extra?.fingerprint);
    if (s.falsePositives.includes(fp)) return;
    const d = evaluate(category, evidence);
    if (!shouldBlock(d, s.sensitivity)) return;
    if (this.engine.apply(el, d, fp)) {
      this.onBlocked?.({
        time: Date.now(),
        host: this.host,
        category,
        score: d.score,
        reasons: d.evidence.map((e) => e.reason),
        snippet: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
      });
    }
  }
}
