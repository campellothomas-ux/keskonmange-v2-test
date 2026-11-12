import {Q,requireThat,text,EngineError} from './exact.mjs';
import {initialMenu,evaluateMenu,assertLocks,validateMenu} from './menu-evaluation.mjs';
import {resolveProduction,productionModel} from './production.mjs';
import {emptyStock,applyEvent,stableJSON} from './ledger.mjs';

const clean=v=>JSON.parse(JSON.stringify(v));
function basis(context,menu) {
  const state=context.state??emptyStock();
  return {menu:stableJSON(menu),stock:stableJSON({revision:state.revision,physical:state.physical,reservations:state.reservations,prepared:state.prepared??{}}),
    context:stableJSON(clean({recipes:context.recipes,ingredients:context.ingredients,products:context.products,session:context.session,
      policy:context.policy??{},constraints:context.constraints??{},manual:context.manual??[],budget:context.budget??null,
      maxStates:context.maxStates??100_000,maxPortfolioStates:context.maxPortfolioStates??10_000}))};
}
export function compareEvaluations(context,before,after) {
  const quantities={},ids=new Set([...Object.keys(before.basket.quantities),...Object.keys(after.basket.quantities)]);
  const sum=(evaluation,field)=>evaluation.requirements.preparations.reduce((s,p)=>s.add(p[field]),Q.of(0));
  for(const id of ids) {
    const old=before.basket.quantities[id]??{},next=after.basket.quantities[id]??{},i=context.ingredients.find(x=>x.id===id);
    quantities[id]={unit:i.unit,basis:i.basis,perishable:i.perishable===true};
    for(const field of ['required','bought','purchaseSurplus','fromStock'])quantities[id][field+'Delta']=Q.of(next[field]??0).sub(old[field]??0).toString();
  }
  const a=before.basket.cart.totalCents,b=after.basket.cart.totalCents;
  const packCount=e=>e.basket.cart.lines.reduce((s,l)=>s+l.count,0);
  const purchasedQuantities={};
  for(const id of new Set([...before.basket.cart.lines,...after.basket.cart.lines].map(l=>l.productId))) {
    const old=before.basket.cart.lines.find(l=>l.productId===id)?.count??0,next=after.basket.cart.lines.find(l=>l.productId===id)?.count??0;
    purchasedQuantities[id]=next-old;
  }
  return {costDeltaCents:a===null||b===null?null:b-a,scoreDelta:Q.of(after.score).sub(before.score).toString(),
    extraPreparedPortions:sum(after,'producedPortions').sub(sum(before,'producedPortions')).toString(),
    extraKeptPortions:sum(after,'keptPortions').sub(sum(before,'keptPortions')).toString(),
    packageCountDelta:packCount(after)-packCount(before),purchasedCountsDelta:purchasedQuantities,quantities,
    distinctRecipesDelta:after.metrics.distinctRecipes-before.metrics.distinctRecipes};
}
export function proposeMenu(context,menu,meals,{reason='explicit_menu_proposal',includeComparison=true}={}) {
  validateMenu(menu);
  const candidate={...structuredClone(menu),revision:menu.revision+1,meals:structuredClone(meals)};
  assertLocks(menu,candidate,context.recipes);
  const evaluation=evaluateMenu(context,candidate,{stockMenu:menu});
  let comparison=null,comparisonUnavailable=null;
  if(includeComparison) {
    try {const before=evaluateMenu(context,menu); comparison=compareEvaluations(context,before,evaluation);}
    catch(e){if(!(e instanceof EngineError))throw e;comparisonUnavailable={code:e.code,detail:e.message};}
  }
  return {version:1,kind:'menu-proposal',status:'awaiting_acceptance',reason,basis:basis(context,menu),
    stockRevision:(context.state??emptyStock()).revision,menu:candidate,evaluation,comparison,comparisonUnavailable};
}
export function recalculateMenu(context,menu,changes) {
  requireThat(Array.isArray(changes)&&new Set(changes.map(c=>c.mealId)).size===changes.length,'INVALID_CHANGES','unique meal changes required');
  const meals=structuredClone(menu.meals),map=new Map(context.recipes.map(r=>[r.id,r]));
  for(const change of changes) {
    const m=meals.find(x=>x.id===change.mealId);requireThat(m,'UNKNOWN_MEAL',change.mealId);
    requireThat(m.status!=='cooked','MEAL_ALREADY_COOKED',m.id);
    requireThat(Object.keys(change).every(k=>['mealId','diners','productionUnits','leftovers'].includes(k)),'INVALID_CHANGES','use replacement API for recipes');
    const original=menu.meals.find(x=>x.id===m.id),r=map.get(m.recipeId);requireThat(r,'UNKNOWN_RECIPE',m.recipeId);
    if(change.diners!==undefined)m.diners=change.diners;
    if(change.leftovers!==undefined)m.leftovers=change.leftovers;
    if(change.productionUnits!==undefined)m.productionUnits=change.productionUnits;
    else if(change.diners!==undefined&&m.productionUnits!==undefined) {
      const min=resolveProduction(r,{...m,productionUnits:undefined}).minimumUnits;
      if(Q.of(m.productionUnits).cmp(min)<0)m.productionUnits=min;
    }
    assertLocks({...menu,meals:[original]},{...menu,meals:[m]},context.recipes);
  }
  return proposeMenu(context,menu,meals,{reason:'meal_parameters_changed'});
}
function proposalEvent(proposal,eventId) {
  text(eventId,'eventId');const before=JSON.parse(proposal.basis.menu),after=structuredClone(proposal.menu),reservations={};
  after.reservationIds={};
  for(const [k,m]of after.meals.entries())if(m.status!=='cooked') {
    const id=`${eventId}:${k}`;text(id,'reservation ID');after.reservationIds[m.id]=id;reservations[id]=proposal.evaluation.allocation[m.id]??{};
  }
  return {event:{id:eventId,kind:'replan',expectedRevision:proposal.stockRevision,releaseIds:Object.values(before.reservationIds),
    reservations,menuIntent:{before,after},proposalBasis:proposal.basis},after};
}
export function acceptMenuProposal(context,menu,proposal,{eventId}={}) {
  requireThat(proposal?.kind==='menu-proposal'&&proposal.status==='awaiting_acceptance','INVALID_PROPOSAL','menu proposal required');
  const state=context.state??emptyStock(),{event,after}=proposalEvent(proposal,eventId);
  if(state.operations[eventId])return {menu:structuredClone(menu),stock:applyEvent(state,event,context),replayed:true};
  requireThat(stableJSON(basis(context,menu))===stableJSON(proposal.basis),'PROPOSAL_STALE','menu, stock or calculation context changed');
  requireThat(after.revision===menu.revision+1,'INVALID_PROPOSAL','revision');assertLocks(menu,after,context.recipes);
  const evaluation=evaluateMenu(context,proposal.menu,{stockMenu:menu});
  requireThat(stableJSON(evaluation)===stableJSON(proposal.evaluation),'INVALID_PROPOSAL','evaluation changed');
  const stock=applyEvent(state,event,context);
  return {menu:after,stock,evaluation,replayed:false};
}
export function cancelMenuChange(context,menu,{eventId,targetId}) {
  const state=context.state??emptyStock(),event={id:eventId,kind:'cancel',targetId};
  if(state.operations[eventId])return {menu:structuredClone(menu),stock:applyEvent(state,event,context),replayed:true};
  const target=state.operations[targetId];requireThat(target&&['replan','cook'].includes(target.kind),'UNKNOWN_MENU_OPERATION',targetId);
  const intent=JSON.parse(target.fingerprint).menuIntent;
  requireThat(intent,'UNKNOWN_MENU_OPERATION','operation has no menu transition');
  const noRevision=m=>({...m,revision:0});
  requireThat(stableJSON(noRevision(menu))===stableJSON(noRevision(intent.after)),'MENU_CANCELLATION_CONFLICT','cancel later menu changes first');
  const stock=applyEvent(state,event,context),restored={...intent.before,revision:menu.revision+1};
  return {menu:restored,stock,replayed:false};
}
export function mealForReplacement(context,old,recipe) {
  requireThat(!old.locks?.recipe,'LOCKED_RECIPE',old.id);requireThat(old.status!=='cooked','MEAL_ALREADY_COOKED',old.id);
  const m={...structuredClone(old),recipeId:recipe.id};delete m.productionUnits;
  if(old.locks?.production) {
    const original=context.recipes.find(r=>r.id===old.recipeId),produced=resolveProduction(original,old).producedPortions;
    m.productionUnits=Q.of(produced).div(productionModel(recipe).portions).toString();
  }
  resolveProduction(recipe,m);return m;
}
export function confirmMealCooking(context,menu,{mealId,eventId,actualNeeds}) {
  const m=menu.meals.find(x=>x.id===mealId);requireThat(m,'UNKNOWN_MEAL',mealId);
  const r=context.recipes.find(x=>x.id===m.recipeId);requireThat(r,'UNKNOWN_RECIPE',m.recipeId);
  const prep=resolveProduction(r,m),state=context.state??emptyStock(),previous=state.operations[eventId];
  const stored=previous?JSON.parse(previous.fingerprint):null;
  const reservationId=stored?.reservationId??menu.reservationIds[mealId];
  const next=structuredClone(menu);
  next.meals.find(x=>x.id===mealId).status='cooked';delete next.reservationIds[mealId];next.revision++;
  const event={id:eventId,kind:'cook',needs:actualNeeds,...(reservationId?{reservationId}:{}),
    menuIntent:stored?.menuIntent??{before:menu,after:next},
    prepared:{id:`${eventId}:prepared`,recipeId:r.id,producedPortions:prep.producedPortions,servedPortions:prep.diners,
      keptPortions:prep.keptPortions,discardedPortions:prep.discardedPortions}};
  if(previous)return {menu:structuredClone(menu),stock:applyEvent(state,event,context),replayed:true};
  requireThat(m.status!=='cooked','MEAL_ALREADY_COOKED',mealId);
  const stock=applyEvent(state,event,context);
  return {menu:next,stock,preparation:prep,replayed:false};
}
export {initialMenu};
