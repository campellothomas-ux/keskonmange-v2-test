import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMenu,proposeMenu,acceptMenuProposal,evaluateMenu,recalculateMenu,suggestPortions,replacementAlternatives,
  cancelMenuChange,stockAvailable,proposeReoptimization,confirmMealCooking,applyEvent,emptyStock,Q} from '../src/index.mjs';
import {context,menu,fiveMeals,code} from './lot2-helpers.mjs';
function accepted() {
  const c=context(),empty=initialMenu('family-menu');
  const result=acceptMenuProposal(c,empty,proposeMenu(c,empty,fiveMeals()),{eventId:'initial'});
  c.state=result.stock;return {c,menu:result.menu};
}
test('Lot2 C — five meals: change only 2/3/2/4/3 diners, recompute individual and global quantities',()=>{
  const {c,menu:m}=accepted(),snapshot=structuredClone({c,m});
  const p=recalculateMenu(c,m,[{mealId:'meal-2',diners:3},{mealId:'meal-4',diners:4},{mealId:'meal-5',diners:3}]);
  assert.deepEqual(p.menu.meals.map(m=>m.recipeId),m.meals.map(m=>m.recipeId));
  assert.deepEqual(p.menu.meals.map(m=>m.diners),[2,3,2,4,3]);
  assert.deepEqual(p.evaluation.requirements.preparations.map(p=>p.producedPortions),['2','3','2','4','3']);
  assert.deepEqual(p.evaluation.requirements.individual.map(p=>p.needs.tomato),['200','300','200','400','300']);
  assert.equal(p.evaluation.requirements.needs.tomato,'1400');assert.equal(p.evaluation.basket.quantities.tomato.fromStock,'150');
  assert.equal(p.evaluation.basket.quantities.tomato.bought,'1600');assert.equal(p.evaluation.basket.quantities.tomato.purchaseSurplus,'350');
  assert.deepEqual(p.menu.meals[0],m.meals[0]);assert.deepEqual(p.menu.meals[2],m.meals[2]);assert.deepEqual({c,m},snapshot);
});
test('Lot2 D — measurable extra portion suggestion is not applied until acceptance',()=>{
  const {c,menu:m}=accepted();const original=structuredClone(m);
  const edited=acceptMenuProposal(c,m,recalculateMenu(c,m,[{mealId:'meal-2',diners:3},{mealId:'meal-4',diners:4},{mealId:'meal-5',diners:3}]),{eventId:'portions'});
  c.state=edited.stock;const result=suggestPortions(c,edited.menu,{mealId:'meal-2',maxSteps:1});
  assert.equal(result.suggestions.length,1);const p=result.suggestions[0];
  assert.equal(p.comparison.costDeltaCents,0);assert.equal(p.comparison.extraPreparedPortions,'1');assert.equal(p.comparison.extraKeptPortions,'1');
  assert.equal(p.comparison.quantities.tomato.purchaseSurplusDelta,'-100');assert.equal(p.benefits.saving,false);
  assert.equal(edited.menu.meals[1].productionUnits,undefined);
  const confirmed=acceptMenuProposal(c,edited.menu,p,{eventId:'accept-extra'});
  assert.equal(confirmed.menu.meals[1].productionUnits,'4');assert.deepEqual(m,original);
});
test('Lot2 D — additional package is not mislabeled as an economy; unchanged shelf-stable surplus has no artificial benefit',()=>{
  const c=context();c.state=emptyStock();const m={...initialMenu('m'),meals:[{id:'one',recipeId:'r0',diners:4,leftovers:'keep'}]};
  assert.equal(suggestPortions(c,m,{mealId:'one',maxSteps:1}).suggestions.length,0);
  // The extra 100 g requires a second 400 g package, increasing both cost and surplus.
  const p=recalculateMenu(c,m,[{mealId:'one',productionUnits:'5'}]);assert.equal(p.comparison.costDeltaCents,100);
  assert.equal(p.comparison.quantities.tomato.purchaseSurplusDelta,'300');
});
test('Lot2 E — alternatives price the whole five-meal basket, preserve others, require acceptance and remember temporary rejects',()=>{
  const {c,menu:m}=accepted(),snapshot=structuredClone(m);
  const result=replacementAlternatives(c,m,{mealId:'meal-3',limit:4});assert(result.alternatives.length>=3);
  for(const p of result.alternatives) {
    assert.equal(p.menu.meals[2].diners,m.meals[2].diners);
    for(const k of [0,1,3,4])assert.deepEqual(p.menu.meals[k],m.meals[k]);
    assert.deepEqual(p.evaluation,evaluateMenu(c,p.menu,{stockMenu:m}));
  }
  const rejected=result.alternatives[0].recipeId;
  const next=replacementAlternatives(c,m,{mealId:'meal-3',rejectedRecipeIds:[rejected]});
  assert(next.alternatives.every(p=>p.recipeId!==rejected));assert.deepEqual(m,snapshot);
  const chosen=acceptMenuProposal(c,m,result.alternatives[0],{eventId:'replace'});
  assert.equal(chosen.menu.meals[2].recipeId,rejected);assert.equal(chosen.menu.meals[2].diners,2);
  assert.equal(c.constraints.excludedIngredients,undefined);
});
test('Lot2 F — voluntary reoptimization preserves locked meals and only returns a candidate',()=>{
  const c=context(),m=menu();m.meals[0].locks={recipe:true,production:true};m.meals[3].locks={recipe:true};
  const snapshot=structuredClone(m),out=proposeReoptimization(c,m,{strategy:'diverse',maxEvaluations:80});
  assert(out.proposal);assert.equal(out.applied,false);assert.deepEqual(m,snapshot);
  for(const k of [0,3])assert.deepEqual(out.proposal.menu.meals[k],m.meals[k]);
  assert.deepEqual(out.proposal.menu.meals.map(x=>x.diners),[2,2,2,2,2]);
});
test('Lot2 G — reservations survive portion changes, replacement and reverse-order cancellation without double allocation',()=>{
  const {c,menu:m}=accepted(),start=structuredClone(c.state);
  const first=acceptMenuProposal(c,m,recalculateMenu(c,m,[{mealId:'meal-2',diners:3}]),{eventId:'edit'});c.state=first.stock;
  const alternative=replacementAlternatives(c,first.menu,{mealId:'meal-3'}).alternatives[0];
  const changed=acceptMenuProposal(c,first.menu,alternative,{eventId:'replace'});c.state=changed.stock;
  assert.deepEqual(changed.stock.physical,start.physical);assert.deepEqual(changed.stock.reservations['outside-menu'],{tomato:'50'});
  assert.equal(stockAvailable(changed.stock,c.ingredients).tomato,'0');
  assert.throws(()=>cancelMenuChange(c,changed.menu,{eventId:'bad-undo',targetId:'edit'}),code('MENU_CANCELLATION_CONFLICT'));
  const undo2=cancelMenuChange(c,changed.menu,{eventId:'undo-replace',targetId:'replace'});c.state=undo2.stock;
  const undo1=cancelMenuChange(c,undo2.menu,{eventId:'undo-edit',targetId:'edit'});
  assert.deepEqual(undo1.stock.reservations,start.reservations);assert.deepEqual(undo1.stock.physical,start.physical);
});
test('Lot2 H — cook two whole quiches, keep three portions, no ingredient recreation, replay and cancellation',()=>{
  const c=context();c.state={...emptyStock(),physical:{tomato:'800',egg:'6'}};
  const initial=initialMenu('quiches'),meals=[{id:'q',recipeId:'quiche',diners:5,leftovers:'keep'}];
  const accepted=acceptMenuProposal(c,initial,proposeMenu(c,initial,meals),{eventId:'reserve'});c.state=accepted.stock;
  assert.deepEqual(c.state.prepared,undefined);
  const request={mealId:'q',eventId:'cook-quiches',actualNeeds:{tomato:'800',egg:'6'}};
  const cooked=confirmMealCooking(c,accepted.menu,request);assert.deepEqual(cooked.stock.physical,{});
  assert.equal(cooked.stock.prepared['cook-quiches:prepared'].portions,'3');assert.equal(cooked.preparation.producedPortions,'8');
  c.state=cooked.stock;const repeated=confirmMealCooking(c,cooked.menu,request);assert.deepEqual(repeated.stock,cooked.stock);assert.deepEqual(repeated.menu,cooked.menu);
  const eaten=applyEvent(cooked.stock,{id:'eat',kind:'consume-prepared',lotId:'cook-quiches:prepared',portions:'1'},c);
  assert.equal(eaten.prepared['cook-quiches:prepared'].portions,'2');assert.deepEqual(eaten.physical,{});
  assert.throws(()=>cancelMenuChange({...c,state:eaten},cooked.menu,{eventId:'bad-cancel',targetId:'cook-quiches'}),code('CANCELLATION_CONFLICT'));
  const undo=cancelMenuChange(c,cooked.menu,{eventId:'undo-cook',targetId:'cook-quiches'});
  assert.deepEqual(undo.stock.physical,{tomato:'800',egg:'6'});assert.deepEqual(undo.stock.prepared,{});
  assert.deepEqual(undo.menu.reservationIds,accepted.menu.reservationIds);assert.equal(undo.menu.meals[0].status,undefined);
});
test('Lot2 acceptance is idempotent, stale proposals and altered evaluation are rejected',()=>{
  const {c,menu:m}=accepted(),p=recalculateMenu(c,m,[{mealId:'meal-2',diners:3}]);
  const result=acceptMenuProposal(c,m,p,{eventId:'update'});
  const replay=acceptMenuProposal({...c,state:result.stock},result.menu,p,{eventId:'update'});
  assert.deepEqual(replay.menu,result.menu);assert.deepEqual(replay.stock,result.stock);
  assert.throws(()=>acceptMenuProposal({...c,state:result.stock},result.menu,p,{eventId:'different'}),code('PROPOSAL_STALE'));
  const tampered=structuredClone(p);tampered.evaluation.score='0';
  assert.throws(()=>acceptMenuProposal(c,m,tampered,{eventId:'tampered'}),code('INVALID_PROPOSAL'));
  const changed=context();changed.products[0].price.cents++;
  assert.throws(()=>acceptMenuProposal({...c,products:changed.products},m,p,{eventId:'stale-catalog'}),code('PROPOSAL_STALE'));
});
test('Lot2 K — locks, missing data, unknown allergens, impossible budgets and insufficient actual stock are explicit',()=>{
  const c=context(),m=menu();m.meals[0].locks={recipe:true,production:true,diners:true};
  assert.throws(()=>recalculateMenu(c,m,[{mealId:'meal-1',diners:3}]),code('LOCKED_DINERS'));
  assert.throws(()=>replacementAlternatives(c,m,{mealId:'meal-1'}),code('LOCKED_RECIPE'));
  const allergy={...c,constraints:{allergies:['unknown']}};delete allergy.ingredients[0].allergens;
  assert.throws(()=>evaluateMenu(allergy,m),code('UNKNOWN_ALLERGENS'));
  assert.throws(()=>confirmMealCooking(c,m,{mealId:'meal-1',eventId:'cook',actualNeeds:{tomato:'1000'}}),code('INSUFFICIENT_STOCK'));
});
test('Lot2 suggestions respect significance thresholds, stock usage and leftover destination',()=>{
  const c=context();c.state=emptyStock();const m={...initialMenu('one'),meals:[{id:'m',recipeId:'r0',diners:3,leftovers:'keep'}]};
  assert.equal(suggestPortions(c,m,{mealId:'m',maxSteps:1,minIngredientGain:{tomato:'200'}}).suggestions.length,0);
  c.ingredients[0].perishable=false;
  assert.equal(suggestPortions(c,m,{mealId:'m',maxSteps:1}).suggestions.length,0);
  c.ingredients[0].perishable=true;c.state.physical.tomato='1000';
  const stock=suggestPortions(c,m,{mealId:'m',maxSteps:1});assert.equal(stock.suggestions[0].benefits.morePerishableStockUsed,true);
  m.meals[0].leftovers='discard';assert.equal(suggestPortions(c,m,{mealId:'m'}).suggestions.length,0);
});
test('Lot2 replacement can repair a newly incompatible target without inventing a baseline comparison',()=>{
  const c=context(),m={...initialMenu('one'),meals:[{id:'m',recipeId:'quiche',diners:2,leftovers:'keep'}]};
  c.constraints={excludedIngredients:['egg']};
  const alternatives=replacementAlternatives(c,m,{mealId:'m'});assert(alternatives.alternatives.length);
  for(const p of alternatives.alternatives){assert.equal(p.comparison,null);assert.equal(p.comparisonUnavailable.code,'DIET_EXCLUSION');}
});
test('Lot2 full and partial locks survive global proposals; unlocked proposal can improve while original stays intact',()=>{
  const c=context(),all=menu();all.meals.forEach(m=>m.locks={recipe:true,production:true,diners:true});
  const snapshot=structuredClone(all),fixed=proposeReoptimization(c,all,{strategy:'diverse',maxEvaluations:50});
  assert.deepEqual(fixed.proposal.menu.meals,all.meals);assert.deepEqual(all,snapshot);
  const unlocked=menu(),before=evaluateMenu(c,unlocked),free=proposeReoptimization(c,unlocked,{strategy:'diverse',maxEvaluations:100});
  assert(Q.of(free.proposal.evaluation.score).cmp(before.score)<=0);assert.deepEqual(unlocked,menu());
});
test('Lot2 prepared portion consumption and its cancellation are idempotent and separate from ingredients',()=>{
  const c=context();c.state={...emptyStock(),prepared:{lot:{recipeId:'quiche',portions:'3',sourceEventId:'earlier'}}};
  const event={id:'eat',kind:'consume-prepared',lotId:'lot',portions:'3'};
  const eaten=applyEvent(c.state,event,c);assert.deepEqual(eaten.prepared,{});assert.deepEqual(eaten.physical,{});
  assert.deepEqual(applyEvent(eaten,event,c),eaten);
  const restored=applyEvent(eaten,{id:'undo-eat',kind:'cancel',targetId:'eat'},c);
  assert.equal(restored.prepared.lot.portions,'3');assert.deepEqual(restored.physical,{});
  assert.throws(()=>applyEvent(c.state,{...event,id:'overeat',portions:'4'},c),code('INSUFFICIENT_PREPARED_PORTIONS'));
});
test('Lot2 explicit production grows only to the legal minimum when diners increase; production locks block it',()=>{
  const c=context(),m={...initialMenu('quiche-menu'),meals:[{id:'q',recipeId:'quiche',diners:2,leftovers:'keep',productionUnits:'1'}]};
  const p=recalculateMenu(c,m,[{mealId:'q',diners:5}]);
  assert.equal(p.menu.meals[0].productionUnits,'2');assert.equal(p.evaluation.requirements.preparations[0].producedPortions,'8');
  assert.equal(m.meals[0].productionUnits,'1');
  m.meals[0].locks={production:true};
  assert.throws(()=>recalculateMenu(c,m,[{mealId:'q',diners:5}]),code('LOCKED_PRODUCTION'));
});
test('Lot2 replacement honors a production lock across modes and rejects incompatible batch sizes',()=>{
  const c=context(),m={...initialMenu('locked-production'),meals:[{id:'m',recipeId:'r0',diners:2,leftovers:'keep',productionUnits:'4',locks:{production:true}}]};
  const all=replacementAlternatives(c,m,{mealId:'m',limit:20});
  const batch=all.alternatives.find(p=>p.recipeId==='quiche');assert(batch);
  assert.equal(batch.evaluation.requirements.preparations[0].producedPortions,'4');
  m.meals[0].productionUnits='3';
  const incompatible=replacementAlternatives(c,m,{mealId:'m',limit:20});
  assert(!incompatible.alternatives.some(p=>p.recipeId==='quiche'));
  assert(incompatible.failures.some(f=>f.recipeId==='quiche'&&f.code==='PRODUCTION_STEP_INVALID'));
});
test('Lot2 menu proposals cannot mark a meal cooked to bypass ingredient consumption',()=>{
  const c=context(),m=menu(),changed=structuredClone(m.meals);changed[0].status='cooked';
  assert.throws(()=>proposeMenu(c,m,changed),code('COOKING_CONFIRMATION_REQUIRED'));
  assert.throws(()=>proposeMenu(c,initialMenu('new'),[{...changed[0],id:'new'}]),code('COOKING_CONFIRMATION_REQUIRED'));
});
