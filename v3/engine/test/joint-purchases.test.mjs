import test from 'node:test';
import assert from 'node:assert/strict';
import {jointBasket,emptyStock,Q} from '../src/index.mjs';
import {context,code} from './lot2-helpers.mjs';
test('Lot2 I — more expensive format wins on explicit perishable surplus penalty',()=>{
  const c=context();c.state=emptyStock();c.products=c.products.filter(p=>p.ingredientId==='tomato');
  c.products[0].content.amount='800';c.products.push({...structuredClone(c.products[0]),id:'exact650',content:{amount:'650',unit:'g',basis:'net'},price:{...c.products[0].price,cents:130}});
  c.policy.wasteRateCents.tomato='1';
  const req={needs:{tomato:'650'}};
  assert.equal(jointBasket(c,req).menu.lines[0].productId,'exact650');
  assert.equal(jointBasket(c,req).purchaseScore,'130');
  c.policy.wasteRateCents.tomato='0';assert.equal(jointBasket(c,req).menu.lines[0].productId,'tomato-pack');
  c.policy.wasteRateCents.tomato='1';c.budget={cents:120,strict:true};
  c.products.forEach(p=>p.price={...p.price,kind:'observed',observedOn:c.session.asOf});
  assert.equal(jointBasket(c,req).menu.totalCents,100);assert.equal(jointBasket(c,req).purchaseScore,'250');
});
test('Lot2 joint strict budget couples ingredient frontiers instead of picking independent winners',()=>{
  const c=context();c.state=emptyStock();c.ingredients=c.ingredients.filter(i=>i.id!=='egg');
  c.products=c.products.filter(p=>p.ingredientId!=='egg');
  for(const p of [...c.products]) {
    p.content.amount='800';p.price={...p.price,cents:100,kind:'observed',observedOn:c.session.asOf};
    c.products.push({...structuredClone(p),id:p.id+'-exact',content:{...p.content,amount:'650'},price:{...p.price,cents:p.ingredientId==='tomato'?130:140}});
  }
  c.policy.wasteRateCents={tomato:'2',rice:'1'};c.budget={strict:true,cents:240};
  const b=jointBasket(c,{needs:{tomato:'650',rice:'650'}});
  assert.equal(b.cart.totalCents,230);assert.equal(b.quantities.tomato.purchaseSurplus,'0');assert.equal(b.quantities.rice.purchaseSurplus,'150');
});
test('Lot2 unknown prices remain uncertain and limit proof; no valid format or mixed stores fails',()=>{
  const c=context();c.state=emptyStock();c.products[0].price={...c.products[0].price,kind:'unknown',cents:null};
  const b=jointBasket(c,{needs:{tomato:'650'}});assert.equal(b.cart.totalCents,null);assert.equal(b.packageOptimal,false);
  c.budget={strict:true,cents:1000};assert.throws(()=>jointBasket(c,{needs:{tomato:'650'}}),code('BUDGET_UNVERIFIABLE'));
  c.budget=undefined;c.products[0].storeId='foreign';assert.throws(()=>jointBasket(c,{needs:{tomato:'650'}}),code('STORE_MISMATCH'));
});
test('Lot2 generated joint purchases match independent exhaustive integer pack oracle',()=>{
  let seed=31;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let k=0;k<120;k++) {
    const c=context();c.state=emptyStock();c.products=c.products.filter(p=>p.ingredientId==='tomato');
    const sizes=[1+random(10),1+random(10)],costs=[random(25),random(25)],need=1+random(20),rate=random(6);
    c.products=[0,1].map(j=>({...structuredClone(c.products[0]),id:`p${j}`,content:{amount:String(sizes[j]),unit:'g',basis:'net'},price:{...c.products[0].price,cents:costs[j]}}));
    c.policy.wasteRateCents={tomato:String(rate)};let best=Infinity;
    for(let a=0;a<=need;a++)for(let b=0;b<=need;b++)if(a*sizes[0]+b*sizes[1]>=need)
      best=Math.min(best,a*costs[0]+b*costs[1]+rate*(a*sizes[0]+b*sizes[1]-need));
    const result=jointBasket(c,{needs:{tomato:String(need)}});
    assert.equal(Number(result.purchaseScore),best,`case ${k}`);
    assert(Q.of(result.quantities.tomato.bought).cmp(need)>=0);
  }
});
test('Lot2 exact rational contents and real weight increments retain merged-line cent rounding',()=>{
  const c=context();c.state=emptyStock();c.products=[{...c.products[0],mode:'weight',saleUnit:'weight',
    increment:{amount:'0.1',unit:'g',basis:'net'},priceQuantity:{amount:'1',unit:'kg',basis:'net'},price:{...c.products[0].price,cents:399}}];
  c.manual=[{productId:'tomato-pack',count:1}];
  const b=jointBasket(c,{needs:{tomato:'650.25'}});
  assert.equal(b.quantities.tomato.bought,'6503/10');assert.equal(b.quantities.tomato.purchaseSurplus,'1/20');
  assert.equal(b.cart.lines.length,1);assert.equal(b.cart.totalCents,260);
  c.products=[{...c.products[0],mode:'fixed',content:{amount:'1/3',unit:'g',basis:'net'},price:{...c.products[0].price,cents:10}}];c.manual=[];
  assert.equal(jointBasket(c,{needs:{tomato:'4/5'}}).quantities.tomato.bought,'1');
});
test('Lot2 joint frontier bounds and invalid commercial quantities fail instead of silently truncating',()=>{
  const c=context();c.state=emptyStock();c.maxStates=1;
  assert.throws(()=>jointBasket(c,{needs:{tomato:'650'}}),code('RESOURCE_LIMIT'));
  c.maxStates=100_000;c.products[0].content.amount='0';
  assert.throws(()=>jointBasket(c,{needs:{tomato:'650'}}),code('INVALID_QUANTITY'));
});
