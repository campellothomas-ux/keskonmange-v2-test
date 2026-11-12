import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeMenus,calculateBasket} from '../src/index.mjs';
import {ingredient,product,recipe,session,observed} from './helpers.mjs';
const input = () => ({ingredients:[ingredient()],products:[product('p',100,100)],recipes:[recipe('a',100),recipe('b',110)],
  session,mealCount:2,diners:2,leftovers:'keep',constraints:{maxRepeats:2}});

test('J — incompatible budget or dietary constraints return explicit infeasibility', () => {
  const data = input(); data.products[0].price = observed(100);
  assert.equal(optimizeMenus({...data,budget:{strict:true,cents:199}}).status,'infeasible');
  assert.equal(optimizeMenus({...data,constraints:{excludedIngredients:['tomato']}}).status,'infeasible');
  data.products[0].price.kind = 'estimated';
  const unknown = optimizeMenus({...data,budget:{strict:true,cents:1000}});
  assert.equal(unknown.status,'needs_data'); assert.equal(unknown.search.failures.BUDGET_UNVERIFIABLE,3);
});
test('J/M — manual items count toward strict budget; no cross-store fallback', () => {
  const data = input(); data.products[0].price = observed(100);
  const out = optimizeMenus({...data,manual:[{productId:'p',count:1}],budget:{strict:true,cents:250}});
  assert.equal(out.status,'infeasible');
  assert.throws(() => optimizeMenus({...data,products:[{...data.products[0],storeId:'foreign'}]}),e => e.code === 'STORE_MISMATCH');
});
test('K — explicit perishable stock bonus can favor stock without forcing all of it to be consumed', () => {
  const data = input();
  data.ingredients.push(ingredient('leek',{perishable:true}));
  data.recipes = [recipe('cheap',100),recipe('leek',100,'leek')]; data.mealCount=1;
  data.recipes[1].ingredients.push({ingredientId:'tomato',quantity:{amount:200,unit:'g',basis:'net'}});
  data.products.push(product('leek',100,180,'leek')); data.state = {physical:{leek:'1000'}};
  assert.equal(optimizeMenus(data).solution.meals[0].recipeId,'cheap');
  const out = optimizeMenus({...data,policy:{perishableStockRateCents:{leek:'3/2'}}});
  assert.equal(out.solution.meals[0].recipeId,'leek');
  assert.equal(out.solution.metrics.stockUsed.leek,'100');
  assert.equal(out.solution.basket.quantities.leek.remainingFree,'900');
});
test('L — explicit variety priority can beat a slightly cheaper repetitive menu', () => {
  const data = input();
  assert.deepEqual(optimizeMenus(data).solution.meals.map(m => m.recipeId),['a','a']);
  const out = optimizeMenus({...data,policy:{repeatPenaltyCents:150}});
  assert.deepEqual(out.solution.meals.map(m => m.recipeId),['a','b']);
  assert.equal(out.solution.basket.cart.totalCents,300);
  assert.equal(out.solution.metrics.distinctRecipes,2);
  assert.equal(optimizeMenus({...data,constraints:{maxRepeats:2,minDistinct:2},budget:{strict:true,cents:200},products:[{...data.products[0],price:observed(100)}]}).status,'infeasible');
});
test('allergy knowledge is explicit and V2 diet tags cannot certify a recipe', () => {
  const data = input(); data.ingredients[0].allergens = ['milk'];
  assert.equal(optimizeMenus({...data,constraints:{allergies:['milk']}}).status,'infeasible');
  delete data.ingredients[0].allergens;
  assert.equal(optimizeMenus({...data,constraints:{allergies:['milk']}}).status,'needs_data');
  data.recipes[0].tags = ['vegan'];
  assert.equal(optimizeMenus({...data,constraints:{requiredDietTags:['vegan']}}).status,'needs_data');
});
test('history, family limits, preferences and preservation priorities are caller policies', () => {
  const data = input(); data.mealCount=1;
  const out = optimizeMenus({...data,policy:{preferredRecipeIds:['b'],preferencePenaltyCents:150}});
  assert.equal(out.solution.meals[0].recipeId,'b');
  assert.equal(optimizeMenus({...data,policy:{historyRecipeIds:['a'],historyPenaltyCents:150}}).solution.meals[0].recipeId,'b');
  data.mealCount=2; data.recipes.forEach(r => r.family='same');
  assert.equal(optimizeMenus({...data,constraints:{maxPerFamily:1,maxRepeats:2}}).status,'infeasible');
});
test('unknown prices stay provisional; limits and rejected calculations prevent optimality claims', () => {
  const data = input();
  const complete = optimizeMenus(data); assert.equal(complete.search.optimal,true);
  const limit = optimizeMenus({...data,maxCandidates:1});
  assert.equal(limit.search.truncated,true); assert.equal(limit.search.optimal,false);
  data.products[0].price = {kind:'unknown',cents:null,currency:'EUR',storeId:session.storeId};
  const unknown = optimizeMenus(data); assert.equal(unknown.status,'needs_prices'); assert.equal(unknown.search.optimal,false);
  const blocked = input(); blocked.recipes.push(recipe('bad',100,'unmapped'));
  assert.equal(optimizeMenus(blocked).search.optimal,false);
  assert.equal(optimizeMenus({...input(),maxCandidates:3}).search.truncated,false);
});
test('menu optimization shares ingredient needs and stock across recipes', () => {
  const data = input(); data.constraints={minDistinct:2};
  data.recipes = [recipe('a',325),recipe('b',325)]; data.products=[product('p',400,100)];
  data.state={physical:{tomato:'250'}};
  const out = optimizeMenus(data);
  assert.equal(out.solution.basket.cart.totalCents,100);
  assert.equal(out.solution.basket.quantities.tomato.fromStock,'250');
});
test('properties — small menus match independent ordered enumeration of every cover and explicit score', () => {
  let seed = 73;
  const random = n => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed%n; };
  for(let k=0;k<60;k++) {
    const data=input(); data.mealCount=3; data.recipes=[0,1,2].map(j=>recipe(`r${j}`,1+random(10)));
    const size=1+random(8), price=1+random(20), stock=random(8), penalty=random(30);
    data.products=[product('p',size,price)]; data.state={physical:{tomato:String(stock)}};
    data.policy={repeatPenaltyCents:penalty};
    let best=Infinity;
    // Ordered triples deliberately differ from the implementation's unordered recursion.
    for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++) {
      const ids=[a,b,c], distinct=new Set(ids).size;
      if (ids.some(i=>ids.filter(j=>i===j).length>2))continue;
      const need=ids.reduce((s,j)=>s+Number(data.recipes[j].ingredients[0].quantity.amount),0);
      let cover=Infinity;
      for(let n=0;n<=30;n++)if(stock+n*size>=need)cover=Math.min(cover,n*price);
      best=Math.min(best,cover+penalty*(3-distinct));
    }
    const out=optimizeMenus(data);
    assert.equal(Number(out.solution.score),best,`seed case ${k}`);
    assert.equal(out.search.optimal,true);
    assert.deepEqual(optimizeMenus(data),out);
  }
});
