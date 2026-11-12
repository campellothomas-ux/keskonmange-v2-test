import test from 'node:test';
import assert from 'node:assert/strict';
import {productionRequirements,resolveProduction,stepProduction,productionModel,jointBasket,adaptProductionRecipes} from '../src/index.mjs';
import {context,code} from './lot2-helpers.mjs';

test('Lot2 A — whole quiches: 2/4/5/8/9 diners produce 4/4/8/8/12 portions',()=>{
  const c=context(),r=c.recipes.find(r=>r.id==='quiche');
  for(const [diners,units,produced,kept]of [[2,1,4,2],[4,1,4,0],[5,2,8,3],[8,2,8,0],[9,3,12,3]]) {
    const m={id:'m',recipeId:r.id,diners,leftovers:'keep'},out=productionRequirements([r],[m],c.ingredients),p=out.preparations[0];
    assert.equal(p.units,String(units));assert.equal(p.producedPortions,String(produced));assert.equal(p.keptPortions,String(kept));
    assert.equal(out.needs.tomato,String(units*400));assert.equal(out.needs.egg,String(units*3));
  }
  const m={id:'m',recipeId:r.id,diners:2,leftovers:'keep'};
  assert.equal(resolveProduction(r,stepProduction(r,m,1)).producedPortions,'8');
  assert.throws(()=>resolveProduction(r,{...m,productionUnits:'5/4'}),code('PRODUCTION_STEP_INVALID'));
  assert.throws(()=>stepProduction(r,{...m,diners:5},-1),code('INSUFFICIENT_PORTIONS'));
});
test('Lot2 B — adjustable exact factors, eggs rounded by explicit policy, complete cart',()=>{
  const c=context();c.state={physical:{},reservations:{}};
  const r=structuredClone(c.recipes.find(r=>r.id==='quiche'));
  r.id='chili';r.production={version:1,mode:'adjustable',referenceUnits:'4',portionsPerUnit:'1',unitLabel:'portion',minUnits:'1',stepUnits:'1'};
  for(const [n,eggs,factor]of [[2,2,'1/2'],[3,3,'3/4'],[6,5,'3/2']]) {
    const m={id:'m',recipeId:r.id,diners:n,leftovers:'keep',productionUnits:String(n),indivisiblePolicy:'ceil'};
    const req=productionRequirements([r],[m],c.ingredients),cart=jointBasket(c,req);
    assert.equal(req.needs.tomato,String(n*100));assert.equal(req.needs.egg,String(eggs));assert.equal(req.preparations[0].factor,factor);
    assert.equal(cart.quantities.tomato.bought,n<=4?'400':'800');assert.equal(cart.quantities.egg.bought,'6');
    assert.throws(()=>productionRequirements([r],[{...m,indivisiblePolicy:undefined}],c.ingredients),code('INDIVISIBLE_ROUNDING_REQUIRED'));
  }
});
test('Lot2 production by individual unit and explicit limits',()=>{
  const c=context(),r=c.recipes.find(r=>r.id==='burger');
  const m={id:'burger',recipeId:r.id,diners:3,leftovers:'discard'};
  assert.equal(productionRequirements([r],[m],c.ingredients).needs.tomato,'240');
  assert.equal(stepProduction(r,m,1).productionUnits,'4');
  assert.throws(()=>resolveProduction({...r,production:{...r.production,maxUnits:'2'}},m),code('PRODUCTION_LIMIT'));
});
test('Lot2 K — no inferred mode/yield, no invalid production grid',()=>{
  const r=context().recipes[0];
  assert.throws(()=>productionModel({...r,production:undefined}),code('PRODUCTION_REVIEW_REQUIRED'));
  assert.throws(()=>productionModel({...r,production:{...r.production,portionsPerUnit:undefined}}),code('INVALID_QUANTITY'));
  assert.throws(()=>productionModel({...r,yieldPortions:5}),code('YIELD_MISMATCH'));
  assert.throws(()=>productionModel({...r,production:{...r.production,stepUnits:'0'}}),code('INVALID_QUANTITY'));
});
test('Lot2 adaptation requires an explicit review and evidence, never infers batch mode from title',()=>{
  const r=structuredClone(context().recipes.find(r=>r.id==='quiche')),production=r.production;delete r.production;
  assert.equal(adaptProductionRecipes([r],{}).accepted.length,0);
  const reviewed=adaptProductionRecipes([r],{quiche:{production,evidence:'Explicit synthetic test review'}});
  assert.equal(reviewed.accepted[0].production.mode,'batch');assert.equal(r.production,undefined);
  assert.equal(adaptProductionRecipes([r],{quiche:{production:{...production,portionsPerUnit:undefined},evidence:'test'}}).validationRequired.length,1);
});
