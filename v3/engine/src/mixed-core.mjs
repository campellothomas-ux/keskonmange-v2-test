import {Q,EngineError,requireThat,unique} from './exact.mjs';
import {ingredientMap,validateCatalog,canonicalQuantity} from './model.mjs';
import {validateContext} from './menu-evaluation.mjs';
import {resolveProduction,productionRequirements} from './production.mjs';

export const jsonCopy=value=>JSON.parse(JSON.stringify(value));
export const missing=value=>value===null||value===undefined||value==='';
export function safeMixedContext(context) {
  unique(context.recipes,'recipes');unique(context.products,'products');ingredientMap(context.ingredients);
  const products=[],catalogIssues=[];
  for(const p of context.products) {
    try {if(validateCatalog([p],context.ingredients,context.session).length)products.push(p);}
    catch(e){if(!(e instanceof EngineError))throw e;catalogIssues.push({productId:p.id,code:e.code,detail:e.message,status:'invalid'});}
  }
  const safe={...context,products,manual:[]};validateContext(safe);
  return {context:safe,catalogIssues};
}
export function analyzeMixedMeal(context,meal) {
  const recipe=context.recipes.find(r=>r.id===meal.recipeId),manual=meal.selection==='manual'||recipe?.manual===true;
  const result={mealId:meal.id,recipeId:meal.recipeId??null,status:manual?'manual':'needs_review',calculationStatus:'needs_review',
    knownNeeds:{},issues:[],risks:[],preparation:null,optimizable:false};
  if(meal.status==='cooked'){result.status='manual';result.calculationStatus='complete';return result;}
  if(!recipe){result.issues.push({code:'RECIPE_DATA_REQUIRED',status:'needs_review'});return result;}
  const map=ingredientMap(context.ingredients),p=recipe.production;
  const productionMissing=!p||['version','mode','unitLabel','referenceUnits','portionsPerUnit','minUnits','stepUnits'].some(k=>missing(p[k]))||missing(meal.diners);
  try {result.preparation=resolveProduction(recipe,meal);}
  catch(e){if(!(e instanceof EngineError))throw e;result.issues.push({code:e.code,detail:e.message,status:productionMissing?'needs_review':'invalid'});}
  if(!Array.isArray(recipe.ingredients)||!recipe.ingredients.length)result.issues.push({code:'INGREDIENTS_REQUIRED',status:'needs_review'});
  const rows=(Array.isArray(recipe.ingredients)?recipe.ingredients:[]).map((g,index)=>{
    const id=g?.ingredientId,i=map.get(id),q=g?.quantity;
    const unknown=!g||!i||!q||['amount','unit','basis'].some(k=>missing(q[k]));
    let issue=null;
    if(unknown)issue={code:!i?'INGREDIENT_DATA_REQUIRED':'QUANTITY_REQUIRED',status:'needs_review'};
    else try {canonicalQuantity(q,i);}catch(e){if(!(e instanceof EngineError))throw e;issue={code:e.code,detail:e.message,
      status:e.code==='MISSING_CONVERSION'?'needs_review':'invalid'};}
    if(i) {
      if((context.constraints?.excludedIngredients??[]).includes(id))result.risks.push({code:'DIET_EXCLUSION',ingredientId:id});
      if(context.constraints?.allergies?.length) {
        if(!Array.isArray(i.allergens))result.risks.push({code:'UNKNOWN_ALLERGENS',ingredientId:id});
        else for(const a of i.allergens)if(context.constraints.allergies.includes(a))result.risks.push({code:'ALLERGY_EXCLUSION',ingredientId:id,allergen:a});
      }
    }
    return {g,index,id,issue};
  });
  const partial=manual||rows.some(r=>r.issue||r.g?.quantityVerified===false)||recipe.validationStatus==='needs_review';
  for(const row of rows) {
    let issue=row.issue;
    if(!issue&&(row.g.quantityVerified===false||partial&&row.g.quantityVerified!==true))issue={code:'QUANTITY_REVIEW_REQUIRED',status:'needs_review'};
    if(issue){result.issues.push({...issue,ingredientId:row.id??null,index:row.index});continue;}
    if(!result.preparation)continue;
    try {
      const out=productionRequirements([{...recipe,ingredients:[row.g]}],[meal],context.ingredients);
      for(const [id,q]of Object.entries(out.needs))result.knownNeeds[id]=Q.of(result.knownNeeds[id]??0).add(q).toString();
    }catch(e){if(!(e instanceof EngineError))throw e;result.issues.push({ingredientId:row.id,index:row.index,code:e.code,detail:e.message,
      status:['MISSING_CONVERSION','INDIVISIBLE_ROUNDING_REQUIRED'].includes(e.code)?'needs_review':'invalid'});}
  }
  for(const tag of context.constraints?.requiredDietTags??[])if(!recipe.verifiedDietTags?.includes(tag))result.risks.push({code:'UNVERIFIED_DIET',tag});
  const known=Object.keys(result.knownNeeds).length>0;
  result.calculationStatus=result.issues.some(i=>i.status==='invalid')?'invalid':result.issues.length?known?'partial':'needs_review':'complete';
  result.status=manual?'manual':result.calculationStatus==='complete'?'optimized':result.calculationStatus;
  result.optimizable=!manual&&result.calculationStatus==='complete'&&!result.risks.length;
  return result;
}
