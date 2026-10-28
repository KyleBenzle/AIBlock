import { findTextContainer, refineCategory } from './container';
import { norm } from './text-scan';
import type { Candidate, Detector } from './types';

/**
 * Leaked chatbot boilerplate. Writing style alone is weak evidence; only phrases that are
 * near-signatures of pasted chatbot output score moderately. Generic fluency is never used.
 */
export const PHRASES: [RegExp, number, string][] = [
  [/\bas an AI (?:language model|assistant|model)\b/i, 70, 'Contains chatbot boilerplate "as an AI language model"'],
  [/\bI(?:'m| am) (?:just )?an AI (?:language model|assistant)\b/i, 65, 'Contains chatbot self-identification'],
  [/\bas of my (?:last )?(?:knowledge )?(?:cutoff|cut-off|training data|last update)\b/i, 55, 'Mentions a model knowledge cutoff'],
  [/\b(?:regenerate response|I cannot fulfill (?:this|that) request)\b/i, 45, 'Contains chatbot interface text'],
  [/^(?:Certainly|Absolutely|Sure)! Here(?:'s| is) (?:a|an|the|your)\b/i, 30, 'Opens like a chatbot reply (weak)'],
  [/\bI hope this (?:helps|email finds you well)\b.*\bLet me know if you (?:need|have|would like)\b/i, 25, 'Chatbot-style closing (weak)'],
];

export const heuristicDetector: Detector = (input) => {
  const out: Candidate[] = [];
  for (const t of [...input.longTexts, ...input.shortTexts]) {
    const el = t.parentElement;
    if (!el) continue;
    const text = norm(t);
    for (const [re, score, reason] of PHRASES) {
      if (!re.test(text)) continue;
      const target = findTextContainer(el);
      if (target) out.push({ target, category: refineCategory(target, 'text'), evidence: { source: 'heuristic', type: 'phrase', score, reason } });
      break;
    }
  }
  return out;
};
