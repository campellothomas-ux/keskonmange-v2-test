import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopping,addShoppingItem,editShoppingItem,removeShoppingItem,checkShoppingItem,reconcileShopping,estimateShopping,
  prepareShoppingConfirmation,confirmShopping,evaluateMixedMenu,setShoppingPurchaseCount,cancelShoppingConfirmation,applyEvent} from '../src/index.mjs';
import {context,mixedMenu,code} from './lot3-helpers.mjs';
const free=(id,label,cents)=>({id,label,presentation:'free presentation',...(cents===undefined?{}:{estimate:{kind:'estimated',currency:'EUR',totalCents:cents}})});
test('Lot3 C — free products retain exact quantities/states and contribute only known prices',()=>{
  const c=context();let s=createShopping('s');
  for(const item of [free('b','Biscuits',150),free('s','Soda',200),free('w','Cleaning product')])s=addShoppingItem(s,item);
  s=checkShoppingItem(s,'b',true);s=editShoppingItem(s,'s',{quantity:{amount:'2',unit:'bottles'},estimate:{kind:'estimated',currency:'EUR',totalCents:400}});
  const e=evaluateMixedMenu(c,mixedMenu(),s);assert.deepEqual(e.shopping.manual,s.manual);
  const money=estimateShopping(c,e.shopping);assert.equal(money.total.totalCents,null);assert(money.total.knownSubtotalCents>=550);
  assert.equal(e.shopping.manual[0].checked,true);assert.equal(e.shopping.manual[1].quantity.amount,'2');
});
test('Lot3 matching SKU merges origins and adds quantities; similar names alone never merge',()=>{
  const c=context();let s=addShoppingItem(createShopping('s'),{id:'m',label:'Tomatoes',productId:'tomato-pack',count:1,checked:true});
  s=reconcileShopping(s,[{productId:'tomato-pack',count:2}]).shopping;
  let rows=estimateShopping(c,s).lines;assert.equal(rows.length,1);assert.equal(rows[0].count,3);assert.equal(rows[0].origins.length,2);assert.equal(rows[0].checkedState,'partial');
  s=addShoppingItem(s,free('other','Tomatoes'));rows=estimateShopping(c,s).lines;assert.equal(rows.length,2);
});
test('Lot3 F — adding/editing pending products preserves checks; checked changes require explicit acknowledgement',()=>{
  let s=addShoppingItem(createShopping('s'),free('a','a',100));s=checkShoppingItem(s,'a',true);
  s=addShoppingItem(s,free('b','b',200));s=editShoppingItem(s,'b',{quantity:{amount:'3',unit:'packs'}});
  assert.equal(s.manual[0].checked,true);assert.throws(()=>editShoppingItem(s,'a',{label:'changed'}),code('CHECKED_CHANGE_REQUIRES_ACK'));
  assert.throws(()=>removeShoppingItem(s,'a'),code('CHECKED_CHANGE_REQUIRES_ACK'));
  s=editShoppingItem(s,'a',{label:'explicitly changed'},{acknowledgeChecked:true});assert(s.manual[0].checked);
  s=removeShoppingItem(s,'a',{acknowledgeChecked:true});assert.equal(s.manual.length,1);assert.equal(s.manual[0].id,'b');assert(s.archived[0].checked);
});
test('Lot3 F — changed checked computed intent is frozen until explicit reconciliation',()=>{
  let s=reconcileShopping(createShopping('s'),[{productId:'tomato-pack',count:2}]).shopping;
  const id=s.calculated[0].id;s=checkShoppingItem(s,id,true);
  const result=reconcileShopping(s,[{productId:'tomato-pack',count:3}]);assert(result.reconciliationRequired);assert.equal(result.shopping.calculated[0].count,2);
  assert.equal(result.shopping.calculated[0].id,id);assert(result.shopping.calculated[0].checked);
  const acknowledged=reconcileShopping(s,[{productId:'tomato-pack',count:3}],{acknowledgeChecked:true});assert.equal(acknowledged.shopping.calculated[0].count,3);
});
test('Lot3 F — prepared immutable checkout is idempotent; a late addition is a new intent, not a duplicate purchase',()=>{
  const c=context();let s=createShopping('s');s=addShoppingItem(s,{id:'rice',label:'rice',productId:'rice-pack',count:1,checked:true});
  s=addShoppingItem(s,free('late','Cleaning product',200));
  const cmd=prepareShoppingConfirmation(c,s,{eventId:'checkout'}),purchased=confirmShopping(c,s,cmd);c.state=purchased.stock;s=purchased.shopping;
  assert.equal(c.state.physical.rice,'500');assert(s.manual[0].confirmed);assert(s.manual[0].checked);
  const repeated=confirmShopping(c,s,cmd);assert.deepEqual(repeated.stock,c.state);assert.deepEqual(repeated.shopping,s);
  s=checkShoppingItem(s,'late',true);const lateCmd=prepareShoppingConfirmation(c,s,{eventId:'late-checkout'});
  const late=confirmShopping(c,s,lateCmd);assert.equal(late.stock.physical.rice,'500');assert.equal(late.untracked.length,1);
  assert.deepEqual(late.stock.physical,c.state.physical);assert.equal(estimateShopping({...c,state:late.stock},late.shopping).total.knownSubtotalCents,320);
  assert.throws(()=>editShoppingItem(late.shopping,'rice',{count:2},{acknowledgeChecked:true}),code('PURCHASED_ITEM_IMMUTABLE'));
});
test('Lot3 checkout rejects stale content, changed selection and modified command IDs before any persistence',()=>{
  const c=context();let s=addShoppingItem(createShopping('s'),{id:'rice',label:'rice',productId:'rice-pack',count:1,checked:true});
  const cmd=prepareShoppingConfirmation(c,s,{eventId:'buy'}),changed=editShoppingItem(s,'rice',{count:2},{acknowledgeChecked:true});
  assert.throws(()=>confirmShopping(c,changed,cmd),code('PURCHASE_INTENT_STALE'));
  assert.throws(()=>confirmShopping(c,s,{...cmd,intentIds:[]}),code('INVALID_PURCHASE_COMMAND'));
  c.products[1].content.amount='750';assert.throws(()=>confirmShopping(c,s,cmd),code('PURCHASE_INTENT_STALE'));
});
test('Lot3 confirmed computed purchases remain checked after recalculation; no new purchase is requested for acquired stock',()=>{
  const c=context(),m=mixedMenu();let e=evaluateMixedMenu(c,m),s=e.shopping;
  const tomato=s.calculated.find(r=>r.productId==='tomato-pack');s=checkShoppingItem(s,tomato.id,true);
  const cmd=prepareShoppingConfirmation(c,s,{eventId:'buy-tomato'}),purchase=confirmShopping(c,s,cmd);c.state=purchase.stock;
  e=evaluateMixedMenu(c,m,purchase.shopping);const kept=e.shopping.calculated.find(r=>r.id===tomato.id);
  assert(kept.checked&&kept.confirmed);assert.equal(e.shopping.calculated.filter(r=>r.productId==='tomato-pack'&&!r.confirmed).length,0);
  assert.equal(e.basket.shopping.confirmed.knownSubtotalCents,purchase.shopping.receipts['buy-tomato'].amount.knownSubtotalCents);
});
test('Lot3 actual partial package count is confirmed exactly and the still-missing package receives a new intent',()=>{
  const c=context();c.state.physical={};c.state.reservations={};const m=mixedMenu();
  const e=evaluateMixedMenu(c,m),id=e.shopping.calculated.find(r=>r.productId==='tomato-pack').id;
  let s=setShoppingPurchaseCount(e.shopping,id,1);s=checkShoppingItem(s,id,true);
  const cmd=prepareShoppingConfirmation(c,s,{eventId:'actual-count'}),purchased=confirmShopping(c,s,cmd);
  assert.equal(purchased.stock.physical.tomato,'400');assert.equal(purchased.shopping.calculated.find(r=>r.id===id).count,2);
  const recalculated=evaluateMixedMenu({...c,state:purchased.stock},m,purchased.shopping);
  assert.equal(recalculated.shopping.calculated.find(r=>r.productId==='tomato-pack'&&!r.confirmed).count,1);
  assert.equal(recalculated.basket.shopping.lines.find(r=>r.productId==='tomato-pack').confirmedCount,1);
  assert.deepEqual(confirmShopping({...c,state:purchased.stock},purchased.shopping,cmd).stock,purchased.stock);
});
test('Lot3 checkout cancellation reverses stock and confirmation coherently, protects dependencies and replays safely',()=>{
  const c=context();let s=addShoppingItem(createShopping('s'),{id:'rice',label:'rice',productId:'rice-pack',count:1,checked:true});
  const cmd=prepareShoppingConfirmation(c,s,{eventId:'buy'}),bought=confirmShopping(c,s,cmd);c.state=bought.stock;s=bought.shopping;
  const reserved=applyEvent(c.state,{id:'r',kind:'reserve',reservationId:'other',needs:{rice:'500'}},c);
  assert.throws(()=>cancelShoppingConfirmation({...c,state:reserved},s,{eventId:'bad-undo',targetId:'buy'}),code('INSUFFICIENT_STOCK'));
  const undone=cancelShoppingConfirmation(c,s,{eventId:'undo',targetId:'buy'});
  assert.equal(undone.stock.physical.rice,undefined);assert.equal(undone.shopping.manual[0].confirmed,false);
  const replay=cancelShoppingConfirmation({...c,state:undone.stock},undone.shopping,{eventId:'undo',targetId:'buy'});
  assert.deepEqual(replay.stock,undone.stock);assert.deepEqual(replay.shopping,undone.shopping);
  assert.deepEqual(confirmShopping({...c,state:undone.stock},undone.shopping,cmd).stock,undone.stock);
});
