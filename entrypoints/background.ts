import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { isMsg, type Msg } from '../src/messages';
import { loadSettings } from '../src/storage/settings';
import { getApiKey } from '../src/storage/secrets';
import { AiService } from '../src/core/ai-service';
import { checkMedia } from '../src/core/media-check';
import { createProvider } from '../src/providers';
import type { BlockedRecord } from '../src/types';

const RECENT_MAX = 100;

export default defineBackground(() => {
  const local = browser.storage.local;
  const session = browser.storage.session;
  const ai = new AiService({ area: local as any, getKey: getApiKey });

  // Serialize storage read-modify-write updates (service worker may receive bursts).
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => (chain = chain.then(fn, fn)) as Promise<T>;

  async function onCount(tabId: number, frameId: number, count: number, added: BlockedRecord[]) {
    await serial(async () => {
      const key = `tab:${tabId}`;
      const cur = ((await session.get(key))[key] as Record<string, number>) ?? {};
      cur[frameId] = Math.max(0, Math.floor(count));
      const s = (await session.get('sessionStats')).sessionStats as number | undefined;
      const updates: Record<string, unknown> = { [key]: cur };
      const valid = added.filter((r) => r && typeof r.category === 'string').slice(0, 50);
      if (valid.length) {
        updates.sessionStats = (s ?? 0) + valid.length;
        const l = await local.get(['lifetimeStats', 'recent']);
        await local.set({
          lifetimeStats: ((l.lifetimeStats as number) ?? 0) + valid.length,
          recent: [
            ...valid.map((r) => ({ ...r, snippet: String(r.snippet ?? '').slice(0, 100), reasons: (r.reasons ?? []).slice(0, 5).map(String) })),
            ...(((l.recent as BlockedRecord[]) ?? []) as BlockedRecord[]),
          ].slice(0, RECENT_MAX),
        });
      }
      await session.set(updates);
      const total = Object.values(cur).reduce((a, b) => a + b, 0);
      await browser.action.setBadgeText({ tabId, text: total ? String(Math.min(total, 999)) : '' });
      await browser.action.setBadgeBackgroundColor({ tabId, color: '#5b5bd6' });
    });
  }

  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !isMsg(msg)) return;
    const m = msg as Msg;
    const tabId = sender.tab?.id;
    const run = async () => {
      switch (m.type) {
        case 'aib:count':
          if (tabId !== undefined && typeof m.count === 'number' && Array.isArray(m.added)) await onCount(tabId, sender.frameId ?? 0, m.count, m.added);
          return { ok: true };
        case 'aib:checkMedia': {
          const s = await loadSettings(local as any);
          if (!s.methods.metadata || typeof m.url !== 'string' || m.url.length > 4096) return { evidence: [] };
          return { evidence: await checkMedia(m.url) };
        }
        case 'aib:classify': {
          // Content scripts never see the API key; consent/limits are re-checked here.
          const s = await loadSettings(local as any);
          return ai.classify(s, m.text, m.host);
        }
        case 'aib:testProvider': {
          if (sender.tab) return { ok: false, error: 'Not allowed' }; // extension pages only
          const s = await loadSettings(local as any);
          try {
            const key = await getApiKey(s.ai.provider);
            const r = await createProvider({ ...s.ai, apiKey: key }).classifyText(
              'The quick brown fox jumps over the lazy dog. This is a short connection test sentence.',
            );
            return { ok: true, message: `Connected. Test score ${r.classification.score}, ~${r.tokens} tokens.` };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        }
      }
      return undefined;
    };
    run().then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    session.remove(`tab:${tabId}`);
  });
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading' && info.url) {
      session.remove(`tab:${tabId}`);
      browser.action.setBadgeText({ tabId, text: '' });
    }
  });
});
