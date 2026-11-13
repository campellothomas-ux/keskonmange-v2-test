import {Q,positive,requireThat,EngineError} from './exact.mjs';
import {productionRequirements} from './production.mjs';
import {formatCulinaryQuantity} from './culinary.mjs';

/** Explicit ingredient bindings; numeric text (times, temperatures) is untouched. */
export function renderCooking(recipe,meal,ingredients,options={}) {
  const recipeWithWater={...recipe,ingredients:[...recipe.ingredients,...(recipe.cookingAuxiliaries??[])]};
  const requirements=productionRequirements([recipeWithWater],[meal],ingredients),map=new Map(ingredients.map(i=>[i.id,i]));
  const steps=[],issues=[];
  if(!Array.isArray(recipe.cookingSteps)||!recipe.cookingSteps.length)
    return {mealId:meal.id,status:'needs_review',steps,issues:[{code:'COOKING_BINDINGS_REQUIRED'}]};
  for(const [index,step]of recipe.cookingSteps.entries()) {
    try {
      requireThat(Array.isArray(step.parts)&&step.parts.length,'INVALID_COOKING_STEP',String(index));
      requireThat(step.quantityBindingsReviewed===true,'COOKING_QUANTITY_REVIEW_REQUIRED',String(index));
      const bindings=[];
      const rendered=step.parts.map(part=>{
        if(typeof part==='string')return part;
        const id=part?.ingredientId,i=map.get(id),amount=requirements.needs[id];
        requireThat(i&&amount!==undefined,'COOKING_INGREDIENT_REQUIRED',String(id));
        const share=positive(part.share??'1','cooking ingredient share');
        requireThat(share.cmp(1)<=0,'INVALID_COOKING_SHARE',String(id));
        const quantity=formatCulinaryQuantity(i,Q.of(amount).mul(share),{...options,precise:part.precise===true});
        bindings.push({ingredientId:id,...(part.share?{share:share.toString()}:{}),...quantity});return quantity.text;
      }).join('');
      steps.push({index,text:rendered,bindings,sourceStep:step.sourceStep??null});
    }catch(e){if(!(e instanceof EngineError))throw e;issues.push({index,code:e.code,detail:e.message});}
  }
  return {mealId:meal.id,status:issues.length?'needs_review':'complete',steps,issues,
    notes:[...new Set(Object.entries(requirements.needs).filter(([id,q])=>map.get(id)?.fractionNote&&Q.of(q).d!==1n).map(([id])=>map.get(id).fractionNote))],
    ingredients:Object.entries(requirements.needs).map(([id,q])=>({ingredientId:id,...formatCulinaryQuantity(map.get(id),q,options)}))};
}
