import {emptyStock,Q} from '../src/index.mjs';
// Same synthetic case builder used by the lot 2 and lot 3 comparisons.
export function makeBenchmarkCase(fixture,count,meals) {
  const context=structuredClone(fixture);context.recipes=[];
  for(let k=0;k<count;k++) {
    const r=structuredClone(fixture.recipes[k%9]);r.id=`bench-${String(k).padStart(3,'0')}`;r.name=`Synthetic benchmark recipe ${k}`;r.family=`family-${k%8}`;
    for(const g of r.ingredients)if(g.quantity.unit==='g')g.quantity.amount=String(Number(g.quantity.amount)+(k%7)*20);
    context.recipes.push(r);
  }
  for(const p of [...context.products])context.products.push({...structuredClone(p),id:p.id+'-large',
    content:{...p.content,amount:Q.of(p.content.amount).mul(2).toString()},price:{...p.price,cents:Math.floor(p.price.cents*1.7)}});
  context.state={...emptyStock(),physical:{tomato:'500',rice:'300',egg:'6'},reservations:{outside:{tomato:'50'}}};
  context.constraints={maxRepeats:1,minDistinct:meals,maxPerFamily:Math.ceil(meals/4)};
  context.policy={wasteRateCents:{tomato:'1/10',rice:'1/100',egg:'10'},perishableStockRateCents:{tomato:'1/100',egg:'1'},
    familyRepeatPenaltyCents:50,historyRecipeIds:context.recipes.slice(0,3).map(r=>r.id),historyPenaltyCents:20};
  const slots=Array.from({length:meals},(_,k)=>({id:`meal-${k}`,diners:2+k%3,leftovers:'keep'}));
  return {context,slots};
}
