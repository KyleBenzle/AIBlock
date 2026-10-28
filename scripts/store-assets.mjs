// Generates Chrome Web Store screenshots (1280x800) and promo tile (440x280) into store/.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const EXT = join(root, '.output/chrome-mv3');
const out = (f) => join(root, 'store', f);
const server = createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end(readFileSync(join(root, 'store/demo.html'))); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'aib-')), {
  channel: 'chromium', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;
const set = (p) => sw.evaluate(async (p) => chrome.storage.local.set({ settings: { ...((await chrome.storage.local.get('settings')).settings ?? {}), ...p } }), p);

const page = await ctx.newPage();
await set({ removalMode: 'placeholder', sensitivity: 4 });
await page.goto(url);
await page.waitForSelector('[data-aib-ui]');
await page.waitForTimeout(500);
await page.screenshot({ path: out('screenshot-1-placeholders.png') });

// Popup on a backdrop.
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 360, height: 640 });
const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({ url: u + '*' }))[0].id, url);
await pop.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
await pop.waitForTimeout(500);
const popPng = (await pop.locator('main').screenshot()).toString('base64');
const bg = (await page.screenshot()).toString('base64');
const comp = await ctx.newPage();
await comp.setContent(`<body style="margin:0;width:1280px;height:800px;position:relative;overflow:hidden">
<img src="data:image/png;base64,${bg}" style="position:absolute;inset:0;filter:blur(2px) brightness(.85)">
<img src="data:image/png;base64,${popPng}" style="position:absolute;right:80px;top:40px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35)">
<div style="position:absolute;left:80px;top:300px;color:#fff;font:700 44px/1.2 system-ui;text-shadow:0 2px 12px rgba(0,0,0,.5);max-width:620px">Choose how much AI slop to block.</div></body>`);
await comp.screenshot({ path: out('screenshot-2-popup.png') });

const opt = await ctx.newPage();
await opt.goto(`chrome-extension://${id}/options.html`);
await opt.waitForTimeout(500);
await opt.screenshot({ path: out('screenshot-3-settings.png') });

const icon = readFileSync(join(root, 'public/icon/128.png')).toString('base64');
const tile = await ctx.newPage();
await tile.setViewportSize({ width: 440, height: 280 });
await tile.setContent(`<body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:22px;padding:0 34px;box-sizing:border-box;background:linear-gradient(135deg,#2b2b6e,#5b5bd6);font-family:system-ui;color:#fff">
<img src="data:image/png;base64,${icon}" width="96" height="96"><div><div style="font:800 34px/1.1 system-ui">Slop Blocker</div><div style="font:500 16px/1.4 system-ui;opacity:.9;margin-top:8px">Hide AI-generated content.<br>Local-first. No tracking.</div></div></body>`);
await tile.screenshot({ path: out('promo-small-440x280.png') });

await ctx.close();
server.close();
console.log('done');
