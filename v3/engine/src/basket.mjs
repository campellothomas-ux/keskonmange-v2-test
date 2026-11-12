import {Q, minQ, maxQ, requireThat, positive} from './exact.mjs';
import {ingredientMap, validateCatalog} from './model.mjs';
import {calculateRequirements} from './requirements.mjs';
import {choosePackages, priceLines} from './packages.mjs';

export function stockAvailable(state, ingredients) {
  const map = ingredientMap(ingredients), reserved = {}, result = {};
  for (const needs of Object.values(state.reservations ?? {})) {
    for (const [id,q] of Object.entries(needs)) { requireThat(map.has(id),'UNKNOWN_INGREDIENT',id); reserved[id] = Q.of(reserved[id] ?? 0).add(positive(q,id,true)); }
  }
  for (const id of new Set([...Object.keys(state.physical ?? {}),...Object.keys(reserved)])) {
    const i = map.get(id); requireThat(i,'UNKNOWN_INGREDIENT',id);
    const physical = positive(state.physical?.[id] ?? '0',id,true);
    requireThat(!i.indivisible || physical.d === 1n, 'INDIVISIBLE_STOCK', id);
    requireThat(!i.indivisible || Q.of(reserved[id] ?? 0).d === 1n, 'INDIVISIBLE_STOCK', id);
    const free = physical.sub(reserved[id] ?? 0); requireThat(free.cmp(0) >= 0,'INSUFFICIENT_STOCK',id);
    result[id] = free.toString();
  }
  return result;
}

export function calculateBasket({recipes, meals, ingredients, products, session, state = {}, manual = [], maxStates}) {
  const map = ingredientMap(ingredients), catalog = validateCatalog(products,ingredients,session);
  const requirements = calculateRequirements(recipes,meals,ingredients);
  const available = stockAvailable(state,ingredients), quantities = {}, purchases = [];
  let packageOptimal = true;
  for (const [id,amount] of Object.entries(requirements.needs)) {
    const need = Q.of(amount), used = minQ(available[id] ?? 0,need), missing = maxQ(need.sub(used),0);
    const packs = choosePackages(missing,catalog.filter(p => p.ingredientId === id),map,{maxStates});
    purchases.push(...packs.lines); packageOptimal &&= packs.optimal;
    quantities[id] = {unit:map.get(id).unit,basis:map.get(id).basis,required:amount,physical:state.physical?.[id] ?? '0',
      available:available[id] ?? '0',fromStock:used.toString(),toBuy:missing.toString(),bought:packs.bought,
      purchaseSurplus:packs.surplus,remainingFree:Q.of(available[id] ?? 0).sub(used).add(packs.surplus).toString()};
  }
  const menu = priceLines(purchases,catalog,map,session);
  const cart = priceLines([...purchases,...manual],catalog,map,session);
  return {requirements,quantities,menu,cart,packageOptimal};
}
