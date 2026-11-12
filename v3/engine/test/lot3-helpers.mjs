import {context as lot2Context,menu as lot2Menu} from './lot2-helpers.mjs';
export const context=()=>{
  const c=lot2Context();
  c.ingredients.push({id:'chicken-unknown',unit:'g',basis:'net',perishable:true,allergens:[]});
  c.recipes.push({id:'partial',name:'Synthetic partial recipe',family:'partial',yieldPortions:4,production:structuredClone(c.recipes[0].production),ingredients:[
    {ingredientId:'rice',quantity:{amount:'400',unit:'g',basis:'net'},quantityVerified:true},
    {ingredientId:'chicken-unknown',quantity:{amount:null,unit:'g',basis:'net'},quantityVerified:false}]});
  c.recipes.push({id:'manual',name:'Unreviewed synthetic manual meal',manual:true,ingredients:[]});
  return c;
};
export const mixedMenu=()=>{
  const m=lot2Menu();m.meals[3].recipeId='partial';m.meals[4]={...m.meals[4],recipeId:'manual',selection:'manual'};return m;
};
export {code} from './lot2-helpers.mjs';
