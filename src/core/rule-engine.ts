import { CATEGORIES, type Category, type Rule } from '../types';
import builtin from '../rules/builtin.json';

const isStr = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export function isValidSelector(sel: string): boolean {
  if (!isStr(sel, 1000)) return false;
  try {
    // Throws SyntaxError on invalid selectors; DocumentFragment has no side effects.
    globalThis.document?.createDocumentFragment().querySelector(sel);
    return true;
  } catch {
    return false;
  }
}

const regexCache = new Map<string, RegExp | null>();
export function compilePattern(p: string): RegExp | null {
  if (regexCache.has(p)) return regexCache.get(p)!;
  let re: RegExp | null = null;
  try {
    // Restrict length and disallow backreferences/lookbehind to limit pathological patterns.
    if (p.length <= 200 && !/\\\d|\(\?<[=!]/.test(p)) re = new RegExp(p, 'i');
  } catch {
    re = null;
  }
  regexCache.set(p, re);
  return re;
}

/** Validates untrusted rule data. Rules are declarative only; nothing is executed. */
export function validateRule(raw: unknown): Rule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isStr(r.id, 100) || !/^[\w.:-]+$/.test(r.id)) return null;
  if (!CATEGORIES.includes(r.category as Category)) return null;
  if (!isStr(r.selector) || !isValidSelector(r.selector)) return null;
  if (r.removalTarget !== undefined && (!isStr(r.removalTarget) || !isValidSelector(r.removalTarget))) return null;
  if (r.textPattern !== undefined && (!isStr(r.textPattern, 200) || !compilePattern(r.textPattern))) return null;
  const domains = Array.isArray(r.domains) ? r.domains.filter((d) => isStr(d, 253) && /^[\w.*-]+$/.test(d)) : [];
  const score = typeof r.score === 'number' ? Math.max(0, Math.min(100, r.score)) : 50;
  return {
    id: r.id,
    domains: domains as string[],
    category: r.category as Category,
    selector: r.selector,
    ...(r.textPattern ? { textPattern: r.textPattern as string } : {}),
    score,
    reason: isStr(r.reason, 300) ? r.reason : 'Matched rule ' + r.id,
    enabled: r.enabled !== false,
    ...(r.removalTarget ? { removalTarget: r.removalTarget as string } : {}),
    ...(r.explicit === true ? { explicit: true } : {}),
  };
}

export function parseRuleList(json: string): { rules: Rule[]; rejected: number } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { rules: [], rejected: 0 };
  }
  const arr = Array.isArray(data) ? data : (data as any)?.rules;
  if (!Array.isArray(arr)) return { rules: [], rejected: 0 };
  const rules = arr.map(validateRule).filter((r): r is Rule => !!r);
  return { rules, rejected: arr.length - rules.length };
}

export const BUILTIN_RULES: Rule[] = (builtin as unknown[]).map((r) => {
  const v = validateRule(r);
  if (!v) throw new Error('Invalid builtin rule: ' + JSON.stringify(r));
  return v;
});

/** Domain pattern match: "example.com" matches subdomains, "google.*" matches any TLD. */
export function domainMatches(host: string, pattern: string): boolean {
  host = host.toLowerCase().replace(/^www\./, '');
  const p = pattern.toLowerCase().replace(/^www\./, '').replace(/^\*\./, '');
  if (p.endsWith('.*')) {
    const base = p.slice(0, -2);
    const labels = host.split('.');
    for (let i = 0; i < labels.length; i++) {
      const rest = labels.slice(i).join('.');
      if (rest.startsWith(base + '.') && /^[a-z.]{2,7}$/.test(rest.slice(base.length + 1))) return true;
    }
    return false;
  }
  return host === p || host.endsWith('.' + p);
}

export function rulesForHost(host: string, rules: Rule[], disabled: string[] = []): Rule[] {
  const off = new Set(disabled);
  return rules.filter(
    (r) => r.enabled && !off.has(r.id) && (r.domains.length === 0 || r.domains.some((d) => domainMatches(host, d))),
  );
}
