import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {optimizeMenuJoint,Q} from '../src/index.mjs';
import {makeBenchmarkCase} from './benchmark-cases.mjs';
const fixture=JSON.parse(await readFile(new URL('../fixtures/lot2.json',import.meta.url),'utf8'));
const results=[];
for(const [count,meals,maxEvaluations]of [[4,2,100],[30,5,250],[60,10,400]]) {
  const {context,slots}=makeBenchmarkCase(fixture,count,meals);
  for(const strategy of ['exhaustive','local','diverse']) {
    const before=process.memoryUsage();let sampledPeakRss=before.rss;
    const settings={slots,strategy,maxEvaluations,maxNodes:100_000};
    const start=performance.now(),result=optimizeMenuJoint(context,{...settings,onProgress:()=>{sampledPeakRss=Math.max(sampledPeakRss,process.memoryUsage().rss);}});
    const elapsedMs=performance.now()-start,after=process.memoryUsage();sampledPeakRss=Math.max(sampledPeakRss,after.rss);
    const repeatStart=performance.now(),repeat=optimizeMenuJoint(context,settings),repeatElapsedMs=performance.now()-repeatStart;
    const stable=JSON.stringify(repeat)===JSON.stringify(result),e=result.solution?.evaluation;
    const quantitiesValid=!!e&&Object.values(e.basket.quantities).every(q=>Q.of(q.fromStock).add(q.bought).cmp(q.required)>=0&&Q.of(q.fromStock).cmp(q.available)<=0);
    results.push({recipeCount:count,mealCount:meals,strategy,maxEvaluations,elapsedMs,repeatElapsedMs,
      memory:{rssBefore:before.rss,rssAfter:after.rss,heapUsedDelta:after.heapUsed-before.heapUsed,sampledPeakRss,
        processCumulativeMaxRssKiB:process.resourceUsage().maxRSS},status:result.status,search:result.search,
      totalCents:e?.basket.cart.totalCents??null,score:e?.score??null,metrics:e?.metrics??null,stable,quantitiesValid});
  }
}
const comparisons=[4,30,60].map(count=>{
  const rows=results.filter(r=>r.recipeCount===count&&r.score!==null).sort((a,b)=>Q.of(a.score).cmp(b.score));
  return {recipeCount:count,bestMeasuredScore:rows[0]?.score??null,provenReference:rows.find(r=>r.search.optimal)?.score??null,
    gaps:rows.map(r=>({strategy:r.strategy,scoreGapToBestMeasured:Q.of(r.score).sub(rows[0].score).toString()}))};
});
console.log(JSON.stringify({notice:fixture.notice,runtime:{node:process.version,platform:process.platform,arch:process.arch},results,comparisons,
  limits:['Synthetic catalogs, not household culinary validation.','RSS is sampled, not a per-call allocation or mobile peak guarantee.',
    'Heap deltas may be negative due to garbage collection.','Only completed exhaustive searches certify optimality.',
    'No iPhone or Safari timing guarantee; no OR-Tools timing was measured.']},null,2));
if(results.some(r=>!r.stable||!r.quantitiesValid))process.exitCode=1;
