import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {optimizeMenus,calculateBasket,Q} from '../src/index.mjs';

const input = JSON.parse(await readFile(new URL('../fixtures/scenario.json',import.meta.url),'utf8'));
const snapshots = [];
function measure(name, data) {
  const start = performance.now(), result = optimizeMenus(data), elapsedMs = performance.now()-start;
  const solution = result.solution;
  const quantityChecks = solution ? Object.entries(solution.basket.quantities).map(([id,q]) => ({ingredientId:id,
    coverage:Q.of(q.fromStock).add(q.bought).cmp(q.required)>=0,
    surplusExact:Q.of(q.bought).sub(q.toBuy).cmp(q.purchaseSurplus)===0,
    stockNotReused:Q.of(q.fromStock).cmp(q.available)<=0,
    unit:q.unit,basis:q.basis,stockUsed:q.fromStock,purchaseSurplus:q.purchaseSurplus})) : [];
  const expectedFamilies = solution ? solution.meals.map(m=>data.recipes.find(r=>r.id===m.recipeId).family) : [];
  const strictConstraintChecks = solution ? {
    mealCount:solution.meals.length===data.mealCount,
    minDistinct:new Set(solution.meals.map(m=>m.recipeId)).size >= (data.constraints?.minDistinct ?? 1),
    maxRepeats:solution.meals.every(m=>solution.meals.filter(x=>x.recipeId===m.recipeId).length <= (data.constraints?.maxRepeats ?? 1)),
    maxPerFamily:data.constraints?.maxPerFamily === undefined || expectedFamilies.every(f=>expectedFamilies.filter(x=>x===f).length <= data.constraints.maxPerFamily),
    wholePackages:solution.basket.cart.lines.every(l=>Number.isSafeInteger(l.count) && l.count>0),
    singleStore:solution.basket.cart.lines.every(l=>l.storeId===data.session.storeId),
    budget:!data.budget?.strict || solution.basket.cart.strictBudgetVerifiable && solution.basket.cart.totalCents<=data.budget.cents
  } : {};
  snapshots.push({name,status:result.status,elapsedMs,search:result.search,
    totalCents:solution?.basket.cart.totalCents ?? null,certainty:solution?.basket.cart.certainty ?? null,
    score:solution?.score ?? null,metrics:solution?.metrics ?? null,quantityChecks,strictConstraintChecks,
    allChecksPass:!!solution && quantityChecks.every(x=>x.coverage&&x.surplusExact&&x.stockNotReused) && Object.values(strictConstraintChecks).every(Boolean)});
  return result;
}
const small = measure('v2-three-recipes-exhaustive',input);
// Independent cover oracle for these integer fixed-pack fixtures only.
function cover(need,opts) {
  if (need<=0) return {cost:0,bought:0};
  const bound=Math.ceil(need/Math.min(...opts.map(p=>Number(p.content.amount))));
  let best=null;
  function visit(k,bought,cost) {
    if (k===opts.length) {
      if(bought>=need&&(!best||cost<best.cost||cost===best.cost&&bought<best.bought))best={cost,bought};
      return;
    }
    for(let n=0;n<=bound;n++)visit(k+1,bought+n*Number(opts[k].content.amount),cost+n*opts[k].price.cents);
  }
  visit(0,0,0); return best;
}
let reference = null;
const referenceMenus = [];
for (let a=0;a<input.recipes.length;a++) for (let b=a+1;b<input.recipes.length;b++) {
  const recipes = [input.recipes[a],input.recipes[b]], needs = {};
  for (const r of recipes)for (const g of r.ingredients)needs[g.ingredientId]=(needs[g.ingredientId]??0)+Number(g.quantity.amount);
  let cost=0,score=Q.of(0);
  for (const [id,need] of Object.entries(needs)) {
    const reserved=Object.values(input.state.reservations).reduce((s,r)=>s+Number(r[id]??0),0);
    const stock=Number(input.state.physical[id]??0)-reserved, used=Math.min(stock,need), missing=need-used;
    const result=cover(missing,input.products.filter(p=>p.ingredientId===id)); cost+=result.cost;
    score=score.add(Q.of(input.policy.wasteRateCents?.[id]??0).mul(result.bought-missing));
    score=score.sub(Q.of(input.policy.perishableStockRateCents?.[id]??0).mul(used));
  }
  score=score.add(cost);
  const row={recipes:recipes.map(r=>r.id),costCents:cost,score:score.toString()}; referenceMenus.push(row);
  if(!reference||score.cmp(reference.score)<0)reference=row;
}
const firstMeals=input.recipes.slice(0,2).map((r,k)=>({id:`naive-${k}`,recipeId:r.id,diners:input.diners,leftovers:input.leftovers}));
const naive=calculateBasket({...input,meals:firstMeals});
const expanded={...input,recipes:Array.from({length:18},(_,k)=>({...structuredClone(input.recipes[k%3]),id:`synthetic-${String(k).padStart(2,'0')}`})),
  mealCount:6,maxCandidates:500,constraints:{minDistinct:3,maxRepeats:1,maxPerFamily:3}};
measure('synthetic-18-recipes-six-meals-cap-500',expanded);
const reverse={...expanded,recipes:expanded.recipes.map(r=>({...r,id:`reverse-${String(17-Number(r.id.split('-')[1])).padStart(2,'0')}`}))};
measure('synthetic-same-recipes-reversed-traversal-cap-500',reverse);
const report={runtime:{node:process.version,platform:process.platform,arch:process.arch},
  notice:input.notice,source:input.source,policy:input.policy,
  reference:{method:'independent enumeration of all distinct pairs + exhaustive integer pack counts',menus:referenceMenus,best:reference,
    matchesEngine:small.solution?.score===reference.score && small.solution?.basket.cart.totalCents===reference.costCents},
  naive:{method:'first two V2 recipes, same validated packaging and stock',totalCents:naive.cart.totalCents,
    extraCentsOverOptimizer:naive.cart.totalCents-small.solution.basket.cart.totalCents},
  measurements:snapshots,limits:['synthetic expanded recipes are copies, not additional real culinary diversity',
    'timings are measured once, not device performance guarantees','no global optimality for capped searches or real unobserved prices',
    'optimality applies to cheapest-pack-then-menu-score policy, not a joint weighted pack/menu objective']};
console.log(JSON.stringify(report,null,2));
if (!report.reference.matchesEngine || snapshots.some(s=>!s.allChecksPass))process.exitCode=1;
