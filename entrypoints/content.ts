import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { DomObserver } from '../src/core/dom-observer';
import { FilterEngine } from '../src/core/filter-engine';
import { Scanner } from '../src/core/scanner';
import { findMediaContainer, findTextContainer, isSafeTarget } from '../src/core/detectors/container';
import { DEFAULT_SETTINGS, SETTINGS_KEY, effectiveSettings, sanitizeSettings, updateSettings, type EffectiveSettings } from '../src/storage/settings';
import { SENSITIVE_HOSTS, isMsg, type CheckMediaResult, type Msg, type PageState } from '../src/messages';
import { hostInList } from '../src/storage/settings';
import type { BlockedRecord, ClassifyResult, Settings } from '../src/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  async main() {
    const host = location.hostname;
    let settings: Settings = DEFAULT_SETTINGS;
    let eff: EffectiveSettings = effectiveSettings(settings, host);
    let pendingRecords: BlockedRecord[] = [];
    let reportTimer: ReturnType<typeof setTimeout> | null = null;
    let lastReported = -1;

    const report = () => {
      if (reportTimer) return;
      reportTimer = setTimeout(() => {
        reportTimer = null;
        const count = engine.count();
        if (count === lastReported && !pendingRecords.length) return;
        lastReported = count;
        const added = pendingRecords;
        pendingRecords = [];
        browser.runtime.sendMessage({ type: 'aib:count', count, added } satisfies Msg).catch(() => {});
      }, 300);
    };

    const engine = new FilterEngine({
      mode: eff.removalMode,
      onChange: report,
      onNotAi: (e) => {
        if (!e.fingerprint) return;
        updateSettings(browser.storage.local as any, (s) => {
          if (!s.falsePositives.includes(e.fingerprint!)) s.falsePositives.push(e.fingerprint!);
        });
      },
    });
    const scanner = new Scanner(engine, () => eff);
    scanner.onBlocked = (r) => {
      pendingRecords.push(r);
      report();
    };

    // --- Async evidence: image metadata and optional AI classification, only for visible items.
    const seenMedia = new WeakSet<Element>();
    const seenText = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.unobserve(en.target);
          if (en.target.tagName === 'IMG') checkImage(en.target as HTMLImageElement);
          else classifyText(en.target);
        }
      },
      { rootMargin: '600px' },
    );

    async function checkImage(img: HTMLImageElement) {
      const url = img.currentSrc || img.src;
      if (!/^https?:/.test(url) || !eff.active) return;
      try {
        const r = (await browser.runtime.sendMessage({ type: 'aib:checkMedia', url } satisfies Msg)) as CheckMediaResult;
        if (!r?.evidence?.length || !img.isConnected) return;
        const c = findMediaContainer(img, 2);
        const target = c && c.querySelectorAll('img, video').length === 1 ? c : img;
        if (isSafeTarget(target)) scanner.addEvidence(target, 'image', r.evidence);
      } catch {
        /* background unavailable */
      }
    }

    async function classifyText(el: Element) {
      if (!aiEligible()) return;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      try {
        const r = (await browser.runtime.sendMessage({ type: 'aib:classify', text: text.slice(0, eff.ai.maxCharsPerItem), host } satisfies Msg)) as ClassifyResult;
        if (r?.ok && r.evidence && el.isConnected) scanner.addEvidence(el, 'text', [r.evidence]);
      } catch {
        /* provider errors never affect local filtering */
      }
    }

    const aiEligible = () =>
      eff.active && eff.ai.enabled && eff.ai.consent && eff.ai.categories.text && eff.categories.text && !hostInList(host, SENSITIVE_HOSTS);

    scanner.onScanned = (input) => {
      if (eff.methods.metadata && eff.categories.image) {
        const root = input.root as ParentNode & Node;
        const imgs = [...root.querySelectorAll('img')];
        if (root.nodeType === 1 && (root as Element).tagName === 'IMG') imgs.push(root as HTMLImageElement);
        for (const img of imgs) {
          if (seenMedia.has(img)) continue;
          const w = Number(img.getAttribute('width')) || img.naturalWidth || 999;
          const h = Number(img.getAttribute('height')) || img.naturalHeight || 999;
          if (w < 64 || h < 64) continue;
          seenMedia.add(img);
          io.observe(img);
        }
      }
      if (aiEligible()) {
        for (const t of input.longTexts) {
          const p = t.parentElement;
          if (!p || p.closest('form, [contenteditable="true"], input, textarea, [role="textbox"]')) continue;
          const c = findTextContainer(p);
          if (!c || seenText.has(c) || (c.textContent?.length ?? 0) < eff.ai.minTextLength) continue;
          seenText.add(c);
          io.observe(c);
        }
      }
    };

    const observer = new DomObserver((roots) => {
      roots.forEach((r) => scanner.scan(r));
      report(); // also reflects removed nodes (SPA navigation)
    });
    scanner.onShadowRoot = (sr) => observer.observe(sr);

    const start = () => {
      scanner.refresh();
      observer.observe(document);
      scanner.scan(document);
    };
    const stop = () => {
      observer.disconnect();
      engine.restoreAll();
    };

    const apply = (next: Settings) => {
      const prev = eff;
      settings = next;
      eff = effectiveSettings(settings, host);
      if (!eff.active) return prev.active && stop();
      engine.setMode(eff.removalMode);
      const detectionChanged =
        !prev.active ||
        JSON.stringify([prev.sensitivity, prev.categories, prev.methods, prev.userRules, prev.disabledRules, prev.falsePositives, prev.ai]) !==
          JSON.stringify([eff.sensitivity, eff.categories, eff.methods, eff.userRules, eff.disabledRules, eff.falsePositives, eff.ai]);
      if (detectionChanged) {
        engine.restoreAll();
        observer.disconnect();
        start();
      }
    };

    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[SETTINGS_KEY]) apply(sanitizeSettings(changes[SETTINGS_KEY].newValue));
    });

    browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id || !isMsg(msg)) return;
      const m = msg as Msg;
      if (window !== window.top && m.type === 'aib:getState') return; // top frame answers
      if (m.type === 'aib:getState') {
        const state: PageState = {
          count: engine.count(),
          items: engine.list().map((e) => ({ id: e.id, category: e.detection.category, score: e.detection.score, reasons: e.detection.evidence.map((x) => x.reason) })),
        };
        sendResponse(state);
      } else if (m.type === 'aib:revealAll') {
        engine.revealAll();
        sendResponse({ ok: true });
      } else if (m.type === 'aib:rescan') {
        apply(settings);
        engine.restoreAll();
        observer.disconnect();
        if (eff.active) start();
        sendResponse({ ok: true });
      }
    });

    settings = sanitizeSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
    eff = effectiveSettings(settings, host);
    // Optional: Google's Web-only results view never contains an AI Overview.
    if (eff.active && eff.googleWebOnly && eff.categories.search && window === window.top && /(^|\.)google\.[a-z.]+$/.test(host) && location.pathname === '/search') {
      const u = new URL(location.href);
      if (!u.searchParams.has('udm') && !u.searchParams.has('tbm')) {
        u.searchParams.set('udm', '14');
        location.replace(u.href);
        return;
      }
    }
    engine.setMode(eff.removalMode);
    if (eff.active) start();
  },
});
