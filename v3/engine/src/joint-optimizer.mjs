import {Q,integer,requireThat,EngineError,unique} from './exact.mjs';
import {validateCatalog} from './model.mjs';
import {stockAvailable} from './basket.mjs';
import {productionRequirements,stepProduction,automaticProductionAllowed} from './production.mjs';
import {initialMenu,evaluateMenu,validateContext,projectedStock,checkRecipeConstraints,assertLocks} from './menu-evaluation.mjs';
import {mealForReplacement} from './menu-proposals.mjs';

const hardFailures=new Set(['DIET_EXCLUSION','ALLERGY_EXCLUSION','REPEAT_CONSTRAINT','VARIETY_CONSTRAINT','FAMILY_CONSTRAINT',
  'BUDGET_EXCEEDED','INSUFFICIENT_PORTIONS','PRODUCTION_LIMIT','PRODUCTION_STEP_INVALID','LOCKED_PRODUCTION','AUTOMATIC_SURPLUS_NOT_ALLOWED']);
export function optimizeMenuJoint(context,{slots,baseMenu=initialMenu('candidate'),strategy='diverse',maxEvaluations=500,
  seedCount=6,allowProductionAdjustments=false,productionExtraSteps=1,maxNodes=maxEvaluations*1000,onProgress,evaluateCandidate}={}) {
  validateContext(context);unique(slots,'slots');requireThat(slots.length>0&&slots.length<=30,'INVALID_MEAL_COUNT','1..30');
  requireThat(['exhaustive','local','diverse'].includes(strategy),'INVALID_STRATEGY',strategy);
  integer(maxEvaluations,'maxEvaluations');integer(seedCount,'seedCount');integer(productionExtraSteps,'productionExtraSteps',true);
  integer(maxNodes,'maxNodes');
  requireThat(seedCount<=100&&productionExtraSteps<=20,'RESOURCE_LIMIT','search settings');
  const catalog=validateCatalog(context.products,context.ingredients,context.session);
  const free=stockAvailable(projectedStock(context,baseMenu),context.ingredients),constraints=context.constraints??{};
  const rejected=[],failures={},options=[];
  const recipes=[...context.recipes].sort((a,b)=>a.id<b.id?-1:1);
  for(const slot of slots) {
    const choices=[];
    for(const r of recipes) {
      if((slot.locks?.recipe||slot.status==='cooked')&&slot.recipeId!==r.id)continue;
      try {
        checkRecipeConstraints(context,r);
        const m=slot.recipeId===r.id?structuredClone(slot):slot.recipeId?mealForReplacement(context,slot,r):{...structuredClone(slot),recipeId:r.id};
        const variants=[m];
        if(allowProductionAdjustments&&r.automaticPolicy?.allowExtraProduction!==false&&!m.locks?.production&&m.status!=='cooked')for(let k=0;k<productionExtraSteps;k++) {
          try {variants.push(stepProduction(r,variants.at(-1),1));}catch(e){if(!(e instanceof EngineError))throw e;break;}
        }
        for(const meal of variants) {
          requireThat(automaticProductionAllowed(r,meal),'AUTOMATIC_SURPLUS_NOT_ALLOWED',r.id);
          const requirements=productionRequirements([r],[meal],context.ingredients);
          let bound=Q.of(0);
          for(const [id,q]of Object.entries(requirements.needs)) {
            const needed=Q.of(q).sub(free[id]??0),prices=catalog.filter(p=>p.ingredientId===id&&p.mode==='fixed'&&p.price.cents!==null)
              .map(p=>Q.of(p.price.cents).div(p.capacity)).sort((a,b)=>a.cmp(b));
            if(needed.cmp(0)>0&&prices.length)bound=bound.add(needed.mul(prices[0]));
          }
          choices.push({meal,bound:bound.toString(),family:r.family});
        }
      } catch(e) {if(!(e instanceof EngineError))throw e;rejected.push({mealId:slot.id,recipeId:r.id,code:e.code});}
    }
    choices.sort((a,b)=>Q.of(a.bound).cmp(b.bound)||(a.meal.recipeId<b.meal.recipeId?-1:a.meal.recipeId>b.meal.recipeId?1:0));
    options.push(choices);
  }
  const seen=new Set(),progress=[];let evaluated=0,feasible=0,best=null,limited=false,nodes=0;
  const fits=(chosen,choice)=>chosen.filter(x=>x.recipeId===choice.meal.recipeId).length<(constraints.maxRepeats??1)&&
    (constraints.maxPerFamily===undefined||chosen.filter(x=>context.recipes.find(r=>r.id===x.recipeId)?.family===choice.family).length<constraints.maxPerFamily);
  function evaluate(meals,cause) {
    const key=JSON.stringify(meals);if(seen.has(key))return null;
    if(evaluated>=maxEvaluations){limited=true;return null;}seen.add(key);evaluated++;
    try {
      const menu={...structuredClone(baseMenu),meals:structuredClone(meals)};assertLocks(baseMenu,menu,context.recipes);
      // Optional integration boundary: price a complete household basket (including
      // unreferenced/manual lines) while retaining this global search algorithm.
      const evaluation=evaluateCandidate?evaluateCandidate(context,menu,{stockMenu:baseMenu}):evaluateMenu(context,menu,{stockMenu:baseMenu});feasible++;
      const candidate={menu,evaluation},incomplete=evaluation.basket.cart.totalCents===null;
      if(!best||Number(incomplete)<Number(best.evaluation.basket.cart.totalCents===null)||
        incomplete===(best.evaluation.basket.cart.totalCents===null)&&Q.of(evaluation.score).cmp(best.evaluation.score)<0) {
        best=candidate;const row={evaluated,score:evaluation.score,totalCents:evaluation.basket.cart.totalCents,cause};progress.push(row);
        if(onProgress)onProgress(structuredClone(row));
      }
      return candidate;
    }catch(e){if(!(e instanceof EngineError))throw e;failures[e.code]=(failures[e.code]??0)+1;return null;}
  }
  if(strategy==='exhaustive') {
    const chosen=[];
    function visit(k) {
      if(++nodes>maxNodes){limited=true;return;}
      if(k===slots.length){evaluate(chosen,'exhaustive');return;}
      for(const choice of options[k]) {
        if(limited)break;if(!fits(chosen,choice))continue;
        chosen.push(choice.meal);visit(k+1);chosen.pop();
      }
    }
    visit(0);
  }else {
    const seeds=strategy==='local'?1:seedCount;
    for(let seed=0;seed<seeds&&!limited;seed++) {
      const meals=new Array(slots.length),chosen=[];let failed=false;
      const order=slots.map((_,k)=>k).sort((a,b)=>Number(!!slots[b].locks?.recipe)-Number(!!slots[a].locks?.recipe)||a-b);
      for(const k of order) {
        const choices=options[k],offset=choices.length?(seed*(k+1))%choices.length:0;
        const rotated=[...choices.slice(offset),...choices.slice(0,offset)];
        const choice=rotated.find(c=>fits(chosen,c));
        if(!choice){failed=true;break;}meals[k]=choice.meal;chosen.push(choice.meal);
      }
      if(!failed)evaluate(meals,`seed-${seed}`);
    }
    // Coordinate descent on complete feasible menus: every move prices the full basket.
    let improve=true;
    while(best&&improve&&!limited) {
      const startScore=best.evaluation.score,incumbent=structuredClone(best.menu.meals);
      for(let k=0;k<slots.length&&!limited;k++)for(const choice of options[k]) {
        const rest=incumbent.filter((_,j)=>j!==k);if(!fits(rest,choice))continue;
        const candidate=[...incumbent];candidate[k]=choice.meal;evaluate(candidate,'local-replacement');
        if(limited)break;
      }
      improve=Q.of(best.evaluation.score).cmp(startScore)<0;
    }
  }
  const missing=rejected.some(r=>!hardFailures.has(r.code))||Object.keys(failures).some(c=>!hardFailures.has(c));
  const optimal=!evaluateCandidate&&strategy==='exhaustive'&&!limited&&!missing&&!!best?.evaluation.basket.packageOptimal;
  return {status:best?best.evaluation.basket.cart.totalCents===null?'needs_prices':'feasible':
    missing?'needs_data':options.some(o=>!o.length)?'infeasible':strategy!=='exhaustive'||limited?'search_limit':'infeasible',solution:best,
    search:{strategy,evaluated,feasible,nodes,maxNodes,limited,optimal,quality:optimal?'proven_optimal':best?evaluated>1?'best_found':'feasible':'no_solution',
      rejected,failures,progress,scope:'joint menu, permitted production choices and cost/surplus pack frontiers; provided price data',
      heuristicOrdering:'continuous lower price relaxation for ordering only; never a physical quantity or an optimality certificate'}};
}
