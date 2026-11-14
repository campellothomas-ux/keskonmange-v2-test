// Base ouverte et historique privé restent deux collections distinctes.
export const today = () => new Date().toISOString().slice(0, 10);
export const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/œ/g,'oe').replace(/[^a-z0-9]+/g,' ').trim();
export const money = cents => cents === null || cents === undefined ? 'Prix inconnu' : (cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
export function cents(value) {
  const text=String(value??'').trim().replace(/\s|€/g,'').replace(',','.');
  if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))throw Error('Montant invalide, deux décimales au maximum.');
  const n=Math.round(Number(text)*100);if(!Number.isSafeInteger(n))throw Error('Montant trop élevé.');return n;
}
export function ageDays(date,asOf=today()) {return Math.floor((Date.parse(asOf)-Date.parse(date))/86400000);}
export function validObservation(o) {
  if(!o||!o.id||!Number.isSafeInteger(o.cents)||o.cents<0||o.currency!=='EUR'||!/^\d{4}-\d{2}-\d{2}$/.test(o.date)||Number.isNaN(Date.parse(o.date))||new Date(o.date).toISOString().slice(0,10)!==o.date||ageDays(o.date)<0)throw Error('Observation tarifaire invalide.');
  if(!['open_prices','receipt','manual','indicative'].includes(o.source))throw Error('Source tarifaire inconnue.');
  if(!o.productId||!o.evidence)throw Error('Produit et provenance obligatoires.');
  return o;
}
export function selectReference(product,observations,{store='',storeLocationId='',asOf=today(),allowPromotions=false,allowMemberPrices=false,maxAgeDays=730}={}) {
  const sameStore=o=>o.source==='open_prices'?!!storeLocationId&&String(o.locationId)===String(storeLocationId):!!store&&norm(o.store)===norm(store);
  const eligible=observations.filter(o=>o.productId===product.id&&o.currency==='EUR'&&Number.isSafeInteger(o.cents)&&o.cents>=0&&ageDays(o.date,asOf)>=0&&ageDays(o.date,asOf)<=maxAgeDays
    &&(!o.promotion||allowPromotions)&&(!o.memberOnly||allowMemberPrices));
  if(!eligible.length)return {cents:null,kind:'unknown',confidence:'unknown',observations:[],reason:'Aucune observation compatible, datée et admissible.'};
  const rank=o=>{
    const age=ageDays(o.date,asOf),same=sameStore(o);
    if(o.source==='receipt'&&same&&age<=120)return 0;
    if(o.source==='manual'&&same&&age<=90)return 1;
    if(o.source==='open_prices'&&same&&age<=60)return 2;
    if(o.source==='receipt'&&age<=180)return 3;
    if(o.source==='open_prices'&&age<=180)return 4;
    return 5;
  };
  eligible.sort((a,b)=>rank(a)-rank(b)||b.date.localeCompare(a.date));
  const best=eligible[0],priority=rank(best),cohort=eligible.filter(o=>rank(o)===priority&&o.source===best.source&&norm(o.store)===norm(best.store)).slice(0,5);
  const ordered=[...cohort].sort((a,b)=>a.cents-b.cents||b.date.localeCompare(a.date)),selected=ordered[Math.floor(ordered.length/2)];
  const age=ageDays(selected.date,asOf),same=sameStore(selected);
  const kind=selected.categoryBased?'indicative':selected.source==='manual'?'manual':selected.source==='receipt'?'historical':same&&age<=60?'recent_store':selected.source==='open_prices'?'open_prices':'indicative';
  return {cents:selected.cents,kind,confidence:age>180?'low':same&&age<=60?'medium':'indicative',observations:cohort,source:selected.source,date:selected.date,store:selected.store,
    reason:`${cohort.length>1?'Médiane de '+cohort.length+' observations compatibles':'Observation compatible'} · ${same?'magasin choisi':'autre magasin ou lieu à confirmer'} · ${age} jour(s). Ce prix reste estimatif.`};
}
export function parseNetQuantity(text) {
  const s=norm(text).replace(/\b(kg|g|ml|cl|l)\b/g,' $1 '),raw=String(text??'').toLowerCase().replace(',','.');
  let m=raw.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if(m)return {amount:String(Number(m[1])*Number(m[2])*({kg:1000,g:1,ml:1,cl:10,l:1000}[m[3]])),unit:['kg','g'].includes(m[3])?'g':'ml',evidence:String(text)};
  m=raw.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  if(m)return {amount:String(Number(m[1])*({kg:1000,g:1,ml:1,cl:10,l:1000}[m[2]])),unit:['kg','g'].includes(m[2])?'g':'ml',evidence:String(text)};
  m=s.match(/^(\d+)\s*(?:oeufs?|pieces?|unites?|tranches?|tortillas?|pains?)\b/);
  return m?{amount:m[1],unit:'unit',evidence:String(text)}:null;
}
export function publicProduct(raw) {
  const code=String(raw.code??raw._id??'');if(!/^\d{8,14}$/.test(code))throw Error('Code produit inexploitable.');
  const quantity=parseNetQuantity(raw.quantity);
  return {id:`off-${code}`,barcode:code,name:String(raw.product_name_fr||raw.product_name||raw.product_name_en||code),brand:String(raw.brands??''),quantityLabel:String(raw.quantity??''),
    content:quantity,allergens:Array.isArray(raw.allergens_tags)?raw.allergens_tags:null,ingredientsText:raw.ingredients_text_fr||raw.ingredients_text||'',categories:raw.categories_tags??[],
    source:'open_food_facts',sourceURL:`https://world.openfoodfacts.org/product/${code}`,license:'ODbL',retrievedOn:today(),validatedMapping:false};
}
