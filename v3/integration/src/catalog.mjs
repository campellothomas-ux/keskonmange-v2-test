import original from '../data/original-v1.json' with {type:'json'};
import library from '../../library/data/library-v3.json' with {type:'json'};
import {RAYONS} from '../../../core.mjs';
import {Q} from '../../engine/src/exact.mjs';
import {renderCooking} from '../../engine/src/cooking.mjs';
import {norm} from './prices.mjs';

export const number = value => {const q=Q.of(value);return Number(q.n)/Number(q.d);};
export const ingredients = structuredClone(library.ingredients);
export const ingredientById = new Map(ingredients.map(i=>[i.id,i]));
export const engineRecipes = structuredClone(library.recipes).map(r=>({...r,family:r.library.category,
  minutes:r.library.minutes,category:r.library.category,verifiedDietTags:[]}));
export const engineById = new Map(engineRecipes.map(r=>[r.id,r]));
export function equipmentNeeded(recipe) {
  const text=norm([recipe.name,...recipe.cookingSteps.flatMap(s=>s.parts.filter(p=>typeof p==='string'))].join(' ')),needed=[];
  if(/\b(?:four|enfourner)\b/.test(text))needed.push('four');
  if(/\bair\s?fryer\b/.test(text))needed.push('airfryer');
  if(/\b(?:poele|sauteuse)\b/.test(text))needed.push('poêle','plaques');
  if(/\b(?:casserole|marmite|faitout)\b/.test(text))needed.push('casserole','plaques');
  if(/\b(?:mixeur|mixer|blender)\b/.test(text))needed.push('mixeur');
  return [...new Set(needed)];
}
export const originals = original;
export const unitLabel = i => i.unit==='unit' ? (i.countKind?.startsWith('piece:')?'pièce':i.countKind?.startsWith('slice:')?'tranche':i.countKind?.startsWith('clove:')?'gousse':i.countKind?.split(':').at(-1)||'unité') : i.unit;
const rayon = n => RAYONS[n]?.[0]||'a_classer';
const legacyMap = new Map();

export function ingredientFor(name,unit='g') {
  const candidates=ingredients.filter(i=>norm(i.name)===norm(name)&&
    (['g','kg'].includes(unit)?i.unit==='g':['ml','cl','l'].includes(unit)?i.unit==='ml':i.unit==='unit'&&norm(unitLabel(i))===norm(unit)));
  return candidates.length===1?candidates[0]:null;
}
export const uiRecipes=Object.entries(original).map(([id,r])=>{
  const strict=engineById.get(id);
  let rows,steps,portions;
  if(strict) {
    portions=number(Q.of(strict.production.referenceUnits).mul(strict.production.portionsPerUnit));
    rows=strict.ingredients.map((g,index)=>{
      const i=ingredientById.get(g.ingredientId),source=r.ingredients[g.trace?.sourceIngredientIndex??index];
      return {nom:i.name,quantite:number(g.quantity.amount),unite:unitLabel(i),ingredientId:i.id,meta:{rayon:rayon(source?.rayon),familles:[],alias:[]}};
    });
    const cooking=renderCooking(strict,{id:'reference',recipeId:id,diners:portions,leftovers:'keep'},ingredients);
    steps=cooking.steps.map(s=>s.text);
  }else {
    portions=Number(r.personnes)||2;steps=r.etapes;
    rows=r.ingredients.map((g,index)=>{
      const unit=norm(g.unite)==='piece'?'pièce':g.unite,known=ingredientFor(g.nom,unit);
      const iid=known?.id||`legacy-${Object.keys(original).indexOf(id)}-${index}`;
      if(!known)legacyMap.set(iid,{id:iid,name:g.nom,unit:['g','kg'].includes(unit)?'g':['ml','cl','l'].includes(unit)?'ml':'unit',basis:'net',
        ...( ['g','kg','ml','cl','l'].includes(unit)?{}:{countKind:`legacy:${unit}`,culinary:{singular:g.nom,plural:g.nom}}),legacyUnit:unit});
      return {nom:g.nom,quantite:g.qte,unite:unit,ingredientId:iid,meta:{rayon:rayon(g.rayon),familles:[],alias:[]}};
    });
  }
  return {id,nom:r.nom,portions,tempsMinutes:r.temps,ingredients:rows,etapes:steps,
    tags:strict?.library.tags??[],difficulte:'facile',effort:{manipulations:null,vaisselle:null,coordination:null},
    saisonnalite:{mode:'auto',ingredientsPrincipaux:[]},image:null};
});
export const allIngredients=[...ingredients,...legacyMap.values()];
export const allIngredientById=new Map(allIngredients.map(i=>[i.id,i]));
export const uiById=new Map(uiRecipes.map(r=>[r.id,r]));
export const fingerprints=new Map(uiRecipes.map(r=>[r.id,JSON.stringify(r)]));
export function qualifiedRecipe(state,id) {
  const r=state.recipes.find(r=>r.id===id),base=uiById.get(id);
  if(!r||!base||!engineById.has(id))return null;
  const relevant=x=>JSON.stringify([x.nom,x.portions,x.ingredients,x.etapes]);
  return relevant(r)===relevant(base)?engineById.get(id):null;
}
export const pilotCategories={
  i_pommes_de_terre:'en:potatoes',i_carottes:'en:carrots',i_oignon:'en:onions',i_bananes:'en:bananas',
};
