import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMenu,createShopping,addShoppingItem,checkShoppingItem,evaluateMixedMenu,changeMixedMenu,proposeMixedMenu,
  acceptMixedProposal,cancelMixedChange,requestSuggestions,createAdviceSession,declineSuggestion,acceptSuggestion,
  requestMixedReoptimization,stockAvailable} from '../src/index.mjs';
import {context,mixedMenu,code} from './lot3-helpers.mjs';
function setup(){const c=context(),m=mixedMenu(),s=evaluateMixedMenu(c,m,createShopping('s')).shopping;return {c,m,s};}
test('Lot3 B/D — manual edits and an expensive free choice preserve opaque meals and never request advice',()=>{
  const {c,m,s}=setup();c.budget={cents:1,strict:true};
  const before=structuredClone({c,m,s}),p=changeMixedMenu(c,m,s,[{type:'updateMeal',mealId:'meal-2',patch:{diners:3}},
    {type:'addMeal',meal:{id:'chosen',recipeId:'r6',diners:6,leftovers:'keep',selection:'user'}}]);
  assert.equal(p.menu.meals.length,6);assert.deepEqual(p.menu.meals[4],m.meals[4]);assert.equal(p.evaluation.budget.blocking,false);
  assert.equal(p.evaluation.advice.requested,false);assert(p.evaluation.budget.knownExcessCents>0);
  assert.deepEqual({c,m,s},before);const accepted=acceptMixedProposal(c,m,s,p,{eventId:'manual-choice'});
  assert.equal(accepted.menu.meals[5].recipeId,'r6');assert.equal(accepted.menu.meals[5].diners,6);
  assert.deepEqual(accepted.stock.physical,c.state.physical);assert.equal(accepted.stock.reservations['outside-menu'].tomato,'50');
});
test('Lot3 partial planning acceptance is idempotent, reserves only known stock and protects snapshots',()=>{
  const {c,m,s}=setup(),p=proposeMixedMenu(c,m,s,m.meals);
  const a=acceptMixedProposal(c,m,s,p,{eventId:'plan'});assert.equal(stockAvailable(a.stock,c.ingredients).tomato,'0');
  assert(Object.values(a.stock.reservations).every(r=>!Object.hasOwn(r,'chicken-unknown')));
  const replay=acceptMixedProposal({...c,state:a.stock},a.menu,a.shopping,p,{eventId:'plan'});assert.deepEqual(replay.stock,a.stock);assert.deepEqual(replay.shopping,a.shopping);
  let changed=addShoppingItem(s,{id:'late',label:'Late product'});
  assert.throws(()=>acceptMixedProposal(c,m,changed,p,{eventId:'stale'}),code('PROPOSAL_STALE'));
  const undo=cancelMixedChange({...c,state:a.stock},a.menu,a.shopping,{eventId:'undo',targetId:'plan'});
  assert.deepEqual(undo.stock.reservations,c.state.reservations);assert.deepEqual(undo.shopping.manual,s.manual);
});
test('Lot3 C — manual products survive explicit partial reoptimization with quantities and checks intact',()=>{
  const {c,m}=setup();let s=createShopping('s');
  for(const [id,label]of [['b','Biscuits'],['d','Soda'],['h','Household product']])s=addShoppingItem(s,{id,label,quantity:{amount:'2',unit:'free packs'}});
  s=checkShoppingItem(s,'b',true);const rows=structuredClone(s.manual);
  const changed=changeMixedMenu(c,m,s,[{type:'updateMeal',mealId:'meal-2',patch:{diners:3}}]);
  assert.deepEqual(changed.shopping.manual,rows);
  const adopted=acceptMixedProposal(c,m,s,changed,{eventId:'change'});c.state=adopted.stock;
  const optimized=requestMixedReoptimization(c,adopted.menu,adopted.shopping,{maxEvaluations:60});
  assert.equal(optimized.applied,false);assert(optimized.proposal);assert.deepEqual(optimized.proposal.shopping.manual,rows);
  const accepted=acceptMixedProposal(c,adopted.menu,adopted.shopping,optimized.proposal,{eventId:'reopt-accepted'});
  assert.deepEqual(accepted.shopping.manual,rows);
});
test('Lot3 D/E — advice only on demand, multiple useful proposals, decline has no effect and explicit acceptance changes only proposed meals',()=>{
  const {c,m,s}=setup(),before=structuredClone({c,m,s});let session=createAdviceSession('request');
  const found=requestSuggestions(c,m,s,{session,limit:3});assert(found.suggestions.length>=2);assert.equal(found.applied,false);
  assert.deepEqual({c,m,s},before);session=declineSuggestion(session,found.suggestions[0]);
  const next=requestSuggestions(c,m,s,{session,limit:3});assert(next.suggestions.every(p=>p.signature!==found.suggestions[0].signature));
  assert.throws(()=>acceptSuggestion(c,m,s,session,found.suggestions[0],{eventId:'rejected'}),code('SUGGESTION_REJECTED'));
  const chosen=next.suggestions[0],result=acceptSuggestion(c,m,s,session,chosen,{eventId:'advice-accept'});
  for(const old of m.meals)if(!chosen.changes.some(x=>x.mealId===old.id))assert.deepEqual(result.menu.meals.find(x=>x.id===old.id),old);
  assert.equal(result.menu.meals[3].recipeId,'partial');assert.equal(result.menu.meals[4].recipeId,'manual');
  assert(result.adviceSession.acceptedSignatures.includes(chosen.signature));
});
test('Lot3 advice never recommends a known allergen or silently accepts an unverifiable strict budget',()=>{
  const {c,m,s}=setup();c.constraints={allergies:['egg']};
  const safe=requestSuggestions(c,m,s);assert(safe.suggestions.every(p=>p.changes.every(ch=>ch.after?.recipeId!=='quiche')));
  c.budget={strict:true,cents:1500};const strict=requestSuggestions(c,m,s);
  assert.equal(strict.suggestions.length,0);assert(strict.failures.some(f=>f.code==='BUDGET_UNVERIFIABLE'));
});
test('Lot3 mathematical locks and mandatory production remain enforced even when other meals are opaque',()=>{
  const {c,m,s}=setup();m.meals[4].locks={recipe:true,production:true};
  const p=changeMixedMenu(c,m,s,[{type:'updateMeal',mealId:'meal-1',patch:{diners:3}}]);assert.deepEqual(p.menu.meals[4],m.meals[4]);
  m.meals[0].recipeId='quiche';m.meals[0].productionUnits='1';
  const batches=changeMixedMenu(c,m,s,[{type:'updateMeal',mealId:'meal-1',patch:{diners:5}}]);
  assert.equal(batches.evaluation.meals[0].preparation.producedPortions,'8');
  const invalid=changeMixedMenu(c,m,s,[{type:'updateMeal',mealId:'meal-1',patch:{productionUnits:'5/4'}}]);
  assert.equal(invalid.evaluation.meals[0].calculationStatus,'invalid');assert.equal(invalid.evaluation.meals[0].knownNeeds.egg,undefined);
});
test('Lot3 no useful gain means no advice, rather than an artificial saving from preparing more',()=>{
  const c=context();c.state.physical={};c.state.reservations={};const m={...initialMenu('one'),meals:[{id:'m',recipeId:'r0',diners:4,leftovers:'keep'}]},s=evaluateMixedMenu(c,m).shopping;
  const r=requestSuggestions(c,m,s);assert.equal(r.suggestions.length,0);assert.equal(r.applied,false);
});
test('Lot3 low-level automatic proposals cannot bypass diet safety or modify an opaque manual meal',()=>{
  const {c,m,s}=setup();c.constraints={allergies:['egg']};const changed=structuredClone(m.meals);changed[0].recipeId='quiche';
  assert.throws(()=>proposeMixedMenu(c,m,s,changed,{purpose:'suggestion'}),code('ALLERGY_EXCLUSION'));
  const manual=structuredClone(m.meals);manual[4].recipeId='r6';manual[4].selection='user';
  assert.throws(()=>proposeMixedMenu(c,m,s,manual,{purpose:'suggestion'}),code('MANUAL_MEAL_FIXED'));
});
