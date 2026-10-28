import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import '../../src/ui/theme.css';
import { useSettings, useTheme } from '../../src/ui/useSettings';
import { Switch } from '../../src/ui/Switch';
import { CATEGORIES, CATEGORY_LABELS, SENSITIVITY_LABELS, type BlockedRecord, type ProviderKind, type Sensitivity, type Settings } from '../../src/types';
import { BUILTIN_RULES, parseRuleList } from '../../src/core/rule-engine';
import { normalizeHost, sanitizeSettings } from '../../src/storage/settings';
import { getApiKey, setApiKey } from '../../src/storage/secrets';
import { getUsage, type Usage } from '../../src/core/ai-service';
import { OLLAMA_DEFAULTS } from '../../src/providers/ollama';
import { OPENAI_DEFAULTS, XAI_DEFAULTS } from '../../src/providers/openai';

const PROVIDER_DEFAULTS: Record<ProviderKind, { endpoint: string; model: string }> = {
  openai: OPENAI_DEFAULTS,
  xai: XAI_DEFAULTS,
  'openai-compatible': { endpoint: 'https://', model: '' },
  ollama: OLLAMA_DEFAULTS,
};

function Section(p: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="card" id={p.id} style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ fontSize: 16 }}>{p.title}</h2>
      {p.children}
    </section>
  );
}

const lines = (v: string) => v.split(/[\n,]/).map(normalizeHost).filter(Boolean);

function download(name: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function pickFile(cb: (text: string) => void) {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = 'application/json,.json';
  i.onchange = () => i.files?.[0]?.text().then(cb);
  i.click();
}

function Options() {
  const [s, update, loaded] = useSettings();
  useTheme(s.theme);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => update((x) => ({ ...x, [k]: v }));
  const setAi = (patch: Partial<Settings['ai']>) => update((x) => ({ ...x, ai: { ...x.ai, ...patch } }));

  const [allow, setAllow] = useState('');
  const [block, setBlock] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [msg, setMsg] = useState('');
  const [apiKey, setKey] = useState('');
  const [recent, setRecent] = useState<BlockedRecord[]>([]);
  const [stats, setStats] = useState({ session: 0, lifetime: 0 });
  const [usage, setUsage] = useState<Usage>({ day: '', requests: 0, tokens: 0 });
  const [ovHost, setOvHost] = useState('');

  useEffect(() => {
    if (!loaded) return;
    setAllow(s.allowlist.join('\n'));
    setBlock(s.blocklist.join('\n'));
    setRulesText(JSON.stringify(s.userRules, null, 2));
  }, [loaded]);
  useEffect(() => {
    getApiKey(s.ai.provider).then((k) => setKey(k ?? ''));
  }, [s.ai.provider]);
  const refreshData = async () => {
    const l = await browser.storage.local.get(['recent', 'lifetimeStats']);
    const ss = await browser.storage.session.get('sessionStats');
    setRecent((l.recent as BlockedRecord[]) ?? []);
    setStats({ session: (ss.sessionStats as number) ?? 0, lifetime: (l.lifetimeStats as number) ?? 0 });
    setUsage(await getUsage(browser.storage.local as any));
  };
  useEffect(() => {
    refreshData();
  }, []);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 4000);
  };

  const saveRules = () => {
    const { rules, rejected } = parseRuleList(rulesText.trim() || '[]');
    set('userRules', rules);
    flash(`Saved ${rules.length} rule(s)${rejected ? `, rejected ${rejected} invalid` : ''}.`);
  };

  const providerChange = (p: ProviderKind) => setAi({ provider: p, ...PROVIDER_DEFAULTS[p] });

  const testProvider = async () => {
    flash('Testing…');
    const r: any = await browser.runtime.sendMessage({ type: 'aib:testProvider' });
    flash(r?.ok ? r.message : `Failed: ${r?.error ?? 'unknown error'}`);
    refreshData();
  };

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
      <header className="row between">
        <div className="row">
          <img src="/icon/48.png" width={32} height={32} alt="" />
          <h1 style={{ fontSize: 22 }}>Slop Blocker settings</h1>
        </div>
        <div className="row">
          <span>{s.enabled ? 'Enabled' : 'Disabled'}</span>
          <Switch label="Enable Slop Blocker" checked={s.enabled} onChange={(v) => set('enabled', v)} />
        </div>
      </header>
      {msg && (
        <div className="card" role="status">
          {msg}
        </div>
      )}

      <Section title="Detection">
        <label htmlFor="sens">
          Sensitivity: <strong>{SENSITIVITY_LABELS[s.sensitivity]}</strong>
        </label>
        <input id="sens" type="range" min={1} max={5} value={s.sensitivity} onChange={(e) => set('sensitivity', Number(e.target.value) as Sensitivity)} />
        <p className="muted" style={{ margin: 0 }}>
          Higher sensitivity removes more suspected AI content but may also block human content. Labeled Only uses explicit labels and embedded generator
          signatures only. Scores are engineering thresholds, not probabilities.
        </p>
        <div className="grid2">
          {CATEGORIES.map((c) => (
            <label key={c} className="row">
              <input type="checkbox" checked={s.categories[c]} onChange={(e) => set('categories', { ...s.categories, [c]: e.target.checked })} />
              {CATEGORY_LABELS[c]}
            </label>
          ))}
        </div>
        <div className="row" style={{ gap: 16 }}>
          <span>Removal:</span>
          {(['hide', 'placeholder'] as const).map((m) => (
            <label key={m} className="row">
              <input type="radio" name="mode" checked={s.removalMode === m} onChange={() => set('removalMode', m)} />
              {m === 'hide' ? 'Hide completely' : 'Show placeholder'}
            </label>
          ))}
        </div>
        <h3 style={{ fontSize: 14 }}>Methods</h3>
        <div className="grid2">
          {(
            [
              ['labels', 'Visible AI labels & disclosures'],
              ['rules', 'Website rules'],
              ['metadata', 'Image provenance metadata (C2PA/IPTC)'],
              ['urls', 'AI generator URLs/domains'],
              ['heuristics', 'Chatbot boilerplate phrases (weak)'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="row">
              <input type="checkbox" checked={s.methods[k]} onChange={(e) => set('methods', { ...s.methods, [k]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
        <label className="row">
          Theme
          <select value={s.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </Section>

      <Section title="Websites">
        <label className="row">
          <input type="radio" checked={s.siteMode === 'all'} onChange={() => set('siteMode', 'all')} /> Filter all websites except the allowlist
        </label>
        <label className="row">
          <input type="radio" checked={s.siteMode === 'listedOnly'} onChange={() => set('siteMode', 'listedOnly')} /> Filter only websites on the blocklist
        </label>
        <div className="grid2">
          <label>
            Allowlist (never filter), one per line
            <textarea rows={5} style={{ width: '100%' }} value={allow} onChange={(e) => setAllow(e.target.value)} onBlur={() => set('allowlist', lines(allow))} />
          </label>
          <label>
            Blocklist (filter-only mode)
            <textarea rows={5} style={{ width: '100%' }} value={block} onChange={(e) => setBlock(e.target.value)} onBlur={() => set('blocklist', lines(block))} />
          </label>
        </div>
        <label className="row">
          <input type="checkbox" checked={s.googleWebOnly} onChange={(e) => set('googleWebOnly', e.target.checked)} />
          Google: always open the “Web” results view (udm=14). Removes AI Overviews at the source, but also hides image/knowledge panels.
        </label>
        <h3 style={{ fontSize: 14 }}>Per-site sensitivity overrides</h3>
        {Object.entries(s.siteOverrides).map(([h, o]) => (
          <div key={h} className="row">
            <code style={{ minWidth: 200 }}>{h}</code>
            <select
              value={o.sensitivity ?? ''}
              onChange={(e) => set('siteOverrides', { ...s.siteOverrides, [h]: { ...o, sensitivity: (Number(e.target.value) || undefined) as Sensitivity | undefined } })}
            >
              <option value="">Default</option>
              {([1, 2, 3, 4, 5] as Sensitivity[]).map((n) => (
                <option key={n} value={n}>
                  {SENSITIVITY_LABELS[n]}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const { [h]: _, ...rest } = s.siteOverrides;
                set('siteOverrides', rest);
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="row">
          <input type="text" placeholder="example.com" value={ovHost} onChange={(e) => setOvHost(e.target.value)} />
          <button
            onClick={() => {
              const h = normalizeHost(ovHost);
              if (h) set('siteOverrides', { ...s.siteOverrides, [h]: { sensitivity: s.sensitivity } });
              setOvHost('');
            }}
          >
            Add override
          </button>
        </div>
      </Section>

      <Section title="Rules">
        <p className="muted" style={{ margin: 0 }}>
          Built-in rules match explicit AI labels and known AI components. Rules are declarative JSON only — never executable code.
        </p>
        <div style={{ display: 'grid', gap: 4 }}>
          {BUILTIN_RULES.map((r) => (
            <label key={r.id} className="row">
              <input
                type="checkbox"
                checked={!s.disabledRules.includes(r.id)}
                onChange={(e) => set('disabledRules', e.target.checked ? s.disabledRules.filter((x) => x !== r.id) : [...s.disabledRules, r.id])}
              />
              <span>
                {r.reason} <span className="muted">({r.domains.join(', ') || 'all sites'} · {r.category})</span>
              </span>
            </label>
          ))}
        </div>
        <label>
          Custom rules (JSON array). Fields: id, domains, category, selector, textPattern?, score, reason, enabled, removalTarget?, explicit?
          <textarea rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} value={rulesText} onChange={(e) => setRulesText(e.target.value)} />
        </label>
        <div className="row">
          <button className="primary" onClick={saveRules}>Save rules</button>
          <button onClick={() => download('slop-blocker-rules.json', s.userRules)}>Export rules</button>
          <button
            onClick={() =>
              pickFile((t) => {
                const { rules, rejected } = parseRuleList(t);
                const ids = new Set(rules.map((r) => r.id));
                const merged = [...s.userRules.filter((r) => !ids.has(r.id)), ...rules];
                set('userRules', merged);
                setRulesText(JSON.stringify(merged, null, 2));
                flash(`Imported ${rules.length} rule(s)${rejected ? `, rejected ${rejected}` : ''}.`);
              })
            }
          >
            Import rules
          </button>
        </div>
        <div className="row">
          <span className="muted">{s.falsePositives.length} item(s) marked “Not AI”.</span>
          <button onClick={() => set('falsePositives', [])} disabled={!s.falsePositives.length}>Clear corrections</button>
        </div>
      </Section>

      <Section title="AI-assisted detection (optional)" id="ai">
        <p className="muted" style={{ margin: 0 }}>
          Off by default. When enabled, visible text passages (≥ minimum length) are sent to the provider you choose. Forms, editable fields and mail/chat
          sites are never sent. Results are cached; model output is only one evidence source and is capped. Image classification is not implemented.
        </p>
        <label className="row">
          <input type="checkbox" checked={s.ai.consent} onChange={(e) => setAi({ consent: e.target.checked, ...(e.target.checked ? {} : { enabled: false }) })} />
          I consent to sending webpage text to the selected AI provider.
        </label>
        <label className="row">
          <input type="checkbox" disabled={!s.ai.consent} checked={s.ai.enabled} onChange={(e) => setAi({ enabled: e.target.checked })} />
          Enable AI-assisted text detection
        </label>
        <div className="grid2">
          <label>
            Provider
            <select style={{ width: '100%' }} value={s.ai.provider} onChange={(e) => providerChange(e.target.value as ProviderKind)}>
              <option value="openai">OpenAI</option>
              <option value="xai">xAI (Grok)</option>
              <option value="openai-compatible">OpenAI-compatible API</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </label>
          <label>
            Model
            <input type="text" style={{ width: '100%' }} value={s.ai.model} onChange={(e) => setAi({ model: e.target.value.trim() })} />
          </label>
          <label>
            Endpoint
            <input type="url" style={{ width: '100%' }} value={s.ai.endpoint} onChange={(e) => setAi({ endpoint: e.target.value.trim() })} />
          </label>
          <label>
            API key {s.ai.provider === 'ollama' && <span className="muted">(not needed)</span>}
            <input
              type="password"
              autoComplete="off"
              style={{ width: '100%' }}
              value={apiKey}
              onChange={(e) => setKey(e.target.value)}
              onBlur={() => setApiKey(s.ai.provider, apiKey.trim()).then(() => flash('API key saved (extension-only storage).'))}
            />
          </label>
          {(
            [
              ['maxRequestsPerMinute', 'Max requests / minute'],
              ['maxRequestsPerDay', 'Max requests / day'],
              ['dailyTokenBudget', 'Daily token budget'],
              ['maxCharsPerItem', 'Max characters per item'],
              ['minTextLength', 'Minimum text length'],
              ['cacheDays', 'Cache results (days)'],
              ['costPerMillionTokens', 'Price per 1M tokens (USD, for estimates)'],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              {label}
              <input type="number" min={0} step="any" style={{ width: '100%' }} value={s.ai[k]} onChange={(e) => setAi({ [k]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        {s.ai.provider === 'ollama' && <p className="muted" style={{ margin: 0 }}>Ollama must allow extension origins: start it with OLLAMA_ORIGINS=chrome-extension://*</p>}
        <div className="row">
          <button onClick={testProvider}>Test connection</button>
          <span className="muted">
            Today: {usage.requests} requests, {usage.tokens.toLocaleString()} tokens ≈ ${((usage.tokens / 1e6) * s.ai.costPerMillionTokens).toFixed(4)}
          </span>
        </div>
        <div>
          <button onClick={() => browser.storage.local.remove('aiCache').then(() => flash('AI cache cleared.'))}>Clear AI cache</button>
        </div>
      </Section>

      <Section title="Recent blocked content">
        <div className="row" style={{ gap: 24 }}>
          <span>Session: <strong>{stats.session}</strong></span>
          <span>Lifetime: <strong>{stats.lifetime}</strong></span>
          <button onClick={refreshData}>Refresh</button>
          <button
            onClick={async () => {
              await browser.storage.local.set({ recent: [], lifetimeStats: 0 });
              await browser.storage.session.set({ sessionStats: 0 });
              refreshData();
            }}
          >
            Clear history
          </button>
        </div>
        {recent.length === 0 && <span className="muted">Nothing blocked yet.</span>}
        <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflow: 'auto' }}>
          {recent.map((r, i) => (
            <details key={i} className="card" style={{ padding: 8 }}>
              <summary>
                <strong>{CATEGORY_LABELS[r.category] ?? r.category}</strong> on {r.host} · score {r.score} · {new Date(r.time).toLocaleString()}
              </summary>
              <ul style={{ margin: '6px 0' }}>
                {r.reasons.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
              {r.snippet && <div className="muted">“{r.snippet}”</div>}
            </details>
          ))}
        </div>
      </Section>

      <Section title="Import / export configuration">
        <p className="muted" style={{ margin: 0 }}>API keys are never exported.</p>
        <div className="row">
          <button onClick={() => download('slop-blocker-settings.json', s)}>Export settings</button>
          <button
            onClick={() =>
              pickFile((t) => {
                try {
                  const next = sanitizeSettings(JSON.parse(t));
                  update(() => next);
                  setAllow(next.allowlist.join('\n'));
                  setBlock(next.blocklist.join('\n'));
                  setRulesText(JSON.stringify(next.userRules, null, 2));
                  flash('Settings imported.');
                } catch {
                  flash('Invalid settings file.');
                }
              })
            }
          >
            Import settings
          </button>
          <button
            onClick={() => {
              if (confirm('Reset all settings to defaults?')) update(() => sanitizeSettings({}));
            }}
          >
            Reset to defaults
          </button>
        </div>
      </Section>

      <p className="muted">
        Detection is probabilistic and imperfect. Slop Blocker needs access to all websites to filter their content and read image metadata; it has no
        telemetry and sends nothing anywhere unless you enable AI-assisted detection.
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Options />);
