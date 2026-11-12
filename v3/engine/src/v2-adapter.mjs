import {requireThat, EngineError, text} from './exact.mjs';
import {calculateRequirements} from './requirements.mjs';

// Exact name mapping and quantity-basis review must come from the caller.
// V2 aliases, recipe tags and missing yield semantics are never silently certified.
export function adaptV2Recipes(source, {mappings, recipes:reviews}, ingredients) {
  requireThat(source?.version === 2 && Array.isArray(source.recettes),'INVALID_V2','version/recettes');
  const accepted = [], blocked = [];
  for (const [index,r] of source.recettes.entries()) {
    try {
      const review = reviews[r.nom]; requireThat(review,'RECIPE_REVIEW_REQUIRED',r.nom);
      text(review.evidence,'recipe review evidence');
      const result = {id:review.id,name:r.nom,yieldPortions:review.yieldPortions,scalable:review.scalable === true,
        family:review.family,ingredients:r.ingredients.map(g => {
          const mapping = mappings[g.nom]; requireThat(mapping,'INGREDIENT_REVIEW_REQUIRED',g.nom);
          text(mapping.evidence,'mapping evidence');
          return {ingredientId:mapping.ingredientId,quantity:{amount:String(g.quantite),unit:g.unite,basis:mapping.basis,
            ...(mapping.countKind ? {countKind:mapping.countKind} : {})}};
        }),provenance:{sourceRecipeIndex:index,sourceName:r.nom,reviewEvidence:review.evidence}};
      calculateRequirements([result],[{id:'review',recipeId:result.id,diners:result.yieldPortions,leftovers:'keep'}],ingredients);
      accepted.push(result);
    } catch (e) { if (!(e instanceof EngineError)) throw e; blocked.push({index,name:r.nom,code:e.code,detail:e.message}); }
  }
  return {accepted,blocked};
}
