import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCulinaryQuantity,ingredientPurchaseNeed,productionRequirements,evaluateMixedMenu,renderCooking,Q} from '../src/index.mjs';
import {pilots,setup,code} from './lot4-helpers.mjs';

// Artificial numbers test configuration semantics, NOT real kitchen conversions.
const onion={id:'test-onion',name:'oignon test',unit:'g',basis:'net'};
const pieceConversions=[{ingredientId:'test-onion',basis:'net',gramsPerPiece:'80',singular:'petit oignon test',plural:'petits oignons test',
  evidence:'TEST DATA ONLY: artificial 80 g reference, not an approved real ingredient conversion.'}];
test('LOT4 — natural fractions use source pieces/cloves without inventing a mass conversion',()=>{
  const f=pilots(),get=id=>f.ingredients.find(i=>i.id===id);
  assert.equal(formatCulinaryQuantity(get('i_oignon'),'1/2').text,'½ oignon');
  assert.equal(formatCulinaryQuantity(get('i_ail'),'3/2').text,'1 ½ gousses d’ail');
  assert.equal(formatCulinaryQuantity(get('i_oeufs'),'3').text,'3 œufs');
  assert.equal(formatCulinaryQuantity(get('i_cheddar_en_tranches'),'2').text,'2 tranches de cheddar');
  assert.equal(formatCulinaryQuantity(get('i_pates'),'250').text,'250 g de pates');
});
test('LOT4 — only evidenced ingredient-specific configuration enables approximate gram/piece display',()=>{
  const exact=Object.freeze({...onion});
  const out=formatCulinaryQuantity(exact,'80',{pieceConversions});
  assert.equal(out.text,'environ 1 petit oignon test');assert.equal(out.referenceQuantity.amount,'80');
  assert.equal(out.referenceQuantity.unit,'g');assert.equal(out.displayQuantity.unit,'unit');assert(out.evidence);
  assert.equal(formatCulinaryQuantity(onion,'30',{pieceConversions}).text,'30 g de oignon test');
  assert.equal(formatCulinaryQuantity(onion,'40',{pieceConversions}).text,'environ ½ petit oignon test');
  assert.equal(formatCulinaryQuantity(onion,'80').displayQuantity.unit,'g');
  assert.equal(formatCulinaryQuantity({...onion,id:'other'},'80',{pieceConversions}).displayQuantity.unit,'g');
  const chicken={...onion,id:'chicken',name:'poulet'};assert.equal(formatCulinaryQuantity(chicken,'250',{pieceConversions}).text,'250 g de poulet');
  const noEvidence=[{...pieceConversions[0],evidence:''}];assert.throws(()=>formatCulinaryQuantity(onion,'80',{pieceConversions:noEvidence}),code('INVALID_ID'));
  assert.throws(()=>formatCulinaryQuantity(onion,'80',{pieceConversions:[{...pieceConversions[0],basis:'drained'}]}),code('INVALID_CONVERSION'));
});
test('LOT4 — displayed decimal rounding and precise measures never overwrite reference quantities',()=>{
  const r=formatCulinaryQuantity(onion,'700/3',{decimalPlaces:0});
  assert.equal(r.displayQuantity.amount,'233');assert.equal(r.referenceQuantity.amount,'700/3');assert(r.approximate);
  const precise=formatCulinaryQuantity(onion,'700/3',{precise:true,pieceConversions});assert.equal(precise.displayQuantity.amount,'700/3');assert(!precise.approximate);
  const tiny=formatCulinaryQuantity(onion,'1/1000',{decimalPlaces:0});assert.equal(tiny.displayQuantity.amount,'1/1000');
  assert.throws(()=>formatCulinaryQuantity(onion,'1',{decimalPlaces:12}),code('INVALID_DISPLAY_PRECISION'));
});
test('LOT4 — embedded culinary configuration is reused by cooking and shopping without changing calculations',()=>{
  const {c,m}=setup();
  c.ingredients=[{...onion,culinary:{pieceConversion:pieceConversions[0]}}];
  const r={...c.recipes[1],ingredients:[{ingredientId:onion.id,quantity:{amount:'80',unit:'g',basis:'net'}}],
    cookingSteps:[{quantityBindingsReviewed:true,parts:['Émincer ',{ingredientId:onion.id},'.']}]};
  c.recipes=[r];m.meals=[m.meals[1]];
  const e=evaluateMixedMenu(c,m);
  assert.equal(e.shopping.calculated[0].culinaryNeed.text,'environ 1 petit oignon test');
  assert.equal(renderCooking(r,m.meals[0],c.ingredients).steps[0].text,'Émincer environ 1 petit oignon test.');
  assert.equal(e.requirements.needs[onion.id],'80');assert.equal(e.shopping.calculated[0].purchaseQuantity.amount,'80');
  // Display conversion is approximate and must not become a commercial conversion.
  assert.equal(e.shopping.calculated[0].purchaseQuantity.unit,'g');
});
test('LOT4 — three half-onions aggregate to 1.5 then buy 2; stock is deducted before whole-piece rounding',()=>{
  const {c,m}=setup([4,'1.5','1.5',2,2]),before=structuredClone({c,m});
  const e=evaluateMixedMenu(c,m),row=e.shopping.calculated.find(i=>i.ingredientId==='i_oignon');
  assert.equal(e.requirements.needs.i_oignon,'3/2');assert.equal(row.referenceNeed,'3/2');
  assert.equal(row.quantity.amount,'3/2');assert.equal(row.purchaseQuantity.amount,'2');assert.equal(row.minimumPurchaseSurplus,'1/2');
  assert.equal(row.commercial.packCount,null);assert.deepEqual({c,m},before);
  c.state.physical.i_oignon='1/2';
  const withStock=evaluateMixedMenu(c,m),stockRow=withStock.shopping.calculated.find(i=>i.ingredientId==='i_oignon');
  assert.equal(stockRow.referenceNeed,'3/2');assert.equal(stockRow.fromStock,'1/2');assert.equal(stockRow.quantity.amount,'1');assert.equal(stockRow.purchaseQuantity.amount,'1');
});
test('LOT4 — exact compatible kg/g and evidenced piece/g needs aggregate before display, with no density guesses',()=>{
  const {c,m}=setup();const r=c.recipes[1];c.recipes=[{...r,ingredients:[
    {ingredientId:'test-onion',quantity:{amount:'0.05',unit:'kg',basis:'net'}},
    {ingredientId:'test-onion',quantity:{amount:'1/2',unit:'unit',basis:'net',countKind:'test-piece'}}]}];
  c.ingredients=[{...onion,conversions:[{fromUnit:'unit',fromBasis:'net',fromCountKind:'test-piece',factor:'80',evidence:'TEST ONLY artificial 80 g reference'}]}];
  const meal={...m.meals[1],diners:3};assert.equal(productionRequirements(c.recipes,[meal],c.ingredients).needs['test-onion'],'90');
  c.ingredients[0].conversions=[];assert.throws(()=>productionRequirements(c.recipes,[meal],c.ingredients),code('MISSING_CONVERSION'));
});
test('LOT4 — repeated display and commercial rounding leave every exact menu need unchanged',()=>{
  const {c,m}=setup([4,2,2,2,2]),before=structuredClone(c),original=productionRequirements(c.recipes,m.meals,c.ingredients);
  for(let run=0;run<20;run++)for(const i of c.ingredients)if(original.needs[i.id]) {
    for(const decimalPlaces of [0,1,2,4])formatCulinaryQuantity(i,original.needs[i.id],{decimalPlaces});
    ingredientPurchaseNeed(i,{required:original.needs[i.id],fromStock:'0'});
  }
  assert.deepEqual(productionRequirements(c.recipes,m.meals,c.ingredients),original);assert.deepEqual(c,before);
  assert.equal(original.needs.i_pates,'700/3');assert.equal(Q.of(original.needs.i_tomates_concassees).toString(),'1600/3');
});
