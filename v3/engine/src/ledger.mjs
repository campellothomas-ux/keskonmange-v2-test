import {Q, integer, positive, requireThat, text} from './exact.mjs';
import {ingredientMap, validateCatalog} from './model.mjs';
import {stockAvailable} from './basket.mjs';

export const emptyStock = () => ({revision:0,physical:{},reservations:{},operations:{}});
export function stableJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJSON).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stableJSON(value[k])).join(',') + '}';
  const s = JSON.stringify(value); requireThat(s !== undefined,'INVALID_EVENT','JSON values required'); return s;
}
function canonicalNeeds(needs, ingredients) {
  requireThat(needs && typeof needs === 'object' && !Array.isArray(needs),'INVALID_EVENT','needs map required');
  const out = {};
  for (const [id,value] of Object.entries(needs)) {
    text(id,'ingredientId'); const i = ingredients.get(id); requireThat(i,'UNKNOWN_INGREDIENT',id);
    const q = positive(value,id,true); requireThat(!i.indivisible || q.d === 1n,'INDIVISIBLE_STOCK',id);
    if (q.cmp(0) > 0) out[id] = q.toString();
  }
  return out;
}

// Pure transaction reducer. Persist event ID before sending to a future Firebase adapter.
export function applyEvent(state, event, {ingredients, products = [], session} = {}) {
  requireThat(state && typeof state === 'object' && state.physical && state.reservations && state.operations,
    'INVALID_STOCK_STATE','use emptyStock() and an atomic stored state');
  const map = ingredientMap(ingredients); text(event?.id,'event.id');
  const fingerprint = stableJSON(event), previous = state.operations?.[event.id];
  if (previous) {
    requireThat(previous.fingerprint === fingerprint,'EVENT_ID_CONFLICT',event.id);
    return structuredClone(state);
  }
  integer(state.revision,'revision',true);
  if (event.expectedRevision !== undefined) {
    integer(event.expectedRevision,'expectedRevision',true);
    requireThat(event.expectedRevision === state.revision,'REVISION_CONFLICT',event.id);
  }
  stockAvailable(state,ingredients);
  const next = structuredClone(state), deltas = {};
  const reservationChanges=[],preparedChanges=[];
  const reservationUsed=id=>Object.values(next.operations).some(op=>
    op.kind==='reserve'&&op.reservationId===id || (op.reservationChanges??[]).some(c=>c.id===id&&c.before===null&&c.after!==null));
  let reservationId = null, before = null, after = null;
  const change = (id,q) => { requireThat(map.has(id),'UNKNOWN_INGREDIENT',id); deltas[id] = Q.of(deltas[id] ?? 0).add(q).toString(); };
  if (event.kind === 'purchase') {
    requireThat(Array.isArray(event.lines),'INVALID_EVENT','purchase lines required');
    const catalog = validateCatalog(products,ingredients,session), byId = new Map(catalog.map(p => [p.id,p]));
    for (const line of event.lines) {
      requireThat(typeof line.checked === 'boolean','INVALID_EVENT','explicit checked flag required');
      if (!line.checked) continue;
      const p = byId.get(line.productId); requireThat(p,'NO_PRODUCT',line.productId);
      integer(line.count,'actual purchased count',true);
      change(p.ingredientId,p.capacity.mul(line.count));
    }
  } else if (['reserve','release','cook'].includes(event.kind)) {
    if (event.reservationId !== undefined) {
      reservationId = text(event.reservationId,'reservationId'); before = next.reservations[reservationId] ?? null;
    }
    if (event.kind === 'reserve') {
      requireThat(reservationId !== null && before === null,'RESERVATION_CONFLICT',event.reservationId);
      requireThat(!reservationUsed(reservationId),
        'RESERVATION_ID_REUSED','use a fresh reservation ID for a new planning intent');
      after = canonicalNeeds(event.needs,map);
    } else if (event.kind === 'release') {
      requireThat(before !== null,'UNKNOWN_RESERVATION',event.reservationId);
    } else {
      const consumed = canonicalNeeds(event.needs,map);
      if (reservationId !== null) requireThat(before !== null,'UNKNOWN_RESERVATION',reservationId);
      // A cook event releases its reservation; actual consumption is explicitly supplied.
      for (const [id,q] of Object.entries(consumed)) change(id,Q.of(0).sub(q));
      if(event.prepared) {
        const p=event.prepared;text(p.id,'prepared.id');text(p.recipeId,'prepared.recipeId');
        const produced=positive(p.producedPortions,'produced portions'),served=positive(p.servedPortions,'served portions');
        const kept=positive(p.keptPortions,'kept portions',true),discarded=positive(p.discardedPortions,'discarded portions',true);
        requireThat(produced.cmp(served.add(kept).add(discarded))===0,'INVALID_PREPARED_YIELD',p.id);
        requireThat(!next.prepared?.[p.id]&&!Object.values(next.operations).some(op=>(op.preparedChanges??[]).some(c=>c.id===p.id)),
          'PREPARED_ID_REUSED',p.id);
        if(kept.cmp(0)>0)preparedChanges.push({id:p.id,before:null,after:{recipeId:p.recipeId,portions:kept.toString(),sourceEventId:event.id}});
      }
    }
  } else if(event.kind==='replan') {
    requireThat(Array.isArray(event.releaseIds)&&new Set(event.releaseIds).size===event.releaseIds.length,'INVALID_EVENT','releaseIds');
    requireThat(event.reservations&&typeof event.reservations==='object'&&!Array.isArray(event.reservations),'INVALID_EVENT','new reservations');
    for(const id of event.releaseIds) {
      text(id,'reservation ID');requireThat(next.reservations[id]!==undefined,'RESERVATION_STALE',id);
      reservationChanges.push({id,before:next.reservations[id],after:null});
    }
    for(const [id,needs]of Object.entries(event.reservations)) {
      text(id,'reservation ID');requireThat(next.reservations[id]===undefined&&!reservationUsed(id),'RESERVATION_ID_REUSED',id);
      reservationChanges.push({id,before:null,after:canonicalNeeds(needs,map)});
    }
  } else if(event.kind==='consume-prepared') {
    text(event.lotId,'prepared lot');const lot=next.prepared?.[event.lotId];requireThat(lot,'UNKNOWN_PREPARED_LOT',event.lotId);
    const left=positive(lot.portions,'prepared portions').sub(positive(event.portions,'consumed portions'));
    requireThat(left.cmp(0)>=0,'INSUFFICIENT_PREPARED_PORTIONS',event.lotId);
    preparedChanges.push({id:event.lotId,before:lot,after:left.cmp(0)===0?null:{...lot,portions:left.toString()}});
  } else if (event.kind === 'cancel') {
    text(event.targetId,'targetId'); const target = next.operations[event.targetId];
    requireThat(target && target.kind !== 'cancel','UNKNOWN_OPERATION',event.targetId);
    requireThat(!target.cancelledBy,'ALREADY_CANCELLED',event.targetId);
    reservationId = target.reservationId; before = target.after; after = target.before;
    if (reservationId !== null) requireThat(stableJSON(next.reservations[reservationId] ?? null) === stableJSON(before),
      'CANCELLATION_CONFLICT','reservation has changed; cancel dependent operations first');
    for (const [id,q] of Object.entries(target.deltas)) change(id,Q.of(0).sub(q));
    for(const c of target.reservationChanges??[])reservationChanges.push({id:c.id,before:c.after,after:c.before});
    for(const c of target.preparedChanges??[])preparedChanges.push({id:c.id,before:c.after,after:c.before});
    target.cancelledBy = event.id;
  } else requireThat(false,'INVALID_EVENT',String(event.kind));
  if (reservationId !== null) {
    if (after === null) delete next.reservations[reservationId]; else next.reservations[reservationId] = after;
  }
  for(const [changes,key]of [[reservationChanges,'reservations'],[preparedChanges,'prepared']])for(const c of changes) {
    requireThat(stableJSON(next[key]?.[c.id]??null)===stableJSON(c.before),'CANCELLATION_CONFLICT',`${key}/${c.id} changed`);
    next[key]??={};if(c.after===null)delete next[key][c.id];else next[key][c.id]=c.after;
  }
  for (const [id,q] of Object.entries(deltas)) {
    next.physical[id] = Q.of(next.physical[id] ?? 0).add(q).toString();
    requireThat(Q.of(next.physical[id]).cmp(0)>=0,'INSUFFICIENT_STOCK',id);
    if (next.physical[id] === '0') delete next.physical[id];
  }
  stockAvailable(next,ingredients); // Reject the entire operation if physical or reserved stock goes negative.
  next.operations[event.id] = {fingerprint,kind:event.kind,deltas,reservationId,before,after};
  if(reservationChanges.length)next.operations[event.id].reservationChanges=reservationChanges;
  if(preparedChanges.length)next.operations[event.id].preparedChanges=preparedChanges;
  next.revision++; integer(next.revision,'revision');
  return next;
}
