import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,STORAGE_KEY,createState,loadState,saveState,change,evaluate,details,suggestions,validateState} from '../src/state.mjs';
const recipe=index=>catalog.recipes.find(r=>r.library.sourceIndex===index);
const code=c=>e=>e.code===c;
function storage(){const map=new Map([['v2-production-save','untouched']]);return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};}
function add(state,index,diners=2){return change(state,{type:'addRecipe',recipeId:recipe(index).id,diners});}
function ten(){let s=createState();for(const index of [68,4,6,7,8,15,16,37,53,83])s=add(s,index,index===68?5:2);return s;}

test('LOT5 — ten planned meals aggregate exact needs, cooked yields, integer components and unknown prices',()=>{
  const s=ten(),before=JSON.stringify(s),e=evaluate(s);
  assert.equal(s.menu.meals.length,10);assert.equal(e.coverage.ingredientQuantitiesComplete,true);assert.deepEqual(e.coverage.unknownNeeds,[]);
  assert.equal(e.requirements.needs.i_oignon,'7/2');
  assert.equal(e.shopping.calculated.find(r=>r.ingredientId==='i_oignon').purchaseQuantity.amount,'4');
  assert.equal(e.requirements.needs.i_patates_douces,'750');
  assert.equal(e.requirements.needs.i_pates,'180');assert.equal(e.requirements.needs.i_pate_brisee,'2');
  assert.equal(e.requirements.preparations[0].producedPortions,'8');assert.equal(e.requirements.preparations[0].keptPortions,'3');
  assert.equal(e.basket.amount.totalCents,null);assert(e.shopping.calculated.every(r=>!r.productId));
  assert.equal(JSON.stringify(s),before);
});
test('LOT5 — planned portion changes update cooking, whole burger counts and shopping after explicit checked-line reconciliation',()=>{
  let s=ten();const potatoes=s.shopping.calculated.find(r=>r.ingredientId==='i_patates_douces'),burger=s.menu.meals.find(m=>m.recipeId===recipe(15).id);
  s=change(s,{type:'checkItem',id:potatoes.id,checked:true});const before=JSON.stringify(s);
  const updated=change(s,{type:'setDiners',mealId:burger.id,diners:3}),e=evaluate(updated);
  assert.equal(JSON.stringify(s),before);assert.equal(e.requirements.needs.i_patates_douces,'975');
  assert.equal(updated.shopping.calculated.find(r=>r.id===potatoes.id).quantity.amount,'750');assert.equal(e.coverage.checkedConflicts.length,1);
  const cooking=details(burger.recipeId,3,burger.id).cooking;assert(cooking.steps[2].text.includes('1 ½ c. à soupe'));
  const accepted=change(updated,{type:'acknowledgeShopping'}),row=accepted.shopping.calculated.find(r=>r.id===potatoes.id);
  assert.equal(row.quantity.amount,'975');assert.equal(row.checked,true);assert.equal(evaluate(accepted).coverage.checkedConflicts.length,0);
});
test('LOT5 — local persistence restores ten meals, portion preferences and checked manual/calculated articles; V2 keys stay untouched',()=>{
  const disk=storage();let s=ten();
  s=change(s,{type:'rememberDiners',recipeId:recipe(25).id,diners:4});
  s=change(s,{type:'addManual',label:'Savon',quantity:'1 pièce'});const id=s.shopping.manual[0].id;
  s=change(s,{type:'checkItem',id,checked:true});s=change(s,{type:'checkItem',id:s.shopping.calculated[0].id,checked:true});
  assert.equal(saveState(disk,s).saved,true);const restored=loadState(disk);
  assert.equal(restored.error,null);assert.deepEqual(restored.state,s);assert.equal(disk.map.get('v2-production-save'),'untouched');
  const again=evaluate(restored.state);assert.deepEqual(again.shopping,restored.state.shopping);
  assert(JSON.stringify(s).length<500000,'only snapshots, no large ledger/context history in localStorage');
});
test('LOT5 — corrupted or unavailable storage is explicit and never silently clears or overwrites an old save',()=>{
  const disk=storage();disk.map.set(STORAGE_KEY,'{broken');const loaded=loadState(disk);
  assert(loaded.error);assert.equal(loaded.state.menu.meals.length,0);assert.equal(disk.map.get(STORAGE_KEY),'{broken');
  const blocked={getItem:()=>{throw Error('SecurityError');},setItem:()=>{throw Error('QuotaExceededError');}};
  assert(loadState(blocked).error);const s=ten(),before=JSON.stringify(s);assert.equal(saveState(blocked,s).saved,false);assert.equal(JSON.stringify(s),before);
  const unknown=ten();unknown.menu.meals[0].recipeId='unknown';assert.throws(()=>validateState(unknown),code('UNKNOWN_RECIPE'));
});
test('LOT5 — deleting a meal recomputes shopping and preserves manual additions and their checks',()=>{
  let s=add(createState(),15,2);s=change(s,{type:'addManual',label:'Café',quantity:'1 paquet'});s=change(s,{type:'checkItem',id:s.shopping.manual[0].id,checked:true});
  const manual=structuredClone(s.shopping.manual);s=change(s,{type:'removeMeal',mealId:s.menu.meals[0].id});
  assert.equal(s.menu.meals.length,0);assert.equal(s.shopping.calculated.length,0);assert.deepEqual(s.shopping.manual,manual);
  s=change(s,{type:'removeManual',id:manual[0].id});assert.equal(s.shopping.manual.length,0);
});
test('LOT5 — requesting ideas does not mutate the planning and adding one requires an explicit command',()=>{
  const s=ten(),before=JSON.stringify(s),ideas=suggestions(s,5);assert.equal(JSON.stringify(s),before);
  assert.equal(ideas.applied,false);assert.equal(ideas.suggestions.length,6);
  assert(ideas.suggestions.every(i=>!s.menu.meals.some(m=>m.recipeId===i.recipeId)));
  const updated=change(s,{type:'addRecipe',recipeId:ideas.suggestions[0].recipeId,diners:5});assert.equal(updated.menu.meals.length,11);
});
test('LOT5 — beaten egg fractions remain exact while whole eggs are bought after aggregation',()=>{
  const d=details(recipe(45).id,1);assert(d.cooking.ingredients.some(g=>g.ingredientId==='i_oeufs'&&g.referenceQuantity.amount==='5/2'));
  assert(d.cooking.notes.some(n=>n.includes('battre')));
  let s=add(createState(),45,1);s=add(s,34,3);const e=evaluate(s),egg=e.shopping.calculated.find(r=>r.ingredientId==='i_oeufs');
  assert.equal(egg.quantity.amount,'9/2');assert.equal(egg.purchaseQuantity.amount,'5');assert.equal(egg.minimumPurchaseSurplus,'1/2');
});
test('LOT5 — invalid portion changes and empty manual labels fail without changing the prior snapshot',()=>{
  const s=ten(),before=JSON.stringify(s);
  for(const count of [0,13,1.5,NaN])assert.throws(()=>change(s,{type:'setDiners',mealId:s.menu.meals[0].id,diners:count}),code('INVALID_DINERS'));
  assert.throws(()=>change(s,{type:'addManual',label:'  '}),code('INVALID_MANUAL_ITEM'));assert.equal(JSON.stringify(s),before);
});
