import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,calculateBasket,validateCatalog,ingredientMap,choosePackages,priceLines} from '../src/index.mjs';
import {ingredient,product,recipe,meal,session,quantity,observed} from './helpers.mjs';
const code = c => e => e.code === c;
const input = () => ({recipes:[recipe()],meals:[meal()],ingredients:[ingredient()],products:[product()],session});

test('A — 650 g requires two 400 g cans, 800 bought, 150 surplus', () => {
  const b = calculateBasket(input());
  assert.equal(b.menu.lines[0].count,2); assert.equal(b.quantities.tomato.bought,'800');
  assert.equal(b.quantities.tomato.purchaseSurplus,'150'); assert.equal(b.menu.totalCents,200);
});
test('B/E — shared stock is subtracted once after needs aggregation', () => {
  const data = input(); data.state = {physical:{tomato:'250'},reservations:{}};
  const original = structuredClone(data.state);
  assert.equal(calculateBasket(data).menu.lines[0].count,1);
  data.recipes = [recipe('sauce','325')]; data.meals = [meal('m1'),meal('m2')];
  const b = calculateBasket(data);
  assert.equal(b.quantities.tomato.required,'650'); assert.equal(b.quantities.tomato.fromStock,'250');
  assert.equal(b.menu.lines[0].count,1); assert.deepEqual(data.state,original);
  data.state.reservations.other = {tomato:'200'};
  assert.equal(calculateBasket(data).menu.lines[0].count,2);
});
test('C — multiple sizes choose total package cost, not cheapest kg', () => {
  const data = input(); data.products = [product('500','500',160),product('1000','1000',290)];
  const run = need => calculateBasket({...data,recipes:[recipe('sauce',need)]});
  assert.deepEqual(run('400').menu.lines.map(l => [l.productId,l.count]),[['500',1]]);
  assert.deepEqual(run('650').menu.lines.map(l => [l.productId,l.count]),[['1000',1]]);
  assert.deepEqual(run('1400').menu.lines.map(l => [l.productId,l.count]),[['1000',1],['500',1]]);
  assert.equal(run('1400').menu.totalCents,450);
});
test('M — foreign store refs fail; elsewhere price is explicitly estimated', () => {
  const data = input();
  assert.throws(() => calculateBasket({...data,products:[product('bad','400',100,'tomato',{storeId:'other'})]}),code('STORE_MISMATCH'));
  data.products[0].price = {...data.products[0].price,kind:'elsewhere',storeId:'other'};
  assert.equal(calculateBasket(data).cart.certainty,'estimated');
  data.products[0].price.kind = 'observed'; data.products[0].price.observedOn = session.asOf;
  assert.throws(() => calculateBasket(data),code('STORE_MISMATCH'));
});
test('prices retain missingness and uncertainty; manual purchases belong to total cart', () => {
  const data = input(); data.products.push(product('oil','10',200,'oil'));
  data.ingredients.push(ingredient('oil')); data.manual = [{productId:'oil',count:1}];
  let b = calculateBasket(data);
  assert.equal(b.menu.totalCents,200); assert.equal(b.cart.totalCents,400);
  assert.equal(b.cart.strictBudgetVerifiable,false); assert.deepEqual(b.cart.rangeCents,[0,null]);
  data.products[0].price = {...data.products[0].price,rangeCents:[90,130]};
  data.products[1].price = observed(200);
  assert.deepEqual(calculateBasket(data).cart.rangeCents,[380,460]);
  data.products[0].price = {kind:'unknown',cents:null,currency:'EUR',storeId:session.storeId};
  b = calculateBasket(data);
  assert.equal(b.cart.totalCents,null); assert.equal(b.cart.knownSubtotalCents,200);
  assert.equal(b.packageOptimal,false); assert.equal(b.cart.certainty,'incomplete');
});
test('N — weight sales have explicit increments and a rate, rounded only on merged line', () => {
  const data = input(); data.recipes = [recipe('sauce','650.25')];
  data.products = [product('bulk',null,399,'tomato',{mode:'weight',saleUnit:'weight',content:undefined,
    increment:quantity('0.1'),priceQuantity:quantity(1,'kg')})];
  let b = calculateBasket(data);
  assert.equal(b.menu.lines[0].count,6503); assert.equal(b.quantities.tomato.bought,'6503/10');
  assert.equal(b.menu.totalCents,260);
  b = calculateBasket({...data,manual:[{productId:'bulk',count:1}]});
  assert.equal(b.cart.lines.length,1); assert.equal(b.cart.totalCents,260);
  assert.throws(() => calculateBasket({...data,products:[...data.products,product()]}),code('UNSUPPORTED_FORMAT_MIX'));
});
test('availability, verified content, missing formats, bounded work and invalid money fail explicitly', () => {
  const data = input();
  for (const change of [{available:false},{validUntil:'2026-11-11'}])
    assert.throws(() => calculateBasket({...data,products:[{...product(),...change}]}),code('NO_PRODUCT'));
  assert.throws(() => calculateBasket({...data,products:[product('p',400,100,'tomato',{contentVerified:false})]}),code('UNVERIFIED_PRODUCT'));
  assert.throws(() => calculateBasket({...data,maxStates:1}),code('RESOURCE_LIMIT'));
  data.products[0].price.cents = -1;
  assert.throws(() => calculateBasket(data),code('INVALID_INTEGER'));
});
test('same-day observation is required before a strict budget can be verified', () => {
  const data = input(); data.products[0].price = observed(100);
  assert.equal(calculateBasket(data).cart.strictBudgetVerifiable,true);
  data.products[0].price.observedOn = '2026-11-11';
  assert.equal(calculateBasket(data).cart.strictBudgetVerifiable,false);
});
test('rational package lattice keeps all small fractions exact', () => {
  const ingredients = [ingredient()], map = ingredientMap(ingredients);
  const products = validateCatalog([product('third','1/3',10)],ingredients,session);
  const out = choosePackages('4/5',products,map);
  assert.equal(out.lines[0].count,3); assert.equal(out.bought,'1'); assert.equal(out.surplus,'1/5');
  assert.equal(priceLines(out.lines,products,map,session).totalCents,30);
});

export function oracleCover(need, products) {
  if (need <= 0) return {cost:0,bought:0};
  const bound = Math.ceil(need / Math.min(...products.map(p => p.size)));
  let best = null;
  function visit(k,bought,cost) {
    if (k === products.length) {
      if (bought >= need && (!best || cost < best.cost || cost === best.cost && bought < best.bought)) best = {cost,bought};
      return;
    }
    for (let n=0; n<=bound; n++) visit(k+1,bought+n*products[k].size,cost+n*products[k].cost);
  }
  visit(0,0,0); return best;
}
test('properties — 250 seeded package problems match an independent exhaustive oracle', () => {
  let seed = 5023;
  const random = n => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed % n; };
  const ingredients = [ingredient()], map = ingredientMap(ingredients);
  for (let k=0;k<250;k++) {
    const need = 1+random(40), sizes = [1+random(12),1+random(12),1+random(12)], costs = sizes.map(() => random(30));
    const products = validateCatalog(sizes.map((s,i) => product(`p${i}`,s,costs[i])),ingredients,session);
    const out = choosePackages(need,products,map), price = priceLines(out.lines,products,map,session);
    const ref = oracleCover(need,sizes.map((size,i) => ({size,cost:costs[i]})));
    assert.equal(price.totalCents,ref.cost,`seed case ${k}`); assert.equal(out.bought,String(ref.bought));
    assert.equal(Q.of(out.bought).sub(need).toString(),out.surplus);
    assert(out.lines.every(l => Number.isInteger(l.count) && l.count > 0));
  }
});
