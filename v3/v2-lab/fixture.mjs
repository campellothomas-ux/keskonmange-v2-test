// Des exemples livrés avec la V2, jamais une copie des données du foyer.
import {
  baseState, validateImport, findIngredient, clone, qtyKey,
  refreshCourses, editCourseItem, courseRows, togglePurchase,
} from '../../core.mjs';

export const FIXTURE_ID = 'v2-exemples-lot0-1';

export function sourceData(html) {
  const literal = name => {
    const matches = [...html.matchAll(new RegExp(`^const ${name} = (.+);$`, 'gm'))];
    if (matches.length !== 1) throw Error(`Source V2 inattendue : ${name}`);
    return JSON.parse(matches[0][1]);
  };
  return { catalogue: literal('PILOT_CATALOGUE'), original: literal('DEMO_IMPORT') };
}

export function makeFixture(html) {
  const { catalogue, original } = sourceData(html);
  let state = baseState();
  state.recipes = validateImport(original).map((r, i) => ({
    ...r, id: `lot0-recette-${i + 1}`,
    ingredients: r.ingredients.map(g => {
      let entry = findIngredient(g.nom, [...catalogue, ...state.catalogCustom]);
      if (!entry) {
        entry = { id: `lot0-ingredient-${state.catalogCustom.length + 1}`, nom: g.nom,
          rayon: g.meta.rayon, alias: g.meta.alias, familles: g.meta.familles, unites: [g.unite] };
        state.catalogCustom.push(entry);
      }
      return { ...g, ingredientId: entry.id };
    }),
  }));
  state.favorites = state.recipes.slice(0, 2).map(r => r.id);
  state.plan = state.recipes.slice(0, 3).map((r, i) => ({
    id: `lot0-repas-${i + 1}`, recipeId: r.id, portions: [2, 3, 4][i],
  }));
  state = refreshCourses(state, catalogue);
  const [customized, checked] = courseRows(state, catalogue);
  state = editCourseItem(state, customized, customized.quantite + 10, customized.unite);
  state = togglePurchase(state, checked);
  const soap = { id: 'lot0-savon', nom: 'Savon (test)', rayon: 'hygiene', alias: [], familles: [], unites: ['pièce'] };
  state.catalogCustom.push(soap);
  state.rayonOverrides[soap.id] = 'hygiene';
  state.shopping.manual.push({ id: 'lot0-manuel-1', ingredientId: soap.id, nom: soap.nom,
    key: qtyKey(soap.id, 'pièce').key, quantite: 2, unite: 'pièce', checked: false });
  return { fixtureId: FIXTURE_ID, state: clone(state) };
}
