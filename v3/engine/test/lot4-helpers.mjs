import {readFileSync} from 'node:fs';
import {initialMenu,emptyStock} from '../src/index.mjs';
export const pilots=()=>JSON.parse(readFileSync(new URL('../fixtures/pilot-v3.json',import.meta.url),'utf8'));
export const source=()=>JSON.parse(readFileSync(new URL('../fixtures/pilot-source-review.json',import.meta.url),'utf8'));
export function setup(diners=[4,3,3,2,2]) {
  const f=pilots(),c={ingredients:f.ingredients,recipes:f.recipes,products:[],state:emptyStock(),
    session:{storeId:'offline-no-catalog',asOf:'2026-11-13'}};
  const m=initialMenu('five-pilots');
  m.meals=f.recipes.map((r,k)=>({id:`meal-${k}`,recipeId:r.id,diners:diners[k],leftovers:'discard'}));
  return {f,c,m};
}
export const code=c=>e=>e.code===c;
