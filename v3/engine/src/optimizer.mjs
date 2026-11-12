import {Q, integer, positive, requireThat, EngineError, unique} from './exact.mjs';
import {ingredientMap, validateCatalog} from './model.mjs';
import {stockAvailable, calculateBasket} from './basket.mjs';
import {calculateRequirements} from './requirements.mjs';

export function optimizeMenus(input) {
  const {recipes, ingredients, products, session, state = {}, mealCount, diners, leftovers,
    producePortions, indivisiblePolicy, manual = [], budget, policy = {}, constraints = {}} = input;
  unique(recipes,'recipes'); const map = ingredientMap(ingredients);
  validateCatalog(products,ingredients,session); stockAvailable(state,ingredients);
  integer(mealCount,'mealCount'); requireThat(mealCount <= 30,'RESOURCE_LIMIT','at most 30 meals');
  positive(diners,'diners'); requireThat(['keep','discard'].includes(leftovers),'LEFTOVER_POLICY_REQUIRED','optimizer');
  if (producePortions !== undefined) positive(producePortions,'producePortions');
  const maxCandidates = integer(input.maxCandidates ?? 2000,'maxCandidates');
  const maxRepeats = integer(constraints.maxRepeats ?? 1,'maxRepeats');
  const minDistinct = integer(constraints.minDistinct ?? 1,'minDistinct');
  for (const field of ['excludedIngredients','allergies','requiredDietTags'])
    requireThat(constraints[field] === undefined || Array.isArray(constraints[field]) && constraints[field].every(x => typeof x === 'string'),
      'INVALID_CONSTRAINT',field);
  for (const id of constraints.excludedIngredients ?? []) requireThat(map.has(id),'UNKNOWN_INGREDIENT',id);
  if (constraints.maxPerFamily !== undefined) integer(constraints.maxPerFamily,'maxPerFamily');
  if (budget) { integer(budget.cents,'budget cents',true); requireThat(typeof budget.strict === 'boolean','INVALID_BUDGET','strict flag required'); }
  for (const name of ['repeatPenaltyCents','familyRepeatPenaltyCents','preferencePenaltyCents','historyPenaltyCents','budgetOverPenaltyPerCent']) {
    integer(policy[name] ?? 0,name,true);
  }
  for (const name of ['wasteRateCents','perishableStockRateCents']) {
    for (const [id,rate] of Object.entries(policy[name] ?? {})) {
      requireThat(map.has(id),'UNKNOWN_INGREDIENT',id); positive(rate,`${name}/${id}`,true);
      if (name === 'perishableStockRateCents') requireThat(map.get(id).perishable === true,'INVALID_POLICY',`${id} is not marked perishable`);
    }
  }
  const rejected = [], eligible = [];
  const baseMeal = r => ({id:'validation',recipeId:r.id,diners,leftovers,...(producePortions === undefined ? {} : {producePortions}),
    ...(indivisiblePolicy === undefined ? {} : {indivisiblePolicy})});
  for (const r of [...recipes].sort((a,b) => a.id < b.id ? -1 : 1)) {
    try {
      calculateRequirements([r],[baseMeal(r)],ingredients);
      requireThat(!r.ingredients.some(g => (constraints.excludedIngredients ?? []).includes(g.ingredientId)), 'DIET_EXCLUSION',r.id);
      for (const g of r.ingredients) {
        const i = map.get(g.ingredientId);
        if ((constraints.allergies ?? []).length) {
          requireThat(Array.isArray(i.allergens),'UNKNOWN_ALLERGENS',i.id);
          requireThat(!i.allergens.some(a => constraints.allergies.includes(a)),'ALLERGY_EXCLUSION',r.id);
        }
      }
      requireThat((constraints.requiredDietTags ?? []).every(t => r.verifiedDietTags?.includes(t)), 'UNVERIFIED_DIET',r.id);
      if (constraints.maxPerFamily !== undefined || policy.familyRepeatPenaltyCents) requireThat(typeof r.family === 'string' && r.family.length > 0,'UNKNOWN_FAMILY',r.id);
      eligible.push(r);
    } catch (e) { if (!(e instanceof EngineError)) throw e; rejected.push({recipeId:r.id,code:e.code,detail:e.message}); }
  }
  const preferred = new Set(policy.preferredRecipeIds ?? []), history = new Set(policy.historyRecipeIds ?? []);
  const failures = {}, chosen = [], repeats = new Map(), families = new Map();
  let visited = 0, feasible = 0, truncated = false, best = null;
  function evaluate() {
    if (visited >= maxCandidates) { truncated = true; return; }
    visited++;
    if (new Set(chosen.map(r => r.id)).size < minDistinct) { failures.VARIETY_CONSTRAINT = (failures.VARIETY_CONSTRAINT ?? 0)+1; return; }
    try {
      const meals = chosen.map((r,k) => ({...baseMeal(r),id:`meal-${k+1}`}));
      const basket = calculateBasket({recipes,meals,ingredients,products,session,state,manual,maxStates:input.maxStates});
      if (budget?.strict) {
        requireThat(basket.cart.strictBudgetVerifiable,'BUDGET_UNVERIFIABLE','essential prices must be observed in this session');
        requireThat(basket.cart.totalCents <= budget.cents,'BUDGET_EXCEEDED','whole cart exceeds budget');
      }
      const distinct = new Set(chosen.map(r => r.id)).size;
      const distinctFamilies = new Set(chosen.map(r => r.family).filter(Boolean)).size;
      let score = Q.of(basket.cart.totalCents ?? basket.cart.knownSubtotalCents)
        .add(Q.of(policy.repeatPenaltyCents ?? 0).mul(mealCount-distinct))
        .add(Q.of(policy.familyRepeatPenaltyCents ?? 0).mul(policy.familyRepeatPenaltyCents ? mealCount-distinctFamilies : 0))
        .add(Q.of(policy.preferencePenaltyCents ?? 0).mul(preferred.size ? chosen.filter(r => !preferred.has(r.id)).length : 0))
        .add(Q.of(policy.historyPenaltyCents ?? 0).mul(chosen.filter(r => history.has(r.id)).length));
      if (budget && !budget.strict && basket.cart.totalCents !== null && basket.cart.totalCents > budget.cents)
        score = score.add(Q.of(policy.budgetOverPenaltyPerCent ?? 0).mul(basket.cart.totalCents-budget.cents));
      const stockUsed = {}, purchaseSurplus = {};
      for (const [id,q] of Object.entries(basket.quantities)) {
        stockUsed[id] = q.fromStock; purchaseSurplus[id] = q.purchaseSurplus;
        score = score.add(Q.of(policy.wasteRateCents?.[id] ?? 0).mul(q.purchaseSurplus));
        score = score.sub(Q.of(policy.perishableStockRateCents?.[id] ?? 0).mul(q.fromStock));
      }
      feasible++;
      const incomplete = basket.cart.totalCents === null;
      if (!best || Number(incomplete) < Number(best.incomplete) || incomplete === best.incomplete && score.cmp(best.score) < 0)
        best = {meals,basket,score:score.toString(),incomplete,metrics:{distinctRecipes:distinct,distinctFamilies,stockUsed,purchaseSurplus}};
    } catch (e) { if (!(e instanceof EngineError)) throw e; failures[e.code] = (failures[e.code] ?? 0)+1; }
  }
  function visit(start) {
    if (chosen.length === mealCount) { evaluate(); return; }
    for (let k = start; k < eligible.length && !truncated; k++) {
      const r = eligible[k], used = repeats.get(r.id) ?? 0, familyUsed = families.get(r.family) ?? 0;
      if (used >= maxRepeats || constraints.maxPerFamily !== undefined && familyUsed >= constraints.maxPerFamily) continue;
      chosen.push(r); repeats.set(r.id,used+1); families.set(r.family,familyUsed+1);
      visit(k); chosen.pop(); repeats.set(r.id,used); families.set(r.family,familyUsed);
    }
  }
  visit(0);
  const dataRejected = rejected.some(r => !['DIET_EXCLUSION','ALLERGY_EXCLUSION'].includes(r.code));
  const dataFailures = Object.keys(failures).some(c => !['VARIETY_CONSTRAINT','BUDGET_EXCEEDED'].includes(c));
  const proof = !truncated && !dataRejected && !dataFailures && best?.basket.packageOptimal && !best?.incomplete;
  return {status:best ? best.incomplete ? 'needs_prices' : 'feasible' : truncated ? 'search_limit' : dataRejected || dataFailures ? 'needs_data' : 'infeasible',
    solution:best,search:{visited,feasible,truncated,rejected,failures,
      optimal:!!proof,scope:'two-stage: cheapest cover per menu, then explicit menu score; unordered menus, no expiry scheduling',
      priceBasis:'provided catalog amounts, including estimates; not a claim about real shop prices'}};
}
