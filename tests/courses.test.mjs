import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as core from '../core.mjs';
import { encodeSharedState, decodeSharedState, transactionTransform } from '../firebase-sync.mjs';

// L'interface contient aussi une copie du moteur : vérifier les deux versions.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const inlineCore = html.split('<script>')[1].split('// Pilote V2 Firebase :')[0];
const context = vm.createContext({});
vm.runInContext(inlineCore, context);
const plain = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = core.baseState([{
    id: 'soupe', nom: 'Soupe', portions: 2,
    ingredients: [{ ingredientId: 'carotte', nom: 'Carottes', quantite: 400, unite: 'g' }]
  }]);
  state.favorites = ['soupe'];
  state.plan = [{ id: 'repas', recipeId: 'soupe', portions: 4 }];
  state.catalogCustom = [{ id: 'carotte', nom: 'Carottes', rayon: 'fruits_legumes' }];
  state.rayonOverrides = { carotte: 'fruits_legumes' };
  const generated = core.refreshCourses(state);
  const item = generated.shopping.generated['carotte|g'];
  generated.shopping.purchased['carotte|g'] = { ...item, quantite: 200 };
  generated.shopping.overrides['carotte|g'] = { quantite: 900, unite: 'g' };
  generated.shopping.manual = [
    { id: 'sel', ingredientId: 'sel', nom: 'Sel', quantite: 1, unite: 'pièce', checked: false },
    { id: 'pain', ingredientId: 'pain', nom: 'Pain', quantite: 1, unite: 'pièce', checked: true }
  ];
  return generated;
}

for (const [name, engine] of [['module', core], ['interface intégrée', context]]) {
  test(`${name} : vider tous les articles sans modifier recettes, favoris ni planning`, () => {
    const state = fixture(), before = structuredClone(state);
    assert.equal(engine.courseRows(state).length, 4);
    const cleared = engine.clearCourses(state);
    assert.deepEqual(plain(cleared.shopping), { generated: {}, purchased: {}, manual: [], overrides: {} });
    assert.equal(engine.courseRows(cleared).length, 0);
    for (const key of ['recipes', 'favorites', 'plan', 'catalogCustom', 'rayonOverrides']) {
      assert.deepEqual(plain(cleared[key]), before[key]);
    }
    assert.deepEqual(state, before, 'ne pas muter l’état partagé reçu');
    assert.deepEqual(plain(engine.clearCourses(cleared)), plain(cleared));
  });

  test(`${name} : Actualiser régénère les besoins du planning après effacement`, () => {
    const refreshed = engine.refreshCourses(engine.clearCourses(fixture()));
    const rows = engine.courseRows(refreshed);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].quantite, 800);
    assert.equal(rows[0].type, 'generated');
    assert.deepEqual(plain(refreshed.shopping.manual), []);
    assert.deepEqual(plain(refreshed.shopping.purchased), {});
  });
}

test('transaction Firebase : utiliser le dernier état et propager un panier vide encodé', () => {
  const latest = fixture();
  latest.recipes.push({ id: 'nouvelle', nom: 'Ajout autre compte', portions: 2, ingredients: [] });
  latest.favorites.push('nouvelle');
  latest.plan.push({ id: 'autre-repas', recipeId: 'nouvelle', portions: 2 });
  const raw = transactionTransform(encodeSharedState(latest), core.clearCourses);
  const otherAccount = decodeSharedState(raw);
  assert.equal(core.courseRows(otherAccount).length, 0);
  assert.deepEqual(otherAccount.recipes, latest.recipes);
  assert.deepEqual(otherAccount.favorites, latest.favorites);
  assert.deepEqual(otherAccount.plan, latest.plan);
});
