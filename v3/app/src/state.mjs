import {library} from '../../library/index.mjs';
import {Q,requireThat,initialMenu,emptyStock,createShopping,validateMenu,validateShopping,evaluateMixedMenu,
  changeMixedMenu,addShoppingItem,removeShoppingItem,checkShoppingItem,renderCooking,suggestRecipes} from '../../engine/src/index.mjs';

export const STORAGE_KEY='keskonmange:v3:lot5';
export const catalog=library;
export function context(){return {recipes:catalog.recipes,ingredients:catalog.ingredients,products:[],state:emptyStock(),
  session:{storeId:'local-demo-no-catalog',asOf:new Date().toISOString().slice(0,10)}};}
export function createState(){return {version:1,menu:initialMenu('local-planning'),shopping:createShopping('local-courses'),nextId:1,preferences:{}};}
function diners(value){requireThat(Number.isSafeInteger(value)&&value>=1&&value<=12,'INVALID_DINERS','Choisir entre 1 et 12 personnes.');return value;}
export function validateState(state){
  requireThat(state?.version===1&&Number.isSafeInteger(state.nextId)&&state.nextId>=1,'INVALID_LOCAL_SAVE','Version de sauvegarde inconnue.');
  validateMenu(state.menu);validateShopping(state.shopping);
  requireThat(Object.keys(state.menu.reservationIds).length===0,'INVALID_LOCAL_SAVE','Cette démo ne réserve pas de stock.');
  requireThat(state.preferences&&typeof state.preferences==='object'&&!Array.isArray(state.preferences),'INVALID_LOCAL_SAVE','Préférences illisibles.');
  for(const [id,n]of Object.entries(state.preferences)){requireThat(catalog.recipes.some(r=>r.id===id),'UNKNOWN_RECIPE',id);diners(n);}
  for(const m of state.menu.meals){diners(m.diners);requireThat(catalog.recipes.some(r=>r.id===m.recipeId)&&m.status!=='cooked','UNKNOWN_RECIPE',m.recipeId);}
  return state;
}
export function loadState(storage){
  try {const saved=storage.getItem(STORAGE_KEY);return {state:saved?validateState(JSON.parse(saved)):createState(),error:null};}
  catch {return {state:createState(),error:'La sauvegarde locale ne peut pas être lue. Elle est conservée ; les nouveaux changements la remplaceront si la sauvegarde redevient possible.'};}
}
export function saveState(storage,state){
  validateState(state);
  try {storage.setItem(STORAGE_KEY,JSON.stringify(state));return {saved:true,error:null};}
  catch {return {saved:false,error:'La sauvegarde est indisponible sur cet appareil. Vos changements restent dans cet onglet ; gardez-le ouvert.'};}
}
export function evaluate(state,{acknowledgeChecked=false}={}){validateState(state);return evaluateMixedMenu(context(),state.menu,state.shopping,{acknowledgeChecked});}
export function details(recipeId,count=2,mealId=null){
  const recipe=catalog.recipes.find(r=>r.id===recipeId);requireThat(recipe,'UNKNOWN_RECIPE',recipeId);diners(count);
  const meal={id:mealId??'recipe-preview',recipeId,diners:count,leftovers:'keep'};
  const cooking=renderCooking(recipe,meal,catalog.ingredients);
  const evaluation=evaluateMixedMenu(context(),{...initialMenu('preview'),meals:[meal]});
  return {recipe,meal,cooking,preparation:evaluation.requirements.preparations[0],ingredients:cooking.ingredients??[],
    calculated:cooking.status==='complete'&&evaluation.coverage.ingredientQuantitiesComplete};
}
// No stock, checkout or cooking transaction is performed in this local demo.
// Only the menu and shopping snapshot are saved; engine proposals own calculation
// and checked-line reconciliation. An explicit user action applies the snapshot.
function planChange(state,commands){const proposal=changeMixedMenu(context(),state.menu,state.shopping,commands);
  return {...state,menu:proposal.menu,shopping:proposal.shopping};}
export function change(state,command){
  validateState(state);let next=structuredClone(state);
  if(command.type==='addRecipe'){
    requireThat(next.menu.meals.length<30,'MEAL_LIMIT','Le planning accepte au maximum 30 repas.');
    const count=diners(command.diners),recipe=catalog.recipes.find(r=>r.id===command.recipeId);requireThat(recipe,'UNKNOWN_RECIPE',command.recipeId);
    let id;do{id=`meal-${next.nextId++}`;}while(next.menu.meals.some(m=>m.id===id));
    next=planChange(next,[{type:'addMeal',meal:{id,recipeId:recipe.id,diners:count,leftovers:'keep',selection:'user'}}]);
    next.preferences[recipe.id]=count;
  }else if(command.type==='setDiners'){
    const count=diners(command.diners),meal=next.menu.meals.find(m=>m.id===command.mealId);requireThat(meal,'UNKNOWN_MEAL',command.mealId);
    next=planChange(next,[{type:'updateMeal',mealId:meal.id,patch:{diners:count}}]);next.preferences[meal.recipeId]=count;
  }else if(command.type==='removeMeal')next=planChange(next,[{type:'removeMeal',mealId:command.mealId}]);
  else if(command.type==='rememberDiners'){
    requireThat(catalog.recipes.some(r=>r.id===command.recipeId),'UNKNOWN_RECIPE',command.recipeId);next.preferences[command.recipeId]=diners(command.diners);
  }else if(command.type==='checkItem')next.shopping=checkShoppingItem(next.shopping,command.id,command.checked);
  else if(command.type==='addManual'){
    const label=String(command.label??'').trim(),quantity=String(command.quantity??'').trim();
    requireThat(label.length>0&&label.length<=120&&quantity.length<=80,'INVALID_MANUAL_ITEM','Indiquer un article (120 caractères maximum) et une quantité courte.');
    let id;do{id=`manual-${next.nextId++}`;}while([...next.shopping.manual,...next.shopping.calculated,...next.shopping.archived].some(r=>r.id===id));
    next.shopping=addShoppingItem(next.shopping,{id,label,...(quantity?{quantity}:{} )});
  }else if(command.type==='removeManual')next.shopping=removeShoppingItem(next.shopping,command.id,{acknowledgeChecked:true});
  else if(command.type==='acknowledgeShopping')next.shopping=evaluate(next,{acknowledgeChecked:true}).shopping;
  else requireThat(false,'UNKNOWN_COMMAND',String(command.type));
  return validateState(next);
}
export function suggestions(state,count){
  diners(count);const used=new Set(state.menu.meals.map(m=>m.recipeId)),c=context();c.recipes=c.recipes.filter(r=>!used.has(r.id));
  return suggestRecipes(c,{diners:count,limit:6,leftovers:'keep'});
}
export function culinaryLabel(row){
  if(typeof row.quantity==='string')return row.quantity;
  return row.purchaseDisplay?.text??(row.quantity?`${row.quantity.amount} ${row.quantity.unit}`:'Quantité libre');
}
export const fractionEqual=(a,b)=>Q.of(a).cmp(b)===0;
