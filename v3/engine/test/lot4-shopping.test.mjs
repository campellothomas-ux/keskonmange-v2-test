import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMixedMenu,createShopping,addShoppingItem,checkShoppingItem,changeMixedMenu,acceptMixedProposal,
  renderCooking,stockAvailable} from '../src/index.mjs';
import {setup} from './lot4-helpers.mjs';

test('LOT4 — complete five-recipe planning exposes all ingredient needs without any SKU or fabricated price',()=>{
  const {c,m}=setup(),e=evaluateMixedMenu(c,m);
  assert.equal(e.coverage.ingredientQuantitiesComplete,true);assert.deepEqual(e.coverage.unknownNeeds,[]);
  assert.equal(e.shopping.calculated.length,42);assert.equal(Object.keys(e.requirements.needs).length,42);
  assert(e.shopping.calculated.every(r=>r.kind==='ingredient_need'&&!r.productId&&r.label&&r.quantity.unit&&r.commercial.priceCents===null));
  assert.equal(e.basket.amount.totalCents,null);assert.equal(e.basket.amount.knownSubtotalCents,0);
  const n=e.requirements.needs;
  assert.equal(n.i_boeuf_hache_5_mg,'850');assert.equal(n.i_tomates_concassees,'800');assert.equal(n.i_concentre_de_tomate,'2');
  assert.equal(n.i_oignon,'5/2');assert.equal(n.i_huile_d_olive,'7/2');assert.equal(n.i_ail,'7/2');
  assert.equal(n.i_salade_verte,'210');assert.equal(n.i_pates,'350');assert.equal(n.i_gnocchis,'375');
  assert(!e.shopping.calculated.some(r=>r.ingredientId==='i_eau_cuisine'));
  assert(e.basket.shopping.lines.every(l=>l.quantitiesComplete));
  // Reconciliation has stable identities and is idempotent.
  const repeated=evaluateMixedMenu(c,m,e.shopping);assert.deepEqual(repeated.shopping,e.shopping);
});
test('LOT4 — portion change recalculates cooking and shopping together while preserving manual additions and checks',()=>{
  const {c,m}=setup();let s=evaluateMixedMenu(c,m).shopping;
  s=addShoppingItem(s,{id:'manual-soap',label:'Savon',quantity:{amount:'1',unit:'pièce'}});
  s=checkShoppingItem(s,'manual-soap',true);const before=structuredClone({c,m,s});
  const proposal=changeMixedMenu(c,m,s,[{type:'updateMeal',mealId:'meal-3',patch:{diners:3}}]);
  const changed=proposal.menu.meals[3],cooking=renderCooking(c.recipes[3],changed,c.ingredients);
  assert.equal(proposal.evaluation.requirements.individual[3].needs.i_pains_a_burger,'3');
  assert(cooking.steps[2].text.includes('1 ½ c. à soupe'));assert(cooking.steps[1].text.includes('675 g'));
  assert.deepEqual(proposal.shopping.manual,s.manual);assert.deepEqual({c,m,s},before);
  const accepted=acceptMixedProposal(c,m,s,proposal,{eventId:'lot4-local-example'});
  assert.equal(accepted.menu.meals[3].diners,3);assert.deepEqual(accepted.shopping.manual,s.manual);
  assert.deepEqual(accepted.stock.physical,c.state.physical);assert.equal(accepted.shopping.manual[0].checked,true);
});
test('LOT4 — checked ingredient line is protected on changed need; explicit reconciliation updates exact quantities',()=>{
  const {c,m}=setup();let s=evaluateMixedMenu(c,m).shopping;
  const row=s.calculated.find(r=>r.ingredientId==='i_patates_douces');s=checkShoppingItem(s,row.id,true);
  const next=structuredClone(m);next.meals[3].diners=3;
  const blocked=evaluateMixedMenu(c,next,s);assert.equal(blocked.coverage.checkedConflicts.length,1);
  const proposed=changeMixedMenu(c,m,s,[{type:'updateMeal',mealId:'meal-3',patch:{diners:3}}]);
  assert.equal(proposed.evaluation.coverage.checkedConflicts[0].ingredientId,'i_patates_douces');
  assert.equal(blocked.shopping.calculated.find(r=>r.id===row.id).quantity.amount,'450');
  assert.equal(blocked.requirements.needs.i_patates_douces,'675');
  const acknowledged=evaluateMixedMenu(c,next,s,{acknowledgeChecked:true});
  assert.equal(acknowledged.coverage.checkedConflicts.length,0);assert.equal(acknowledged.shopping.calculated.find(r=>r.id===row.id).quantity.amount,'675');
});
test('LOT4 — physical stock and outside reservations are applied once after aggregation; stock-only ingredients are not bought',()=>{
  const {c,m}=setup();c.state.physical={i_oignon:'3',i_pates:'500'};c.state.reservations={other:{i_oignon:'1'}};
  const before=structuredClone(c.state),e=evaluateMixedMenu(c,m);
  const onion=e.shopping.calculated.find(r=>r.ingredientId==='i_oignon');assert.equal(onion.referenceNeed,'5/2');
  assert.equal(onion.fromStock,'2');assert.equal(onion.quantity.amount,'1/2');assert.equal(onion.purchaseQuantity.amount,'1');
  assert(!e.shopping.calculated.some(r=>r.ingredientId==='i_pates'));
  assert.equal(e.ingredientNeeds.find(r=>r.ingredientId==='i_pates').referenceNeed,'350');
  assert.deepEqual(c.state,before);assert.equal(stockAvailable(c.state,c.ingredients).i_oignon,'2');
});
