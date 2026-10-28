import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_SETTINGS, effectiveSettings, loadSettings, sanitizeSettings, saveSettings } from '../src/storage/settings';

describe('settings', () => {
  it('persists to storage and reloads (survives restart)', async () => {
    fakeBrowser.reset();
    const area = fakeBrowser.storage.local as any;
    expect((await loadSettings(area)).sensitivity).toBe(3);
    await saveSettings(area, { ...DEFAULT_SETTINGS, sensitivity: 5, removalMode: 'placeholder', allowlist: ['a.com'] });
    const s = await loadSettings(area);
    expect(s).toMatchObject({ sensitivity: 5, removalMode: 'placeholder', allowlist: ['a.com'] });
  });
  it('sanitizes untrusted data', () => {
    const s = sanitizeSettings({ sensitivity: 9, removalMode: 'x', categories: { text: 'yes' }, ai: { enabled: 'true', maxRequestsPerDay: -5 }, userRules: [{ id: 'bad', selector: '[' }] });
    expect(s.sensitivity).toBe(3);
    expect(s.removalMode).toBe('hide');
    expect(s.categories.text).toBe(true);
    expect(s.ai.enabled).toBe(false);
    expect(s.ai.maxRequestsPerDay).toBe(1);
    expect(s.userRules).toEqual([]);
  });
  it('resolves allowlist, listed-only mode and per-site overrides', () => {
    const s = sanitizeSettings({ allowlist: ['https://www.Example.com/path'], siteOverrides: { 'news.com': { sensitivity: 1 } } });
    expect(effectiveSettings(s, 'sub.example.com').active).toBe(false);
    expect(effectiveSettings(s, 'other.com').active).toBe(true);
    expect(effectiveSettings(s, 'www.news.com').sensitivity).toBe(1);
    const l = sanitizeSettings({ siteMode: 'listedOnly', blocklist: ['b.com'] });
    expect(effectiveSettings(l, 'a.com').active).toBe(false);
    expect(effectiveSettings(l, 'b.com').active).toBe(true);
    expect(effectiveSettings({ ...l, enabled: false }, 'b.com').active).toBe(false);
  });
});
