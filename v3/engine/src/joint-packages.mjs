import {Q,gcd,lcm,positive,integer,requireThat,safeNumber,minQ} from './exact.mjs';
import {ingredientMap,validateCatalog} from './model.mjs';
import {stockAvailable} from './basket.mjs';
import {choosePackages,priceLines} from './packages.mjs';

export function pareto(rows) {
  rows.sort((a,b)=>a.cost-b.cost || Q.of(a.waste).cmp(b.waste));
  let lowest=null;
  return rows.filter(r=>{if(lowest!==null && Q.of(r.waste).cmp(lowest)>=0)return false; lowest=r.waste; return true;});
}
const currentPrice=(p,s)=>p.price.kind==='observed' && p.price.observedOn===s.asOf &&
  (!p.price.rangeCents || p.price.rangeCents.every(c=>c===p.price.cents));

// All nondominated (cost, weighted surplus) covers, not just the cheapest cover.
export function packageFrontier(needValue,options,map,{rate='0',maxStates=100_000,session,strict=false}={}) {
  const need=positive(needValue,'package need',true); positive(rate,'waste rate',true); integer(maxStates,'maxStates');
  if(need.cmp(0)===0)return {rows:[{cost:0,waste:'0',bought:'0',lines:[]}],complete:true};
  requireThat(options.length>0,'NO_PRODUCT','no available format');
  let opts=[...options].sort((a,b)=>a.id<b.id?-1:1);
  if(strict) {opts=opts.filter(p=>currentPrice(p,session)); requireThat(opts.length,'BUDGET_UNVERIFIABLE','no observed session price');}
  const complete=opts.every(p=>p.price.cents!==null);
  if(opts.some(p=>p.mode==='weight')) {
    const result=choosePackages(need,opts,map,{maxStates});
    const priced=priceLines(result.lines,opts,map,session);
    return {complete,rows:[{cost:priced.totalCents??priced.knownSubtotalCents,waste:Q.of(result.surplus).mul(rate).toString(),
      bought:result.bought,lines:result.lines}]};
  }
  const known=opts.filter(p=>p.price.cents!==null);
  if(!known.length) {
    const result=choosePackages(need,opts,map,{maxStates});
    return {complete:false,rows:[{cost:0,waste:Q.of(result.surplus).mul(rate).toString(),bought:result.bought,lines:result.lines}]};
  }
  opts=known;
  const denominator=opts.reduce((d,p)=>lcm(d,p.capacity.d),need.d);
  const sizes=opts.map(p=>p.capacity.n*(denominator/p.capacity.d)), divisor=sizes.reduce(gcd);
  const caps=sizes.map(x=>safeNumber(x/divisor,'capacity lattice'));
  const target=safeNumber(need.mul(denominator.toString()).div(divisor.toString()).ceil(),'target');
  const limit=target+Math.max(...caps)-1;
  requireThat(Number.isSafeInteger(limit)&&limit+1<=maxStates&&(limit+1)*opts.length<=5_000_000,'RESOURCE_LIMIT','joint package lattice');
  const dp=new Array(limit+1); dp[0]={cost:0n,previous:-1,index:-1,packs:0};
  for(let q=1;q<=limit;q++)for(let k=0;k<opts.length;k++) {
    const previous=q-caps[k]; if(previous<0||!dp[previous])continue;
    const cost=dp[previous].cost+BigInt(opts[k].price.cents),packs=dp[previous].packs+1;
    if(!dp[q]||cost<dp[q].cost||cost===dp[q].cost&&packs<dp[q].packs)dp[q]={cost,previous,index:k,packs};
  }
  let rows=[];
  for(let q=target;q<=limit;q++)if(dp[q]) {
    const bought=new Q(BigInt(q)*divisor,denominator);
    rows.push({cost:safeNumber(dp[q].cost,'cover cost'),waste:bought.sub(need).mul(rate).toString(),bought:bought.toString(),q});
  }
  rows=pareto(rows);
  for(const row of rows) {
    const counts=opts.map(()=>0);
    for(let q=row.q;q>0;q=dp[q].previous)counts[dp[q].index]++;
    row.lines=opts.flatMap((p,k)=>counts[k]?[{productId:p.id,count:counts[k]}]:[]); delete row.q;
  }
  return {rows,complete};
}

export function jointBasket(context,requirements,state=context.state??{}) {
  const {ingredients,products,session,manual=[],budget,policy={},maxStates,maxPortfolioStates=10_000}=context;
  const map=ingredientMap(ingredients),catalog=validateCatalog(products,ingredients,session),available=stockAvailable(state,ingredients);
  integer(maxPortfolioStates,'maxPortfolioStates');
  const manualPrice=priceLines(manual,catalog,map,session);
  if(budget?.strict)requireThat(manualPrice.strictBudgetVerifiable,'BUDGET_UNVERIFIABLE','manual purchases');
  let portfolio=[{cost:manualPrice.totalCents??manualPrice.knownSubtotalCents,waste:'0',selected:{},lines:[]}],complete=true;
  const quantities={};
  for(const [id,amount]of Object.entries(requirements.needs).sort(([a],[b])=>a<b?-1:1)) {
    const used=minQ(available[id]??0,amount),missing=Q.of(amount).sub(used);
    const front=packageFrontier(missing,catalog.filter(p=>p.ingredientId===id),map,
      {rate:policy.wasteRateCents?.[id]??'0',maxStates,session,strict:budget?.strict});
    complete&&=front.complete;
    const manualForIngredient=manual.filter(l=>catalog.find(p=>p.id===l.productId)?.ingredientId===id);
    const base=priceLines(manualForIngredient,catalog,map,session);
    // Weight prices round per merged line. Compute the exact marginal cost after manual purchases.
    for(const row of front.rows) {
      const price=priceLines([...manualForIngredient,...row.lines],catalog,map,session);
      row.cost=(price.totalCents??price.knownSubtotalCents)-(base.totalCents??base.knownSubtotalCents);
    }
    requireThat(portfolio.length*front.rows.length<=maxPortfolioStates,'RESOURCE_LIMIT','joint purchase frontier combinations');
    const next=[];
    for(const prev of portfolio)for(const row of front.rows) {
      const cost=safeNumber(BigInt(prev.cost)+BigInt(row.cost),'portfolio cost');
      if(budget?.strict && cost>budget.cents)continue;
      next.push({cost,waste:Q.of(prev.waste).add(row.waste).toString(),selected:{...prev.selected,[id]:row},lines:[...prev.lines,...row.lines]});
    }
    requireThat(next.length>0,'BUDGET_EXCEEDED','no joint pack combination within strict budget');
    portfolio=pareto(next);
    quantities[id]={unit:map.get(id).unit,basis:map.get(id).basis,required:amount,physical:state.physical?.[id]??'0',
      available:available[id]??'0',fromStock:used.toString(),toBuy:missing.toString()};
  }
  const scoreRow=row=>Q.of(row.cost).add(row.waste).add(budget&&!budget.strict&&row.cost>budget.cents ?
    Q.of(policy.budgetOverPenaltyPerCent??0).mul(row.cost-budget.cents) : 0);
  portfolio.sort((a,b)=>scoreRow(a).cmp(scoreRow(b))||a.cost-b.cost);
  const best=portfolio[0];
  for(const [id,q]of Object.entries(quantities)) {
    q.bought=best.selected[id].bought;q.purchaseSurplus=Q.of(q.bought).sub(q.toBuy).toString();
    q.remainingFree=Q.of(q.available).sub(q.fromStock).add(q.purchaseSurplus).toString();
  }
  const menu=priceLines(best.lines,catalog,map,session),cart=priceLines([...best.lines,...manual],catalog,map,session);
  if(budget?.strict)requireThat(cart.strictBudgetVerifiable&&cart.totalCents<=budget.cents,'BUDGET_EXCEEDED','cart');
  return {requirements,quantities,menu,cart,packageOptimal:complete&&cart.totalCents!==null,
    purchaseScore:scoreRow(best).toString(),weightedSurplus:best.waste,frontierStates:portfolio.length};
}
