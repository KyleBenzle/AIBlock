import { compilePattern } from '../rule-engine';
import type { Rule } from '../../types';
import { climbToBoundary, closestSafe, findMediaContainer, findTextContainer, isSafeTarget, parentOf, refineCategory } from './container';
import { norm } from './text-scan';
import type { Candidate, Detector } from './types';

function resolveTarget(el: Element, rule: Rule): Element | null {
  if (rule.removalTarget) return closestSafe(el, rule.removalTarget) ?? (rule.category === 'search' ? climbToBoundary(el) : null);
  if (rule.textPattern) {
    return rule.category === 'image' || rule.category === 'video' || rule.category === 'audio'
      ? findMediaContainer(el) ?? findTextContainer(el)
      : findTextContainer(el);
  }
  return isSafeTarget(el) ? el : null;
}

function candidate(el: Element, rule: Rule): Candidate | null {
  const target = resolveTarget(el, rule);
  if (!target) return null;
  return {
    target,
    category: refineCategory(target, rule.category),
    evidence: { source: 'rule', type: rule.explicit ? 'platform-label' : 'site-rule', score: rule.score, reason: rule.reason, explicit: rule.explicit },
  };
}

/** Applies selector rules and text-label rules for the current host. */
export const ruleDetector: Detector = (input, ctx) => {
  const out: Candidate[] = [];
  const root = input.root as ParentNode & Node;
  const textRules: { rule: Rule; re: RegExp }[] = [];
  for (const rule of ctx.rules) {
    if (rule.textPattern) {
      const re = compilePattern(rule.textPattern);
      if (re) textRules.push({ rule, re });
      continue;
    }
    try {
      const els = [...root.querySelectorAll(rule.selector)];
      if (root.nodeType === 1 && (root as Element).matches(rule.selector)) els.push(root as Element);
      for (const el of els) {
        const c = candidate(el, rule);
        if (c) out.push(c);
      }
    } catch {
      /* invalid selector filtered at validation; ignore defensively */
    }
  }
  if (!textRules.length) return out;
  const check = (text: string, el: Element) => {
    for (const { rule, re } of textRules) {
      if (!re.test(text)) continue;
      // Label element: the text's parent or a near ancestor matching the rule selector.
      let label: Element | null = el;
      for (let i = 0; label && i < 3 && !label.matches(rule.selector); i++) label = parentOf(label);
      if (!label || !label.matches(rule.selector)) continue;
      const c = candidate(label, rule);
      if (c) out.push(c);
    }
  };
  for (const t of input.shortTexts) if (t.parentElement) check(norm(t), t.parentElement);
  for (const el of root.querySelectorAll('[aria-label]')) {
    const v = el.getAttribute('aria-label')!.trim();
    if (v.length <= 120) check(v, el);
  }
  return out;
};
