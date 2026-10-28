import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FilterEngine } from '../src/core/filter-engine';
import { Scanner } from '../src/core/scanner';
import { DEFAULT_SETTINGS, effectiveSettings, sanitizeSettings } from '../src/storage/settings';
import type { Settings } from '../src/types';

export const FIXTURES = join(__dirname, 'fixtures');
export const fixtureNames = () => readdirSync(FIXTURES).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));

export function loadFixture(name: string): string {
  const html = readFileSync(join(FIXTURES, name + '.html'), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  return doc.querySelector('meta[name="host"]')!.getAttribute('content')!;
}

export function setup(host: string, patch: Partial<Settings> = {}) {
  let s = sanitizeSettings({ ...structuredClone(DEFAULT_SETTINGS), ...patch });
  const engine = new FilterEngine({ mode: s.removalMode, onNotAi: () => {} });
  const scanner = new Scanner(engine, () => effectiveSettings(s, host), host);
  return {
    engine,
    scanner,
    set(p: Partial<Settings>) {
      s = sanitizeSettings({ ...s, ...p });
      scanner.refresh();
    },
  };
}

export const hidden = (el: Element) => el.hasAttribute('data-aib-hidden');
export const $$ = (sel: string) => [...document.querySelectorAll(sel)];
