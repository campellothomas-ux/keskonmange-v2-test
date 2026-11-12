import {Q, gcd, lcm, positive, integer, requireThat, safeNumber} from './exact.mjs';
import {lineCost} from './model.mjs';

// Exact cover on the common rational lattice. Input products are validated first.
export function choosePackages(required, products, ingredients, {maxStates = 100_000} = {}) {
  const need = positive(required, 'required', true); integer(maxStates, 'maxStates');
  if (need.cmp(0) === 0) return {lines:[], bought:'0', surplus:'0', optimal:true, states:0};
  requireThat(products.length > 0, 'NO_PRODUCT', 'no available validated reference');
  const opts = [...products].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  requireThat(new Set(opts.map(p => p.ingredientId)).size === 1, 'INVALID_PRODUCT', 'one ingredient per package problem');
  if (opts.some(p => p.mode === 'weight')) {
    requireThat(opts.length === 1 && opts[0].mode === 'weight', 'UNSUPPORTED_FORMAT_MIX', 'first lot: one weight offer, no fixed/weight mix');
    const p = opts[0], count = safeNumber(need.div(p.capacity).ceil(), 'weight count');
    const bought = p.capacity.mul(count);
    return {lines:[{productId:p.id,count}], bought:bought.toString(), surplus:bought.sub(need).toString(),
      optimal:p.price.cents !== null, states:1};
  }
  const denominator = opts.reduce((d,p) => lcm(d,p.capacity.d), need.d);
  const sizes = opts.map(p => p.capacity.n * (denominator / p.capacity.d));
  const divisor = sizes.reduce(gcd);
  const caps = sizes.map(x => safeNumber(x / divisor, 'pack lattice'));
  const target = safeNumber(need.mul(denominator.toString()).div(divisor.toString()).ceil(), 'target');
  const limit = target + Math.max(...caps) - 1;
  requireThat(Number.isSafeInteger(limit) && limit + 1 <= maxStates && (limit + 1) * opts.length <= 5_000_000,
    'RESOURCE_LIMIT', `package lattice needs ${limit + 1} states x ${opts.length} formats`);
  const allPriced = opts.every(p => p.price.cents !== null);
  const costs = opts.map(p => BigInt(p.price.cents ?? 0));
  const dp = new Array(limit + 1); dp[0] = {cost:0n, packs:0, prev:-1, choice:-1};
  for (let q = 1; q <= limit; q++) {
    for (let k = 0; k < opts.length; k++) {
      const prev = q - caps[k]; if (prev < 0 || !dp[prev]) continue;
      const candidate = {cost:dp[prev].cost + costs[k], packs:dp[prev].packs + 1, prev, choice:k};
      if (!dp[q] || candidate.cost < dp[q].cost || candidate.cost === dp[q].cost && candidate.packs < dp[q].packs) dp[q] = candidate;
    }
  }
  let best = null;
  for (let q = target; q <= limit; q++) {
    if (!dp[q]) continue;
    if (best === null || (allPriced ? dp[q].cost < dp[best].cost || dp[q].cost === dp[best].cost && q < best : q < best)) best = q;
  }
  requireThat(best !== null, 'NO_PRODUCT', 'cover unreachable');
  const counts = opts.map(() => 0);
  for (let q = best; q > 0; q = dp[q].prev) counts[dp[q].choice]++;
  const bought = new Q(BigInt(best) * divisor, denominator);
  return {lines:opts.flatMap((p,k) => counts[k] ? [{productId:p.id,count:counts[k]}] : []), bought:bought.toString(),
    surplus:bought.sub(need).toString(), optimal:allPriced, states:limit + 1};
}

export function priceLines(lines, products, ingredients, session) {
  const byId = new Map(products.map(p => [p.id,p]));
  // Merge commercial lines before cent rounding, including manual additions.
  const counts = new Map();
  for (const line of lines) {
    integer(line.count, 'line.count', true);
    requireThat(byId.has(line.productId), 'NO_PRODUCT', line.productId);
    const count = (counts.get(line.productId) ?? 0) + line.count; integer(count,'merged count',true); counts.set(line.productId,count);
  }
  let known = 0n, low = 0n, high = 0n, complete = true, bounded = true, currentObserved = true;
  const result = [];
  for (const [id,count] of [...counts].sort(([a],[b]) => a < b ? -1 : 1)) {
    if (!count) continue;
    const p = byId.get(id), cost = lineCost(p,count,ingredients);
    const current = p.price.kind === 'observed' && p.price.observedOn === session.asOf &&
      (!p.price.rangeCents || p.price.rangeCents.every(c => c === p.price.cents));
    currentObserved &&= current;
    if (cost === null) { complete = false; bounded = false; }
    else {
      known += cost;
      if (current) { low += cost; high += cost; }
      else if (p.price.rangeCents) {
        const [a,b] = p.price.rangeCents;
        low += lineCost({...p,price:{...p.price,cents:a}},count,ingredients);
        high += lineCost({...p,price:{...p.price,cents:b}},count,ingredients);
      } else { bounded = false; }
    }
    result.push({productId:id,ingredientId:p.ingredientId,storeId:p.storeId,count,
      acquired:p.capacity.mul(count).toString(),costCents:cost === null ? null : safeNumber(cost,'line cost'), price:{...p.price}});
  }
  return {lines:result, knownSubtotalCents:safeNumber(known,'subtotal'), totalCents:complete ? safeNumber(known,'total') : null,
    rangeCents:[safeNumber(low,'lower price'),bounded ? safeNumber(high,'upper price') : null],
    certainty:complete && currentObserved ? 'observed_session' : complete ? 'estimated' : 'incomplete',
    strictBudgetVerifiable:complete && currentObserved};
}
