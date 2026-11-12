import {readFile} from 'node:fs/promises';
import {Q,EngineError,initialMenu,optimizeMenuJoint,proposeMenu,acceptMenuProposal,recalculateMenu,suggestPortions,
  replacementAlternatives,evaluateMenu,stockAvailable} from '../src/index.mjs';

try {
  const context=JSON.parse(await readFile(new URL('../fixtures/lot2.json',import.meta.url),'utf8'));
  let menu=initialMenu('lot2-family-menu');const steps=[];
  const snapshot=(step,extra={})=>{
    const evaluation=evaluateMenu(context,menu);
    steps.push({step,menu:structuredClone(menu),preparations:evaluation.requirements.preparations,needs:evaluation.requirements.needs,
      quantities:evaluation.basket.quantities,totalCents:evaluation.basket.cart.totalCents,certainty:evaluation.basket.cart.certainty,
      stock:structuredClone({revision:context.state.revision,physical:context.state.physical,reservations:context.state.reservations,
        prepared:context.state.prepared??{}}),...extra});
  };
  const adopt=(proposal,eventId)=>{const result=acceptMenuProposal(context,menu,proposal,{eventId});menu=result.menu;context.state=result.stock;};
  const slots=Array.from({length:5},(_,k)=>({id:`meal-${k+1}`,diners:2,leftovers:'keep'}));
  const generated=optimizeMenuJoint({...context,recipes:context.recipes.slice(0,5)},{slots,strategy:'diverse',maxEvaluations:100});
  adopt(proposeMenu(context,menu,generated.solution.menu.meals),'lot2-initial');snapshot('created_five_meals',{search:generated.search});
  const changes=[{mealId:'meal-2',diners:3},{mealId:'meal-4',diners:4},{mealId:'meal-5',diners:3}];
  const modification=recalculateMenu(context,menu,changes);adopt(modification,'lot2-edit');snapshot('three_diner_counts_changed',{changes,comparison:modification.comparison});
  const previous=JSON.stringify({menu,state:context.state}),suggestion=suggestPortions(context,menu,{mealId:'meal-2',maxSteps:1}).suggestions[0];
  if(!suggestion)throw new Error('fixture must demonstrate a justified portion suggestion');
  snapshot('portion_proposed_not_applied',{comparison:suggestion.comparison,benefits:suggestion.benefits,
    unchanged:previous===JSON.stringify({menu,state:context.state})});
  snapshot('portion_declined',{unchanged:previous===JSON.stringify({menu,state:context.state})});
  adopt(suggestion,'lot2-extra-accepted');snapshot('portion_explicitly_accepted');
  const alternatives=replacementAlternatives(context,menu,{mealId:'meal-3',limit:3});
  const rejected=alternatives.alternatives[0].recipeId;
  const retried=replacementAlternatives(context,menu,{mealId:'meal-3',rejectedRecipeIds:[rejected],limit:3});
  snapshot('replacement_requested_and_first_choice_rejected',{temporarilyRejected:rejected,
    alternatives:retried.alternatives.map(p=>({recipeId:p.recipeId,objectiveRank:p.objectiveRank,comparison:p.comparison}))});
  const chosen=retried.alternatives[0],before=structuredClone(menu);adopt(chosen,'lot2-replacement');snapshot('replacement_explicitly_accepted');
  const free=stockAvailable(context.state,context.ingredients),checks={
    fiveMeals:menu.meals.length===5,dinersPreserved:menu.meals.map(m=>String(m.diners)).join(',')==='2,3,2,4,3',
    onlyRequestedRecipeReplaced:menu.meals.every((m,k)=>k===2||JSON.stringify(m)===JSON.stringify(before.meals[k])),
    rejectedNotReoffered:retried.alternatives.every(p=>p.recipeId!==rejected),
    planningNeverConsumesIngredients:context.state.physical.tomato==='200',
    outsideReservationPreserved:context.state.reservations['outside-menu'].tomato==='50',
    noDoubleReservation:Object.values(free).every(q=>Q.of(q).cmp(0)>=0),
    noCookedPortionsBeforeCooking:Object.keys(context.state.prepared??{}).length===0};
  console.log(JSON.stringify({notice:context.notice,fixture:'fixtures/lot2.json',steps,checks},null,2));
  if(!Object.values(checks).every(Boolean))process.exitCode=1;
}catch(e){console.log(JSON.stringify({status:'error',code:e instanceof EngineError?e.code:'INVALID_SCENARIO',detail:e.message},null,2));process.exitCode=1;}
