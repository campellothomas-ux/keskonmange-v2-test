import {Q,integer,positive,requireThat,text,unique,minQ} from './exact.mjs';
import {ingredientMap,validateCatalog} from './model.mjs';
import {stockAvailable} from './basket.mjs';
import {productionRequirements,resolveProduction} from './production.mjs';
import {jointBasket} from './joint-packages.mjs';
import {emptyStock} from './ledger.mjs';

export const initialMenu=id=>({version:2,id:text(id,'menu.id'),revision:0,meals:[],reservationIds:{}});
export function validateContext(c) {
  unique(c.recipes,'recipes');const ingredients=ingredientMap(c.ingredients);
  validateCatalog(c.products,c.ingredients,c.session);stockAvailable(c.state??emptyStock(),c.ingredients);
  const constraints=c.constraints??{},policy=c.policy??{};
  for(const f of ['excludedIngredients','allergies','requiredDietTags'])requireThat(constraints[f]===undefined||
    Array.isArray(constraints[f])&&constraints[f].every(x=>typeof x==='string'),'INVALID_CONSTRAINT',f);
  for(const id of constraints.excludedIngredients??[])requireThat(ingredients.has(id),'UNKNOWN_INGREDIENT',id);
  for(const f of ['maxRepeats','minDistinct','maxPerFamily'])if(constraints[f]!==undefined)integer(constraints[f],f);
  for(const f of ['repeatPenaltyCents','familyRepeatPenaltyCents','preferencePenaltyCents','historyPenaltyCents','budgetOverPenaltyPerCent'])integer(policy[f]??0,f,true);
  for(const f of ['preferredRecipeIds','historyRecipeIds'])requireThat(policy[f]===undefined||Array.isArray(policy[f])&&policy[f].every(x=>typeof x==='string'),'INVALID_POLICY',f);
  for(const f of ['wasteRateCents','perishableStockRateCents'])for(const [id,rate]of Object.entries(policy[f]??{})) {
    requireThat(ingredients.has(id),'UNKNOWN_INGREDIENT',id);positive(rate,f,true);
    if(f==='perishableStockRateCents')requireThat(ingredients.get(id).perishable===true,'INVALID_POLICY',id);
  }
  if(c.budget){integer(c.budget.cents,'budget.cents',true);requireThat(typeof c.budget.strict==='boolean','INVALID_BUDGET','strict');}
  return ingredients;
}
export function checkRecipeConstraints(context,recipe) {
  const constraints=context.constraints??{},map=ingredientMap(context.ingredients);
  requireThat(Array.isArray(recipe.ingredients)&&recipe.ingredients.length,'INVALID_RECIPE',recipe.id);
  for(const g of recipe.ingredients) {
    const i=map.get(g.ingredientId);requireThat(i,'UNKNOWN_INGREDIENT',g.ingredientId);
    requireThat(!(constraints.excludedIngredients??[]).includes(i.id),'DIET_EXCLUSION',i.id);
    if(constraints.allergies?.length) {
      requireThat(Array.isArray(i.allergens),'UNKNOWN_ALLERGENS',i.id);
      requireThat(!i.allergens.some(a=>constraints.allergies.includes(a)),'ALLERGY_EXCLUSION',i.id);
    }
  }
  requireThat((constraints.requiredDietTags??[]).every(t=>recipe.verifiedDietTags?.includes(t)),'UNVERIFIED_DIET',recipe.id);
  if(constraints.maxPerFamily!==undefined || context.policy?.familyRepeatPenaltyCents)text(recipe.family,'recipe.family');
}
export function validateMenu(menu) {
  requireThat(menu?.version===2,'INVALID_MENU','version 2 required');text(menu.id,'menu.id');integer(menu.revision,'menu.revision',true);
  unique(menu.meals,'meals'); requireThat(menu.meals.length<=30,'RESOURCE_LIMIT','at most 30 meals');
  requireThat(menu.reservationIds&&typeof menu.reservationIds==='object'&&!Array.isArray(menu.reservationIds),'INVALID_MENU','reservationIds');
  for(const m of menu.meals) {
    for(const [key,value]of Object.entries(m.locks??{}))requireThat(['recipe','production','diners','leftovers'].includes(key)&&typeof value==='boolean','INVALID_LOCK',m.id);
    requireThat(m.status===undefined||['planned','cooked'].includes(m.status),'INVALID_MEAL_STATUS',m.id);
  }
  const ids=Object.values(menu.reservationIds);
  requireThat(new Set(ids).size===ids.length,'INVALID_MENU','shared reservation IDs');
  for(const [mealId,id]of Object.entries(menu.reservationIds)) {
    requireThat(menu.meals.some(m=>m.id===mealId&&m.status!=='cooked'),'INVALID_MENU','reservation must belong to a planned meal');text(id,'reservation ID');
  }
}
export function projectedStock(context,menu) {
  validateMenu(menu);const state=structuredClone(context.state??emptyStock());
  for(const id of Object.values(menu.reservationIds)) {
    requireThat(state.reservations[id]!==undefined,'RESERVATION_STALE',id);delete state.reservations[id];
  }
  return state;
}
export function assertLocks(before,after,recipes) {
  const map=new Map(recipes.map(r=>[r.id,r]));
  requireThat(before.id===after.id,'INVALID_MENU','menu ID changed');
  for(const meal of after.meals)if(meal.status==='cooked')requireThat(before.meals.some(m=>m.id===meal.id&&m.status==='cooked'),
    'COOKING_CONFIRMATION_REQUIRED',meal.id);
  for(const old of before.meals) {
    const m=after.meals.find(x=>x.id===old.id);
    requireThat(m,'MEAL_REMOVAL_UNSUPPORTED',old.id);
    if(old.status==='cooked')requireThat(JSON.stringify(m)===JSON.stringify(old),'MEAL_ALREADY_COOKED',old.id);
    if(old.locks?.recipe)requireThat(m.recipeId===old.recipeId,'LOCKED_RECIPE',old.id);
    if(old.locks?.diners)requireThat(Q.of(m.diners).cmp(old.diners)===0,'LOCKED_DINERS',old.id);
    if(old.locks?.leftovers)requireThat(m.leftovers===old.leftovers,'LOCKED_LEFTOVERS',old.id);
    if(old.locks?.production)requireThat(resolveProduction(map.get(m.recipeId),m).producedPortions===
      resolveProduction(map.get(old.recipeId),old).producedPortions,'LOCKED_PRODUCTION',old.id);
    requireThat(JSON.stringify(m.locks??{})===JSON.stringify(old.locks??{}),'LOCK_CHANGE_UNSUPPORTED',old.id);
  }
}
export function evaluateMenu(context,menu,{partial=false,stockMenu=menu}={}) {
  validateContext(context);validateMenu(menu);
  const map=new Map(context.recipes.map(r=>[r.id,r]));
  for(const meal of menu.meals) {const r=map.get(meal.recipeId);requireThat(r,'UNKNOWN_RECIPE',meal.recipeId);checkRecipeConstraints(context,r);}
  const counts=new Map(),families=new Map();
  for(const m of menu.meals){counts.set(m.recipeId,(counts.get(m.recipeId)??0)+1);const f=map.get(m.recipeId).family;if(f)families.set(f,(families.get(f)??0)+1);}
  const constraints=context.constraints??{},policy=context.policy??{};
  requireThat([...counts.values()].every(n=>n<=(constraints.maxRepeats??1)),'REPEAT_CONSTRAINT','menu');
  if(!partial&&menu.meals.length)requireThat(counts.size>=(constraints.minDistinct??1),'VARIETY_CONSTRAINT','menu');
  if(constraints.maxPerFamily!==undefined)requireThat([...families.values()].every(n=>n<=constraints.maxPerFamily),'FAMILY_CONSTRAINT','menu');
  const state=projectedStock(context,stockMenu);
  const requirements=productionRequirements(context.recipes,menu.meals.filter(m=>m.status!=='cooked'),context.ingredients);
  const basket=jointBasket(context,requirements,state);
  let score=Q.of(basket.purchaseScore)
    .add(Q.of(policy.repeatPenaltyCents??0).mul(menu.meals.length-counts.size))
    .add(Q.of(policy.familyRepeatPenaltyCents??0).mul(menu.meals.length-families.size));
  const preferred=new Set(policy.preferredRecipeIds??[]),history=new Set(policy.historyRecipeIds??[]);
  score=score.add(Q.of(policy.preferencePenaltyCents??0).mul(preferred.size?menu.meals.filter(m=>!preferred.has(m.recipeId)).length:0));
  score=score.add(Q.of(policy.historyPenaltyCents??0).mul(menu.meals.filter(m=>history.has(m.recipeId)).length));
  const allocation={},free=stockAvailable(state,context.ingredients);
  for(const row of requirements.individual) {
    allocation[row.mealId]={};
    for(const [id,need]of Object.entries(row.needs)) {
      const used=minQ(free[id]??0,need);if(used.cmp(0)>0)allocation[row.mealId][id]=used.toString();
      free[id]=Q.of(free[id]??0).sub(used).toString();
    }
  }
  for(const [id,q]of Object.entries(basket.quantities))score=score.sub(Q.of(policy.perishableStockRateCents?.[id]??0).mul(q.fromStock));
  return {version:2,requirements,basket,score:score.toString(),allocation,
    metrics:{distinctRecipes:counts.size,distinctFamilies:families.size,
      stockUsed:Object.fromEntries(Object.entries(basket.quantities).map(([id,q])=>[id,q.fromStock])),
      purchaseSurplus:Object.fromEntries(Object.entries(basket.quantities).map(([id,q])=>[id,q.purchaseSurplus]))}};
}
