import {EngineError,requireThat,unique,text} from './exact.mjs';
import {ingredientMap,validateCatalog,validDate} from './model.mjs';
import {productionRequirements} from './production.mjs';

// Checks a review packet's technical consistency, never the authenticity of external evidence.
export function validateFieldPacket(packet) {
  requireThat(packet?.version===1,'INVALID_REVIEW_PACKET','version');
  requireThat(Array.isArray(packet.recipeReviews)&&Array.isArray(packet.productReviews)&&Array.isArray(packet.evidence),
    'INVALID_REVIEW_PACKET','reviews and evidence arrays');
  unique(packet.recipeReviews,'recipe reviews');unique(packet.productReviews,'product reviews');unique(packet.evidence,'evidence');
  const issues=[],recipes=[],products=[],evidence=new Map(packet.evidence.map(e=>[e.id,e]));
  const reviewedEvidence=(id,at)=>{
    const e=evidence.get(id);requireThat(e?.reviewed===true&&typeof e.location==='string'&&e.location.length>0,'EVIDENCE_REVIEW_REQUIRED',at);
    requireThat(['recipe_review','product_label','receipt'].includes(e.kind),'INVALID_EVIDENCE',at);return e;
  };
  try {ingredientMap(packet.ingredients);validDate(packet.session?.asOf);text(packet.session?.storeId,'session.storeId');}
  catch(e){if(!(e instanceof EngineError))throw e;issues.push({code:e.code,detail:e.message,status:'invalid'});}
  for(const review of packet.recipeReviews) {
    try {
      requireThat(review.sourceKind==='household'&&review.householdConfirmed===true,'HOUSEHOLD_REVIEW_REQUIRED',review.id);
      requireThat(review.quantitiesReviewed===true&&review.productionReviewed===true,'RECIPE_REVIEW_REQUIRED',review.id);
      reviewedEvidence(review.evidenceId,review.id);const r=review.recipe;requireThat(r,'RECIPE_DATA_REQUIRED',review.id);
      requireThat(Array.isArray(r.ingredients)&&r.ingredients.every(g=>g?.quantityVerified===true),'QUANTITY_REVIEW_REQUIRED',review.id);
      productionRequirements([r],[{id:'review',recipeId:r.id,diners:r.yieldPortions,leftovers:'keep',indivisiblePolicy:'ceil'}],packet.ingredients);
      recipes.push(r);
    }catch(e){if(!(e instanceof EngineError))throw e;issues.push({reviewId:review.id,code:e.code,detail:e.message,status:'needs_review'});}
  }
  for(const review of packet.productReviews) {
    try {
      reviewedEvidence(review.contentEvidenceId,review.id);const p=review.product;requireThat(p,'PRODUCT_DATA_REQUIRED',review.id);
      if(['observed','historical'].includes(p.price?.kind))requireThat(reviewedEvidence(review.priceEvidenceId,review.id).kind==='receipt',
        'PRICE_EVIDENCE_REQUIRED',review.id);
      validateCatalog([p],packet.ingredients,packet.session);products.push(p);
    }catch(e){if(!(e instanceof EngineError))throw e;issues.push({reviewId:review.id,code:e.code,detail:e.message,status:'needs_review'});}
  }
  if(new Set(recipes.map(r=>r.id)).size!==recipes.length)issues.push({code:'DUPLICATE_RECIPE_REVIEW',status:'invalid'});
  if(recipes.length<5)issues.push({code:'FIVE_HOUSEHOLD_RECIPES_REQUIRED',found:recipes.length,required:5,status:'needs_review'});
  const used=new Set(recipes.flatMap(r=>r.ingredients.map(g=>g.ingredientId)));
  for(const id of used)if(!products.some(p=>p.ingredientId===id))issues.push({code:'VERIFIED_PRODUCT_REQUIRED',ingredientId:id,status:'needs_review'});
  return {status:issues.some(i=>i.status==='invalid')?'invalid':issues.length?'needs_review':'technically_ready',
    recipeCount:recipes.length,productCount:products.length,issues,
    modeCoverage:[...new Set(recipes.map(r=>r.production.mode))],priceKinds:[...new Set(products.map(p=>p.price.kind))],
    fieldValidated:false,notice:'Technical checks do not verify source authenticity, household use, commercial availability or real field usage.'};
}
