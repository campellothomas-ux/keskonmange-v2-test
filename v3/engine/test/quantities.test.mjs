import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,ingredientMap,canonicalQuantity,calculateRequirements} from '../src/index.mjs';
import {ingredient,recipe,meal,quantity} from './helpers.mjs';
const code = c => e => e.code === c;

test('D — diners, produced portions, kept/discarded portions stay distinct', () => {
  const run = extra => calculateRequirements([recipe()],[meal('m1','sauce',extra)],[ingredient()]);
  assert.equal(run({}).needs.tomato,'650');
  assert.equal(run({}).preparations[0].keptPortions,'2');
  assert.equal(run({leftovers:'discard'}).preparations[0].discardedPortions,'2');
  assert.equal(run({producePortions:2}).needs.tomato,'325');
  assert.throws(() => calculateRequirements([recipe('sauce','650','tomato',{scalable:false})],[meal('m1','sauce',{producePortions:2})],[ingredient()]),code('RECIPE_NOT_SCALABLE'));
  assert.throws(() => run({diners:5}),code('INSUFFICIENT_PORTIONS'));
});
test('N — exact fractions, tiny volumes, no binary-float or repeated-rounding drift', () => {
  assert.equal(Q.of('0.1').add('0.2').toString(),'3/10');
  assert.equal(Q.of('1/3').mul(3).toString(),'1');
  assert.equal(canonicalQuantity(quantity('0.0001','l'),ingredient('water',{unit:'ml'})).toString(),'1/10');
  assert.throws(() => Q.of(0.1),code('INVALID_QUANTITY'));
  assert.throws(() => Q.of('1/0'),code('INVALID_QUANTITY'));
  const r = recipe('sauce','1');
  r.yieldPortions = 3;
  const meals = [0,1,2].map(k => meal(`m${k}`,'sauce',{diners:1,producePortions:1}));
  assert.equal(calculateRequirements([r],meals,[ingredient()]).needs.tomato,'1');
});
test('I/N — no invented piece mass, head/clove count, density, drained or edible yield', () => {
  const i = ingredient();
  for (const q of [quantity(1,'unit'),quantity(530,'g','gross'),quantity(20,'ml'),quantity(1,'head')])
    assert.throws(() => canonicalQuantity(q,i),code('MISSING_CONVERSION'));
  const drained = ingredient('beans',{basis:'drained',conversions:[{fromUnit:'g',fromBasis:'net',factor:'3/5',evidence:'test drained yield'}]});
  ingredientMap([drained]);
  assert.equal(canonicalQuantity(quantity(530),drained).toString(),'318');
  const cloves = ingredient('garlic',{unit:'unit',countKind:'clove'});
  assert.throws(() => canonicalQuantity(quantity(1,'unit','net',{countKind:'head'}),cloves),code('MISSING_CONVERSION'));
});
test('D/N — indivisible eggs require explicit ceil for each preparation', () => {
  const egg = ingredient('egg',{unit:'unit',countKind:'egg',indivisible:true});
  const r = recipe('omelette',3,'egg'); r.ingredients[0].quantity = quantity(3,'unit','net',{countKind:'egg'});
  const m = meal('m','omelette',{producePortions:2});
  assert.throws(() => calculateRequirements([r],[m],[egg]),code('INDIVISIBLE_ROUNDING_REQUIRED'));
  const out = calculateRequirements([r],[{...m,indivisiblePolicy:'ceil'}],[egg]);
  assert.equal(out.needs.egg,'2'); assert.equal(out.preparations[0].rounding[0].exact,'3/2');
});
test('input validation rejects ambiguous conversion declarations and invalid metadata', () => {
  const c = {fromUnit:'box',fromBasis:'net',factor:400,evidence:'test'};
  assert.throws(() => ingredientMap([ingredient('t',{conversions:[c,c]})]),code('AMBIGUOUS_CONVERSION'));
  assert.throws(() => ingredientMap([ingredient('t',{perishable:'yes'})]),code('INVALID_INGREDIENT'));
});
