import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateFieldPacket} from '../src/index.mjs';
import {context} from './lot2-helpers.mjs';
test('Lot3 field template reports five missing household reviews and never pretends to be field validated',async()=>{
  const packet=JSON.parse(await readFile(new URL('../fixtures/household-review.template.json',import.meta.url),'utf8')),r=validateFieldPacket(packet);
  assert.equal(r.recipeCount,0);assert.equal(r.status,'needs_review');assert.equal(r.fieldValidated,false);
  assert(r.issues.some(i=>i.code==='FIVE_HOUSEHOLD_RECIPES_REQUIRED'));
});
function mockPacket(){
  const c=context();return {version:1,ingredients:c.ingredients,session:c.session,
    evidence:[{id:'r',kind:'recipe_review',location:'mock evidence, not a real source',reviewed:true},{id:'p',kind:'product_label',location:'mock label',reviewed:true}],
    recipeReviews:c.recipes.slice(0,5).map(r=>({id:r.id,sourceKind:'household',householdConfirmed:true,quantitiesReviewed:true,productionReviewed:true,evidenceId:'r',
      recipe:{...r,ingredients:r.ingredients.map(g=>({...g,quantityVerified:true}))}})),
    productReviews:c.products.map(p=>({id:p.id,contentEvidenceId:'p',product:p}))};
}
test('Lot3 technical review checks can pass on mock attestations but cannot certify real household/commercial authenticity',()=>{
  const r=validateFieldPacket(mockPacket());assert.equal(r.status,'technically_ready');assert.equal(r.recipeCount,5);assert.equal(r.fieldValidated,false);
});
test('Lot3 demo origin, missing evidence and unknown production remain explicitly unvalidated',()=>{
  const p=mockPacket();p.recipeReviews[0].sourceKind='demo';p.recipeReviews[1].evidenceId=null;delete p.recipeReviews[2].recipe.production;
  const r=validateFieldPacket(p);assert.equal(r.status,'needs_review');assert.equal(r.recipeCount,2);
  assert(r.issues.some(i=>i.code==='PRODUCTION_REVIEW_REQUIRED'));
});
test('Lot3 observed historical prices require receipt evidence, not a product-label assertion',()=>{
  const p=mockPacket();p.productReviews[0].product.price={...p.productReviews[0].product.price,kind:'historical',observedOn:p.session.asOf};p.productReviews[0].priceEvidenceId='p';
  const r=validateFieldPacket(p);assert(r.issues.some(i=>i.code==='PRICE_EVIDENCE_REQUIRED'));assert.equal(r.fieldValidated,false);
});
