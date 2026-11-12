import {readFileSync} from 'node:fs';
export const context=()=>JSON.parse(readFileSync(new URL('../fixtures/lot2.json',import.meta.url),'utf8'));
export const fiveMeals=()=>Array.from({length:5},(_,k)=>({id:`meal-${k+1}`,recipeId:`r${k}`,diners:2,leftovers:'keep'}));
export const menu=()=>({version:2,id:'family-menu',revision:0,meals:fiveMeals(),reservationIds:{}});
export const code=c=>e=>e.code===c;
