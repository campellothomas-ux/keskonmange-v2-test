import {Q,EngineError,requireThat,text} from './exact.mjs';
import {resolveProduction} from './production.mjs';
import {validateMenu,checkRecipeConstraints} from './menu-evaluation.mjs';
import {cancelMenuChange} from './menu-proposals.mjs';
import {stableJSON,applyEvent,emptyStock} from './ledger.mjs';
import {safeMixedContext,jsonCopy,analyzeMixedMeal} from './mixed-core.mjs';
import {evaluateMixedMenu} from './mixed-menu.mjs';

export function mixedBasis(context,menu,shopping) {
  const state=context.state??emptyStock();
  return {menu:stableJSON(jsonCopy(menu)),shopping:stableJSON(jsonCopy(shopping)),
    stock:stableJSON(jsonCopy({revision:state.revision,physical:state.physical,reservations:state.reservations,prepared:state.prepared??{}})),
    context:stableJSON(jsonCopy({recipes:context.recipes,ingredients:context.ingredients,products:context.products,session:context.session,
      policy:context.policy??{},constraints:context.constraints??{},budget:context.budget??null,maxStates:context.maxStates??100_000,maxPortfolioStates:context.maxPortfolioStates??10_000}))};
}
function assertMixedLocks(context,before,after) {
  for(const m of after.meals)if(m.status==='cooked')requireThat(before.meals.some(old=>stableJSON(old)===stableJSON(m)),
    'COOKING_CONFIRMATION_REQUIRED',m.id);
  for(const old of before.meals) {
    const next=after.meals.find(m=>m.id===old.id);if(next&&stableJSON(next)===stableJSON(old))continue;
    requireThat(old.status!=='cooked','MEAL_ALREADY_COOKED',old.id);
    if(!next){requireThat(!Object.values(old.locks??{}).some(Boolean),'LOCKED_MEAL',old.id);continue;}
    if(old.locks?.recipe)requireThat(old.recipeId===next.recipeId,'LOCKED_RECIPE',old.id);
    if(old.locks?.diners)requireThat(Q.of(old.diners).cmp(next.diners)===0,'LOCKED_DINERS',old.id);
    if(old.locks?.leftovers)requireThat(old.leftovers===next.leftovers,'LOCKED_LEFTOVERS',old.id);
    requireThat(stableJSON(old.locks??{})===stableJSON(next.locks??{}),'LOCK_CHANGE_UNSUPPORTED',old.id);
    if(old.locks?.production) {
      try {
        const a=resolveProduction(context.recipes.find(r=>r.id===old.recipeId),old),b=resolveProduction(context.recipes.find(r=>r.id===next.recipeId),next);
        requireThat(a.producedPortions===b.producedPortions,'LOCKED_PRODUCTION',old.id);
      }catch(e){if(!(e instanceof EngineError))throw e;
        if(e.code==='LOCKED_PRODUCTION')throw e;
        requireThat(old.recipeId===next.recipeId&&stableJSON(old.productionUnits??null)===stableJSON(next.productionUnits??null),
          'LOCKED_PRODUCTION_DATA_REQUIRED',old.id);
      }
    }
  }
}
export function compareMixedEvaluations(context,before,after) {
  const a=before.basket.amount,b=after.basket.amount,quantities={};
  for(const id of new Set([...Object.keys(before.basket.quantities),...Object.keys(after.basket.quantities)])) {
    const old=before.basket.quantities[id]??{},next=after.basket.quantities[id]??{},i=context.ingredients.find(i=>i.id===id);
    const row={unit:i.unit,basis:i.basis,perishable:i.perishable===true};
    for(const field of ['required','bought','purchaseSurplus','fromStock'])row[field+'Delta']=old[field]===null||next[field]===null?null:Q.of(next[field]??0).sub(old[field]??0).toString();
    quantities[id]=row;
  }
  const portions=e=>e.requirements.preparations.reduce((q,p)=>q.add(p.producedPortions),Q.of(0));
  return {costDeltaCents:a.totalCents===null||b.totalCents===null?null:b.totalCents-a.totalCents,
    knownSubtotalDeltaCents:b.knownSubtotalCents-a.knownSubtotalCents,priceScope:a.totalCents===null||b.totalCents===null?'known_items_only':'listed_cart',
    scoreDelta:Q.of(after.score).sub(before.score).toString(),extraPreparedPortions:portions(after).sub(portions(before)).toString(),quantities,
    packageCountDelta:after.basket.menu.lines.filter(l=>context.products.find(p=>p.id===l.productId)?.mode==='fixed').reduce((n,l)=>n+l.count,0)-
      before.basket.menu.lines.filter(l=>context.products.find(p=>p.id===l.productId)?.mode==='fixed').reduce((n,l)=>n+l.count,0)};
}
function menuChanges(before,after) {
  const changes=after.meals.filter(m=>{const old=before.meals.find(x=>x.id===m.id);return !old||stableJSON(old)!==stableJSON(m);})
    .map(m=>({mealId:m.id,before:before.meals.find(x=>x.id===m.id)??null,after:m}));
  for(const old of before.meals)if(!after.meals.some(m=>m.id===old.id))changes.push({mealId:old.id,before:old,after:null});return changes;
}
function assertAdviceChoices(context,changes,evaluation) {
  for(const change of changes) {
    requireThat(change.after,'INVALID_SUGGESTION','automatic meal removal unsupported');
    if(change.before)requireThat(analyzeMixedMeal(context,change.before).optimizable,'MANUAL_MEAL_FIXED',change.mealId);
    const recipe=context.recipes.find(r=>r.id===change.after.recipeId);requireThat(recipe,'RECIPE_DATA_REQUIRED',change.mealId);
    checkRecipeConstraints(context,recipe);requireThat(analyzeMixedMeal(context,change.after).optimizable,'INCOMPLETE_AUTOMATIC_CHOICE',change.mealId);
  }
  if(context.budget?.strict) {
    requireThat(evaluation.basket.amount.totalCents!==null&&evaluation.basket.amount.certainty==='observed_session','BUDGET_UNVERIFIABLE','automatic proposal');
    requireThat(evaluation.basket.amount.totalCents<=context.budget.cents,'BUDGET_EXCEEDED','automatic proposal');
  }
}
export function proposeMixedMenu(context,menu,shopping,meals,{purpose='manual',reason='explicit_manual_choice',acknowledgeChecked=false}={}) {
  requireThat(['manual','suggestion'].includes(purpose),'INVALID_PROPOSAL_PURPOSE',purpose);validateMenu(menu);
  const candidate={...structuredClone(menu),revision:menu.revision+1,meals:structuredClone(meals),
    reservationIds:Object.fromEntries(Object.entries(menu.reservationIds).filter(([id])=>meals.some(m=>m.id===id&&m.status!=='cooked')))};
  assertMixedLocks(context,menu,candidate);
  const evaluation=evaluateMixedMenu(context,candidate,shopping,{stockMenu:menu,acknowledgeChecked});
  const before=evaluateMixedMenu(context,menu,shopping);
  const changes=menuChanges(menu,candidate);if(purpose==='suggestion')assertAdviceChoices(context,changes,evaluation);
  return {version:1,kind:'mixed-menu-proposal',status:'awaiting_acceptance',purpose,reason,basis:mixedBasis(context,menu,shopping),
    stockRevision:(context.state??emptyStock()).revision,menu:candidate,shopping:evaluation.shopping,evaluation,
    comparison:compareMixedEvaluations(context,before,evaluation),changes,acknowledgeChecked};
}
export function changeMixedMenu(context,menu,shopping,commands) {
  requireThat(Array.isArray(commands),'INVALID_CHANGES','commands');const meals=structuredClone(menu.meals);
  for(const command of commands) {
    if(command.type==='addMeal'){meals.push(structuredClone(command.meal));continue;}
    const index=meals.findIndex(m=>m.id===command.mealId);requireThat(index>=0,'UNKNOWN_MEAL',command.mealId);const meal=meals[index];
    if(command.type==='removeMeal'){meals.splice(index,1);continue;}
    if(command.type==='replaceMeal') {
      text(command.recipeId,'recipeId');meal.recipeId=command.recipeId;meal.selection=command.selection??'user';
      requireThat(!meal.locks?.production,'LOCKED_PRODUCTION','use a reviewed replacement preserving produced portions');delete meal.productionUnits;
    }else if(command.type==='updateMeal') {
      const patch=command.patch??{};requireThat(Object.keys(patch).every(k=>['diners','productionUnits','leftovers'].includes(k)),'INVALID_CHANGES',command.mealId);
      Object.assign(meal,structuredClone(patch));
      if(patch.diners!==undefined&&patch.productionUnits===undefined&&meal.productionUnits!==undefined) {
        const r=context.recipes.find(r=>r.id===meal.recipeId);
        try {const min=resolveProduction(r,{...meal,productionUnits:undefined}).minimumUnits;if(Q.of(meal.productionUnits).cmp(min)<0)meal.productionUnits=min;}
        catch(e){if(!(e instanceof EngineError))throw e;} // Incomplete records remain reviewable; no inferred quantity.
      }
    }else requireThat(false,'INVALID_CHANGE_TYPE',String(command.type));
  }
  return proposeMixedMenu(context,menu,shopping,meals);
}
function reservationEvent(proposal,eventId) {
  text(eventId,'eventId');const before=JSON.parse(proposal.basis.menu),after=structuredClone(proposal.menu),reservations={};after.reservationIds={};
  after.meals.forEach((m,k)=>{if(m.status!=='cooked'){const id=`${eventId}:${k}`;text(id,'reservation ID');after.reservationIds[m.id]=id;reservations[id]=proposal.evaluation.allocation[m.id]??{};}});
  return {after,event:{id:eventId,kind:'replan',expectedRevision:proposal.stockRevision,releaseIds:Object.values(before.reservationIds),reservations,
    menuIntent:{before,after},shoppingIntent:{before:JSON.parse(proposal.basis.shopping),after:proposal.shopping},
    proposalBasis:proposal.basis,purpose:proposal.purpose,reason:proposal.reason}};
}
export function acceptMixedProposal(context,menu,shopping,proposal,{eventId}={}) {
  requireThat(proposal?.kind==='mixed-menu-proposal'&&proposal.status==='awaiting_acceptance','INVALID_PROPOSAL','mixed menu');
  const state=context.state??emptyStock(),{after,event}=reservationEvent(proposal,eventId),{context:c}=safeMixedContext(context);
  if(state.operations[eventId])return {menu:structuredClone(menu),shopping:structuredClone(shopping),stock:applyEvent(state,event,c),replayed:true};
  requireThat(stableJSON(mixedBasis(context,menu,shopping))===stableJSON(proposal.basis),'PROPOSAL_STALE','menu, stock, shopping or catalog changed');
  requireThat(proposal.menu.id===menu.id&&proposal.menu.revision===menu.revision+1,'INVALID_PROPOSAL','revision or menu ID');
  assertMixedLocks(context,menu,proposal.menu);
  requireThat(['manual','suggestion'].includes(proposal.purpose)&&stableJSON(menuChanges(menu,proposal.menu))===stableJSON(proposal.changes),
    'INVALID_PROPOSAL','purpose or changes');
  const evaluation=evaluateMixedMenu(context,proposal.menu,shopping,{stockMenu:menu,acknowledgeChecked:proposal.acknowledgeChecked});
  requireThat(stableJSON(evaluation)===stableJSON(proposal.evaluation)&&stableJSON(evaluation.shopping)===stableJSON(proposal.shopping),
    'INVALID_PROPOSAL','calculation or shopping changed');
  if(proposal.purpose==='suggestion')assertAdviceChoices(context,proposal.changes,evaluation);
  const stock=applyEvent(state,event,c);
  return {menu:after,shopping:structuredClone(proposal.shopping),stock,evaluation,replayed:false};
}
export function cancelMixedChange(context,menu,shopping,{eventId,targetId}) {
  const state=context.state??emptyStock(),target=state.operations[targetId];requireThat(target,'UNKNOWN_MENU_OPERATION',targetId);
  if(state.operations[eventId])return {...cancelMenuChange(context,menu,{eventId,targetId}),shopping:structuredClone(shopping)};
  const intent=JSON.parse(target.fingerprint).shoppingIntent;requireThat(intent?.after,'UNKNOWN_MENU_OPERATION','not a mixed menu transition');
  const key=s=>stableJSON({...s,revision:0});requireThat(key(shopping)===key(intent.after),'SHOPPING_CANCELLATION_CONFLICT','shopping changed after proposal');
  return {...cancelMenuChange(context,menu,{eventId,targetId}),shopping:{...structuredClone(intent.before),revision:shopping.revision+1}};
}
