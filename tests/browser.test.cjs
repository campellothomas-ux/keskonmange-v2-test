const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { chromium } = require('playwright');
const html = readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');

// Aucun accès réseau ni écriture Firebase : seul le transport est simulé.
test('interface mobile : confirmation, transaction immédiate, échec, hors connexion et Actualiser', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname === '/firebase-config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.KM_STAGING_CONFIG = null;' });
      return route.abort();
    });
    await page.goto('http://keskonmange.test/');
    await page.evaluate(() => {
      STATE = baseState([{ id: 'soupe', nom: 'Soupe', portions: 2, ingredients: [{ ingredientId: 'carotte', nom: 'Carottes', quantite: 400, unite: 'g' }] }]);
      STATE.favorites = ['soupe'];
      STATE.plan = [{ id: 'repas', recipeId: 'soupe', portions: 4 }];
      STATE = refreshCourses(STATE);
      STATE = addManualItem(STATE, 'Pain');
      STATE.shopping.manual[0].checked = true;
      window.beforeClear = clone(STATE);
      window.writes = 0;
      SYNC_CONNECTED = true;
      SYNC = { ready: true, async mutate(fn) {
        window.writes++;
        if (window.failWrite) throw Error('Transaction refusée');
        if (window.delayWrite) await new Promise(resolve => { window.finishWrite = resolve; });
        STATE = fn(STATE); renderView();
      } };
      UI.view = 'courses'; unGate(); renderView();
    });
    const clear = page.getByRole('button', { name: 'Vider la liste', exact: true });
    const confirm = page.getByRole('button', { name: 'Oui, vider la liste', exact: true });
    assert.equal(await clear.count(), 1);
    await clear.click();
    assert.equal(await page.evaluate(() => window.writes), 0);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    assert.equal(await page.evaluate(() => window.writes), 0);
    assert.equal(await page.evaluate(() => courseRows(STATE).length), 2);

    await page.evaluate(() => { window.failWrite = true; });
    await clear.click(); await confirm.click();
    await page.waitForFunction(() => window.writes === 1 && BUSY === 0);
    assert.equal(await confirm.isEnabled(), true);
    assert.equal(await page.evaluate(() => courseRows(STATE).length), 2);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();

    await page.evaluate(() => { window.failWrite = false; SYNC_CONNECTED = false; });
    await clear.click(); await confirm.click();
    assert.equal(await page.evaluate(() => window.writes), 1);
    assert.equal(await confirm.isEnabled(), true);
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();

    await page.evaluate(() => { SYNC_CONNECTED = true; window.delayWrite = true; });
    await clear.click(); await confirm.click();
    await page.waitForFunction(() => typeof window.finishWrite === 'function');
    assert.equal(await confirm.isDisabled(), true);
    assert.equal(await page.evaluate(() => courseRows(STATE).length), 2, 'attendre le succès serveur');
    await page.evaluate(() => { window.delayWrite = false; window.finishWrite(); });
    await page.waitForFunction(() => BUSY === 0 && UI.modal === null);
    assert.equal(await page.evaluate(() => courseRows(STATE).length), 0);
    assert.equal(await clear.isDisabled(), true);
    const preserved = await page.evaluate(() => ['recipes', 'favorites', 'plan'].every(key => JSON.stringify(STATE[key]) === JSON.stringify(window.beforeClear[key])));
    assert.equal(preserved, true);
    await page.getByRole('button', { name: /Actualiser/ }).click();
    await page.waitForFunction(() => BUSY === 0 && courseRows(STATE).length === 1);
    assert.equal(await page.evaluate(() => courseRows(STATE)[0].quantite), 800);

    // Focus portrait et paysage : tailles réellement calculées, sans désactiver le zoom volontaire.
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const input = page.getByRole('textbox', { name: 'Nouvel article' });
      await input.focus();
      assert.ok(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16));
      await page.evaluate(() => {
        const probe = document.createElement('div'); probe.id = 'input-probes';
        probe.innerHTML = '<textarea class="field mono"></textarea><select class="field"><option>Test</option></select><input type="number" class="field">';
        document.body.append(probe);
      });
      const sizes = await page.locator('#input-probes > *').evaluateAll(elements => elements.map(el => parseFloat(getComputedStyle(el).fontSize)));
      assert.ok(sizes.every(size => size >= 16));
      await page.locator('#input-probes').evaluate(el => el.remove());
    }
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).touchAction), 'manipulation');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    assert.doesNotMatch(viewport, /user-scalable=no|maximum-scale=1/);
    assert.equal(await page.evaluate(() => {
      const event = new Event('gesturestart', { bubbles: true, cancelable: true });
      document.dispatchEvent(event); return event.defaultPrevented;
    }), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
