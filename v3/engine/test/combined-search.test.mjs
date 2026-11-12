import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeMenuCombined,optimizeMenuJoint,Q} from '../src/index.mjs';
import {context as lot2Context} from './lot2-helpers.mjs';
test('Lot3 H — combined search selects the best actually evaluated phase under one global budget',()=>{
  const c=lot2Context(),slots=Array.from({length:5},(_,k)=>({id:`m${k}`,diners:2,leftovers:'keep'}));
  const progress=[];const result=optimizeMenuCombined(c,{slots,maxEvaluations:81,maxNodes:1000,onProgress:p=>progress.push(p)});
  assert.equal(result.search.optimal,false);assert(result.search.evaluated<=81);assert.equal(result.search.phases.length,2);
  assert.equal(result.search.phases.reduce((n,p)=>n+p.budget,0),81);
  assert(progress.length>0);assert(progress.every(p=>['local','diverse'].includes(p.phase)&&p.evaluated<=81));
  for(const phase of result.search.phases) {
    const direct=optimizeMenuJoint(c,{slots,strategy:phase.strategy,maxEvaluations:phase.budget,maxNodes:phase.nodeBudget});
    assert.deepEqual(phase.result,direct);if(phase.result.solution)assert(Q.of(result.solution.evaluation.score).cmp(phase.result.solution.evaluation.score)<=0);
  }
  assert.deepEqual(optimizeMenuCombined(c,{slots,maxEvaluations:81,maxNodes:1000}),result);
});
test('Lot3 H — a one-evaluation budget runs one phase only and never claims a global proof',()=>{
  const c=lot2Context(),slots=[{id:'m',diners:2,leftovers:'keep'}];
  const result=optimizeMenuCombined(c,{slots,maxEvaluations:1,maxNodes:1});
  assert.equal(result.search.phases.length,1);assert.equal(result.search.evaluated,1);assert.equal(result.search.optimal,false);
});
