import {Q,EngineError,minQ,requireThat} from './exact.mjs';
import {stockAvailable} from './basket.mjs';
import {projectedStock,validateMenu} from './menu-evaluation.mjs';
import {jointBasket} from './joint-packages.mjs';
import {ingredientMap,validateCatalog} from './model.mjs';
import {priceLines} from './packages.mjs';
import {safeMixedContext,analyzeMixedMeal} from './mixed-core.mjs';
import {createShopping,reconcileShopping,estimateShopping} from './shopping.mjs';

export function evaluateMixedMenu(context,menu,shopping=createShopping(`${menu.id}-shopping`),{stockMenu=menu,acknowledgeChecked=false}={}) {
  validateMenu(menu);const {context:c,catalogIssues}=safeMixedContext(context);
  const state=projectedStock(c,stockMenu),available=stockAvailable(state,c.ingredients);
  const meals=menu.meals.map(m=>analyzeMixedMeal(c,m)),needs={},preparations=[],individual=[],unknownNeeds=[];
  for(const m of meals) {
    individual.push({mealId:m.mealId,needs:m.knownNeeds});if(m.preparation)preparations.push(m.preparation);
    for(const [id,q]of Object.entries(m.knownNeeds))needs[id]=Q.of(needs[id]??0).add(q).toString();
    for(const issue of m.issues)unknownNeeds.push({mealId:m.mealId,...issue,amount:null});
  }
  // Manual choices never inherit a hard search constraint. The real target remains in the diagnostic below.
  const calculation={...c,state,manual:[],budget:c.budget?{...c.budget,strict:false}:undefined};
  const supported={},purchaseIssues=[],isolated=[];
  for(const [id,q]of Object.entries(needs)) {
    try {isolated.push(jointBasket(calculation,{needs:{[id]:q}},state));supported[id]=q;}
    catch(e){if(!(e instanceof EngineError))throw e;purchaseIssues.push({ingredientId:id,code:e.code,detail:e.message,status:'needs_review'});}
  }
  let basket;
  try {basket=jointBasket(calculation,{needs:supported},state);}
  catch(e) {
    if(!(e instanceof EngineError)||e.code!=='RESOURCE_LIMIT')throw e;
    // Retain the independent exact covers, explicitly without claiming a joint optimum.
    const quantities=Object.assign({},...isolated.map(b=>b.quantities)),lines=isolated.flatMap(b=>b.menu.lines.map(l=>({productId:l.productId,count:l.count})));
    const priced=priceLines(lines,validateCatalog(c.products,c.ingredients,c.session),ingredientMap(c.ingredients),c.session);
    basket={quantities,menu:priced,cart:priced,packageOptimal:false,weightedSurplus:isolated.reduce((s,b)=>s.add(b.weightedSurplus),Q.of(0)).toString()};
    purchaseIssues.push({code:e.code,detail:e.message,status:'needs_review'});
  }
  for(const [id,q]of Object.entries(needs))if(!basket.quantities[id]) {
    const used=minQ(available[id]??0,q),i=c.ingredients.find(i=>i.id===id);
    basket.quantities[id]={unit:i.unit,basis:i.basis,required:q,available:available[id]??'0',physical:state.physical?.[id]??'0',fromStock:used.toString(),
      toBuy:Q.of(q).sub(used).toString(),bought:null,purchaseSurplus:null,remainingFree:null};
  }
  const free={...available},allocation={};
  for(const m of meals) {
    allocation[m.mealId]={};
    for(const [id,q]of Object.entries(m.knownNeeds)) {
      const used=minQ(free[id]??0,q);if(used.cmp(0)>0)allocation[m.mealId][id]=used.toString();free[id]=Q.of(free[id]??0).sub(used).toString();
    }
  }
  const reconciled=reconcileShopping(shopping,basket.menu.lines,{acknowledgeChecked}),cart=estimateShopping(c,reconciled.shopping);
  const quantitiesComplete=!unknownNeeds.length&&!purchaseIssues.length&&!catalogIssues.length;
  const coverageComplete=quantitiesComplete&&!reconciled.conflicts.length;
  const amount={...cart.total,listedItemsTotalCents:cart.total.totalCents,totalCents:coverageComplete?cart.total.totalCents:null,
    certainty:coverageComplete?cart.total.certainty:'partial',scope:coverageComplete?'listed_cart':'known_items_only'};
  const invalid=meals.some(m=>m.calculationStatus==='invalid')||catalogIssues.length>0;
  const risks=meals.flatMap(m=>m.risks.map(r=>({mealId:m.mealId,...r})));
  const counts=new Map(),families=new Map();
  for(const m of menu.meals){counts.set(m.recipeId,(counts.get(m.recipeId)??0)+1);const family=c.recipes.find(r=>r.id===m.recipeId)?.family;if(family)families.set(family,(families.get(family)??0)+1);}
  const warnings=[];
  if([...counts.values()].some(n=>n>(c.constraints?.maxRepeats??1)))warnings.push({code:'REPEAT_CONSTRAINT',blocking:false});
  if(c.constraints?.minDistinct&&counts.size<c.constraints.minDistinct)warnings.push({code:'VARIETY_CONSTRAINT',blocking:false});
  if(c.constraints?.maxPerFamily&&[...families.values()].some(n=>n>c.constraints.maxPerFamily))warnings.push({code:'FAMILY_CONSTRAINT',blocking:false});
  const policy=c.policy??{};let score=Q.of(amount.knownSubtotalCents).add(basket.weightedSurplus??0);
  score=score.add(Q.of(policy.repeatPenaltyCents??0).mul(menu.meals.length-counts.size));
  score=score.add(Q.of(policy.familyRepeatPenaltyCents??0).mul(menu.meals.length-families.size));
  for(const [id,q]of Object.entries(basket.quantities))score=score.sub(Q.of(policy.perishableStockRateCents?.[id]??0).mul(q.fromStock));
  if(policy.preferredRecipeIds?.length)score=score.add(Q.of(policy.preferencePenaltyCents??0).mul(menu.meals.filter(m=>!policy.preferredRecipeIds.includes(m.recipeId)).length));
  if(policy.historyRecipeIds?.length)score=score.add(Q.of(policy.historyPenaltyCents??0).mul(menu.meals.filter(m=>policy.historyRecipeIds.includes(m.recipeId)).length));
  if(c.budget&&amount.knownSubtotalCents>c.budget.cents)score=score.add(Q.of(policy.budgetOverPenaltyPerCent??0).mul(amount.knownSubtotalCents-c.budget.cents));
  const budget=c.budget?{targetCents:c.budget.cents,mode:c.budget.strict?'strict_for_automatic_search':'indicative',blocking:false,
    status:amount.totalCents===null?amount.knownSubtotalCents>c.budget.cents?'partial_over_target':'unverifiable':amount.totalCents>c.budget.cents?'over_target':'within_estimate',
    knownExcessCents:Math.max(0,amount.knownSubtotalCents-c.budget.cents),verified:amount.totalCents!==null&&amount.certainty==='observed_session'&&amount.totalCents<=c.budget.cents}:null;
  return {version:1,status:invalid?'invalid':coverageComplete&&amount.totalCents!==null?'complete':Object.keys(needs).length?'partial':'needs_review',
    meals,requirements:{needs,preparations,individual},basket:{...basket,amount,shopping:cart},shopping:reconciled.shopping,
    allocation,coverage:{quantitiesComplete,complete:coverageComplete,unknownNeeds,purchaseIssues,catalogIssues,checkedConflicts:reconciled.conflicts},
    budget,risks,warnings,score:score.toString(),scoreScope:coverageComplete&&amount.totalCents!==null?'provided_prices':'known_components_only',
    advice:{requested:false,applied:false},metrics:{distinctRecipes:counts.size,distinctKnownFamilies:families.size}};
}
