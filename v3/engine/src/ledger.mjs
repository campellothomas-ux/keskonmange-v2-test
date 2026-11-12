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
      requireThat(!Object.values(next.operations).some(op => op.kind === 'reserve' && op.reservationId === reservationId),
        'RESERVATION_ID_REUSED','use a fresh reservation ID for a new planning intent');
      after = canonicalNeeds(event.needs,map);
    } else if (event.kind === 'release') {
      requireThat(before !== null,'UNKNOWN_RESERVATION',event.reservationId);
    } else {
      const consumed = canonicalNeeds(event.needs,map);
      if (reservationId !== null) requireThat(before !== null,'UNKNOWN_RESERVATION',reservationId);
      // A cook event releases its reservation; actual consumption is explicitly supplied.
      for (const [id,q] of Object.entries(consumed)) change(id,Q.of(0).sub(q));
    }
  } else if (event.kind === 'cancel') {
    text(event.targetId,'targetId'); const target = next.operations[event.targetId];
    requireThat(target && target.kind !== 'cancel','UNKNOWN_OPERATION',event.targetId);
    requireThat(!target.cancelledBy,'ALREADY_CANCELLED',event.targetId);
    reservationId = target.reservationId; before = target.after; after = target.before;
    if (reservationId !== null) requireThat(stableJSON(next.reservations[reservationId] ?? null) === stableJSON(before),
      'CANCELLATION_CONFLICT','reservation has changed; cancel dependent operations first');
    for (const [id,q] of Object.entries(target.deltas)) change(id,Q.of(0).sub(q));
    target.cancelledBy = event.id;
  } else requireThat(false,'INVALID_EVENT',String(event.kind));
  if (reservationId !== null) {
    if (after === null) delete next.reservations[reservationId]; else next.reservations[reservationId] = after;
  }
  for (const [id,q] of Object.entries(deltas)) {
    next.physical[id] = Q.of(next.physical[id] ?? 0).add(q).toString();
    if (next.physical[id] === '0') delete next.physical[id];
  }
  stockAvailable(next,ingredients); // Reject the entire operation if physical or reserved stock goes negative.
  next.operations[event.id] = {fingerprint,kind:event.kind,deltas,reservationId,before,after};
  next.revision++; integer(next.revision,'revision');
  return next;
}
