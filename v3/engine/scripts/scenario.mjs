import {readFile} from 'node:fs/promises';
import {optimizeMenus,applyEvent,calculateRequirements,EngineError} from '../src/index.mjs';

try {
  const path = process.argv[2] ?? new URL('../fixtures/scenario.json',import.meta.url);
  const input = JSON.parse(await readFile(path,'utf8'));
  const optimization = optimizeMenus(input);
  const lifecycle = [];
  if (optimization.solution) {
    let state = structuredClone(input.state ?? {revision:0,physical:{},reservations:{},operations:{}});
    const lines = optimization.solution.basket.cart.lines.map(l => ({productId:l.productId,count:l.count,checked:false}));
    const partial = {id:'scenario-purchase-partial',kind:'purchase',lines:lines.map((l,k) => ({...l,checked:k<2}))};
    state = applyEvent(state,partial,input);
    lifecycle.push({step:'only_first_two_lines_purchased',physical:state.physical});
    const repeated = applyEvent(state,partial,input);
    lifecycle.push({step:'same_purchase_replayed',idempotent:JSON.stringify(state)===JSON.stringify(repeated)});
    const rest = {id:'scenario-purchase-rest',kind:'purchase',lines:lines.map((l,k) => ({...l,checked:k>=2}))};
    state = applyEvent(state,rest,input);
    for (const m of optimization.solution.meals) {
      const needs = calculateRequirements(input.recipes,[m],input.ingredients).needs;
      state = applyEvent(state,{id:`reserve-${m.id}`,kind:'reserve',reservationId:m.id,needs},input);
    }
    lifecycle.push({step:'all_meals_reserved',physical:state.physical,reservations:state.reservations});
    const m = optimization.solution.meals[0], needs = calculateRequirements(input.recipes,[m],input.ingredients).needs;
    const cook = {id:`cook-${m.id}`,kind:'cook',reservationId:m.id,needs};
    state = applyEvent(state,cook,input);
    lifecycle.push({step:'first_meal_cooked',physical:state.physical,reservations:state.reservations});
    lifecycle.push({step:'cook_replayed',idempotent:JSON.stringify(state)===JSON.stringify(applyEvent(state,cook,input))});
    state = applyEvent(state,{id:'undo-cook',kind:'cancel',targetId:cook.id},input);
    lifecycle.push({step:'cook_cancelled',physical:state.physical,reservations:state.reservations});
  }
  console.log(JSON.stringify({notice:input.notice,source:input.source,optimization,lifecycle},null,2));
} catch (e) {
  console.log(JSON.stringify({status:'error',code:e instanceof EngineError ? e.code : 'INVALID_SCENARIO',detail:e.message},null,2));
  process.exitCode=1;
}
