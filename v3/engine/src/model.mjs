import {Q, positive, integer, requireThat, text, unique} from './exact.mjs';

const UNITS = {g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], cl: ['ml', 10], l: ['ml', 1000], unit: ['unit', 1], 'pièce': ['unit', 1]};
const BASES = new Set(['gross', 'net', 'drained', 'edible']);
export function ingredientMap(ingredients) {
  unique(ingredients, 'ingredients');
  for (const i of ingredients) {
    requireThat(['g','ml','unit'].includes(i.unit) && BASES.has(i.basis), 'INVALID_INGREDIENT', i.id);
    if (i.unit === 'unit') text(i.countKind, `${i.id}/countKind`);
    if (i.indivisible !== undefined) requireThat(typeof i.indivisible === 'boolean' && (!i.indivisible || i.unit === 'unit'), 'INVALID_INGREDIENT', i.id);
    if (i.perishable !== undefined) requireThat(typeof i.perishable === 'boolean', 'INVALID_INGREDIENT', i.id);
    if (i.allergens !== undefined) requireThat(Array.isArray(i.allergens) && i.allergens.every(x => typeof x === 'string'), 'INVALID_INGREDIENT', i.id);
    const paths = new Set();
    for (const c of i.conversions ?? []) {
      text(c.fromUnit, `${i.id}/conversion`); requireThat(BASES.has(c.fromBasis), 'INVALID_CONVERSION', i.id);
      text(c.evidence, `${i.id}/evidence`); positive(c.factor, `${i.id}/factor`);
      const k = JSON.stringify([c.fromUnit, c.fromBasis, c.fromCountKind ?? null]);
      requireThat(!paths.has(k), 'AMBIGUOUS_CONVERSION', i.id); paths.add(k);
    }
  }
  return new Map(ingredients.map(i => [i.id, i]));
}
export function canonicalQuantity(value, ingredient) {
  requireThat(ingredient && value && BASES.has(value.basis), 'INVALID_QUANTITY', 'ingredient and explicit basis required');
  const q = positive(value.amount, ingredient.id, true);
  const u = UNITS[value.unit];
  if (u && u[0] === ingredient.unit && value.basis === ingredient.basis &&
      (ingredient.unit !== 'unit' || value.countKind === ingredient.countKind)) return q.mul(u[1]);
  const matches = (ingredient.conversions ?? []).filter(c => c.fromUnit === value.unit && c.fromBasis === value.basis &&
    (c.fromCountKind ?? null) === (value.countKind ?? null));
  requireThat(matches.length === 1, 'MISSING_CONVERSION', `${ingredient.id}: ${value.unit}/${value.basis} -> ${ingredient.unit}/${ingredient.basis}`);
  text(matches[0].evidence, ingredient.id); return q.mul(positive(matches[0].factor, ingredient.id));
}
export function validatePrice(price, storeId, asOf) {
  requireThat(price && ['observed','historical','elsewhere','estimated','unknown'].includes(price.kind), 'INVALID_PRICE', storeId);
  requireThat(price.currency === 'EUR', 'INVALID_PRICE', 'EUR required in first lot');
  text(price.storeId, 'price.storeId');
  if (price.kind === 'observed' || price.kind === 'historical') requireThat(price.storeId === storeId, 'STORE_MISMATCH', 'price source');
  if (price.kind === 'elsewhere') requireThat(price.storeId !== storeId, 'INVALID_PRICE', 'elsewhere requires another source store');
  if (price.kind === 'unknown') requireThat(price.cents === null, 'INVALID_PRICE', 'unknown cents must be null');
  else integer(price.cents, 'price.cents', true);
  if (price.observedOn !== undefined) {
    validDate(price.observedOn);
    if (asOf) requireThat(price.observedOn <= asOf, 'INVALID_PRICE', 'future observation');
  }
  if (price.kind === 'observed') requireThat(price.observedOn, 'INVALID_PRICE', 'observation date required');
  if (price.rangeCents) {
    requireThat(Array.isArray(price.rangeCents) && price.rangeCents.length === 2,'INVALID_PRICE','range must contain two cents amounts');
    const [low, high] = price.rangeCents;
    integer(low, 'price range', true); integer(high, 'price range', true);
    requireThat(price.cents !== null && low <= price.cents && high >= price.cents, 'INVALID_PRICE', 'range must enclose estimate');
  }
  return price;
}
export function validDate(s) {
  requireThat(typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s,
    'INVALID_DATE', String(s)); return s;
}
export function validateCatalog(products, ingredients, session) {
  unique(products, 'products'); text(session?.storeId, 'session.storeId'); validDate(session?.asOf);
  const map = ingredientMap(ingredients);
  return products.map(p => {
    requireThat(p.storeId === session.storeId, 'STORE_MISMATCH', p.id);
    text(p.saleUnit, `${p.id}/saleUnit`);
    requireThat(['fixed','weight'].includes(p.mode) && p.contentVerified === true, 'UNVERIFIED_PRODUCT', p.id);
    text(p.contentEvidence, `${p.id}/contentEvidence`);
    const i = map.get(p.ingredientId);
    requireThat(i, 'UNKNOWN_INGREDIENT', p.ingredientId);
    const capacity = canonicalQuantity(p.mode === 'fixed' ? p.content : p.increment, i);
    positive(capacity, p.id);
    requireThat(!i.indivisible || capacity.d === 1n, 'INVALID_PRODUCT', 'indivisible content must be whole');
    if (p.mode === 'weight') requireThat(i.unit === 'g', 'INVALID_PRODUCT', 'weight sale requires mass');
    validatePrice(p.price, p.storeId, session.asOf);
    if (p.mode === 'weight') positive(canonicalQuantity(p.priceQuantity, i), 'priceQuantity');
    if (p.validFrom) validDate(p.validFrom);
    if (p.validUntil) validDate(p.validUntil);
    if (p.validFrom && p.validUntil) requireThat(p.validFrom <= p.validUntil, 'INVALID_DATE', p.id);
    if (p.available !== undefined) requireThat(typeof p.available === 'boolean','INVALID_PRODUCT',p.id);
    return {...p, capacity};
  }).filter(p => p.available !== false && (!p.validFrom || p.validFrom <= session.asOf) && (!p.validUntil || p.validUntil >= session.asOf));
}
export function lineCost(product, count, ingredients) {
  integer(count, 'purchase count', true);
  if (product.price.cents === null) return null;
  let cost = Q.of(product.price.cents).mul(count);
  if (product.mode === 'weight') {
    const i = ingredients.get(product.ingredientId);
    cost = cost.mul(canonicalQuantity(product.increment, i)).div(canonicalQuantity(product.priceQuantity, i));
  }
  // Round each commercial line up to a cent, never round culinary quantities.
  return cost.ceil();
}
