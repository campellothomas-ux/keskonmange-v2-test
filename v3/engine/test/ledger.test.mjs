import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,emptyStock,applyEvent,stockAvailable} from '../src/index.mjs';
import {ingredient,product,session} from './helpers.mjs';
const code = c => e => e.code === c;
const context = {ingredients:[ingredient()],products:[0,1,2,3,4].map(k => product(`p${k}`,100*(k+1),100)),session};
const bought = (id='buy',lines=[{productId:'p0',count:5,checked:true}]) => ({id,kind:'purchase',lines});
const apply = (s,e) => applyEvent(s,e,context);

test('F — of five refs only two checked enter stock; none checked adds nothing', () => {
  const lines = context.products.map((p,k) => ({productId:p.id,count:1,checked:k===1 || k===4}));
  const state = emptyStock(), s = apply(state,bought('partial',lines));
  assert.deepEqual(state,emptyStock()); assert.equal(s.physical.tomato,'700');
  const zero = apply(emptyStock(),bought('none',lines.map(l => ({...l,checked:false}))));
  assert.deepEqual(zero.physical,{});
});
test('G — same purchase intent is idempotent; reused ID with another payload is refused', () => {
  const event = bought(), s = apply(emptyStock(),event);
  assert.deepEqual(apply(s,event),s);
  assert.throws(() => apply(s,bought('buy',[{productId:'p1',count:1,checked:true}])),code('EVENT_ID_CONFLICT'));
});
test('planning reserves physical stock without consuming it or reserving it twice', () => {
  const s = apply(emptyStock(),bought());
  const reserved = apply(s,{id:'reserve',kind:'reserve',reservationId:'menu',needs:{tomato:'300'}});
  assert.equal(reserved.physical.tomato,'500'); assert.equal(stockAvailable(reserved,context.ingredients).tomato,'200');
  assert.throws(() => apply(reserved,{id:'other',kind:'reserve',reservationId:'menu2',needs:{tomato:'201'}}),code('INSUFFICIENT_STOCK'));
  assert.throws(() => apply(reserved,{id:'collision',kind:'reserve',reservationId:'menu',needs:{tomato:'100'}}),code('RESERVATION_CONFLICT'));
  const released = apply(reserved,{id:'release',kind:'release',reservationId:'menu'});
  assert.equal(stockAvailable(released,context.ingredients).tomato,'500');
});
test('H — cook actual quantity once, cancel restores physical stock and original reservation', () => {
  let s = apply(emptyStock(),bought());
  s = apply(s,{id:'r',kind:'reserve',reservationId:'m',needs:{tomato:'300'}});
  const cook = {id:'cook',kind:'cook',reservationId:'m',needs:{tomato:'280'}};
  const cooked = apply(s,cook);
  assert.equal(cooked.physical.tomato,'220'); assert.deepEqual(cooked.reservations,{});
  assert.deepEqual(apply(cooked,cook),cooked);
  assert.throws(() => apply(cooked,{...cook,id:'different-cook'}),code('UNKNOWN_RESERVATION'));
  const undo = {id:'undo',kind:'cancel',targetId:'cook'}, undone = apply(cooked,undo);
  assert.deepEqual(undone.physical,s.physical); assert.deepEqual(undone.reservations,s.reservations);
  assert.deepEqual(apply(undone,undo),undone);
  assert.throws(() => apply(undone,{...undo,id:'undo-twice'}),code('ALREADY_CANCELLED'));
});
test('cancelling purchase or reservation refuses dependent stock conflicts atomically', () => {
  const s = apply(emptyStock(),bought());
  const reserved = apply(s,{id:'r',kind:'reserve',reservationId:'m',needs:{tomato:'300'}});
  const snapshot = structuredClone(reserved);
  assert.throws(() => apply(reserved,{id:'undo-buy',kind:'cancel',targetId:'buy'}),code('INSUFFICIENT_STOCK'));
  assert.deepEqual(reserved,snapshot);
  const cooked = apply(reserved,{id:'cook',kind:'cook',reservationId:'m',needs:{tomato:'300'}});
  assert.throws(() => apply(cooked,{id:'undo-reserve',kind:'cancel',targetId:'r'}),code('CANCELLATION_CONFLICT'));
  const noStock = apply(s,{id:'undo',kind:'cancel',targetId:'buy'});
  assert.deepEqual(noStock.physical,{});
});
test('concurrent intents re-evaluated on latest snapshot detect insufficient stock and revision conflicts', () => {
  const s = apply(emptyStock(),bought());
  const e1 = {id:'device1',kind:'reserve',reservationId:'d1',needs:{tomato:'350'}};
  const e2 = {id:'device2',kind:'reserve',reservationId:'d2',needs:{tomato:'350'}};
  const next = apply(s,e1);
  assert.throws(() => apply(next,e2),code('INSUFFICIENT_STOCK'));
  assert.throws(() => apply(next,{...e2,expectedRevision:s.revision}),code('REVISION_CONFLICT'));
  assert.deepEqual(apply(next,e1),next);
});
test('a released reservation ID cannot be reused and mistaken for an old cancellation target', () => {
  const initial = apply(emptyStock(),bought());
  const reserved = apply(initial,{id:'r',kind:'reserve',reservationId:'menu',needs:{tomato:'100'}});
  const released = apply(reserved,{id:'release',kind:'release',reservationId:'menu'});
  assert.throws(() => apply(released,{id:'new-r',kind:'reserve',reservationId:'menu',needs:{tomato:'100'}}),code('RESERVATION_ID_REUSED'));
  assert.throws(() => apply(released,{id:'undo-r',kind:'cancel',targetId:'r'}),code('CANCELLATION_CONFLICT'));
});
test('physical consumption cannot take other menus reservations; invalid purchases never mutate', () => {
  const s = apply(apply(emptyStock(),bought()),{id:'r',kind:'reserve',reservationId:'m',needs:{tomato:'400'}});
  assert.throws(() => apply(s,{id:'cook',kind:'cook',needs:{tomato:'101'}}),code('INSUFFICIENT_STOCK'));
  assert.throws(() => apply(s,bought('bad',[{productId:'p0',count:-1,checked:true}])),code('INVALID_INTEGER'));
  assert.throws(() => apply(s,bought('bad',[{productId:'p0',count:1}])),code('INVALID_EVENT'));
});
test('properties — 150 seeded purchase/cook/cancel histories conserve exact stock and replay safely', () => {
  let s = emptyStock(), seed = 9;
  for (let k=0;k<150;k++) {
    seed = (Math.imul(seed,1103515245)+12345)>>>0;
    const count = 1+seed%8;
    const buy = bought(`buy-${k}`,[{productId:'p0',count,checked:true}]);
    const before = Q.of(s.physical.tomato ?? 0);
    s = apply(s,buy); assert.equal(s.physical.tomato,before.add(count*100).toString());
    assert.deepEqual(apply(s,buy),s);
    const needs = {tomato:String(count*100-1)}, cook = {id:`cook-${k}`,kind:'cook',needs};
    s = apply(s,cook); assert.equal(s.physical.tomato,before.add(1).toString());
    s = apply(s,{id:`undo-cook-${k}`,kind:'cancel',targetId:cook.id});
    s = apply(s,{id:`undo-buy-${k}`,kind:'cancel',targetId:buy.id});
    assert.equal(Q.of(s.physical.tomato ?? 0).toString(),before.toString());
  }
});
