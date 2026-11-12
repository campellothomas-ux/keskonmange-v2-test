import {Q,integer,positive,text,unique,requireThat} from './exact.mjs';
import {ingredientMap,validateCatalog} from './model.mjs';
import {priceLines} from './packages.mjs';
import {applyEvent,stableJSON,emptyStock} from './ledger.mjs';
import {safeMixedContext,jsonCopy,missing} from './mixed-core.mjs';

export const createShopping=id=>({version:1,id:text(id,'shopping.id'),revision:0,nextIntent:1,manual:[],calculated:[],archived:[],receipts:{},cancellations:{}});
export function validateShopping(s) {
  requireThat(s?.version===1,'INVALID_SHOPPING','version');text(s.id,'shopping.id');integer(s.revision,'shopping.revision',true);integer(s.nextIntent,'nextIntent');
  for(const key of ['manual','calculated','archived'])requireThat(Array.isArray(s[key]),'INVALID_SHOPPING',key);
  unique([...s.manual,...s.calculated,...s.archived],'shopping intents');
  requireThat(s.receipts&&typeof s.receipts==='object'&&!Array.isArray(s.receipts),'INVALID_SHOPPING','receipts');
  for(const row of [...s.manual,...s.calculated,...s.archived]) {
    text(row.label,'item.label');requireThat(typeof row.checked==='boolean'&&typeof row.confirmed==='boolean','INVALID_SHOPPING','explicit states');
    if(row.productId!==undefined)text(row.productId,'item.productId');
    if(!missing(row.count))integer(row.count,'item.count');
    if(!missing(row.checkoutCount))integer(row.checkoutCount,'checkout count');
    if(row.estimate){requireThat(row.estimate.kind==='estimated'&&row.estimate.currency==='EUR','INVALID_PRICE','free item estimate');integer(row.estimate.totalCents,'estimate.totalCents',true);}
    if(row.quantity&&typeof row.quantity==='object'&&!missing(row.quantity.amount))positive(row.quantity.amount,'manual quantity');
  }
}
export function addShoppingItem(s,item) {
  validateShopping(s);const next=structuredClone(s);text(item?.id,'manual.id');
  const row={...structuredClone(item),source:'manual',checked:item.checked??false,confirmed:false};
  delete row.confirmedEventId;next.manual.push(row);next.revision++;validateShopping(next);return next;
}
export function editShoppingItem(s,id,patch,{acknowledgeChecked=false}={}) {
  validateShopping(s);const next=structuredClone(s),row=[...next.manual,...next.calculated].find(r=>r.id===id);requireThat(row,'UNKNOWN_SHOPPING_ITEM',id);
  requireThat(row.source==='manual','CALCULATED_ITEM_READ_ONLY','change meal requirements or add a separate manual item');
  requireThat(Object.keys(patch).every(k=>['label','quantity','presentation','count','productId','estimate'].includes(k)),'INVALID_ITEM_PATCH',id);
  requireThat(!row.confirmed,'PURCHASED_ITEM_IMMUTABLE','archive it and create a new purchase intent');
  requireThat(!row.checked||acknowledgeChecked,'CHECKED_CHANGE_REQUIRES_ACK',id);
  Object.assign(row,structuredClone(patch));next.revision++;validateShopping(next);return next;
}
export function removeShoppingItem(s,id,{acknowledgeChecked=false}={}) {
  validateShopping(s);const next=structuredClone(s),index=next.manual.findIndex(r=>r.id===id);requireThat(index>=0,'UNKNOWN_SHOPPING_ITEM',id);
  const row=next.manual[index];requireThat(!(row.checked||row.confirmed)||acknowledgeChecked,'CHECKED_CHANGE_REQUIRES_ACK',id);
  next.manual.splice(index,1);next.archived.push(row);next.revision++;return next;
}
export function checkShoppingItem(s,id,checked) {
  validateShopping(s);requireThat(typeof checked==='boolean','INVALID_CHECK_STATE',id);const next=structuredClone(s);
  const row=[...next.manual,...next.calculated].find(r=>r.id===id);requireThat(row,'UNKNOWN_SHOPPING_ITEM',id);
  requireThat(!row.confirmed||checked,'PURCHASED_ITEM_IMMUTABLE','a confirmed purchase requires a separate cancellation');
  row.checked=checked;next.revision++;return next;
}
export function setShoppingPurchaseCount(s,id,count,{acknowledgeChecked=false}={}) {
  validateShopping(s);integer(count,'actual purchased count');const next=structuredClone(s);
  const row=[...next.manual,...next.calculated].find(r=>r.id===id);requireThat(row,'UNKNOWN_SHOPPING_ITEM',id);
  requireThat(!row.confirmed,'PURCHASED_ITEM_IMMUTABLE',id);requireThat(!row.checked||acknowledgeChecked,'CHECKED_CHANGE_REQUIRES_ACK',id);
  row.checkoutCount=count;next.revision++;return next;
}
export function reconcileShopping(s,purchaseLines,{acknowledgeChecked=false}={}) {
  validateShopping(s);const next=structuredClone(s),conflicts=[],desired=new Map();
  for(const l of purchaseLines){integer(l.count,'computed count');requireThat(!desired.has(l.productId),'DUPLICATE_REFERENCE',l.productId);desired.set(l.productId,l);}
  const calculated=[];
  for(const old of next.calculated) {
    if(old.confirmed){calculated.push(old);continue;}
    const target=desired.get(old.productId);desired.delete(old.productId);
    if(old.checked&&(!target||target.count!==old.count)&&!acknowledgeChecked) {
      calculated.push(old);conflicts.push({code:'CHECKED_LINE_CHANGED',intentId:old.id,productId:old.productId,
        previousCount:old.count,requestedCount:target?.count??0});continue;
    }
    if(target)calculated.push({...old,count:target.count});else if(old.checked)next.archived.push(old);
  }
  for(const [id,line]of [...desired].sort(([a],[b])=>a<b?-1:1))calculated.push({id:`calc-${next.id}-${next.nextIntent++}`,
    source:'calculated',label:id,productId:id,count:line.count,checked:false,confirmed:false});
  next.calculated=calculated;
  if(stableJSON({...next,revision:0})!==stableJSON({...s,revision:0}))next.revision++;
  validateShopping(next);return {shopping:next,conflicts,reconciliationRequired:conflicts.length>0};
}
const emptyAmount=()=>({knownSubtotalCents:0,totalCents:0,certainty:'observed_session'});
export function sumAmounts(values) {
  let sum=0n,complete=true,observed=true;
  for(const v of values){integer(v?.knownSubtotalCents,'known subtotal',true);if(v.totalCents!==null)requireThat(v.totalCents===v.knownSubtotalCents,'INVALID_PRICE','amount total');
    sum+=BigInt(v.knownSubtotalCents);complete&&=v.totalCents!==null;observed&&=v.certainty==='observed_session';}
  const n=Number(sum);requireThat(Number.isSafeInteger(n),'RESOURCE_LIMIT','shopping amount');
  return {knownSubtotalCents:n,totalCents:complete?n:null,certainty:!complete?'partial':observed?'observed_session':'estimated'};
}
function pendingPrice(context,rows,{actual=false}={}) {
  const {context:c}=safeMixedContext(context),catalog=validateCatalog(c.products,c.ingredients,c.session),map=ingredientMap(c.ingredients);
  const parts=[],linked=[],untracked=[];
  for(const row of rows) {
    const p=catalog.find(p=>p.id===row.productId);
    const count=actual?(row.checkoutCount??row.count):row.count;
    if(p&&!missing(count))linked.push({productId:p.id,count});
    else {
      const estimate=actual&&row.checkoutCount!==undefined&&row.checkoutCount!==row.count?null:row.estimate;
      parts.push(estimate?{knownSubtotalCents:estimate.totalCents,totalCents:estimate.totalCents,certainty:'estimated'}:
        {knownSubtotalCents:0,totalCents:null,certainty:'partial'});
      untracked.push({intentId:row.id,reason:row.productId?'REFERENCE_OR_COUNT_UNAVAILABLE':'NO_VERIFIED_COMMERCIAL_CONTENT'});
    }
  }
  if(linked.length)parts.push(priceLines(linked,catalog,map,c.session));
  return {amount:parts.length?sumAmounts(parts):emptyAmount(),linked,untracked};
}
export function estimateShopping(context,s) {
  validateShopping(s);const active=[...s.manual,...s.calculated],groups=new Map();
  for(const row of active) {
    const key=row.productId?`sku:${row.productId}`:`intent:${row.id}`;
    if(!groups.has(key))groups.set(key,{id:key,productId:row.productId??null,label:row.label,count:null,origins:[]});
    const g=groups.get(key);g.origins.push(structuredClone(row));
    const count=row.confirmed?(row.checkoutCount??row.count):row.count;
    if(!missing(count)){g.count=(g.count??0)+count;integer(g.count,'merged shopping count');}
  }
  const lines=[...groups.values()].map(g=>({...g,checkedState:g.origins.every(r=>r.checked&&(r.confirmed||r.checkoutCount===undefined||r.checkoutCount>=r.count))?'checked':g.origins.some(r=>r.checked)?'partial':'unchecked',
    quantitiesComplete:g.origins.every(r=>!missing(r.confirmed?(r.checkoutCount??r.count):r.count)),
    confirmedCount:g.origins.filter(r=>r.confirmed).reduce((n,r)=>n+(r.checkoutCount??r.count??0),0)}));
  const pending=pendingPrice(context,active.filter(r=>!r.confirmed)),confirmed=sumAmounts(Object.values(s.receipts).filter(r=>!r.cancelledBy).map(r=>r.amount));
  return {lines,pending:pending.amount,confirmed,total:sumAmounts([pending.amount,confirmed]),untracked:pending.untracked};
}
export function prepareShoppingConfirmation(context,s,{eventId,intentIds}={}) {
  validateShopping(s);text(eventId,'eventId');const all=[...s.manual,...s.calculated];
  const rows=intentIds?intentIds.map(id=>{const r=all.find(r=>r.id===id);requireThat(r,'UNKNOWN_SHOPPING_ITEM',id);return r;}):all.filter(r=>r.checked&&!r.confirmed);
  requireThat(rows.every(r=>r.checked&&!r.confirmed),'INVALID_PURCHASE_INTENT','only unconfirmed checked intents');
  requireThat(new Set(rows.map(r=>r.id)).size===rows.length,'DUPLICATE_ID','purchase intents');
  const price=pendingPrice(context,rows,{actual:true}),snapshots=jsonCopy(rows),{context:c}=safeMixedContext(context);
  const catalogBasis=stableJSON(jsonCopy({products:c.products,ingredients:c.ingredients,session:c.session}));
  const event={id:eventId,kind:'purchase',lines:price.linked.map(l=>({...l,checked:true})),
    shoppingIntent:{shoppingId:s.id,rows:snapshots,amount:price.amount,untracked:price.untracked,catalogBasis}};
  return {version:1,event,shoppingId:s.id,intentIds:rows.map(r=>r.id),amount:price.amount,untracked:price.untracked};
}
export function confirmShopping(context,s,command) {
  validateShopping(s);requireThat(command?.version===1&&command.shoppingId===s.id,'INVALID_PURCHASE_COMMAND','shopping');
  const state=context.state??emptyStock(),event=command.event; text(event?.id,'purchase.event.id');const previous=s.receipts[event.id];
  requireThat(event?.shoppingIntent?.shoppingId===s.id,'INVALID_PURCHASE_COMMAND','event shopping');
  if(previous) {
    requireThat(previous.fingerprint===stableJSON(event),'EVENT_ID_CONFLICT',event.id);
    return {shopping:structuredClone(s),stock:applyEvent(state,event,context),replayed:true,untracked:previous.untracked};
  }
  requireThat(!state.operations[event.id],'PURCHASE_RECEIPT_MISSING','stock and shopping must be saved atomically');
  const rows=[...s.manual,...s.calculated];
  for(const snapshot of event.shoppingIntent.rows) {
    const row=rows.find(r=>r.id===snapshot.id);requireThat(row&&stableJSON(row)===stableJSON(snapshot),'PURCHASE_INTENT_STALE',snapshot.id);
  }
  const rebuilt=prepareShoppingConfirmation(context,s,{eventId:event.id,intentIds:event.shoppingIntent.rows.map(r=>r.id)});
  requireThat(stableJSON(rebuilt.event)===stableJSON(event),'PURCHASE_INTENT_STALE','catalog or intent changed');
  const {context:c}=safeMixedContext(context),stock=applyEvent(state,event,c),next=structuredClone(s);
  requireThat(stableJSON(command.intentIds)===stableJSON(rebuilt.intentIds),'INVALID_PURCHASE_COMMAND','intentIds changed');
  for(const row of [...next.manual,...next.calculated])if(rebuilt.intentIds.includes(row.id)){row.confirmed=true;row.confirmedEventId=event.id;}
  next.receipts[event.id]={fingerprint:stableJSON(event),amount:rebuilt.amount,untracked:rebuilt.untracked,intentIds:rebuilt.intentIds};next.revision++;
  return {shopping:next,stock,replayed:false,untracked:rebuilt.untracked};
}
export function cancelShoppingConfirmation(context,s,{eventId,targetId}) {
  validateShopping(s);text(eventId,'cancellation ID');text(targetId,'purchase ID');
  const receipt=s.receipts[targetId];requireThat(receipt,'UNKNOWN_SHOPPING_RECEIPT',targetId);
  const event={id:eventId,kind:'cancel',targetId,shoppingCancellation:{shoppingId:s.id,intentIds:receipt.intentIds}},state=context.state??emptyStock();
  if(s.cancellations?.[eventId])return {shopping:structuredClone(s),stock:applyEvent(state,event,context),replayed:true};
  requireThat(!receipt.cancelledBy,'ALREADY_CANCELLED',targetId);
  requireThat(!state.operations[eventId],'PURCHASE_RECEIPT_MISSING','stock and shopping must be saved atomically');
  const rows=[...s.manual,...s.calculated,...s.archived];
  for(const id of receipt.intentIds)requireThat(rows.some(r=>r.id===id&&r.confirmedEventId===targetId&&r.confirmed),'SHOPPING_CANCELLATION_CONFLICT',id);
  const stock=applyEvent(state,event,context),next=structuredClone(s);
  for(const r of [...next.manual,...next.calculated,...next.archived])if(receipt.intentIds.includes(r.id)){r.confirmed=false;delete r.confirmedEventId;}
  next.receipts[targetId].cancelledBy=eventId;next.cancellations??={};next.cancellations[eventId]={targetId};next.revision++;
  return {shopping:next,stock,replayed:false};
}
