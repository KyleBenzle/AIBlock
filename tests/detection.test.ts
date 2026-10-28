import { describe, expect, it } from 'vitest';
import { combineScore, evaluate, shouldBlock } from '../src/core/decision-engine';
import type { Sensitivity } from '../src/types';
import { $$, hidden, loadFixture, setup } from './helpers';

describe('decision engine', () => {
  it('weak evidence never accumulates into certainty', () => {
    const weak = [1, 2, 3, 4, 5].map((i) => ({ source: 's' + i, type: 't', score: 35, reason: '' }));
    expect(combineScore(weak)).toBeLessThanOrEqual(50);
    expect(shouldBlock(evaluate('text', weak), 3)).toBe(false);
  });
  it('correlated evidence from one source does not stack', () => {
    const ev = [70, 70, 70].map((s) => ({ source: 'same', type: 't', score: s, reason: '' }));
    expect(combineScore(ev)).toBe(70);
  });
  it('independent evidence corroborates', () => {
    expect(combineScore([{ source: 'a', type: 't', score: 70, reason: '' }, { source: 'b', type: 't', score: 60, reason: '' }])).toBeGreaterThan(70);
  });
  it('requires positive evidence even at Maximum and explicit evidence at Labeled Only', () => {
    expect(shouldBlock(evaluate('text', []), 5)).toBe(false);
    const strong = evaluate('image', [{ source: 'url', type: 't', score: 99, reason: '' }]);
    expect(shouldBlock(strong, 2)).toBe(true);
    expect(shouldBlock(strong, 1)).toBe(false);
    expect(shouldBlock(evaluate('image', [{ source: 'label', type: 't', score: 90, reason: '', explicit: true }]), 1)).toBe(true);
  });
  it('caps AI provider evidence', () => {
    const d = evaluate('text', [{ source: 'ai-provider', type: 'openai', score: 100, reason: '' }]);
    expect(d.score).toBe(85);
    expect(shouldBlock(d, 2)).toBe(false);
    expect(shouldBlock(d, 3)).toBe(true);
  });
});

describe('generic label detection', () => {
  it('removes captions/alt/disclosure/badge-labeled items and keeps mentions of AI', () => {
    const host = loadFixture('labels');
    const { scanner } = setup(host, { sensitivity: 5 });
    scanner.scan(document);
    for (const el of $$('[data-expect="blocked"]')) expect(hidden(el), el.outerHTML.slice(0, 90)).toBe(true);
    for (const el of $$('[data-expect="visible"]')) expect(hidden(el), el.outerHTML.slice(0, 90)).toBe(false);
  });
});

describe('sensitivity levels', () => {
  const levels: Sensitivity[] = [1, 2, 3, 4, 5];
  it('each level changes actual decisions as specified by fixture data-level', () => {
    const counts: number[] = [];
    for (const lvl of levels) {
      const host = loadFixture('mixed');
      const { scanner, engine } = setup(host, { sensitivity: lvl });
      scanner.scan(document);
      for (const el of $$('[data-level]')) {
        const min = Number(el.getAttribute('data-level'));
        expect(hidden(el), `level ${lvl}: ${el.outerHTML.slice(0, 80)}`).toBe(lvl >= min);
      }
      for (const el of $$('[data-expect="visible"]')) expect(hidden(el)).toBe(false);
      counts.push(engine.count());
    }
    // Levels 2..5 strictly increase in this fixture; level 1 == level 2 (explicit only).
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[2]);
    expect(counts[4]).toBeGreaterThan(counts[3]);
  });
});

describe('categories', () => {
  it('category switches affect filtering', () => {
    const host = loadFixture('mixed');
    const { scanner } = setup(host, {
      sensitivity: 5,
      categories: { text: true, image: false, video: true, audio: false, advertisement: false, search: true },
    });
    scanner.scan(document);
    expect(hidden(document.querySelector('[data-cat="advertisement"]')!)).toBe(false);
    expect(hidden(document.querySelector('[data-cat="audio"]')!)).toBe(false);
    expect(hidden(document.querySelector('img[src*="midjourney"]')!)).toBe(false);
    expect(hidden(document.querySelector('li[data-level="4"]')!)).toBe(true);
  });
  it('assigns categories', () => {
    const host = loadFixture('mixed');
    const { scanner, engine } = setup(host, { sensitivity: 5 });
    scanner.scan(document);
    const cats = new Set(engine.list().map((e) => e.detection.category));
    expect([...cats].sort()).toEqual(['advertisement', 'audio', 'image', 'text']);
  });
  it('detection methods can be disabled', () => {
    const host = loadFixture('mixed');
    const { scanner } = setup(host, { sensitivity: 5, methods: { labels: true, rules: true, metadata: true, urls: false, heuristics: false } });
    scanner.scan(document);
    expect(hidden(document.querySelector('img[src*="midjourney"]')!)).toBe(false);
    expect(hidden(document.querySelector('li[data-level="4"]')!)).toBe(false);
  });
});

describe('regressions', () => {
  it('a label on a text post never hides a shared container with media from other posts', () => {
    document.body.innerHTML = `<div class="wrap">
      <article id="a"><div class="meta">bot <span class="badge">AI-generated</span></div><p>text</p></article>
      <figure id="f"><article><img src="https://x.example/a.png" width="300" height="200"><figcaption>Illustration: Midjourney</figcaption></article></figure>
      <article id="h"><p>human</p></article></div>`;
    const { scanner } = setup('x.example', { sensitivity: 4 });
    scanner.scan(document);
    expect(hidden(document.querySelector('.wrap')!)).toBe(false);
    expect(hidden(document.getElementById('a')!)).toBe(true);
    expect(hidden(document.getElementById('f')!)).toBe(true);
    expect(hidden(document.getElementById('h')!)).toBe(false);
  });
});
