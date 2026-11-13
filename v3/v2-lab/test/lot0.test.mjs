import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import {
  clone, validateImport, RAYONS, searchRecipes, calculateNeeds, refreshCourses,
  addMeal, editMeal, removeMeal, courseRows, togglePurchase, addManualItem,
  changeRayon, editCourseItem, clearCourses, toggleFavorite, formatStepText,
} from '../../../core.mjs';
import { makeFixture, sourceData } from '../fixture.mjs';
import { makeLocalClient, storageKey, assertLocalEnvironment } from '../local-runtime.mjs';
import { verifySources, localHTML, createLabServer } from '../serve.mjs';

const root = new URL('../../../', import.meta.url);
const source = await readFile(new URL('index.html', root), 'utf8');
const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8');
const fixture = makeFixture(source);
const { catalogue, original } = sourceData(source);
const seed = fixture.state;
const key = storageKey(fixture.fixtureId);

function harness(initial = {}) {
  const map = new Map(Object.entries(initial));
  const calls = [];
  const storage = { getItem: k => map.get(k) ?? null, setItem(k, v) { map.set(k, v); } };
  let queue = Promise.resolve();
  const locks = { request(name, fn) { const next = queue.catch(() => {}).then(fn); queue = next; return next; } };
  const callbacks = { state: state => calls.push(clone(state)) };
  const options = { fixtureId: fixture.fixtureId, seed, storage, locks, callbacks };
  return { map, calls, storage, options, client: makeLocalClient(options) };
}

test('les dix fichiers de référence V2 sont inchangés', async () => {
  const lock = await verifySources();
  assert.equal(Object.keys(lock.files).length, 10);
});

test('la page locale conserve exactement le CSS, le cœur et les écrans V2', async () => {
  const { html } = localHTML(source, bootstrap, 'http://127.0.0.1:43820');
  assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], source.match(/<style>([\s\S]*?)<\/style>/)[1]);
  const core = (await readFile(new URL('core.mjs', root), 'utf8')).replaceAll('export ', '').trim();
  assert.ok(html.includes(core));
  for (const [from, to] of [['const navItems=', 'const isFavorite='],
    ['function recipeDetails(', 'function importOpen('],
    ['function renderPlanning()', 'function renderCourses()'],
    ["document.addEventListener('click'", "document.addEventListener('keydown'"]]) {
    const block = source.slice(source.indexOf(from), source.indexOf(to));
    assert.ok(block.length > 10 && html.includes(block), from);
  }
  assert.doesNotMatch(html, /bootStaging|firebase-config\.js|firebase-runtime\.mjs|serviceWorker\.register|v3\/engine|v3\/app/);
});

test('une source inattendue bloque la génération au lieu de démarrer Firebase', () => {
  assert.throws(() => localHTML(source.replace('bootStaging();', ''), bootstrap, 'http://127.0.0.1:43820'));
  assert.throws(() => localHTML(source.replace('src="./firebase-config.js"', 'src="./other.js"'), bootstrap, 'http://127.0.0.1:43820'));
});

test('les onze exemples ont leurs quantités, étapes et métadonnées V2 ; fixture déterministe', () => {
  const validated = validateImport(original);
  assert.equal(seed.recipes.length, 11);
  assert.deepEqual(makeFixture(source), fixture);
  seed.recipes.forEach((r, i) => {
    const { id, ingredients, ...rest } = r;
    assert.deepEqual(rest, Object.fromEntries(Object.entries(validated[i]).filter(([k]) => k !== 'ingredients')));
    assert.deepEqual(ingredients.map(({ ingredientId, ...g }) => g), validated[i].ingredients);
  });
  assert.equal(seed.favorites.length, 2);
  assert.equal(Object.keys(seed.shopping.overrides).length, 1);
  assert.equal(Object.keys(seed.shopping.purchased).length, 1);
});

test('seule la clé propre au lot 0 est lue et écrite ; seed et autres sauvegardes intacts', async () => {
  const untouched = { 'kmv2-state': '{"favoris":["original"]}', 'keskonmange:v3:app': 'autre prototype' };
  const h = harness(untouched), before = JSON.stringify(seed);
  const requested = [];
  h.storage.getItem = k => { requested.push(k); return h.map.get(k) ?? null; };
  await h.client.start();
  await h.client.mutate(s => toggleFavorite(s, s.recipes[2].id));
  await h.client.reset();
  assert.ok(requested.every(k => k === key));
  for (const [k, v] of Object.entries(untouched)) assert.equal(h.map.get(k), v);
  assert.equal(JSON.stringify(seed), before);
  assert.deepEqual(h.calls.at(-1), seed);
});

test('favoris, personnalisation, achats et planning sont conservés après réouverture', async () => {
  const h = harness(); await h.client.start();
  await h.client.mutate(s => addManualItem(toggleFavorite(s, s.recipes[3].id), '3 pièces Citrons', catalogue));
  const expected = h.calls.at(-1);
  const again = makeLocalClient(h.options); await again.start();
  assert.deepEqual(h.calls.at(-1), expected);
  assert.deepEqual(expected.shopping.overrides, seed.shopping.overrides);
  assert.deepEqual(expected.rayonOverrides, seed.rayonOverrides);
  assert.deepEqual(expected.shopping.purchased, seed.shopping.purchased);
});

test('échec du stockage : pas de faux état enregistré, ancienne sauvegarde conservée', async () => {
  const h = harness(); await h.client.start();
  const saved = h.map.get(key), notifications = h.calls.length;
  h.storage.setItem = () => { throw Error('QuotaExceededError'); };
  await assert.rejects(h.client.mutate(s => clearCourses(s)), /QuotaExceeded/);
  assert.equal(h.calls.length, notifications);
  assert.equal(h.map.get(key), saved);
});

test('une sauvegarde corrompue ne déclenche aucune remise à zéro silencieuse', async () => {
  for (const raw of ['pas du JSON', '{"schema":"autre"}']) {
    const h = harness({ [key]: raw });
    await assert.rejects(h.client.start());
    assert.equal(h.map.get(key), raw); assert.equal(h.client.ready, false);
    await h.client.reset();
    assert.deepEqual(h.calls.at(-1), seed);
  }
});

test('deux onglets écrivent sur le dernier état sous verrou, sans perdre des ajouts', async () => {
  const h = harness(); const other = makeLocalClient(h.options);
  await Promise.all([h.client.start(), other.start()]);
  await Promise.all([
    h.client.mutate(s => addManualItem(s, '2 biscuits test', catalogue)),
    other.mutate(s => addManualItem(s, '3 biscuits test', catalogue)),
  ]);
  assert.equal(h.calls.at(-1).shopping.manual.find(m => m.nom === 'biscuits test').quantite, 5);
});

test('configuration Firebase, origine étrangère, worker ou verrou absent : démarrage refusé', async () => {
  const safe = { location: new URL('http://127.0.0.1:43820'), expectedOrigin: 'http://127.0.0.1:43820',
    hasFirebaseConfig: false, serviceWorker: { controller: null, getRegistrations: async () => [] }, locks: { request() {} } };
  await assertLocalEnvironment(safe);
  for (const patch of [
    { hasFirebaseConfig: true }, { location: new URL('https://example.invalid') },
    { expectedOrigin: 'http://127.0.0.1:4173' }, { locks: null },
    { serviceWorker: { controller: {}, getRegistrations: async () => [] } },
    { serviceWorker: { controller: null, getRegistrations: async () => [{}] } },
  ]) await assert.rejects(assertLocalEnvironment({ ...safe, ...patch }));
});

test('la recherche V2 retrouve noms et ingrédients', () => {
  for (const query of ['poulet', 'potimarron', 'lentilles']) {
    const result = searchRecipes(seed.recipes, query, { pilot: catalogue, showOut: true });
    assert.ok(result.results.length > 0, query);
  }
});

test('les quantités et références des étapes suivent les portions V2', () => {
  const recipe = seed.recipes.find(r => r.etapes.some(s => s.includes('{{q:')));
  assert.ok(recipe);
  const step = recipe.etapes.find(s => s.includes('{{q:'));
  const base = formatStepText(step, recipe, recipe.portions);
  const doubled = formatStepText(step, recipe, recipe.portions * 2);
  assert.notEqual(doubled, base); assert.doesNotMatch(doubled, /\{\{q:/);
  assert.equal(step, recipe.etapes.find(s => s.includes('{{q:')));
});

test('planning : ajout, portions, retrait et actualisation explicite V2', () => {
  let state = { ...clone(seed), plan: [] };
  const recipe = state.recipes[0], ingredient = recipe.ingredients[0];
  state = addMeal(state, recipe.id, recipe.portions);
  const meal = state.plan[0];
  const before = clone(state.shopping.generated);
  state = editMeal(state, meal.id, recipe.portions * 2);
  assert.deepEqual(state.shopping.generated, before, 'le comportement V2 reste explicite');
  state = refreshCourses(state, catalogue);
  const row = Object.values(state.shopping.generated).find(g => g.ingredientId === ingredient.ingredientId);
  assert.equal(row.quantite, ingredient.quantite * 2);
  assert.deepEqual(calculateNeeds(state, catalogue), state.shopping.generated);
  assert.equal(removeMeal(state, meal.id).plan.length, 0);
  assert.throws(() => editMeal(state, meal.id, 0));
});

test('besoins communs regroupés, unités compatibles, quantités achetées conservées', () => {
  const recipe = seed.recipes[0];
  let state = { ...clone(seed), plan: [] };
  state = clearCourses(state);
  state = addMeal(state, recipe.id, recipe.portions);
  state = refreshCourses(state, catalogue);
  const initial = courseRows(state, catalogue)[0];
  state = togglePurchase(state, initial);
  state = addMeal(state, recipe.id, recipe.portions);
  state = refreshCourses(state, catalogue);
  const rows = courseRows(state, catalogue).filter(r => r.key === initial.key);
  assert.equal(rows.find(r => r.type === 'generated').quantite, initial.quantite);
  assert.equal(rows.find(r => r.type === 'purchased').quantite, initial.quantite);
});

test('manuel, quantité et rayon : personnalisations conservées après actualisation', () => {
  let state = addManualItem(seed, '2 pièces Citrons', catalogue);
  state = addManualItem(state, '1 pièce Citrons', catalogue);
  let row = courseRows(state, catalogue).find(r => r.type === 'manual' && /citron/i.test(r.nom));
  assert.equal(row.quantite, 3);
  state = editCourseItem(state, row, 4, 'pièce');
  state = changeRayon(state, row.ingredientId, 'epicerie');
  state = refreshCourses(state, catalogue);
  row = courseRows(state, catalogue).find(r => r.id === row.id);
  assert.equal(row.rayon, 'epicerie'); assert.equal(row.quantite, 4);
  assert.ok(RAYONS.findIndex(r => r[0] === 'epicerie') < RAYONS.findIndex(r => r[0] === 'hygiene'));
});

test('vider les courses conserve les recettes, favoris, planning et rayons V2', () => {
  const cleared = clearCourses(seed);
  assert.equal(courseRows(cleared, catalogue).length, 0);
  for (const field of ['recipes', 'favorites', 'plan', 'catalogCustom', 'rayonOverrides']) assert.deepEqual(cleared[field], seed[field]);
});

test('serveur local : liste blanche, CSP réseau fermée, absence de cache et protection Host', async t => {
  const port = 43821;
  const { server, expectedOrigin } = await createLabServer({ port });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const get = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, headers, method }, res => {
      let body = ''; res.on('data', data => body += data); res.on('end', () => resolve({ code: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
  const page = await get('/');
  assert.equal(page.code, 200); assert.equal(page.headers['cache-control'], 'no-store');
  for (const directive of ["connect-src 'none'", "worker-src 'none'", "manifest-src 'none'", "form-action 'none'", "img-src 'self' data:"]) assert.ok(page.headers['content-security-policy'].includes(directive));
  assert.ok(page.headers['content-security-policy'].includes("script-src 'self' 'sha256-"));
  for (const path of ['/firebase-config.js', '/firebase-runtime.mjs', '/service-worker.js', '/manifest.webmanifest',
    '/v3/app/index.html', '/v3/engine/index.mjs', '/index.html?raw', '/%2e%2e/index.html', '/.git/config', '/source-lock.json']) {
    assert.equal((await get(path)).code, 404, path);
  }
  assert.equal((await get('/', { Host: 'example.invalid' })).code, 403);
  assert.equal((await get('/', { Origin: 'https://example.invalid' })).code, 403);
  assert.equal((await get('/', {}, 'POST')).code, 405);
  for (const path of ['/v3/v2-lab/local-runtime.mjs', '/core.mjs', '/firebase-sync.mjs']) assert.equal((await get(path)).code, 200, path);
});
