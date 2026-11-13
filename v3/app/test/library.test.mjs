import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {library,findRecipes} from '../../library/index.mjs';
import {convertLibrary} from '../../library/scripts/convert.mjs';
import {Q,canonicalQuantity,productionRequirements,renderCooking,suggestRecipes,formatCulinaryQuantity} from '../../engine/src/index.mjs';
import {context} from '../src/state.mjs';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const source=read('../../library/data/selected-source-review.json'),selection=read('../../library/data/selection.json');
const pilots=read('../../engine/fixtures/pilot-v3.json');

test('LOT5 — the reproducible selection contains 5 pilots, 26 P3 and 19 P2, never the 98-recipe corpus or exceptional dessert',()=>{
  assert.equal(library.recipes.length,50);assert.equal(source.recipes.length,50);
  assert.equal(new Set(library.recipes.map(r=>r.id)).size,50);assert.equal(selection.excluded.length,48);
  assert.equal(selection.additionalP3.length,26);assert.equal(selection.additionalP2.length,19);
  assert.deepEqual(convertLibrary(source,selection,pilots),library);
  for(const r of pilots.recipes)assert(library.recipes.some(p=>p.id===r.id));
  assert(!library.recipes.some(r=>r.id.includes('layer_cake')));assert.deepEqual(library.products,[]);assert.deepEqual(library.pieceConversions,[]);
  for(const category of ['viande','poisson','vegetarien'])assert(library.recipes.filter(r=>r.library.category===category).length>=8);
  assert(library.recipes.some(r=>r.production.mode==='batch'));assert(library.recipes.some(r=>r.production.mode==='unit'));
});
for(const recipe of library.recipes)test(`LOT5 fiche ${recipe.library.sourceIndex} — ${recipe.name}`,()=>{
  const record=source.recipes.find(r=>r.id===recipe.id),before=JSON.stringify(recipe);
  assert.deepEqual(recipe.originalV1,record.originalV1);assert.deepEqual(recipe.review,record.review);
  assert.equal(recipe.library.culinaryStatus,'pending');assert.equal(recipe.ingredients.length,record.originalV1.ingredients.length);
  const expected=selection.selected.find(r=>r.id===recipe.id).originalSha256;
  assert.equal(createHash('sha256').update(JSON.stringify(recipe.originalV1)).digest('hex'),expected);
  for(const g of recipe.ingredients){
    assert.equal(g.trace.validated,null);assert(g.trace.original&&g.trace.effective);
    canonicalQuantity(g.quantity,library.ingredients.find(i=>i.id===g.ingredientId));
  }
  for(const diners of [1,2,3,4,5,7,10,12]){
    const meal={id:'check',recipeId:recipe.id,diners,leftovers:'keep'};
    const out=productionRequirements([recipe],[meal],library.ingredients),cooking=renderCooking(recipe,meal,library.ingredients);
    assert.equal(cooking.status,'complete',JSON.stringify(cooking.issues));assert(Object.keys(out.needs).length>0);
    assert(cooking.steps.length>=2);assert(Q.of(out.preparations[0].producedPortions).cmp(diners)>=0);
    for(const [id,q]of Object.entries(out.needs)){
      const i=library.ingredients.find(i=>i.id===id);assert(Q.of(q).cmp(0)>0);
      if(i.indivisible)assert.equal(Q.of(q).d,1n);
      const line=cooking.ingredients.find(i=>i.ingredientId===id);assert.equal(line.referenceQuantity.amount,q);
    }
    assert(!cooking.steps.some(s=>/dans (2|3|5|deux|trois) (bols|assiettes)/i.test(s.text)));
  }
  assert.equal(JSON.stringify(recipe),before,'preview does not mutate recipe quantities or provenance');
});
test('LOT5 — editorial adjustments are explicit pending proposals, not hidden promotions or arbitrary V1 reinstatements',()=>{
  assert.equal(library.changes.length,15);
  for(const c of library.changes){
    const r=library.recipes.find(r=>r.id===c.recipeId),row=r.ingredients[c.ingredientIndex];
    assert.equal(row.trace.validated,null);assert.equal(c.status,'demo_applied_not_culinary_validated');assert(c.reason.length>30);
    assert.equal(row.quantity.amount,Q.of(c.proposedQuantity).toString());assert.notEqual(c.sourceQuantity,c.proposedQuantity);
  }
  const b=library.recipes.find(r=>r.library.sourceIndex===53),row=b.ingredients[1];
  assert.equal(row.trace.original.amount,'350');assert.equal(row.quantity.amount,'270');assert.equal(row.trace.proposed[0].confidence,'candidate_not_validated');
  assert.equal(pilots.recipes.find(r=>r.id===b.id).ingredients[1].quantity.amount,'350','LOT4 pilot file unchanged');
  const herbs=library.recipes.find(r=>r.library.sourceIndex===80).ingredients[5];assert.equal(herbs.quantity.amount,'1/8');
});
test('LOT5 — ingredient identity merges spelling/plurals and keeps incompatible mass/count and spoon measures distinct',()=>{
  const ingredient=(index,row)=>library.recipes.find(r=>r.library.sourceIndex===index).ingredients[row];
  assert.equal(ingredient(8,0).ingredientId,ingredient(62,0).ingredientId);
  assert.equal(ingredient(9,6).ingredientId,ingredient(34,1).ingredientId,'singular/plural carrots');
  assert.notEqual(ingredient(79,5).ingredientId,ingredient(8,13).ingredientId,'teaspoons and tablespoons lack verified volume conversion');
  assert.notEqual(ingredient(68,1).ingredientId,ingredient(46,1).ingredientId,'ham grams vs slices');
  assert.notEqual(ingredient(71,1).ingredientId,ingredient(8,0).ingredientId,'cooked vs raw chicken');
  const spinach=ingredient(24,2);assert.equal(library.ingredients.find(i=>i.id===spinach.ingredientId).name,'épinards frais');
});
test('LOT5 — explicit ingredient shares synchronize cooking without duplicating a source number or changing totals',()=>{
  const recipe=library.recipes.find(r=>r.library.sourceIndex===25),meal={id:'d',recipeId:recipe.id,diners:2,leftovers:'keep'};
  const cooked=renderCooking(recipe,meal,library.ingredients),needs=productionRequirements([recipe],[meal],library.ingredients).needs;
  const broth=recipe.ingredients[7].ingredientId;
  const parts=cooked.steps.flatMap(s=>s.bindings).filter(b=>b.ingredientId===broth);
  assert.deepEqual(parts.map(b=>b.referenceQuantity.amount),['1000/3','100/3']);
  assert.equal(parts.reduce((s,b)=>s.add(b.referenceQuantity.amount),Q.of(0)).toString(),needs[broth]);
  const r=structuredClone(recipe);r.cookingSteps[0].parts=[{ingredientId:broth,share:'3/2'}];
  assert.equal(renderCooking(r,meal,library.ingredients).issues[0].code,'INVALID_COOKING_SHARE');
});
test('LOT5 — recipe search covers fifty records, ingredients, accents, categories, rapid meals and empty results',()=>{
  assert.equal(findRecipes().length,50);assert.equal(findRecipes({query:'quiche'}).length,1);
  assert(findRecipes({query:'bœuf'}).length>0);assert.equal(findRecipes({query:'boeuf'}).length,findRecipes({query:'bœuf'}).length);
  assert.equal(findRecipes({query:'ŒUFS'}).length,findRecipes({query:'oeufs'}).length);
  assert(findRecipes({query:'courgette'}).length>10);
  const quick=findRecipes({filter:'rapide'});assert(quick.length>10&&quick.length<50);assert(quick.every(r=>r.library.minutes<=25));
  assert(findRecipes({filter:'vegetarien'}).every(r=>r.library.category==='vegetarien'));
  assert.deepEqual(findRecipes({query:'inexistantxyz'}),[]);
});
test('LOT5 — approximate culinary pinch display never changes exact needs or rounds a tiny quantity to zero',()=>{
  const ingredient=library.ingredients.find(i=>i.culinary.measure==='pincée'),before=JSON.stringify(ingredient);
  const display=formatCulinaryQuantity(ingredient,'17/5');
  assert.equal(display.referenceQuantity.amount,'17/5');assert.equal(display.displayQuantity.amount,'7/2');
  assert(display.text.startsWith('environ 3 ½ pincées'));assert(display.approximate);
  assert.equal(formatCulinaryQuantity(ingredient,'17/5',{precise:true}).displayQuantity.amount,'17/5');
  assert.equal(formatCulinaryQuantity(ingredient,'1/100').displayQuantity.amount,'1/100');
  assert.equal(JSON.stringify(ingredient),before);
});
test('LOT5 — catalog-free suggestions never create extra cooked portions; quiche manual previews remain possible',()=>{
  for(const diners of [1,2,3,4,5,7,10]){
    const found=suggestRecipes(context(),{diners,limit:50});
    assert(found.suggestions.length>30);assert(found.suggestions.every(s=>s.preparation.producedPortions===String(diners)));
    assert.equal(found.suggestions.some(s=>s.recipeId.includes('quiche')),diners%4===0);
  }
});
