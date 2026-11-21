import { chromium } from 'playwright';
const URL = 'https://bloc-cu-bloc-ten.vercel.app/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
try {
  const res = await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('status:', res.status());
  console.log('title:', await page.title());
  console.log('splash visible:', await page.locator('#splash').isVisible());
  console.log('splash heading:', (await page.locator('.splash-title').textContent().catch(() => ''))?.trim());
  await page.screenshot({ path: 'release/assets/public-mobile.png' });
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no-sw';
    const r = await navigator.serviceWorker.ready.catch(() => null);
    return r ? 'ready' : 'no-reg';
  });
  console.log('service worker:', sw);
  console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  await browser.close();
}
