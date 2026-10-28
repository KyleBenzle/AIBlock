import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXT = join(import.meta.dirname, '../.output/chrome-mv3');
const FIX = join(import.meta.dirname, '../tests/fixtures');
let server: Server;
let base = '';
const userDir = mkdtempSync(join(tmpdir(), 'aib-'));

test.beforeAll(async () => {
  server = createServer((req, res) => {
    try {
      res.setHeader('content-type', 'text/html');
      res.end(readFileSync(join(FIX, (req.url ?? '/').replace(/[^\w-]/g, '') + '.html')));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
test.afterAll(() => server.close());

async function launch(): Promise<[BrowserContext, Worker]> {
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  return [ctx, sw];
}
const setSettings = (sw: Worker, patch: object) =>
  sw.evaluate(async (p) => {
    const cur = (await chrome.storage.local.get('settings')).settings ?? {};
    await chrome.storage.local.set({ settings: { ...cur, ...p } });
  }, patch);

test('filters, placeholders, restore, dynamic content, allowlist, persistence', async () => {
  let [ctx, sw] = await launch();
  const page = await ctx.newPage();
  await page.goto(base + '/labels');
  const blocked = page.locator('[data-expect="blocked"]');
  await expect(page.locator('[data-aib-hidden]')).toHaveCount(await blocked.count());
  for (const el of await page.locator('[data-expect="visible"]').all()) await expect(el).toBeVisible();
  for (const el of await blocked.all()) await expect(el).toBeHidden();

  // Placeholder mode applies live.
  await setSettings(sw, { removalMode: 'placeholder' });
  await expect(page.locator('[data-aib-ui="placeholder"]')).toHaveCount(await blocked.count());
  await page.locator('[data-aib-ui="placeholder"] button', { hasText: 'Reveal' }).first().click();
  await expect(page.locator('[data-aib-ui="placeholder"]')).toHaveCount((await blocked.count()) - 1);

  // Dynamic insertion.
  await page.evaluate(() => {
    const li = document.createElement('li');
    li.id = 'dyn';
    li.innerHTML = '<p>new</p><span>AI-generated</span>';
    document.querySelector('ul.comments')!.append(li);
  });
  await expect(page.locator('#dyn')).toBeHidden();

  // Global off restores everything.
  await setSettings(sw, { enabled: false });
  await expect(page.locator('[data-aib-hidden]')).toHaveCount(0);
  await expect(page.locator('[data-aib-ui]')).toHaveCount(0);
  await setSettings(sw, { enabled: true });
  await expect(page.locator('[data-aib-hidden]').first()).toBeAttached();

  // Badge count recorded by background.
  const counts = await sw.evaluate(async () => Object.entries(await chrome.storage.session.get(null)).filter(([k]) => k.startsWith('tab:')));
  expect(counts.length).toBeGreaterThan(0);

  // Allowlist.
  await setSettings(sw, { allowlist: ['127.0.0.1'] });
  await expect(page.locator('[data-aib-hidden]')).toHaveCount(0);
  await setSettings(sw, { allowlist: [], sensitivity: 4 });

  // Restart: settings persist.
  await ctx.close();
  [ctx, sw] = await launch();
  const s = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  expect(s).toMatchObject({ removalMode: 'placeholder', sensitivity: 4 });
  const p2 = await ctx.newPage();
  await p2.goto(base + '/mixed');
  await expect(p2.locator('li[data-level="4"]')).toBeHidden();
  await expect(p2.locator('li[data-level="5"]')).toBeVisible();

  // Popup renders and shows count.
  const id = new URL(sw.url()).host;
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.getByRole('heading', { name: 'Slop Blocker' })).toBeVisible();
  await expect(popup.getByRole('slider')).toHaveValue('4');
  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${id}/options.html`);
  await expect(opts.getByText('AI-assisted detection (optional)')).toBeVisible();
  await ctx.close();
});
