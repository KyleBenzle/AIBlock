import { describe, expect, it } from 'vitest';
import { BUILTIN_RULES, domainMatches, parseRuleList, rulesForHost, validateRule } from '../src/core/rule-engine';
import { $$, fixtureNames, hidden, loadFixture, setup } from './helpers';

describe('built-in rules', () => {
  it('every built-in rule has a local HTML fixture', () => {
    const names = fixtureNames();
    for (const r of BUILTIN_RULES) expect(names, r.id).toContain(r.id);
  });

  for (const rule of BUILTIN_RULES) {
    it(`fixture ${rule.id}: removes labeled AI content and keeps nearby content`, () => {
      const host = loadFixture(rule.id);
      const { scanner, engine } = setup(host);
      scanner.scan(document);
      const blocked = $$('[data-expect="blocked"]');
      const visible = $$('[data-expect="visible"]');
      expect(blocked.length).toBeGreaterThan(0);
      for (const el of blocked) expect(hidden(el), el.outerHTML.slice(0, 80)).toBe(true);
      for (const el of visible) expect(hidden(el), el.outerHTML.slice(0, 80)).toBe(false);
      expect(engine.list().some((e) => e.detection.evidence.some((x) => x.reason === rule.reason))).toBe(true);
    });
  }

  it('site rules do not run on other domains', () => {
    loadFixture('google-ai-overview');
    const { scanner, engine } = setup('www.example.com');
    scanner.scan(document);
    expect(engine.count()).toBe(0);
  });
});

describe('rule engine', () => {
  it('matches domain patterns', () => {
    expect(domainMatches('www.google.co.uk', 'google.*')).toBe(true);
    expect(domainMatches('google.com', 'google.*')).toBe(true);
    expect(domainMatches('notgoogle.com', 'google.*')).toBe(false);
    expect(domainMatches('m.youtube.com', 'youtube.com')).toBe(true);
    expect(domainMatches('evilyoutube.com', 'youtube.com')).toBe(false);
  });

  it('rejects invalid selectors, patterns and fields', () => {
    const base = { id: 'x', domains: [], category: 'text', selector: 'div', score: 50, reason: 'r', enabled: true };
    expect(validateRule(base)).not.toBeNull();
    expect(validateRule({ ...base, selector: 'div[' })).toBeNull();
    expect(validateRule({ ...base, category: 'nope' })).toBeNull();
    expect(validateRule({ ...base, textPattern: '(' })).toBeNull();
    expect(validateRule({ ...base, textPattern: '(a)\\1' })).toBeNull();
    expect(validateRule({ ...base, id: 'bad id!' })).toBeNull();
    expect(validateRule({ ...base, score: 900 })!.score).toBe(100);
  });

  it('imports rule lists and counts rejected entries', () => {
    const r = parseRuleList(JSON.stringify({ rules: [{ id: 'a', category: 'image', selector: 'img.ai', score: 80, reason: 'x' }, { id: 'b' }] }));
    expect(r.rules).toHaveLength(1);
    expect(r.rejected).toBe(1);
    expect(parseRuleList('not json').rules).toHaveLength(0);
  });

  it('honours disabled rules', () => {
    expect(rulesForHost('www.google.com', BUILTIN_RULES).some((r) => r.id === 'google-ai-overview')).toBe(true);
    expect(rulesForHost('www.google.com', BUILTIN_RULES, ['google-ai-overview']).some((r) => r.id === 'google-ai-overview')).toBe(false);
  });

  it('user rules filter content', () => {
    document.body.innerHTML = '<div class="x"><div class="gen-box">AI box</div><p>human</p></div>';
    const rule = validateRule({ id: 'u1', domains: ['example.com'], category: 'text', selector: '.gen-box', score: 80, reason: 'custom', enabled: true })!;
    const { scanner } = setup('example.com', { userRules: [rule] });
    scanner.scan(document);
    expect(hidden(document.querySelector('.gen-box')!)).toBe(true);
    expect(hidden(document.querySelector('p')!)).toBe(false);
  });
});
