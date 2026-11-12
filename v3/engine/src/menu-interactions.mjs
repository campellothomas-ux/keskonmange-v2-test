import {Q,integer,requireThat,EngineError} from './exact.mjs';
import {stepProduction} from './production.mjs';
import {evaluateMenu,validateContext,validateMenu} from './menu-evaluation.mjs';
import {proposeMenu,recalculateMenu,mealForReplacement} from './menu-proposals.mjs';
import {optimizeMenuJoint} from './joint-optimizer.mjs';

export function suggestPortions(context,menu,{mealId,maxSteps=3,limit=3,maxExtraCostCents=0,minSavingCents=1,minIngredientGain={}}={}) {
  integer(maxSteps,'maxSteps');integer(limit,'limit');integer(maxExtraCostCents,'maxExtraCostCents',true);integer(minSavingCents,'minSavingCents');
  requireThat(maxSteps<=20,'RESOURCE_LIMIT','portion suggestions');
  for(const [id,value]of Object.entries(minIngredientGain))requireThat(context.ingredients.some(i=>i.id===id)&&Q.of(value).cmp(0)>=0,
    'INVALID_SUGGESTION_THRESHOLD',id);
  const original=menu.meals.find(m=>m.id===mealId);requireThat(original,'UNKNOWN_MEAL',mealId);
  requireThat(!original.locks?.production,'LOCKED_PRODUCTION',mealId);
  requireThat(original.status!=='cooked','MEAL_ALREADY_COOKED',mealId);
  evaluateMenu(context,menu);
  if(original.leftovers!=='keep')return {status:'proposals',suggestions:[],rejected:[{code:'LEFTOVER_KEEP_REQUIRED'}],applied:false};
  const recipe=context.recipes.find(r=>r.id===original.recipeId);requireThat(recipe,'UNKNOWN_RECIPE',original.recipeId);
  const suggestions=[],rejected=[];let next=original;
  for(let k=0;k<maxSteps;k++) {
    try {
      next=stepProduction(recipe,next,1);
      const proposal=recalculateMenu(context,menu,[{mealId,productionUnits:next.productionUnits}]),d=proposal.comparison;
      const gain=(id,q,field,sign)=>q.perishable&&Q.of(q[field]).mul(sign).cmp(0)>0&&Q.of(q[field]).mul(sign).cmp(minIngredientGain[id]??0)>=0;
      const reducedPerishable=Object.entries(d.quantities).some(([id,q])=>gain(id,q,'purchaseSurplusDelta',-1));
      const morePerishableStockUsed=Object.entries(d.quantities).some(([id,q])=>gain(id,q,'fromStockDelta',1));
      const unchangedPurchases=Object.values(d.purchasedCountsDelta).every(n=>n===0);
      const saving=d.costDeltaCents!==null&&d.costDeltaCents<=-minSavingCents;
      if((saving||reducedPerishable||morePerishableStockUsed||d.packageCountDelta<0)&&
        (d.costDeltaCents!==null?d.costDeltaCents<=maxExtraCostCents:unchangedPurchases))
        suggestions.push({...proposal,benefits:{saving,unchangedPurchases,reducedPerishable,morePerishableStockUsed,
          label:saving?'lower_estimated_cost':d.costDeltaCents!==null&&d.costDeltaCents>0?'surplus_reduction_with_extra_cost':'better_use_of_purchases'}});
    }catch(e){if(!(e instanceof EngineError))throw e;rejected.push({code:e.code,detail:e.message});break;}
  }
  suggestions.sort((a,b)=>Q.of(a.evaluation.score).cmp(b.evaluation.score)||Q.of(a.comparison.extraPreparedPortions).cmp(b.comparison.extraPreparedPortions));
  return {status:'proposals',suggestions:suggestions.slice(0,limit),rejected,applied:false};
}
export function replacementAlternatives(context,menu,{mealId,rejectedRecipeIds=[],limit=3,maxEvaluations=100}={}) {
  integer(limit,'limit');integer(maxEvaluations,'maxEvaluations');
  requireThat(Array.isArray(rejectedRecipeIds),'INVALID_REPLACEMENT_REQUEST','rejectedRecipeIds');
  const target=menu.meals.find(m=>m.id===mealId);requireThat(target,'UNKNOWN_MEAL',mealId);
  requireThat(!target.locks?.recipe,'LOCKED_RECIPE',mealId);requireThat(target.status!=='cooked','MEAL_ALREADY_COOKED',mealId);
  validateContext(context);validateMenu(menu);
  const rows=[],failures=[];let evaluated=0,limited=false;
  for(const recipe of [...context.recipes].sort((a,b)=>a.id<b.id?-1:1)) {
    if(recipe.id===target.recipeId||rejectedRecipeIds.includes(recipe.id))continue;
    if(evaluated>=maxEvaluations){limited=true;break;}evaluated++;
    try {
      const meal=mealForReplacement(context,target,recipe),meals=menu.meals.map(m=>m.id===mealId?meal:structuredClone(m));
      const proposal=proposeMenu(context,menu,meals,{reason:'single_meal_replacement'});
      rows.push({...proposal,family:recipe.family??null,recipeId:recipe.id});
    }catch(e){if(!(e instanceof EngineError))throw e;failures.push({recipeId:recipe.id,code:e.code});}
  }
  rows.sort((a,b)=>Number(a.evaluation.basket.cart.totalCents===null)-Number(b.evaluation.basket.cart.totalCents===null)||
    Q.of(a.evaluation.score).cmp(b.evaluation.score));
  rows.forEach((r,k)=>r.objectiveRank=k+1);
  const selected=[],usedFamilies=new Set();
  while(rows.length&&selected.length<limit) {
    const index=selected.length===0?0:rows.findIndex(r=>r.family!==null&&!usedFamilies.has(r.family));
    const row=rows.splice(index<0?0:index,1)[0];usedFamilies.add(row.family);selected.push(row);
  }
  return {status:'proposals',alternatives:selected,evaluated,limited,failures,applied:false,
    presentation:'best objective first, then distinct available families before repeats; objectiveRank retained'};
}
export function proposeReoptimization(context,menu,options={}) {
  const result=optimizeMenuJoint(context,{...options,slots:menu.meals,baseMenu:menu});
  return {...result,proposal:result.solution?proposeMenu(context,menu,result.solution.menu.meals,{reason:'voluntary_global_reoptimization'}):null,applied:false};
}
