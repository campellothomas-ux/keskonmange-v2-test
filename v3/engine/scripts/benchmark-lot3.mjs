import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {Q,optimizeMenuJoint,optimizeMenuCombined} from '../src/index.mjs';
import {makeBenchmarkCase} from './benchmark-cases.mjs';
const fixture=JSON.parse(await readFile(new URL('../fixtures/lot2.json',import.meta.url),'utf8'));
const historical=JSON.parse(await readFile(new URL('../reports/lot2-benchmark.json',import.meta.url),'utf8'));
const rows=[];
for(const [count,meals,budget]of [[4,2,100],[30,5,250],[60,10,400]]) {
  const {context,slots}=makeBenchmarkCase(fixture,count,meals);
  for(const [strategy,globalBudget]of [['local',budget],['diverse',budget],['combined',budget],['combined',budget*2]]) {
    const search=()=>strategy==='combined'?optimizeMenuCombined(context,{slots,maxEvaluations:globalBudget,maxNodes:100_000}):
      optimizeMenuJoint(context,{slots,strategy,maxEvaluations:globalBudget,maxNodes:100_000});
    const memoryBefore=process.memoryUsage(),start=performance.now(),result=search(),elapsedMs=performance.now()-start,memoryAfter=process.memoryUsage();
    const repeat=search(),stable=JSON.stringify(result)===JSON.stringify(repeat),solution=result.solution;
    const phases=strategy==='combined'?result.search.phases.map(p=>({strategy:p.strategy,budget:p.budget,evaluated:p.result.search.evaluated,
      score:p.result.solution?.evaluation.score??null})):[];
    const noWorseThanEvaluatedPhases=phases.every(p=>p.score===null||solution&&Q.of(solution.evaluation.score).cmp(p.score)<=0);
    const prior=historical.results.find(r=>r.recipeCount===count&&r.strategy===strategy);
    rows.push({recipeCount:count,mealCount:meals,strategy,globalBudget,evaluated:result.search.evaluated,elapsedMs,
      score:solution?.evaluation.score??null,totalCents:solution?.evaluation.basket.cart.totalCents??null,status:result.status,optimal:result.search.optimal,
      stable,noWorseThanEvaluatedPhases,phases,
      unchangedFromLot2AtSameBudget:prior?prior.score===solution?.evaluation.score&&prior.totalCents===solution?.evaluation.basket.cart.totalCents:null,
      memory:{rssBefore:memoryBefore.rss,rssAfter:memoryAfter.rss,heapUsedDelta:memoryAfter.heapUsed-memoryBefore.heapUsed}});
  }
}
const report={notice:fixture.notice,runtime:{node:process.version,platform:process.platform,arch:process.arch},
  baseline:'reports/lot2-benchmark.json, source ebbb9c9; case builder shared without changing its data',rows,
  conclusions:['A combined search is only guaranteed no worse than its own allocated phases.',
    'Equal total budget divides each strategy budget and may underperform a standalone full-budget search.',
    'Double total budget is explicit and selects the better full-budget phase; it does not prove a new global optimum.',
    'Memory samples describe the process, not a measured iPhone allocation peak.'],fieldValidated:false};
console.log(JSON.stringify(report,null,2));
if(rows.some(r=>!r.stable||!r.noWorseThanEvaluatedPhases||r.unchangedFromLot2AtSameBudget===false||!r.score))process.exitCode=1;
