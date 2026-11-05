const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');

for (const [name, viewport, touch] of [
  ['iPhone portrait', { width: 390, height: 844 }, true],
  ['iPhone paysage', { width: 844, height: 390 }, true],
  ['bureau', { width: 1280, height: 900 }, false]
]) {
  test(`${name} : raccourci photo, favoris et édition complète`, async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage({ viewport, isMobile: touch, hasTouch: touch });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Aucune requête distante : Firebase est simulé et les photos sont locales au test.
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'keskonmange.test' && url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
        if (url.pathname === '/firebase-config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.KM_STAGING_CONFIG = null;' });
        if (url.hostname === 'images.test' && url.pathname !== '/broken.png') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#D5DBCD"/></svg>' });
        return route.abort();
      });
      await page.goto('http://keskonmange.test/');
      await page.evaluate(() => {
        STATE = baseState([{
          id: 'soupe', nom: 'Soupe de carottes', portions: 2, tempsMinutes: 30,
          difficulte: 'facile', tags: [], effort: { temps: 'faible', technique: 'faible', vaisselle: 'faible' },
          ingredients: [{ ingredientId: 'carotte', nom: 'Carottes', quantite: 400, unite: 'g' }],
          etapes: ['Cuire les carottes.'],
          image: { url: 'https://images.test/old.png', source: 'Crédit initial' }
        }]);
        STATE.favorites = ['soupe'];
        STATE.plan = [{ id: 'repas', recipeId: 'soupe', portions: 4 }];
        window.initialState = clone(STATE); window.writes = 0;
        SYNC_CONNECTED = true;
        SYNC = { ready: true, async mutate(operation) {
          window.writes++;
          STATE = operation(STATE); renderView();
        } };
        unGate(); renderView(); recipeDetails('soupe');
      });
      if (process.env.PHOTO_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.PHOTO_SCREENSHOT_DIR, `photo-${viewport.width}.png`) });
      const pencil = page.locator('.detail-cover .detail-photo-edit');
      const favorite = page.locator('.detail-cover .favorite-button');
      const close = page.getByRole('button', { name: 'Fermer la fiche', exact: true });
      assert.equal(await pencil.count(), 1);
      assert.equal(await pencil.getAttribute('aria-label'), 'Changer la photo');
      const box = await pencil.boundingBox(), heart = await favorite.boundingBox(), cover = await page.locator('.detail-cover').boundingBox(), x = await close.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, 'cible tactile de 44 px minimum');
      assert.ok(box.x + box.width <= cover.x + cover.width && box.y >= cover.y);
      assert.ok(heart.x + heart.width <= box.x, 'aucun chevauchement avec le cœur');
      assert.ok(x.x + x.width < heart.x, 'fermeture accessible séparément');
      await pencil.focus();
      assert.equal(await pencil.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      await pencil.press('Enter');
      assert.equal(await page.getByRole('heading', { name: 'Modifier la photo', exact: true }).count(), 1);
      assert.equal(await page.locator('#photo-url').inputValue(), 'https://images.test/old.png');
      assert.equal(await page.evaluate(() => window.writes), 0, 'ouvrir ne modifie aucune donnée');
      await page.locator('#photo-url').fill('https://images.test/new.png');
      await page.locator('#photo-source').fill('Nouveau crédit');
      await page.getByRole('button', { name: 'Enregistrer la photo', exact: true }).click();
      await page.waitForFunction(() => UI.modal === 'recipe' && BUSY === 0);
      const actual = await page.evaluate(() => STATE);
      const initial = await page.evaluate(() => window.initialState);
      const expected = structuredClone(initial);
      expected.recipes[0].image = { url: 'https://images.test/new.png', source: 'Nouveau crédit' };
      assert.deepEqual(actual, expected, 'seule la photo est modifiée par le parcours existant');
      assert.equal(await favorite.getAttribute('aria-pressed'), 'true');
      await favorite.click();
      await page.waitForFunction(() => BUSY === 0 && STATE.favorites.length === 0);
      await favorite.click();
      await page.waitForFunction(() => BUSY === 0 && STATE.favorites.length === 1);
      await page.getByRole('button', { name: 'Modifier', exact: true }).click();
      assert.equal(await page.locator('#recipe-edit-form').count(), 1, 'édition complète préservée');
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();

      // Photo absente : même raccourci, même éditeur et aucune écriture avant validation.
      await page.evaluate(() => { STATE.recipes[0].image = null; recipeDetails('soupe'); });
      assert.equal(await pencil.getAttribute('aria-label'), 'Ajouter une photo');
      assert.equal(await page.locator('.detail-cover .recipe-photo-fallback').isVisible(), true);
      const writes = await page.evaluate(() => window.writes);
      await pencil.click();
      assert.equal(await page.locator('#photo-url').inputValue(), '');
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();
      assert.equal(await page.evaluate(() => window.writes), writes);
      assert.equal(await pencil.isVisible(), true);
      // Le lien texte existant reste disponible en bas de la fiche.
      await page.locator('.photo-controls [data-action="edit-image"]').click();
      assert.equal(await page.locator('#image-edit-form').count(), 1);
      await page.getByRole('button', { name: 'Annuler', exact: true }).click();

      // Une image indisponible ne doit pas masquer le raccourci.
      await page.evaluate(() => { STATE.recipes[0].image = { url: 'https://images.test/broken.png' }; recipeDetails('soupe'); });
      await page.waitForFunction(() => document.querySelector('.detail-cover .recipe-photo-fallback').hidden === false);
      assert.equal(await pencil.isVisible(), true);
      await pencil.click();
      assert.equal(await page.locator('#image-edit-form').count(), 1);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
