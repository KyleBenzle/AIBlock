import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import '../../src/ui/theme.css';
import { useSettings, useTheme } from '../../src/ui/useSettings';
import { Switch } from '../../src/ui/Switch';
import { CATEGORIES, CATEGORY_LABELS, SENSITIVITY_LABELS, type Sensitivity } from '../../src/types';
import { effectiveSettings, hostInList, normalizeHost } from '../../src/storage/settings';

function Popup() {
  const [s, update] = useSettings();
  useTheme(s.theme);
  const [tab, setTab] = useState<{ id?: number; host: string }>({ host: '' });
  const [count, setCount] = useState(0);

  useEffect(() => {
    // ?tab=<id> lets the popup be opened as a page for a specific tab (store screenshots, debugging).
    const forced = Number(new URLSearchParams(location.search).get('tab'));
    (forced ? browser.tabs.get(forced).then((t) => [t]) : browser.tabs.query({ active: true, currentWindow: true })).then(([t]) => {
      let host = '';
      try {
        const u = new URL(t?.url ?? '');
        if (/^https?:$/.test(u.protocol)) host = normalizeHost(u.hostname);
      } catch {}
      setTab({ id: t?.id, host });
    });
  }, []);

  useEffect(() => {
    if (tab.id === undefined) return;
    const key = `tab:${tab.id}`;
    const read = () =>
      browser.storage.session.get(key).then((r) => setCount(Object.values((r[key] as Record<string, number>) ?? {}).reduce((a, b) => a + b, 0)));
    read();
    const l = (c: Record<string, unknown>, a: string) => a === 'session' && key in c && read();
    browser.storage.onChanged.addListener(l);
    return () => browser.storage.onChanged.removeListener(l);
  }, [tab.id]);

  const siteDisabled = !!tab.host && hostInList(tab.host, s.allowlist);
  const active = tab.host ? effectiveSettings(s, tab.host).active : s.enabled;
  const toggleSite = () =>
    update((x) => {
      x.allowlist = siteDisabled ? x.allowlist.filter((h) => !hostInList(tab.host, [h])) : [...x.allowlist, tab.host];
      return x;
    });
  const revealAll = () => tab.id !== undefined && browser.tabs.sendMessage(tab.id, { type: 'aib:revealAll' }).catch(() => {});

  return (
    <main style={{ width: 340, padding: 14, display: 'grid', gap: 12 }}>
      <header className="row between">
        <div className="row">
          <img src="/icon/32.png" width={22} height={22} alt="" />
          <h1 style={{ fontSize: 17 }}>Slop Blocker</h1>
        </div>
        <Switch label="Enable Slop Blocker" checked={s.enabled} onChange={(v) => update((x) => ({ ...x, enabled: v }))} />
      </header>

      <section className="card row between" aria-live="polite">
        <div>
          <div className="badge">{active ? count : '—'}</div>
          <div className="muted">{active ? 'blocked on this page' : siteDisabled ? 'disabled on this site' : 'filtering off'}</div>
        </div>
        <button onClick={revealAll} disabled={!count}>Reveal all</button>
      </section>

      <section style={{ opacity: s.enabled ? 1 : 0.5 }}>
        <div className="row between">
          <label htmlFor="sens"><strong>Detection sensitivity</strong></label>
          <span>{SENSITIVITY_LABELS[s.sensitivity]}</span>
        </div>
        <input
          id="sens"
          type="range"
          min={1}
          max={5}
          step={1}
          value={s.sensitivity}
          aria-valuetext={SENSITIVITY_LABELS[s.sensitivity]}
          onChange={(e) => update((x) => ({ ...x, sensitivity: Number(e.target.value) as Sensitivity }))}
        />
        <div className="ticks">
          {([1, 2, 3, 4, 5] as Sensitivity[]).map((n) => (
            <span key={n} className={n === s.sensitivity ? 'on' : ''}>{SENSITIVITY_LABELS[n].replace(' Only', '')}</span>
          ))}
        </div>
        <p className="muted" style={{ margin: '6px 0 0' }}>Higher sensitivity removes more suspected AI content but may also block human content.</p>
      </section>

      <fieldset className="grid2" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 6 }}><strong>Block</strong></legend>
        {CATEGORIES.map((c) => (
          <label key={c} className="row">
            <input type="checkbox" checked={s.categories[c]} onChange={(e) => update((x) => ({ ...x, categories: { ...x.categories, [c]: e.target.checked } }))} />
            {CATEGORY_LABELS[c]}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 6 }}><strong>Removal</strong></legend>
        <div className="row" style={{ gap: 16 }}>
          {(['hide', 'placeholder'] as const).map((m) => (
            <label key={m} className="row">
              <input type="radio" name="mode" checked={s.removalMode === m} onChange={() => update((x) => ({ ...x, removalMode: m }))} />
              {m === 'hide' ? 'Hide completely' : 'Show placeholder'}
            </label>
          ))}
        </div>
      </fieldset>

      {/(^|\.)google\.[a-z.]+$/.test(tab.host) && (
        <label className="row">
          <input type="checkbox" checked={s.googleWebOnly} onChange={(e) => update((x) => ({ ...x, googleWebOnly: e.target.checked }))} />
          Google: use Web-only results (no AI Overview)
        </label>
      )}

      <footer className="row between">
        {tab.host ? (
          <button onClick={toggleSite}>{siteDisabled ? 'Enable on this website' : 'Disable on this website'}</button>
        ) : (
          <span className="muted">Not available on this page</span>
        )}
        <a href="#" onClick={(e) => (e.preventDefault(), browser.runtime.openOptionsPage())}>Advanced settings</a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
