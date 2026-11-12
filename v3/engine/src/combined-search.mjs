import {Q,integer,requireThat} from './exact.mjs';
import {optimizeMenuJoint} from './joint-optimizer.mjs';
import {evaluateMenu,initialMenu} from './menu-evaluation.mjs';

export function optimizeMenuCombined(context,{maxEvaluations=500,maxNodes=500_000,...options}={}) {
  integer(maxEvaluations,'global evaluations');integer(maxNodes,'global nodes');
  const shared=structuredClone(context),slots=structuredClone(options.slots),baseMenu=structuredClone(options.baseMenu??initialMenu('candidate'));
  const allocations=maxEvaluations===1?[1,0]:[Math.ceil(maxEvaluations/2),Math.floor(maxEvaluations/2)];
  const nodeAllocations=maxNodes===1?[1,0]:[Math.ceil(maxNodes/2),Math.floor(maxNodes/2)];
  const phases=[];let evaluated=0,best=null;
  for(const [k,strategy]of ['local','diverse'].entries()) {
    if(!allocations[k]||!nodeAllocations[k])continue;
    const result=optimizeMenuJoint(shared,{...options,slots,baseMenu,strategy,maxEvaluations:allocations[k],maxNodes:nodeAllocations[k],
      onProgress:options.onProgress?row=>options.onProgress({...row,phase:strategy,evaluated:evaluated+row.evaluated}):undefined});
    phases.push({strategy,budget:allocations[k],nodeBudget:nodeAllocations[k],result});evaluated+=result.search.evaluated;
    if(result.solution) {
      const checked=evaluateMenu(shared,result.solution.menu,{stockMenu:baseMenu});
      requireThat(checked.score===result.solution.evaluation.score,'INTERNAL_INVARIANT','phase objective changed');
      const candidate=result.solution,complete=checked.basket.cart.totalCents!==null;
      if(!best||Number(complete)>Number(best.evaluation.basket.cart.totalCents!==null)||
        complete===(best.evaluation.basket.cart.totalCents!==null)&&Q.of(checked.score).cmp(best.evaluation.score)<0)best=candidate;
    }
  }
  requireThat(evaluated<=maxEvaluations,'INTERNAL_INVARIANT','global budget');
  return {status:best?best.evaluation.basket.cart.totalCents===null?'needs_prices':'feasible':
    phases.some(p=>p.result.status==='needs_data')?'needs_data':phases.every(p=>p.result.status==='infeasible')?'infeasible':'search_limit',
    solution:best,search:{strategy:'combined',maxEvaluations,evaluated,maxNodes,optimal:false,
      quality:best?'best_found':'no_solution',phases,scope:'best of the actually evaluated local and diverse phases; no global optimality proof'}};
}
