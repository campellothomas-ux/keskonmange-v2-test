import test from 'node:test';
import assert from 'node:assert/strict';
import {convertPilots} from '../scripts/convert-pilots.mjs';
import {productionModel,productionRequirements,resolveProduction,canonicalQuantity,ingredientMap,renderCooking,
  evaluateMixedMenu,suggestRecipes,optimizeMenuJoint,requestSuggestions,createShopping,suggestPortions,
  replacementAlternatives,proposeMixedMenu} from '../src/index.mjs';
import {pilots,source,setup,code} from './lot4-helpers.mjs';

test('LOT4 — exactly five native recipes retain all 60 originals and every unvalidated proposal',()=>{
  const f=pilots(),s=source();assert.deepEqual(convertPilots(s),f);assert.equal(f.recipes.length,5);
  assert.equal(f.recipes.reduce((n,r)=>n+r.ingredients.length,0),60);
  const map=ingredientMap(f.ingredients);
  f.recipes.forEach((r,k)=>{
    assert.deepEqual(r.originalV1,s.recipes[k].originalV1);productionModel(r);
    r.ingredients.forEach((g,n)=>{
      const original=r.originalV1.ingredients[n];assert.equal(g.trace.original.amount,String(original.qte));
      assert.equal(g.trace.validated,null);assert.equal(g.trace.effective.decision,'original_preserved');
      assert.equal(g.quantity.amount,String(original.qte)==='0.5'?'1/2':String(original.qte));
      canonicalQuantity(g.quantity,map.get(g.ingredientId));
    });
  });
  const pasta=f.recipes[2].ingredients[1];assert.equal(pasta.quantity.amount,'350');
  assert.equal(pasta.trace.proposed[0].proposedQuantity,270);assert.equal(pasta.trace.proposed[0].confidence,'candidate_not_validated');
  assert.deepEqual(f.products,[]);assert.deepEqual(f.pieceConversions,[]);
});
test('LOT4 — changed source cannot silently reuse curated instruction bindings',()=>{
  const s=source();s.recipes[0].originalV1.ingredients.reverse();
  assert.throws(()=>convertPilots(s),code('PILOT_SOURCE_CHANGED'));
  const bulk=source();bulk.recipes.push(bulk.recipes[0]);assert.throws(()=>convertPilots(bulk),code('PILOT_SCOPE_REQUIRED'));
});
test('LOT4 — whole quiches never split pastry; salad follows diners, not cooked batches',()=>{
  const f=pilots(),r=f.recipes[0];
  for(const [diners,portions,pastry,salad]of [[2,'4','1','80'],[4,'4','1','160'],[5,'8','2','200'],[8,'8','2','320'],[9,'12','3','360']]) {
    const m={id:'q',recipeId:r.id,diners,leftovers:'keep'},out=productionRequirements([r],[m],f.ingredients);
    assert.equal(out.preparations[0].producedPortions,portions);assert.equal(out.needs.i_pate_brisee,pastry);
    assert.equal(out.needs.i_salade_verte,salad);assert.equal(out.needs.i_oeufs,String(Number(pastry)*3));
  }
  assert.throws(()=>resolveProduction(r,{id:'q',diners:2,leftovers:'discard',productionUnits:'1/2'}),code('PRODUCTION_STEP_INVALID'));
});
test('LOT4 — gratin is adjustable in a smaller dish, with exact sauce and auxiliary water',()=>{
  const {c,m}=setup(),r=c.recipes[4],meal=m.meals[4],out=productionRequirements([r],[meal],c.ingredients);
  assert.equal(out.needs.i_gnocchis,'375');assert.equal(out.needs.i_potimarron,'300');
  assert.equal(out.needs.i_mozzarella,'75');assert.equal(out.needs.i_creme_legere,'50');
  assert.equal(out.needs.i_ail,'1/2');assert.equal(out.needs.i_oignon,'1/2');
  const cooked=renderCooking(r,meal,c.ingredients);assert.equal(cooked.status,'complete');
  assert(cooked.steps[2].text.includes('75 ml d’eau'));assert(cooked.steps[4].text.includes('100 g'));
  assert(!Object.hasOwn(out.needs,'i_eau_cuisine'));assert.equal(r.productionTrace.culinaryTrialStatus,'pending');
});
test('LOT4 — burger components remain whole for 1..9 diners; side potatoes/oil follow diners independently',()=>{
  const f=pilots(),r=f.recipes[3];
  for(let diners=1;diners<=9;diners++) {
    const meal={id:'b',recipeId:r.id,diners,leftovers:'keep'},out=productionRequirements([r],[meal],f.ingredients);
    for(const id of ['i_pains_a_burger','i_steaks_haches_de_boeuf_5_mg','i_cheddar_en_tranches'])assert.equal(out.needs[id],String(diners));
    assert.equal(out.needs.i_patates_douces,String(diners*225));
  }
  const extra={id:'b',recipeId:r.id,diners:2,productionUnits:4,leftovers:'keep'};
  const out=productionRequirements([r],[extra],f.ingredients);
  assert.equal(out.needs.i_pains_a_burger,'4');assert.equal(out.needs.i_patates_douces,'450');assert.equal(out.needs.i_huile_d_olive,'1');
});
test('LOT4 — all five cooking modes use final quantities and preserve literal temperatures/durations',()=>{
  const {c,m}=setup();
  for(const meal of m.meals) {
    const r=c.recipes.find(r=>r.id===meal.recipeId),cooking=renderCooking(r,meal,c.ingredients);
    assert.equal(cooking.status,'complete');assert(cooking.steps.length>=5);
    const needs=productionRequirements([r],[meal],c.ingredients).needs;
    for(const step of cooking.steps)for(const b of step.bindings)if(b.ingredientId!=='i_eau_cuisine')assert.equal(b.referenceQuantity.amount,needs[b.ingredientId]);
  }
  const burger=renderCooking(c.recipes[3],m.meals[3],c.ingredients);
  assert.match(burger.steps[2].text,/1 c\. à soupe d’huile/);assert(!burger.steps[2].text.includes('2 cuillères'));
  assert(burger.steps[0].text.includes('210 °C'));assert(burger.steps[3].text.includes('25 à 35 minutes'));
  const q=renderCooking(c.recipes[0],m.meals[0],c.ingredients);assert.equal(q.steps.length,8);assert.equal(c.recipes[0].originalV1.etapes.length,9);
});
test('LOT4 — missing or unreviewed cooking binding is flagged, never guessed by replacing text numbers',()=>{
  const {c,m}=setup(),r=structuredClone(c.recipes[3]);
  r.cookingSteps[2].quantityBindingsReviewed=false;
  r.cookingSteps[3].parts=[{ingredientId:'missing'}];
  const out=renderCooking(r,m.meals[3],c.ingredients);
  assert.equal(out.status,'needs_review');assert.deepEqual(out.issues.map(i=>i.code),['COOKING_QUANTITY_REVIEW_REQUIRED','COOKING_INGREDIENT_REQUIRED']);
  assert(!out.steps.some(s=>s.index===2||s.index===3));
  delete r.cookingSteps;assert.equal(renderCooking(r,m.meals[3],c.ingredients).issues[0].code,'COOKING_BINDINGS_REQUIRED');
});
test('LOT4 — catalog-free suggestions exclude disproportionate quiche leftovers and keep manual choice possible',()=>{
  const {c,m}=setup([5,3,3,2,2]);
  const found=suggestRecipes(c,{diners:5});assert.equal(found.applied,false);
  assert.equal(found.suggestions.length,4);assert(!found.suggestions.some(s=>s.recipeId===c.recipes[0].id));
  assert(found.excluded.some(x=>x.reason==='AUTOMATIC_SURPLUS_NOT_ALLOWED'));
  assert(found.suggestions.every(s=>s.preparation.producedPortions==='5'&&s.priceCents===null));
  assert(suggestRecipes(c,{diners:4}).suggestions.some(s=>s.recipeId===c.recipes[0].id));
  const manual=evaluateMixedMenu(c,m);assert.equal(manual.meals[0].calculationStatus,'complete');
  assert.equal(manual.meals[0].preparation.producedPortions,'8');assert.equal(manual.meals[0].optimizable,false);
});
test('LOT4 — automatic joint search and legacy alternatives cannot bypass the surplus restriction',()=>{
  const {c}=setup();c.recipes=[c.recipes[0]];
  // Physical stock makes this a genuine production eligibility test, independent of prices.
  const meal={id:'q',recipeId:c.recipes[0].id,diners:5,leftovers:'keep'};
  c.state.physical=productionRequirements(c.recipes,[meal],c.ingredients).needs;
  const r=optimizeMenuJoint(c,{slots:[meal],strategy:'exhaustive',allowProductionAdjustments:true});
  assert.equal(r.solution,null);assert.equal(r.status,'infeasible');assert(r.search.rejected.some(r=>r.code==='AUTOMATIC_SURPLUS_NOT_ALLOWED'));
  const {c:other,m}=setup([4,5,3,2,2]);const alt=replacementAlternatives(other,m,{mealId:'meal-1'});
  assert(alt.failures.some(f=>f.recipeId===other.recipes[0].id&&f.code==='AUTOMATIC_SURPLUS_NOT_ALLOWED'));
});
test('LOT4 — automatic extra portions are disabled on every pilot, including abundant free stock',()=>{
  const {c,m}=setup();c.state.physical=Object.fromEntries(c.ingredients.map(i=>[i.id,'100000']));
  const advice=requestSuggestions(c,m,createShopping('s'),{kinds:['portions']});
  assert.equal(advice.search.evaluated,0);assert.equal(advice.suggestions.length,0);
  const direct=suggestPortions(c,m,{mealId:'meal-3'});assert.equal(direct.rejected[0].code,'EXTRA_PRODUCTION_DISABLED');
  const r=optimizeMenuJoint({...c,recipes:[c.recipes[3]]},{slots:[m.meals[3]],strategy:'exhaustive',allowProductionAdjustments:true,productionExtraSteps:5});
  assert.equal(r.search.evaluated,1);assert.equal(r.solution.menu.meals[0].productionUnits,undefined);
});
test('LOT4 — manual meal change can keep whole quiches while low-level advice cannot introduce them for five',()=>{
  const {c,m}=setup([4,5,3,2,2]),next=structuredClone(m.meals);next[1].recipeId=c.recipes[0].id;
  const manual=proposeMixedMenu(c,m,createShopping('s'),next);assert.equal(manual.evaluation.meals[1].preparation.producedPortions,'8');
  assert.throws(()=>proposeMixedMenu(c,m,createShopping('s'),next,{purpose:'suggestion'}),code('INCOMPLETE_AUTOMATIC_CHOICE'));
});
