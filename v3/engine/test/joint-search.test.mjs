import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeMenuJoint,initialMenu,emptyStock,Q,evaluateMenu} from '../src/index.mjs';
import {context,code} from './lot2-helpers.mjs';
const slots=n=>Array.from({length:n},(_,k)=>({id:`m${k}`,diners:2,leftovers:'keep'}));

test('Lot2 J — exhaustive joint search compares menus and pack alternatives against independent generated oracle',()=>{
  let seed=91;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let k=0;k<45;k++) {
    const c=context();c.state={...emptyStock(),physical:{tomato:String(random(4))}};c.budget=undefined;
    c.recipes=c.recipes.slice(0,3).map(r=>({...r,yieldPortions:1,production:{...r.production,referenceUnits:'1'},ingredients:[{ingredientId:'tomato',quantity:{amount:String(1+random(4)),unit:'g',basis:'net'}}]}));
    c.constraints={maxRepeats:2};c.policy={repeatPenaltyCents:random(8),wasteRateCents:{tomato:String(random(5))}};
    const sizes=[1+random(6),1+random(6)],costs=[1+random(15),1+random(15)];
    c.products=[0,1].map(j=>({...structuredClone(c.products[0]),id:`p${j}`,content:{amount:String(sizes[j]),unit:'g',basis:'net'},price:{...c.products[0].price,cents:costs[j]}}));
    const s=slots(2);s[0].diners=1+random(3);s[1].diners=1+random(3);let best=Infinity;
    for(let a=0;a<3;a++)for(let b=0;b<3;b++) {
      const need=s[0].diners*Number(c.recipes[a].ingredients[0].quantity.amount)+s[1].diners*Number(c.recipes[b].ingredients[0].quantity.amount);
      const missing=Math.max(0,need-Number(c.state.physical.tomato));
      for(let x=0;x<=missing;x++)for(let y=0;y<=missing;y++)if(x*sizes[0]+y*sizes[1]>=missing)
        best=Math.min(best,x*costs[0]+y*costs[1]+Number(c.policy.wasteRateCents.tomato)*(x*sizes[0]+y*sizes[1]-missing)+(a===b?c.policy.repeatPenaltyCents:0));
    }
    const out=optimizeMenuJoint(c,{slots:s,strategy:'exhaustive',maxEvaluations:100});
    assert.equal(Number(out.solution.evaluation.score),best,`case ${k}`);assert.equal(out.search.optimal,true);
    assert.deepEqual(optimizeMenuJoint(c,{slots:s,strategy:'exhaustive',maxEvaluations:100}),out);
  }
});
test('Lot2 J — limits expose feasible/best-found, never optimal; progress reports improving incumbents',()=>{
  const c=context(),progress=[];
  const limited=optimizeMenuJoint(c,{slots:slots(5),strategy:'exhaustive',maxEvaluations:3,onProgress:p=>progress.push(p)});
  assert(limited.solution);assert(limited.search.limited);assert.equal(limited.search.optimal,false);assert.equal(limited.search.evaluated,3);
  assert.deepEqual(progress,limited.search.progress);
  for(let i=1;i<progress.length;i++)assert(Q.of(progress[i].score).cmp(progress[i-1].score)<0);
  for(const strategy of ['local','diverse']) {
    const result=optimizeMenuJoint(c,{slots:slots(5),strategy,maxEvaluations:60});
    assert(result.solution);assert.equal(result.search.optimal,false);assert(result.search.evaluated<=60);
    assert.deepEqual(evaluateMenu(c,result.solution.menu),result.solution.evaluation);
  }
  const bound=optimizeMenuJoint(c,{slots:slots(5),strategy:'exhaustive',maxNodes:1});
  assert(bound.search.limited);assert.equal(bound.search.optimal,false);
});
test('Lot2 K — invalid locked recipe, budget, allergens and production data have explicit diagnostics',()=>{
  const c=context(),s=[{...slots(1)[0],recipeId:'quiche',locks:{recipe:true}}];
  c.constraints={excludedIngredients:['egg']};
  const excluded=optimizeMenuJoint(c,{slots:s,strategy:'exhaustive'});
  assert.equal(excluded.status,'infeasible');assert(excluded.search.rejected.some(x=>x.code==='DIET_EXCLUSION'));
  c.constraints={};c.recipes=c.recipes.filter(r=>r.id==='quiche');delete c.recipes[0].production;
  assert.equal(optimizeMenuJoint(c,{slots:s,strategy:'exhaustive'}).status,'needs_data');
  const budget=context();budget.budget={strict:true,cents:1};budget.products.forEach(p=>p.price={...p.price,kind:'observed',observedOn:budget.session.asOf});
  assert.equal(optimizeMenuJoint(budget,{slots:slots(1),strategy:'exhaustive'}).status,'infeasible');
});
test('Lot2 global proposals preserve per-meal diners and optionally explore legal extra production only as candidates',()=>{
  const c=context();c.recipes=c.recipes.slice(0,2);c.constraints={maxRepeats:2};c.state=emptyStock();
  const s=[{id:'m',recipeId:'r0',diners:3,leftovers:'keep'}];
  const result=optimizeMenuJoint(c,{slots:s,strategy:'exhaustive',allowProductionAdjustments:true,productionExtraSteps:1});
  assert.equal(result.solution.menu.meals[0].diners,3);assert.equal(result.solution.evaluation.requirements.preparations[0].producedPortions,'4');
  assert.equal(s[0].productionUnits,undefined);assert(result.search.optimal);
});
