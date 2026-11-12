import {Q,integer,text,requireThat,EngineError} from './exact.mjs';
import {stableJSON} from './ledger.mjs';
import {stepProduction} from './production.mjs';
import {checkRecipeConstraints} from './menu-evaluation.mjs';
import {mealForReplacement} from './menu-proposals.mjs';
import {analyzeMixedMeal} from './mixed-core.mjs';
import {evaluateMixedMenu} from './mixed-menu.mjs';
import {proposeMixedMenu,acceptMixedProposal} from './mixed-proposals.mjs';

export const createAdviceSession=id=>({version:1,id:text(id,'advice.id'),revision:0,rejectedSignatures:[],acceptedSignatures:[]});
function validateSession(s) {
  requireThat(s?.version===1&&Array.isArray(s.rejectedSignatures)&&Array.isArray(s.acceptedSignatures),'INVALID_ADVICE_SESSION','session');
  text(s.id,'advice.id');integer(s.revision,'advice.revision',true);
}
export function declineSuggestion(session,proposal) {
  validateSession(session);requireThat(proposal?.purpose==='suggestion'&&typeof proposal.signature==='string','INVALID_SUGGESTION','proposal');
  const next=structuredClone(session);if(!next.rejectedSignatures.includes(proposal.signature)){next.rejectedSignatures.push(proposal.signature);next.revision++;}return next;
}
function noNewUncertainty(context,before,after) {
  const key=v=>stableJSON(v),old=new Set([...before.coverage.unknownNeeds,...before.coverage.purchaseIssues,...before.coverage.catalogIssues].map(key));
  if([...after.coverage.unknownNeeds,...after.coverage.purchaseIssues,...after.coverage.catalogIssues].some(v=>!old.has(key(v))))return false;
  const unpriced=e=>{
    const totals=new Map();
    for(const r of [...e.shopping.manual,...e.shopping.calculated].filter(r=>!r.confirmed&&r.productId)) {
      const p=context.products.find(p=>p.id===r.productId);if(p?.price?.cents===null)totals.set(r.productId,(totals.get(r.productId)??0)+(r.count??0));
    }return totals;
  };
  const a=unpriced(before);for(const [id,n]of unpriced(after))if(n>(a.get(id)??0))return false;
  return !after.coverage.checkedConflicts.length;
}
export function requestSuggestions(context,menu,shopping,{session=createAdviceSession('advice'),limit=3,maxEvaluations=60,
  maxExtraCostCents=0,minSavingCents=1,minIngredientGain={},kinds=['portions','replacement']}={}) {
  validateSession(session);integer(limit,'suggestion limit');integer(maxEvaluations,'advice evaluation budget');
  integer(maxExtraCostCents,'max extra cost',true);integer(minSavingCents,'minimum saving');
  requireThat(Array.isArray(kinds)&&kinds.every(k=>['portions','replacement'].includes(k)),'INVALID_ADVICE_KIND','kinds');
  for(const [id,value]of Object.entries(minIngredientGain))requireThat(context.ingredients.some(i=>i.id===id)&&Q.of(value).cmp(0)>=0,
    'INVALID_SUGGESTION_THRESHOLD',id);
  const before=evaluateMixedMenu(context,menu,shopping),rows=[],failures=[],seen=new Set();let evaluated=0,limited=false;
  function consider(meals,kind,reason) {
    if(evaluated>=maxEvaluations){limited=true;return;}evaluated++;
    try {
      const proposal=proposeMixedMenu(context,menu,shopping,meals,{purpose:'suggestion',reason}),after=proposal.evaluation,d=proposal.comparison;
      const signature=stableJSON(proposal.changes);if(seen.has(signature)||session.rejectedSignatures.includes(signature)||session.acceptedSignatures.includes(signature))return;
      seen.add(signature);if(!noNewUncertainty(context,before,after))return;
      if(context.budget?.strict) {
        requireThat(after.basket.amount.totalCents!==null&&after.basket.amount.certainty==='observed_session','BUDGET_UNVERIFIABLE','automatic advice budget');
        requireThat(after.basket.amount.totalCents<=context.budget.cents,'BUDGET_EXCEEDED','automatic advice budget');
      }
      const gain=(id,q,field,sign)=>q.perishable&&q[field]!==null&&Q.of(q[field]).mul(sign).cmp(0)>0&&Q.of(q[field]).mul(sign).cmp(minIngredientGain[id]??0)>=0;
      const lessSurplus=Object.entries(d.quantities).some(([id,q])=>gain(id,q,'purchaseSurplusDelta',-1));
      const moreStock=Object.entries(d.quantities).some(([id,q])=>gain(id,q,'fromStockDelta',1));
      const saving=d.priceScope==='listed_cart'&&d.costDeltaCents!==null&&d.costDeltaCents<=-minSavingCents;
      const knownSaving=d.knownSubtotalDeltaCents<=-minSavingCents;
      if(!(saving||knownSaving||lessSurplus||moreStock||d.packageCountDelta<0)||d.knownSubtotalDeltaCents>maxExtraCostCents)return;
      if(Q.of(d.scoreDelta).cmp(0)>=0)return;
      rows.push({...proposal,signature,adviceKind:kind,id:`${session.id}:${session.revision}:${menu.revision}:${rows.length+1}`,benefits:{saving,knownSaving,lessSurplus,moreStock,
        label:saving?'lower_estimated_cart':knownSaving?'lower_known_subtotal':d.knownSubtotalDeltaCents>0?'measured_gain_with_extra_cost':'better_use_without_price_saving'},
        limits:{partialCalculation:!after.coverage.complete,priceScope:d.priceScope,preservedRisks:after.risks,
          optimal:false,unknownNeeds:after.coverage.unknownNeeds},requiresAcceptance:true});
    }catch(e){if(!(e instanceof EngineError))throw e;failures.push({kind,code:e.code,detail:e.message});}
  }
  const eligible=menu.meals.filter(m=>before.meals.find(a=>a.mealId===m.id)?.optimizable&&m.status!=='cooked');
  if(kinds.includes('portions'))for(const m of eligible) {
    if(m.locks?.production||m.leftovers!=='keep')continue;
    try {const r=context.recipes.find(r=>r.id===m.recipeId),next=stepProduction(r,m,1);
      consider(menu.meals.map(old=>old.id===m.id?next:structuredClone(old)),'portions','use_existing_purchases_or_perishable_stock');
    }catch(e){if(!(e instanceof EngineError))throw e;failures.push({kind:'portions',code:e.code});}
    if(limited)break;
  }
  if(kinds.includes('replacement')&&!limited)for(const m of eligible) {
    if(m.locks?.recipe)continue;
    for(const r of [...context.recipes].sort((a,b)=>a.id<b.id?-1:1)) {
      if(r.id===m.recipeId)continue;
      try {
        checkRecipeConstraints(context,r);const replacement=mealForReplacement(context,m,r);
        if(!analyzeMixedMeal(context,replacement).optimizable)continue;
        const count=menu.meals.filter(old=>old.id!==m.id&&old.recipeId===r.id).length+1;
        if(count>(context.constraints?.maxRepeats??1))continue;
        const meals=menu.meals.map(old=>old.id===m.id?replacement:structuredClone(old));
        if(context.constraints?.maxPerFamily) {
          const familyCount=meals.filter(old=>context.recipes.find(x=>x.id===old.recipeId)?.family===r.family).length;
          if(familyCount>context.constraints.maxPerFamily)continue;
        }
        consider(meals,'replacement','lower_full_context_cost_or_surplus');
      }catch(e){if(!(e instanceof EngineError))throw e;failures.push({kind:'replacement',recipeId:r.id,code:e.code});}
      if(limited)break;
    }if(limited)break;
  }
  rows.sort((a,b)=>Q.of(a.evaluation.score).cmp(b.evaluation.score));
  const selected=[],usedKinds=new Set();
  while(rows.length&&selected.length<limit) {
    const index=selected.length===0?0:rows.findIndex(p=>!usedKinds.has(p.adviceKind));const row=rows.splice(index<0?0:index,1)[0];selected.push(row);usedKinds.add(row.adviceKind);
  }
  return {status:'suggestions',requested:true,applied:false,session:structuredClone(session),suggestions:selected,
    search:{evaluated,maxEvaluations,limited,optimal:false,scope:'one explicit change at a time; full known menu context'},failures};
}
export function acceptSuggestion(context,menu,shopping,session,proposal,{eventId}={}) {
  validateSession(session);requireThat(proposal?.purpose==='suggestion'&&typeof proposal.signature==='string','INVALID_SUGGESTION','proposal');
  requireThat(proposal.signature===stableJSON(proposal.changes),'INVALID_SUGGESTION','signature changed');
  requireThat(!session.rejectedSignatures.includes(proposal.signature),'SUGGESTION_REJECTED','request another proposal or explicitly start a new advice session');
  const accepted=acceptMixedProposal(context,menu,shopping,proposal,{eventId}),next=structuredClone(session);
  if(!next.acceptedSignatures.includes(proposal.signature)){next.acceptedSignatures.push(proposal.signature);next.revision++;}
  return {...accepted,adviceSession:next};
}
export function requestMixedReoptimization(context,menu,shopping,options={}) {
  const advice=requestSuggestions(context,menu,shopping,{...options,limit:1});
  return {...advice,proposal:advice.suggestions[0]??null,quality:advice.suggestions.length?'best_found':'no_improvement',
    scope:'partial local reoptimization; opaque and manual meals remain fixed; no global optimum claimed'};
}
