import {Q,positive,requireThat,unique,text,EngineError} from './exact.mjs';
import {calculateRequirements} from './requirements.mjs';

export function productionModel(recipe) {
  const p=recipe?.production;
  requireThat(p?.version===1,'PRODUCTION_REVIEW_REQUIRED',recipe?.id ?? 'recipe');
  requireThat(['adjustable','batch','unit'].includes(p.mode),'INVALID_PRODUCTION',recipe.id);
  text(p.unitLabel,'production.unitLabel');
  const reference=positive(p.referenceUnits,'referenceUnits'), portions=positive(p.portionsPerUnit,'portionsPerUnit');
  const minimum=positive(p.minUnits,'minUnits'), step=positive(p.stepUnits,'stepUnits');
  const maximum=p.maxUnits===undefined ? null : positive(p.maxUnits,'maxUnits');
  requireThat(!maximum || maximum.cmp(minimum)>=0,'INVALID_PRODUCTION','maxUnits < minUnits');
  if(p.mode==='adjustable')requireThat(portions.cmp(1)===0,'INVALID_PRODUCTION','adjustable units are portions');
  if(p.mode!=='adjustable')requireThat([reference,minimum,step,...(maximum?[maximum]:[])].every(q=>q.d===1n),
    'INVALID_PRODUCTION','batch and individual units must be whole');
  requireThat(reference.cmp(minimum)>=0 && reference.sub(minimum).div(step).d===1n,'INVALID_PRODUCTION','reference is off production grid');
  if(recipe.yieldPortions!==undefined)requireThat(positive(recipe.yieldPortions,'yieldPortions').cmp(reference.mul(portions))===0,
    'YIELD_MISMATCH',recipe.id);
  return {p,reference,portions,minimum,step,maximum};
}
export function resolveProduction(recipe,meal) {
  const {p,reference,portions,minimum,step,maximum}=productionModel(recipe);
  const needed=positive(meal.diners,'diners'), raw=needed.div(portions);
  const minimumForDiners=raw.cmp(minimum)<=0 ? minimum : minimum.add(step.mul(new Q(raw.sub(minimum).div(step).ceil())));
  const units=meal.productionUnits===undefined ? minimumForDiners : positive(meal.productionUnits,'productionUnits');
  requireThat(units.cmp(minimum)>=0 && units.sub(minimum).div(step).d===1n,'PRODUCTION_STEP_INVALID',meal.id);
  requireThat(!maximum || units.cmp(maximum)<=0,'PRODUCTION_LIMIT',meal.id);
  requireThat(units.cmp(minimumForDiners)>=0,'INSUFFICIENT_PORTIONS',meal.id);
  requireThat(['keep','discard'].includes(meal.leftovers),'LEFTOVER_POLICY_REQUIRED',meal.id);
  const produced=units.mul(portions), remaining=produced.sub(needed);
  return {mealId:meal.id,recipeId:recipe.id,mode:p.mode,unitLabel:p.unitLabel,units:units.toString(),
    minimumUnits:minimumForDiners.toString(),factor:units.div(reference).toString(),diners:needed.toString(),
    producedPortions:produced.toString(),keptPortions:meal.leftovers==='keep'?remaining.toString():'0',
    discardedPortions:meal.leftovers==='discard'?remaining.toString():'0'};
}
export function stepProduction(recipe,meal,direction) {
  requireThat(direction===1||direction===-1,'INVALID_DIRECTION','use +1 or -1');
  requireThat(!meal.locks?.production,'LOCKED_PRODUCTION',meal.id);
  const current=resolveProduction(recipe,meal), model=productionModel(recipe);
  const changed={...structuredClone(meal),productionUnits:Q.of(current.units).add(model.step.mul(direction)).toString()};
  resolveProduction(recipe,changed); return changed;
}
export function productionRequirements(recipes,meals,ingredients) {
  unique(recipes,'recipes'); unique(meals,'meals');
  const byId=new Map(recipes.map(r=>[r.id,r])), preparations=[], individual=[], needs={};
  for(const meal of meals) {
    const r=byId.get(meal.recipeId); requireThat(r,'UNKNOWN_RECIPE',meal.recipeId);
    const prep=resolveProduction(r,meal), model=productionModel(r);
    // Side dishes may follow diners rather than the number of whole main dishes.
    // Adjust a copy of the reference row; calculateRequirements still owns exact
    // conversions and indivisible preparation rounding.
    const rows=r.ingredients.map(g=>{
      if(!g.scaling)return g;
      requireThat(g.scaling.mode==='diners','INVALID_INGREDIENT_SCALING',g.ingredientId);
      const reference=positive(g.scaling.referencePortions,'scaling.referencePortions');
      const ratio=Q.of(meal.diners).div(reference).div(prep.factor);
      return {...g,quantity:{...g.quantity,amount:Q.of(g.quantity.amount).mul(ratio).toString()}};
    });
    const legacy={...r,ingredients:rows,yieldPortions:model.reference.mul(model.portions).toString(),scalable:true};
    const result=calculateRequirements([legacy],[{...meal,producePortions:prep.producedPortions}],ingredients);
    preparations.push({...prep,rounding:result.preparations[0].rounding});
    individual.push({mealId:meal.id,needs:result.needs});
    for(const [id,q]of Object.entries(result.needs))needs[id]=Q.of(needs[id]??0).add(q).toString();
  }
  return {needs,preparations,individual};
}
// Applies to automatic choices only. Manual evaluation remains possible.
export function automaticProductionAllowed(recipe,meal) {
  const prep=resolveProduction(recipe,meal);
  return recipe.automaticPolicy?.allowSurplus!==false || Q.of(prep.producedPortions).cmp(meal.diners)===0;
}
export function adaptProductionRecipes(recipes,reviews) {
  unique(recipes,'recipes');const accepted=[],validationRequired=[];
  for(const r of recipes) {
    try {
      const review=reviews?.[r.id];requireThat(review,'PRODUCTION_REVIEW_REQUIRED',r.id);text(review.evidence,'review.evidence');
      const candidate={...structuredClone(r),production:structuredClone(review.production),productionEvidence:review.evidence};
      productionModel(candidate);accepted.push(candidate);
    }catch(e){if(!(e instanceof EngineError))throw e;validationRequired.push({recipeId:r.id,code:e.code,detail:e.message});}
  }
  return {accepted,validationRequired};
}
