import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMixedMenu,createShopping,addShoppingItem,evaluateMenu} from '../src/index.mjs';
import {context,mixedMenu,code} from './lot3-helpers.mjs';

test('Lot3 A/G — three complete, one partial and one manual meal preserve independent exact quantities',()=>{
  const c=context(),m=mixedMenu(),before=structuredClone({c,m});
  const e=evaluateMixedMenu(c,m,createShopping('s'));
  assert.equal(e.status,'partial');assert.equal(e.meals.length,5);assert.equal(e.meals[3].calculationStatus,'partial');assert.equal(e.meals[4].status,'manual');
  assert.equal(e.requirements.needs.tomato,'600');assert.equal(e.requirements.needs.rice,'200');assert.equal(e.requirements.needs['chicken-unknown'],undefined);
  assert.equal(e.basket.quantities.tomato.fromStock,'150');assert.equal(e.allocation['meal-4'].rice,undefined);
  assert(e.coverage.unknownNeeds.some(x=>x.ingredientId==='chicken-unknown'&&x.amount===null));
  assert.equal(e.basket.amount.totalCents,null);assert(e.basket.amount.knownSubtotalCents>0);assert.deepEqual({c,m},before);
  assert.throws(()=>evaluateMenu(c,m)); // Strict lot 2 behavior remains strict.
});
test('Lot3 A — an unreviewed number or missing conversion is never silently used from a partial recipe',()=>{
  const c=context(),m=mixedMenu();delete c.recipes.find(r=>r.id==='partial').ingredients[0].quantityVerified;
  assert.equal(evaluateMixedMenu(c,m).requirements.needs.rice,undefined);
  const r=c.recipes.find(r=>r.id==='partial');r.ingredients[0].quantityVerified=true;r.ingredients[0].quantity.unit='spoon';
  const e=evaluateMixedMenu(c,m);assert.equal(e.requirements.needs.rice,undefined);assert(e.coverage.unknownNeeds.some(x=>x.code==='MISSING_CONVERSION'));
});
test('Lot3 invalid quantities are isolated and never converted into zero or stock',()=>{
  const c=context(),m=mixedMenu();const r=c.recipes.find(r=>r.id==='partial');r.ingredients[1].quantity.amount='-2';
  const e=evaluateMixedMenu(c,m);assert.equal(e.meals[3].calculationStatus,'invalid');assert.equal(e.status,'invalid');
  assert.equal(e.requirements.needs.rice,'200');assert.equal(e.requirements.needs['chicken-unknown'],undefined);
  assert.equal(e.basket.quantities.tomato.required,'600');
});
test('Lot3 B — a manually chosen expensive meal and indicative or search-only strict budgets remain nonblocking',()=>{
  const c=context(),m=mixedMenu();m.meals[4]={...m.meals[4],recipeId:'r6',selection:'user'};c.budget={cents:1,strict:true};
  const e=evaluateMixedMenu(c,m);assert.equal(m.meals[4].recipeId,'r6');assert.equal(e.budget.blocking,false);
  assert(e.budget.knownExcessCents>0);assert.equal(e.budget.mode,'strict_for_automatic_search');
  assert.deepEqual(e.advice,{requested:false,applied:false});
});
test('Lot3 unknown price or absent packaging retains priced needs and never produces a false full basket',()=>{
  const c=context(),m=mixedMenu();c.products=c.products.filter(p=>p.ingredientId!=='rice');
  let e=evaluateMixedMenu(c,m);assert.equal(e.basket.quantities.rice.toBuy,'200');assert.equal(e.basket.quantities.rice.bought,null);
  assert.equal(e.basket.amount.totalCents,null);assert(e.coverage.purchaseIssues.some(x=>x.code==='NO_PRODUCT'));
  let s=addShoppingItem(createShopping('s'),{id:'free',label:'Any product',presentation:'one packet'});
  e=evaluateMixedMenu(c,m,s);assert.equal(e.shopping.manual.length,1);assert.equal(e.basket.amount.totalCents,null);
});
test('Lot3 known manual dietary risk is visible and is not disguised as a mathematical failure',()=>{
  const c=context(),m=mixedMenu();m.meals[0].recipeId='quiche';c.constraints={allergies:['egg']};
  const e=evaluateMixedMenu(c,m);assert(e.risks.some(r=>r.code==='ALLERGY_EXCLUSION'&&r.mealId==='meal-1'));
  assert.equal(e.meals[0].optimizable,false);assert.equal(e.meals[0].knownNeeds.egg,'3');assert.equal(m.meals[0].recipeId,'quiche');
});
