// KeskonMange V2 — moteur métier indépendant de l'interface et de Firebase.
export const RAYONS = [
  ['fruits_legumes','Fruits & légumes','🥕'],
  ['viandes_poissons','Boucherie & poissonnerie','🥩'],
  ['frais','Frais','🧀'],
  ['epicerie','Épicerie','🥫'],
  ['boulangerie','Boulangerie','🥖'],
  ['surgeles','Surgelés','🧊'],
  ['hygiene','Hygiène','🧼'],
  ['droguerie','Entretien','🧽'],
  ['a_classer','À classer','📦']
];
export const RAYON_IDS = new Set(RAYONS.map(x=>x[0]));
export const labelRayon = (id) => (RAYONS.find(r=>r[0]===id)||RAYONS.at(-1))[1];
export const normal = (str='') => String(str).toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,"'")
  .replace(/[‐‑–—-]/g,' ').replace(/[^a-z0-9' ]+/g,' ')
  .replace(/\s+/g,' ').trim();
export const normId = s=>normal(s).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,55)||'article';

// Quantités dynamiques dans les instructions : {{q:nom exact de l'ingrédient}}.
// On ne modifie jamais les chiffres libres (températures, durées, puissances).
const STEP_QUANTITY_PATTERN = /\{\{q:([^{}]+)\}\}/g;
export function resolveStepIngredient(label,ingredients){
  const target=normal(label);
  const matches=ingredients.filter(g=>normal(g.nom)===target||(g.meta?.alias||[]).some(alias=>normal(alias)===target));
  return matches.length===1?matches[0]:null;
}
export function stepTextParts(template,recipe,portions=recipe.portions){
  const factor=Number(portions)/Number(recipe.portions);
  if(!Number.isFinite(factor)||factor<=0)throw new Error('Nombre de portions invalide');
  const parts=[];let last=0;
  for(const m of String(template).matchAll(STEP_QUANTITY_PATTERN)){
    if(m.index>last)parts.push({kind:'text',text:template.slice(last,m.index)});
    const g=resolveStepIngredient(m[1].trim(),recipe.ingredients);
    if(!g)throw new Error('Ingrédient manquant ou ambigu dans une étape : '+m[1]);
    parts.push({kind:'quantity',text:formatQuantity(g.quantite*factor,g.unite),ingredient:g.nom});
    last=m.index+m[0].length;
  }
  if(last<String(template).length)parts.push({kind:'text',text:template.slice(last)});
  return parts;
}
export function formatStepText(template,recipe,portions=recipe.portions){
  return stepTextParts(template,recipe,portions).map(p=>p.text).join('');
}
export function validateStepRefs(steps,ingredients,where='Recette'){
  for(let i=0;i<steps.length;i++){
    const text=steps[i];
    for(const m of text.matchAll(STEP_QUANTITY_PATTERN)){
      if(!resolveStepIngredient(m[1].trim(),ingredients))
        throw new Error(`${where} / étape ${i+1} : "${m[1]}" ne correspond pas à un ingrédient unique de la recette`);
    }
    if(text.replace(STEP_QUANTITY_PATTERN,'').includes('{{'))
      throw new Error(`${where} / étape ${i+1} : balise de quantité invalide (format {{q:nom ingrédient}})`);
  }
}

export const uid = prefix=>prefix+'_'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36));
export const clone = obj=>JSON.parse(JSON.stringify(obj));
export const allowedEffort = new Set(['faible','modere','eleve']);
// Facettes utilisables dans les JSON et les filtres (ni diagnostics ni garanties d'absence d'allergènes).
export const TAG_GROUPS = [
 ['Alimentation', [['vegetarien','Végétarien'],['vegan','Vegan'],['pescetarien','Pescétarien'],['sans_gluten','Sans gluten*'],['sans_lactose','Sans lactose*'],['sans_oeuf','Sans œuf*'],['sans_fruits_a_coque','Sans fruits à coque*']]],
 ['Sport & nutrition', [['riche_en_proteines','Riche en protéines'],['post_entrainement','Post-training'],['avant_entrainement','Avant entraînement'],['low_carb','Low carb']]],
 ['Pratique', [['one_pot','Tout dans un plat'],['peu_de_vaisselle','Peu de vaisselle'],['batch_cooking','Batch cooking'],['economique','Économique'],['familial','Familial'],['congelable','Congélable'],['sans_cuisson','Sans cuisson']]],
 ['Type de repas', [['plat','Plat'],['entree','Entrée'],['dessert','Dessert'],['petit_dejeuner','Petit-déjeuner'],['collation','Collation'],['accompagnement','Accompagnement'],['aperitif','Apéritif']]],
 ['Matériel', [['airfryer','Airfryer'],['thermomix','Thermomix'],['four','Four'],['poele','Poêle'],['casserole','Casserole']]],
 ['Cuisine', [['italien','Italien'],['mediterraneen','Méditerranéen'],['asiatique','Asiatique'],['indien','Indien'],['mexicain','Mexicain']]]
];
export const allowedTags = new Set(TAG_GROUPS.flatMap(group=>group[1].map(item=>item[0])));

export function baseState(recipes=[]){return {version:2,recipes:clone(recipes),favorites:[],plan:[],shopping:{generated:{},purchased:{},manual:[],overrides:{}},catalogCustom:[],rayonOverrides:{}};}

function numeric(n,where){if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>100000)throw new Error(where+' : quantité invalide (nombre positif attendu)');return n;}
function validText(t,where,limit=200){if(typeof t!=='string'||!t.trim()||t.length>limit)throw new Error(where+' : texte manquant ou trop long');return t.trim();}
// Une photo par recette : adresse HTTPS directe, métadonnées facultatives.
export function normalizeRecipeImage(value){
  if(value===undefined||value===null||value==='')return null;
  const image=typeof value==='string'?{url:value}:value;
  if(!image||typeof image!=='object'||Array.isArray(image))throw new Error('Image : format attendu URL ou objet {url, source}');
  const url=String(image.url||'').trim();
  if(!url)return null;
  if(url.length>2048)throw new Error('Image : URL trop longue');
  let parsed;
  try{parsed=new URL(url);}catch{throw new Error('Image : URL incorrecte');}
  if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)throw new Error('Image : une URL HTTPS publique sans identifiant est obligatoire');
  const source=typeof image.source==='string'?image.source.trim().slice(0,120):'';
  return {url:parsed.href,source};
}
export function changeRecipeImage(state,recipeId,image){
  const out=clone(state),recipe=out.recipes.find(r=>r.id===recipeId);
  if(!recipe)throw new Error('Recette introuvable');
  recipe.image=normalizeRecipeImage(image);
  return out;
}

// Favoris de foyer : identifiants stables, pas de copie des recettes.
export function toggleFavorite(state,recipeId){
  const next=clone(state);
  if(!next.recipes.some(r=>r.id===recipeId))throw new Error('Recette introuvable');
  const favorites=Array.isArray(next.favorites)?next.favorites:[];
  next.favorites=favorites.includes(recipeId)?favorites.filter(id=>id!==recipeId):[...favorites,recipeId];
  return next;
}

export function validateImport(raw){
  let data;
  try{data=typeof raw==='string'?JSON.parse(raw):raw;}catch(e){throw new Error('JSON incorrect : '+e.message);}
  if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==2||!Array.isArray(data.recettes))throw new Error('Format attendu : {"version":2,"recettes":[...]}');
  if(!data.recettes.length||data.recettes.length>50)throw new Error('Le JSON doit contenir entre 1 et 50 recettes');
  const recipes=data.recettes.map((r,i)=>{
    const at='Recette '+(i+1);
    if(!r||typeof r!=='object')throw new Error(at+' : structure incorrecte');
    const nom=validText(r.nom,at+' / nom');
    const portions=numeric(r.portions,at+' / portions');
    if(!Number.isInteger(portions)||portions>40)throw new Error(at+' / portions : entier entre 1 et 40 requis');
    const tempsMinutes=numeric(r.tempsMinutes,at+' / tempsMinutes');
    if(tempsMinutes>1440)throw new Error(at+' / durée trop longue');
    if(!Array.isArray(r.ingredients)||!r.ingredients.length||r.ingredients.length>80)throw new Error(at+' : liste ingrédients invalide');
    const ingredients=r.ingredients.map((g,j)=>{
      const path=at+' / ingrédient '+(j+1);
      if(!g||typeof g!=='object')throw new Error(path+' : structure invalide');
      const nom=validText(g.nom,path+' / nom');
      const quantite=numeric(g.quantite,path+' / quantité');
      const unite=validText(g.unite,path+' / unité',22).toLowerCase();
      const m=g.meta&&typeof g.meta==='object'&&!Array.isArray(g.meta)?g.meta:{};
      const safe=(a)=>(Array.isArray(a)?a:[]).filter(t=>typeof t==='string'&&t.trim()&&t.length<=65).slice(0,12);
      return {nom,quantite,unite,meta:{rayon:RAYON_IDS.has(m.rayon)?m.rayon:'a_classer',familles:safe(m.familles),alias:safe(m.alias)}};
    });
    if(!Array.isArray(r.etapes)||!r.etapes.length||r.etapes.length>40)throw new Error(at+' : étapes manquantes');
    const etapes=r.etapes.map((step,j)=>validText(step,at+' / étape '+(j+1),1800));
    validateStepRefs(etapes,ingredients,at);
    const ef=r.effort&&typeof r.effort==='object'?r.effort:{};
    const effort=Object.fromEntries(['manipulations','vaisselle','coordination'].map(k=>[k,allowedEffort.has(ef[k])?ef[k]:null]));
    const tags=[...new Set((Array.isArray(r.tags)?r.tags:[]).filter(t=>allowedTags.has(t)))];
    const mains=r.saisonnalite?.ingredientsPrincipaux;
    const saisonnalite={mode:'auto',ingredientsPrincipaux:Array.isArray(mains)?mains.filter(x=>typeof x==='string'&&x.length<90).slice(0,10):[]};
    return {nom,portions,tempsMinutes,ingredients,etapes,tags,image:normalizeRecipeImage(r.image),difficulte:['facile','moyenne','avancee'].includes(r.difficulte)?r.difficulte:null,effort,saisonnalite};
  });
  return recipes;
}

function identity(s){return normal(s).replace(/^les?\s+/,'').replace(/^des?\s+/,'').trim();}
export function findIngredient(name,catalog){
  const n=identity(name);
  const matches=catalog.filter(g=>identity(g.nom)===n||(g.alias||[]).some(a=>identity(a)===n));
  return matches.length===1?matches[0]:null; // Ambiguïté => aucun rapprochement silencieux.
}
export function mergeImport(state, incoming, actions={}, addToPlan=false, pilot=[]){
  const out=clone(state);let created=0,replaced=0,skipped=0,newIngredients=0,unclassified=0;
  for(let i=0;i<incoming.length;i++){
    const item=incoming[i];
    const existing=out.recipes.find(r=>normal(r.nom)===normal(item.nom));
    const action=existing?(actions[i]||'keep'):'keep';
    if(!['keep','replace','skip'].includes(action))throw new Error('Décision doublon invalide');
    if(action==='skip'){skipped++;continue;}
    const recipe=clone(item);
    recipe.id=existing&&action==='replace'?existing.id:uid('r');
    if(existing&&action==='replace'&&!recipe.image)recipe.image=existing.image||null; // Préserve une photo choisie manuellement si le nouveau JSON n'en fournit pas.
    recipe.ingredients=recipe.ingredients.map(ing=>{
      const known=findIngredient(ing.nom,[...pilot,...out.catalogCustom]);
      if(known)return {...ing,ingredientId:known.id};
      const m=ing.meta||{};
      const newEntry={id:uid('ing'),nom:ing.nom,rayon:RAYON_IDS.has(m.rayon)?m.rayon:'a_classer',alias:m.alias||[],familles:m.familles||[],unites:[ing.unite]};
      out.catalogCustom.push(newEntry);newIngredients++;
      if(newEntry.rayon==='a_classer')unclassified++;
      return {...ing,ingredientId:newEntry.id};
    });
    if(existing&&action==='replace'){
      out.recipes=out.recipes.map(r=>r.id===existing.id?recipe:r);replaced++;
    }else{out.recipes.unshift(recipe);created++;}
    if(addToPlan)out.plan.push({id:uid('meal'),recipeId:recipe.id,portions:recipe.portions});
  }
  return {state:out,stats:{created,replaced,skipped,newIngredients,unclassified}};
}
export function addMeal(state,recipeId,portions){
 const r=state.recipes.find(x=>x.id===recipeId);if(!r)throw new Error('Recette introuvable');
 const p=Number(portions??r.portions);if(!Number.isInteger(p)||p<1||p>40)throw new Error('Nombre de portions invalide');
 const out=clone(state);out.plan.push({id:uid('meal'),recipeId,portions:p});return out;
}
export function editMeal(state,mealId,portions){const out=clone(state);const m=out.plan.find(x=>x.id===mealId);if(!m)throw new Error('Repas introuvable');if(!Number.isInteger(portions)||portions<1||portions>40)throw new Error('Portions invalides');m.portions=portions;return out;}
export function removeMeal(state,mealId){const out=clone(state);out.plan=out.plan.filter(m=>m.id!==mealId);return out;}

export function parseSearch(query){
 let s=normal(query);
 let maxTime=null;
 const patterns=[/(?:moins\s+de|\bde\s+moins\s+de|\bmax(?:imum)?|\bau\s+plus|\bpas\s+plus\s+de)\s*(\d{1,3})\s*(?:min(?:ute)?s?)\b/,/\b(\d{1,3})\s*(?:min(?:ute)?s?)\s*(?:max|maximum)\b/];
 for(const re of patterns){const m=s.match(re);if(m){maxTime=Number(m[1]);s=s.replace(m[0],' ');break;}}
 // normal() supprime le signe « - » de « - de 20 min ».
 if(maxTime===null){const m=s.match(/\bde\s+(\d{1,3})\s*(?:min(?:ute)?s?)\b/);if(m){maxTime=Number(m[1]);s=s.replace(m[0],' ');}}
 const flags={simple:false,lowDishes:false,easy:false,tags:[],tag:null};
 const phrases=[
   [/\b(?:sans prise de tete|sans se prendre la tete|simple|sans effort)\b/g,()=>flags.simple=true],
   [/\b(?:peu de vaisselle|sans vaisselle)\b/g,()=>flags.lowDishes=true],
   [/\b(?:facile)\b/g,()=>flags.easy=true],
   [/\b(?:post training|post entrainement|apres entrainement|apres sport)\b/g,()=>flags.tags.push('post_entrainement')],
   [/\b(?:avant entrainement|avant sport|pre training)\b/g,()=>flags.tags.push('avant_entrainement')],
   [/\b(?:low carb|pauvre en glucides)\b/g,()=>flags.tags.push('low_carb')],
   [/\b(?:riche en proteines?|proteines?|proteine)\b/g,()=>flags.tags.push('riche_en_proteines')],
   [/\b(?:one pot|tout dans une casserole|tout dans un plat)\b/g,()=>flags.tags.push('one_pot')],
   [/\b(?:vegan|vegetalien|vegetalienne)\b/g,()=>flags.tags.push('vegan')],
   [/\b(?:vegetarien|vegetarienne|veggie)\b/g,()=>flags.tags.push('vegetarien')],
   [/\b(?:pescetarien|pescetarienne)\b/g,()=>flags.tags.push('pescetarien')],
   [/\b(?:sans gluten)\b/g,()=>flags.tags.push('sans_gluten')],
   [/\b(?:sans lactose|sans produit laitier)\b/g,()=>flags.tags.push('sans_lactose')],
   [/\b(?:sans oeuf|sans oeufs)\b/g,()=>flags.tags.push('sans_oeuf')],
   [/\b(?:sans fruits a coque|sans noix)\b/g,()=>flags.tags.push('sans_fruits_a_coque')],
   [/\b(?:batch cooking)\b/g,()=>flags.tags.push('batch_cooking')],
   [/\b(?:airfryer|air fryer)\b/g,()=>flags.tags.push('airfryer')],
   [/\b(?:thermomix)\b/g,()=>flags.tags.push('thermomix')],
   [/\b(?:sans cuisson)\b/g,()=>flags.tags.push('sans_cuisson')]
 ];
 for(const [re,set] of phrases)s=s.replace(re,()=>{set();return ' ';});
 flags.tags=[...new Set(flags.tags)];flags.tag=flags.tags[0]||null; // alias de compatibilité
 const words=s.split(/\s+/).filter(w=>w&&!['de','des','du','la','le','les','un','une','et','avec','en','a','au','pour','je','veux','recette','plat','repas','faire','truc','moins','rapide'].includes(w));
 return {raw:query,maxTime,flags,words};
}

const SEASON_MONTHS={
 'potimarron':[9,10,11,12,1,2],'courge butternut':[9,10,11,12,1,2,3],
 'courge':[9,10,11,12,1,2],'poireau':[10,11,12,1,2,3,4],
 'aubergine':[6,7,8,9],'tomate':[6,7,8,9,10],'tomates cerises':[6,7,8,9],
 'courgette':[5,6,7,8,9,10],'asperge':[3,4,5,6],'fraise':[4,5,6,7],
 'fenouil':[9,10,11,12,1,2,3],'endive':[10,11,12,1,2,3,4],
 'chou fleur':[9,10,11,12,1,2,3,4],'brocoli':[6,7,8,9,10,11],
 'carotte':[1,2,3,4,5,6,7,8,9,10,11,12],
 'champignon de paris':[1,2,3,4,5,6,7,8,9,10,11,12]
};
export function seasonOf(recipe,month){
 const names=recipe.saisonnalite?.ingredientsPrincipaux||[];
 const source=names.length?names:recipe.ingredients.filter(x=>x.meta?.rayon==='fruits_legumes').map(x=>x.nom);
 const statuses=[];
 for(const nm of source){
   const ingredient=recipe.ingredients.find(i=>normal(i.nom)===normal(nm))||{nom:nm};
   const label=normal(ingredient.nom);
   if(/\b(?:conserve|en boite|surgel)/.test(label))continue;
   const seasonal=Object.entries(SEASON_MONTHS).find(([k])=>label===k||label.includes(k)&&k.length>6);
   if(seasonal)statuses.push(seasonal[1].includes(month));
 }
 if(!statuses.length)return 'neutral';
 const on=statuses.filter(Boolean).length;
 return on===0||statuses.length>=2&&on/statuses.length<.5?'out':on===statuses.length?'in':'mixed';
}
function editDistance1(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0,j=0,errors=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++errors>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}return errors+(a.length-i)+(b.length-j)<=1;}
export function hasTag(recipe, tag){
 // Une recette vegan est aussi végétarienne ; l'inverse n'est pas vrai.
 return recipe.tags.includes(tag)||(tag==='vegetarien'&&recipe.tags.includes('vegan'));
}
export function searchRecipes(recipes, query, options={}){
 const parsed=parseSearch(query),month=options.month||new Date().getMonth()+1,showOut=!!options.showOut;
 const results=[],near=[],outseason=[];
 for(const recipe of recipes){
   const labels=[recipe.nom,...recipe.ingredients.map(i=>i.nom),...(recipe.ingredients.flatMap(i=>i.meta?.familles||[])),...recipe.tags.map(t=>t.replaceAll('_',' '))].map(normal);
   const terms=labels.join(' ');
   const wordScores=parsed.words.map(w=>{
     const exact=labels.some(s=>s.split(' ').includes(w)||s===w);
     const fuzzy=exact||labels.some(s=>s.split(' ').some(x=>w.length>=5&&editDistance1(w,x)));
     return exact?4:fuzzy?2:0;
   });
   // Tous les termes exprimés sont nécessaires; une seule correspondance forte ne suffit pas.
   if(wordScores.some(score=>score===0))continue;
   const wordScore=wordScores.reduce((sum,n)=>sum+n,0);
   if([...parsed.flags.tags,...(options.selectedTags||[])].some(tag=>!hasTag(recipe,tag)))continue;
   if(parsed.flags.easy&&recipe.difficulte!=='facile')continue;
   if(parsed.flags.simple&&!(recipe.effort?.manipulations==='faible'&&recipe.effort?.vaisselle==='faible'&&recipe.effort?.coordination!=='eleve'))continue;
   if(parsed.flags.lowDishes&&recipe.effort?.vaisselle!=='faible')continue;
   const status=seasonOf(recipe,month);
   const askedSpecific=parsed.words.some(w=>normal(recipe.nom).split(' ').includes(w)&&w.length>=6||Object.keys(SEASON_MONTHS).some(s=>s===w&&recipe.ingredients.some(i=>normal(i.nom)===w)));
   const row={recipe,score:wordScore+(status==='in'?2:0)+(recipe.effort?.manipulations==='faible'?1:0),season:status};
   if(status==='out'&&!showOut&&!askedSpecific){outseason.push(row);continue;}
   if(parsed.maxTime!==null&&recipe.tempsMinutes>parsed.maxTime){
     if(recipe.tempsMinutes<=parsed.maxTime+5)near.push({...row,over:recipe.tempsMinutes-parsed.maxTime});
     continue;
   }
   results.push(row);
 }
 const sorting=(a,b)=>b.score-a.score||a.recipe.tempsMinutes-b.recipe.tempsMinutes||a.recipe.nom.localeCompare(b.recipe.nom,'fr');
 return {parsed,results:results.sort(sorting),near:near.sort((a,b)=>a.over-b.over||sorting(a,b)),outseason:outseason.sort(sorting)};
}

const UNIT_GROUP={g:['g',1],kg:['g',1000],ml:['ml',1],cl:['ml',10],l:['ml',1000],piece:['pièce',1],pièce:['pièce',1],pieces:['pièce',1],pièces:['pièce',1]};
export function qtyKey(ingredientId,unit){const norm=normal(unit);const [base,factor]=UNIT_GROUP[norm]||[norm||'pièce',1];return {key:ingredientId+'|'+base,unit:base,factor};}
export function getRayon(ingredientId,state,pilot=[]){if(state.rayonOverrides[ingredientId])return state.rayonOverrides[ingredientId];const entry=[...state.catalogCustom,...pilot].find(x=>x.id===ingredientId);return entry?.rayon||'a_classer';}
export function calculateNeeds(state,pilot=[]){
 const sums={};
 for(const p of state.plan){
   const r=state.recipes.find(x=>x.id===p.recipeId);if(!r)continue;
   for(const g of r.ingredients){
      const id=g.ingredientId||normId(g.nom),k=qtyKey(id,g.unite),amount=g.quantite*p.portions/r.portions*k.factor;
      if(!sums[k.key])sums[k.key]={key:k.key,ingredientId:id,nom:g.nom,unite:k.unit,quantite:0,rayon:getRayon(id,state,pilot)};
      sums[k.key].quantite=Math.round((sums[k.key].quantite+amount)*1000)/1000;
   }
 }
 return sums;
}
export function refreshCourses(state,pilot=[]){const out=clone(state);out.shopping.generated=calculateNeeds(out,pilot);return out;}
// Conversions uniquement à l'intérieur d'une même dimension, jamais g ↔ pièce.
export function convertQuantity(q,from,to){
 const a=qtyKey('_',from),b=qtyKey('_',to);
 if(a.unit!==b.unit)return null;
 return Math.round(q*a.factor/b.factor*1000)/1000;
}
export function courseRows(state,pilot=[]){
 const rows=[];const keys=new Set([...Object.keys(state.shopping.generated),...Object.keys(state.shopping.purchased)]);
 for(const key of keys){
   const calculated=state.shopping.generated[key];const paid=state.shopping.purchased[key];
   const override=calculated?state.shopping.overrides?.[key]:null;
   const required=calculated?{...calculated, ...(override||{})}:null;
   const example=required||paid;if(!example)continue;
   const bought=paid&&required?convertQuantity(paid.quantite,paid.unite,required.unite):null;
   const outstanding=required?Math.max(0,Math.round((required.quantite-(bought??0))*1000)/1000):0;
   if(outstanding>0)rows.push({...required,key,id:key,type:'generated',quantite:outstanding,bought:bought??0,rayon:getRayon(required.ingredientId,state,pilot),customized:!!override});
   if(paid?.quantite>0)rows.push({...paid,key,id:key+'|bought',type:'purchased',bought:paid.quantite,rayon:getRayon(paid.ingredientId,state,pilot)});
 }
 for(const m of state.shopping.manual)rows.push({...m,type:'manual',rayon:getRayon(m.ingredientId,state,pilot)});
 return rows;
}
export function togglePurchase(state,row){
 const out=clone(state);
 if(row.type==='manual'){const m=out.shopping.manual.find(x=>x.id===row.id);if(m)m.checked=!m.checked;return out;}
 if(row.type==='purchased'){delete out.shopping.purchased[row.key];return out;}
 if(row.type==='generated'){
   const required=out.shopping.generated[row.key];if(!required)return out;
   const chosen=out.shopping.overrides?.[row.key]||{};
   // Le bouton « acheté » ne doit payer que le reste, pas racheter tout le besoin.
   const targetUnit=chosen.unite??required.unite;
   const previous=out.shopping.purchased[row.key];
   const prevQty=previous?convertQuantity(previous.quantite,previous.unite,targetUnit):0;
   if(prevQty===null)throw new Error('Unité incompatible avec un achat existant');
   const remaining=convertQuantity(row.quantite,row.unite,targetUnit);
   if(remaining===null)throw new Error('Unité de l’article incompatible');
   out.shopping.purchased[row.key]={...required,...chosen,quantite:Math.round((prevQty+remaining)*1000)/1000,unite:targetUnit};
 }
 return out;
}
export function editCourseItem(state,row,qty,unit){
 const v=Number(qty),u=String(unit||'').trim().toLowerCase();
 if(!Number.isFinite(v)||v<=0||v>100000)throw new Error('Quantité positive requise');
 if(!u||u.length>22)throw new Error('Unité invalide');
 const out=clone(state);
 if(row.type==='manual'){
   const item=out.shopping.manual.find(x=>x.id===row.id);if(!item)throw new Error('Article manuel introuvable');
   item.quantite=v;item.unite=u;item.key=qtyKey(item.ingredientId,u).key;
 }else if(row.type==='generated'){
   if(!out.shopping.generated[row.key])throw new Error('Article du planning introuvable');
   out.shopping.overrides??={};const paid=out.shopping.purchased[row.key];const alreadyPaid=paid?convertQuantity(paid.quantite,paid.unite,u):0;out.shopping.overrides[row.key]={quantite:Math.round((v+(alreadyPaid??0))*1000)/1000,unite:u};
 }else if(row.type==='purchased'){
   if(!out.shopping.purchased[row.key])throw new Error('Article acheté introuvable');
   out.shopping.purchased[row.key].quantite=v;out.shopping.purchased[row.key].unite=u;
 }else throw new Error('Type d’article inconnu');
 return out;
}
export function resetCourseItem(state,key){
 const out=clone(state);if(out.shopping.overrides)delete out.shopping.overrides[key];return out;
}

export function addManualItem(state,raw,pilot=[]){
 const out=clone(state);
 const m=String(raw).trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|cl|ml|l|pi[eè]ces?|boites?|paquets?|barquettes?|tranches?|gousses?)?\s+(.+)$/i);
 const qty=m?Number(m[1].replace(',','.')):1,unit=m?(m[2]||'pièce'):'pièce',name=m?m[3].replace(/^de\s+/i,'').trim():String(raw).trim();
 if(!name||!Number.isFinite(qty)||qty<=0)throw new Error('Article ou quantité incorrecte');
 let ing=findIngredient(name,[...pilot,...out.catalogCustom]);
 if(!ing){ing={id:uid('ing'),nom:name,rayon:'a_classer',alias:[],familles:[],unites:[unit]};out.catalogCustom.push(ing);}
 const {key,unit:base,factor}=qtyKey(ing.id,unit);const prev=out.shopping.manual.find(x=>!x.checked&&x.key===key);
 if(prev)prev.quantite=Math.round((prev.quantite+qty*factor)*1000)/1000;
 else out.shopping.manual.push({id:uid('manual'),key,ingredientId:ing.id,nom:ing.nom,unite:base,quantite:qty*factor,checked:false});
 return out;
}
export function changeRayon(state,id,rayon){
 if(!RAYON_IDS.has(rayon))throw new Error('Rayon invalide');
 const out=clone(state);out.rayonOverrides[id]=rayon;
 return out;
}
export function formatQuantity(q,unit){const n=(Math.round(q*100)/100).toLocaleString('fr-FR',{maximumFractionDigits:2});return `${n} ${unit}`;}
