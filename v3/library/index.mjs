import data from './data/library-v3.json' with {type:'json'};
export const library=data;
export const searchKey=s=>String(s).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('fr').replace(/œ/g,'oe');
export function findRecipes({query='',filter='tous'}={}) {
  const words=searchKey(query).trim().split(/\s+/).filter(Boolean);
  return library.recipes.filter(r=>(filter==='tous'||r.library.tags.includes(filter))&&
    words.every(word=>searchKey([r.name,...r.ingredients.map(g=>library.ingredients.find(i=>i.id===g.ingredientId)?.name??'')].join(' ')).includes(word)));
}
