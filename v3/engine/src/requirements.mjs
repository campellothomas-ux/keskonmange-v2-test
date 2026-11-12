import {Q, positive, requireThat, text, unique} from './exact.mjs';
import {ingredientMap, canonicalQuantity} from './model.mjs';

export function calculateRequirements(recipes, meals, ingredients) {
  unique(recipes, 'recipes'); unique(meals, 'meals');
  const map = ingredientMap(ingredients), byId = new Map(recipes.map(r => [r.id, r]));
  const needs = new Map(), preparations = [];
  for (const m of meals) {
    const r = byId.get(m.recipeId); requireThat(r, 'UNKNOWN_RECIPE', m.recipeId);
    const yieldPortions = positive(r.yieldPortions, `${r.id}/yieldPortions`);
    const diners = positive(m.diners, `${m.id}/diners`);
    // Diners alone do not scale a batch. Scaling requires an explicit decision.
    const produced = m.producePortions === undefined ? yieldPortions : positive(m.producePortions, `${m.id}/producePortions`);
    requireThat(produced.cmp(yieldPortions) === 0 || r.scalable === true, 'RECIPE_NOT_SCALABLE', r.id);
    requireThat(produced.cmp(diners) >= 0, 'INSUFFICIENT_PORTIONS', m.id);
    requireThat(['keep','discard'].includes(m.leftovers), 'LEFTOVER_POLICY_REQUIRED', m.id);
    const factor = produced.div(yieldPortions), rounding = [];
    requireThat(Array.isArray(r.ingredients) && r.ingredients.length > 0, 'INVALID_RECIPE', r.id);
    for (const g of r.ingredients) {
      text(g.ingredientId, r.id);
      const i = map.get(g.ingredientId); requireThat(i, 'UNKNOWN_INGREDIENT', g.ingredientId);
      let q = canonicalQuantity(g.quantity, i).mul(factor); positive(q, `${r.id}/${i.id}`);
      if (i.indivisible && q.d !== 1n) {
        requireThat(m.indivisiblePolicy === 'ceil', 'INDIVISIBLE_ROUNDING_REQUIRED', i.id);
        const rounded = new Q(q.ceil()); rounding.push({ingredientId:i.id, exact:q.toString(), prepared:rounded.toString()}); q = rounded;
      }
      needs.set(i.id, (needs.get(i.id) ?? Q.of(0)).add(q));
    }
    const left = produced.sub(diners).toString();
    preparations.push({mealId:m.id, recipeId:r.id, diners:diners.toString(), producedPortions:produced.toString(),
      keptPortions:m.leftovers === 'keep' ? left : '0', discardedPortions:m.leftovers === 'discard' ? left : '0', rounding});
  }
  return {needs:Object.fromEntries([...needs].sort(([a],[b]) => a < b ? -1 : 1).map(([id,q]) => [id,q.toString()])), preparations};
}
