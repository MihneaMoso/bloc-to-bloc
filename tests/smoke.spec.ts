import { test, expect } from '@playwright/test';

test('mobile smoke: onboarding, 2D placement, simulated contribution, sponsor request', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?demo=1');
  await expect(page.locator('.splash-title')).toHaveText('Bloc-Cu-Bloc');

  // Invalid nickname is rejected inline.
  await page.fill('#nickname', 'ab');
  await page.click('#join-form button[type="submit"]');
  await expect(page.locator('#nick-error')).toContainText('3 caractere');

  // Valid fictional profile.
  await page.fill('#nickname', 'Evaluator Demo');
  await page.selectOption('#team', 'alumni2010');
  await page.fill('#ref', 'HIPO-TEST');
  await page.click('#join-form button[type="submit"]');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#hud-name')).toHaveText('Evaluator Demo');

  // Force deterministic 2D fallback so placement coordinates are stable.
  await page.click('#btn-menu');
  const renderValue = await page.locator('[data-menu="render"] .mi-value').textContent();
  if ((renderValue ?? '').includes('3D')) await page.click('[data-menu="render"]');
  else await page.click('[data-close-panel]');
  await expect(page.locator('#fallback2d')).toBeVisible();
  await page.click('[data-tut="skip"]').catch(() => {});

  const canvas = await page.locator('#fallback2d').boundingBox();
  expect(canvas).not.toBeNull();
  if (!canvas) return;
  const scale = Math.min(canvas.width / 31, canvas.height / 40);
  const ox = canvas.width / 2;
  const oy = canvas.height * 0.46;
  const xs = [-9, -3, 3, 9];
  const zs = [-4.6, 4.6];
  let placed = false;
  for (const z of zs) {
    for (const x of xs) {
      await page.mouse.click(canvas.x + ox + x * scale, canvas.y + oy + z * scale);
      await page.waitForTimeout(260);
      const texts = await page.locator('.toast').allTextContents();
      if (texts.some((tx) => tx.includes('plasată') || tx.includes('placed'))) { placed = true; break; }
    }
    if (placed) break;
  }
  expect(placed).toBe(true);

  // Simulated contribution flow: persistent banner, invalid amount, successful result.
  await page.click('#tool-contribute');
  await expect(page.locator('.sim-banner').first()).toContainText('SIMULARE DEMONSTRATIVĂ');
  await expect(page.locator('input[autocomplete="cc-number"]')).toHaveCount(0);
  await page.fill('#contrib-custom', '2');
  await page.click('#contrib-submit');
  await expect(page.locator('#contrib-error')).toContainText('5 și 10.000');
  await page.fill('#contrib-custom', '75');
  await page.click('#contrib-submit');
  await expect(page.locator('.result-amount')).toContainText('+75 lei');
  await expect(page.locator('.sim-banner')).toContainText('nicio plată reală');
  const realLink = page.locator('.modal a[href*="fundatia.upb.ro"]').first();
  await expect(realLink).toHaveAttribute('target', '_blank');
  await expect(realLink).toHaveAttribute('rel', /noopener/);
  await page.locator('.modal-actions [data-close]').first().click();

  // Impact panel separates official figures from the simulation.
  await page.click('#btn-menu');
  await page.click('[data-open="impact"]');
  await expect(page.locator('.stat-card.official')).toHaveCount(2);
  await expect(page.locator('.drawer')).toContainText('estimare publicată de Fundație');
  await expect(page.locator('.drawer a[href*="fundatia.upb.ro"]').first()).toHaveAttribute('rel', /noopener/);
  await page.locator('[data-close-panel]').click();

  // Sponsor request form stores a clearly labelled demo request.
  await page.click('#btn-menu');
  await page.click('[data-open="sponsors"]');
  await page.locator('[data-sponsor="s2"]').click();
  await page.fill('#sp-company', 'Demo Company SRL');
  await page.fill('#sp-contact', 'Alex Demo');
  await page.fill('#sp-email', 'contact@demo.example');
  await page.fill('#sp-message', 'Discuție demonstrativă.');
  await page.fill('#sp-banner', 'Construim împreună campusul.');
  await page.click('#sp-submit');
  await expect(page.locator('.modal-body').last()).toContainText('Cerere demonstrativă înregistrată local');
});
