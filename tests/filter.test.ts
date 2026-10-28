import { describe, expect, it, vi } from 'vitest';
import { DomObserver } from '../src/core/dom-observer';
import { $$, hidden, loadFixture, setup } from './helpers';

describe('filter engine', () => {
  it('placeholder mode inserts exactly one placeholder with Reveal, and reveal restores the original node', () => {
    const host = loadFixture('labels');
    const { scanner, engine } = setup(host, { removalMode: 'placeholder' });
    const li = document.querySelector('li[data-expect="blocked"]') as HTMLElement;
    const onClick = vi.fn();
    li.addEventListener('click', onClick);
    li.style.display = 'flex';
    scanner.scan(document);
    scanner.scan(document); // rescans must not duplicate
    const phs = $$('[data-aib-ui="placeholder"]');
    expect(phs.length).toBe(engine.count());
    const ph = li.previousElementSibling!;
    expect(ph.textContent).toContain('AI TEXT REMOVED');
    (ph.querySelector('button') as HTMLButtonElement).click();
    expect(hidden(li)).toBe(false);
    expect(li.style.display).toBe('flex');
    expect(li.previousElementSibling?.getAttribute('data-aib-ui')).toBeFalsy();
    li.click();
    expect(onClick).toHaveBeenCalled(); // same node, listeners preserved
    scanner.scan(document);
    expect(hidden(li)).toBe(false); // revealed items stay revealed
  });

  it('hide mode, reveal-all, restore-all and mode switching', () => {
    const host = loadFixture('labels');
    const { scanner, engine } = setup(host);
    scanner.scan(document);
    const n = engine.count();
    expect(n).toBeGreaterThan(0);
    expect($$('[data-aib-ui]').length).toBe(0);
    engine.setMode('placeholder');
    expect($$('[data-aib-ui]').length).toBe(n);
    engine.setMode('hide');
    expect($$('[data-aib-ui]').length).toBe(0);
    engine.restoreAll(); // turning filtering off
    expect($$('[data-aib-hidden]').length).toBe(0);
    scanner.scan(document);
    engine.revealAll();
    expect($$('[data-aib-hidden]').length).toBe(0);
  });

  it('allowlisted sites remain untouched', () => {
    const host = loadFixture('labels');
    const { scanner, engine } = setup(host, { allowlist: ['news.example'] });
    scanner.scan(document);
    expect(engine.count()).toBe(0);
  });

  it('"Not AI" corrections suppress future detections', () => {
    const host = loadFixture('labels');
    const t = setup(host);
    t.scanner.scan(document);
    const fps = t.engine.list().map((e) => e.fingerprint!);
    t.engine.restoreAll();
    t.set({ falsePositives: fps });
    t.scanner.scan(document);
    expect(t.engine.count()).toBe(0);
  });
});

describe('dom observer', () => {
  it('filters dynamically inserted content without observer loops', async () => {
    document.body.innerHTML = '<ul class="comments"><li>human</li></ul>';
    const { scanner, engine } = setup('example.com', { removalMode: 'placeholder' });
    const obs = new DomObserver((roots) => roots.forEach((r) => scanner.scan(r)), 10);
    obs.observe(document);
    scanner.scan(document);
    const ul = document.querySelector('ul')!;
    for (let i = 0; i < 20; i++) {
      const li = document.createElement('li');
      li.innerHTML = `<p>post ${i}</p><span>${i % 2 ? 'AI-generated' : 'ok'}</span>`;
      ul.append(li);
    }
    await new Promise((r) => setTimeout(r, 80));
    expect(engine.count()).toBe(10);
    expect($$('[data-aib-ui]').length).toBe(10);
    const flushes = obs.flushes;
    await new Promise((r) => setTimeout(r, 80));
    expect(obs.flushes).toBe(flushes); // placeholder insertion did not retrigger scanning
    expect(flushes).toBeLessThanOrEqual(2);
    obs.disconnect();
  });

  it('handles open shadow DOM', () => {
    document.body.innerHTML = '<x-card></x-card>';
    const sr = document.querySelector('x-card')!.attachShadow({ mode: 'open' });
    sr.innerHTML = '<article><p>text</p><span>Made with AI</span></article>';
    const { scanner } = setup('example.com');
    scanner.scan(document);
    expect(hidden(sr.querySelector('article')!)).toBe(true);
  });
});
