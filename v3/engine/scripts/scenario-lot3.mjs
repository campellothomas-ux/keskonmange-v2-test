import {readFile} from 'node:fs/promises';
import {Q,EngineError,initialMenu,createShopping,addShoppingItem,checkShoppingItem,evaluateMixedMenu,proposeMixedMenu,
  changeMixedMenu,acceptMixedProposal,requestSuggestions,createAdviceSession,declineSuggestion,acceptSuggestion,
  prepareShoppingConfirmation,confirmShopping,stockAvailable} from '../src/index.mjs';
try {
  const context=JSON.parse(await readFile(new URL('../fixtures/lot3.json',import.meta.url),'utf8'));
  let menu=initialMenu('lot3-family'),shopping=createShopping('lot3-shopping'),advice=createAdviceSession('lot3-advice');const steps=[];
  const adopt=(p,id)=>{const a=acceptMixedProposal(context,menu,shopping,p,{eventId:id});menu=a.menu;shopping=a.shopping;context.state=a.stock;};
  const snapshot=(step,extra={})=>{
    const e=evaluateMixedMenu(context,menu,shopping);
    steps.push({step,menu:structuredClone(menu),meals:e.meals,knownNeeds:e.requirements.needs,amount:e.basket.amount,budget:e.budget,
      unknownNeeds:e.coverage.unknownNeeds,shopping:{manual:structuredClone(shopping.manual),calculated:structuredClone(shopping.calculated),
        displayLines:e.basket.shopping.lines},stock:{revision:context.state.revision,physical:structuredClone(context.state.physical),reservations:structuredClone(context.state.reservations)},...extra});
  };
  const meals=['r0','r1','r2','partial','manual'].map((recipeId,k)=>({id:`meal-${k+1}`,recipeId,diners:2,leftovers:'keep',...(recipeId==='manual'?{selection:'manual'}:{})}));
  adopt(proposeMixedMenu(context,menu,shopping,meals),'lot3-create');snapshot('five_mixed_meals_created');
  const edit=changeMixedMenu(context,menu,shopping,[{type:'updateMeal',mealId:'meal-2',patch:{diners:3}},
    {type:'updateMeal',mealId:'meal-3',patch:{diners:4}},{type:'updateMeal',mealId:'meal-4',patch:{diners:3}}]);
  adopt(edit,'lot3-portions');snapshot('three_diner_counts_changed_without_advice');
  adopt(changeMixedMenu(context,menu,shopping,[{type:'addMeal',meal:{id:'free-choice',recipeId:'premium-choice',diners:2,leftovers:'keep',selection:'user',locks:{recipe:true}}}]),'lot3-free-choice');
  snapshot('freely_chosen_expensive_meal_retained');
  for(const item of [{id:'biscuits',label:'Biscuits',presentation:'one free packet',checked:true,estimate:{kind:'estimated',currency:'EUR',totalCents:150}},
    {id:'soda',label:'Soda',quantity:{amount:'2',unit:'bottles'}},
    {id:'household',label:'Household product',presentation:'free item',checked:true,estimate:{kind:'estimated',currency:'EUR',totalCents:250}}])shopping=addShoppingItem(shopping,item);
  const recalculated=evaluateMixedMenu(context,menu,shopping);shopping=recalculated.shopping;
  snapshot('three_manual_products_added_and_cart_recalculated');
  const frozen=JSON.stringify({menu,shopping,state:context.state}),result=requestSuggestions(context,menu,shopping,{session:advice,limit:3,maxEvaluations:60});
  if(result.suggestions.length<2)throw new Error('scenario must demonstrate decline and acceptance of different useful proposals');
  snapshot('suggestions_explicitly_requested',{proposals:result.suggestions.map(p=>({id:p.id,signature:p.signature,adviceKind:p.adviceKind,reason:p.reason,
    changes:p.changes,comparison:p.comparison,benefits:p.benefits,limits:p.limits})),unchanged:frozen===JSON.stringify({menu,shopping,state:context.state})});
  advice=declineSuggestion(advice,result.suggestions[0]);
  snapshot('first_suggestion_declined',{unchanged:frozen===JSON.stringify({menu,shopping,state:context.state})});
  const next=requestSuggestions(context,menu,shopping,{session:advice,limit:3,maxEvaluations:60});
  const proposal=next.suggestions[0],beforeAccepted=structuredClone(menu),accepted=acceptSuggestion(context,menu,shopping,advice,proposal,{eventId:'lot3-accept-advice'});
  menu=accepted.menu;shopping=accepted.shopping;context.state=accepted.stock;advice=accepted.adviceSession;
  snapshot('different_suggestion_explicitly_accepted',{changes:proposal.changes,comparison:proposal.comparison});
  const tomato=shopping.calculated.find(l=>l.productId==='tomato-pack'&&!l.confirmed);
  if(tomato)shopping=checkShoppingItem(shopping,tomato.id,true);
  const purchase=prepareShoppingConfirmation(context,shopping,{eventId:'lot3-partial-checkout'}),confirmed=confirmShopping(context,shopping,purchase);
  shopping=confirmed.shopping;context.state=confirmed.stock;
  const replay=confirmShopping(context,shopping,purchase);
  snapshot('selected_purchases_confirmed_and_replayed',{untrackedPurchases:confirmed.untracked,idempotent:JSON.stringify(replay.stock)===JSON.stringify(context.state)});
  const final=evaluateMixedMenu(context,menu,shopping),checks={
    allSixChoicesRetained:menu.meals.length===6,partialMealRetained:menu.meals.some(m=>m.recipeId==='partial'),manualMealRetained:menu.meals.some(m=>m.recipeId==='manual'),
    expensiveMealRetained:menu.meals.some(m=>m.recipeId==='premium-choice'),budgetExcessSignaled:final.budget.knownExcessCents>0,
    unknownChickenNeverInvented:final.requirements.needs['chicken-unknown']===undefined,
    partialAmountNotAdvertisedAsTotal:final.basket.amount.totalCents===null,
    threeManualProductsRetained:shopping.manual.length===3,checkedManualPreserved:shopping.manual.find(r=>r.id==='biscuits').checked&&shopping.manual.find(r=>r.id==='household').checked,
    declinedNotReoffered:next.suggestions.every(p=>p.signature!==result.suggestions[0].signature),
    onlyAcceptedChangesApplied:beforeAccepted.meals.every(old=>proposal.changes.some(ch=>ch.mealId===old.id)||JSON.stringify(old)===JSON.stringify(menu.meals.find(m=>m.id===old.id))),
    checkoutIdempotent:JSON.stringify(replay.stock)===JSON.stringify(context.state),
    outsideReservationPreserved:context.state.reservations['outside-menu'].tomato==='50',noDoubleReservation:Object.values(stockAvailable(context.state,context.ingredients)).every(q=>Q.of(q).cmp(0)>=0)};
  console.log(JSON.stringify({notice:context.notice,fixture:'fixtures/lot3.json',fieldValidated:false,steps,checks},null,2));
  if(!Object.values(checks).every(Boolean))process.exitCode=1;
}catch(e){console.log(JSON.stringify({status:'error',code:e instanceof EngineError?e.code:'INVALID_SCENARIO',detail:e.message},null,2));process.exitCode=1;}
