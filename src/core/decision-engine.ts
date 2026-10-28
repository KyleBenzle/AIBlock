import type { Category, Detection, Evidence, Sensitivity } from '../types';

/** Tunable engineering thresholds on the normalized suspicion score — not probabilities. */
export const THRESHOLDS: Record<Exclude<Sensitivity, 1>, number> = { 2: 90, 3: 75, 4: 55, 5: 25 };

/** Evidence below this is "weak"; weak-only evidence can never exceed WEAK_CAP. */
export const WEAK_LIMIT = 40;
export const WEAK_CAP = 50;
/** AI model classifications alone are capped: they are one evidence source, not an authority. */
export const PROVIDER_CAP = 85;

export function combineScore(evidence: Evidence[]): number {
  if (!evidence.length) return 0;
  // Correlated evidence (same source) contributes only its strongest item.
  const bySource = new Map<string, number>();
  for (const e of evidence) {
    let s = Math.max(0, Math.min(100, e.score));
    if (e.source === 'ai-provider') s = Math.min(s, PROVIDER_CAP);
    if (e.explicit) s = Math.max(s, 95);
    bySource.set(e.source, Math.max(bySource.get(e.source) ?? 0, s));
  }
  const scores = [...bySource.values()].sort((a, b) => b - a);
  let total = scores[0];
  // Independent corroboration adds with diminishing returns.
  for (const s of scores.slice(1)) total += (100 - total) * (s / 100) * 0.35;
  if (scores[0] < WEAK_LIMIT) total = Math.min(total, WEAK_CAP);
  return Math.round(Math.min(100, total));
}

export function evaluate(category: Category, evidence: Evidence[]): Detection {
  const score = combineScore(evidence);
  const inconclusive = !evidence.length || evidence.every((e) => e.score < WEAK_LIMIT && !e.explicit);
  return { category, evidence, score, inconclusive };
}

export function shouldBlock(d: Detection, sensitivity: Sensitivity): boolean {
  if (!d.evidence.some((e) => e.score > 0 || e.explicit)) return false; // positive evidence always required
  if (sensitivity === 1) return d.evidence.some((e) => e.explicit);
  return d.score >= THRESHOLDS[sensitivity];
}
