import {publicProduct,cents,today,validObservation} from './prices.mjs';
export const OFF='https://world.openfoodfacts.org';
export const OPEN_PRICES='https://prices.openfoodfacts.org';
const hosts=new Set([new URL(OFF).host,new URL(OPEN_PRICES).host]);
export function createSources({fetcher=globalThis.fetch,cache=new Map(),now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms)),enabled=()=>false}={}) {
  let last=0;let tail=Promise.resolve();
  const request=(url,{ttl=86400000,interval=1200}={})=>{
    if(!hosts.has(new URL(url).host)||new URL(url).protocol!=='https:')throw Error('Service réseau non autorisé.');
    const hit=cache.get(url);
    if(hit&&now()-hit.at<ttl)return Promise.resolve(structuredClone(hit.data));
    if(!enabled())return Promise.reject(Error('Activez les recherches publiques dans Profil. Aucun ticket n’est envoyé.'));
    const work=tail.catch(()=>{}).then(async()=>{
      const delay=last+interval-now();if(delay>0)await wait(delay);last=now();
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try {
        const response=await fetcher(url,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'},signal:controller.signal});
        if(!response.ok)throw Error(response.status===429?'Limite du service atteinte. Réessayez plus tard.':`Service indisponible (HTTP ${response.status}).`);
        const text=await response.text();if(text.length>3000000)throw Error('Réponse du service trop volumineuse.');
        const data=JSON.parse(text);if(!data||typeof data!=='object')throw Error('Réponse inexploitable.');
        cache.set(url,{at:now(),data});return structuredClone(data);
      }catch(error){
        if(hit)return {...structuredClone(hit.data),_staleCache:true,_cacheError:error.message};
        throw Error(error.name==='AbortError'?'Le service ne répond pas. Vos données locales sont conservées.':`Recherche publique impossible : ${error.message}`);
      }finally{clearTimeout(timer);}
    });tail=work;return work;
  };
  return {
    cache,
    async product(code) {
      if(!/^\d{8,14}$/.test(String(code)))throw Error('Code-barres attendu (8 à 14 chiffres).');
      const fields='code,product_name,product_name_fr,brands,quantity,allergens_tags,ingredients_text,ingredients_text_fr,categories_tags';
      const data=await request(`${OFF}/api/v2/product/${code}.json?fields=${fields}&app_name=KeskonMange&app_version=3`);
      if(data.status!==1||!data.product)throw Error('Produit absent d’Open Food Facts.');
      return {...publicProduct(data.product),staleCache:!!data._staleCache};
    },
    async search(query) {
      const text=String(query).trim();if(text.length<2||text.length>100)throw Error('Indiquez un produit (2 à 100 caractères).');
      // Open Prices permet de chercher uniquement des produits ayant des observations.
      const data=await request(`${OPEN_PRICES}/api/v1/products/?product_name__like=${encodeURIComponent(text)}&price_count__gte=1&page_size=12`,{interval:1500});
      if(!Array.isArray(data.items))throw Error('Format de résultats inconnu.');
      return {items:data.items.map(p=>({code:String(p.code),name:p.product_name||p.code,brand:p.brands||'',quantity:p.quantity||'',priceCount:p.price_count??null})),stale:!!data._staleCache};
    },
    async prices({barcode,category,locationId}={}) {
      const params=new URLSearchParams({currency:'EUR',order_by:'-date',page_size:'40'});
      if(barcode) {if(!/^\d{8,14}$/.test(String(barcode)))throw Error('Code-barres invalide.');params.set('product_code',barcode);}
      else if(category&&/^[a-z]{2}:[a-z0-9-]+$/.test(category))params.set('category_tag',category);
      else throw Error('Produit ou catégorie précis nécessaire.');
      if(locationId) {if(!/^\d+$/.test(String(locationId)))throw Error('Identifiant de lieu invalide.');params.set('location_id',locationId);}
      const url=`${OPEN_PRICES}/api/v1/prices/?${params}`,data=await request(url,{ttl:21600000});
      if(!Array.isArray(data.items))throw Error('Format de prix inconnu.');
      return {items:data.items.map(row=>({...row,sourceURL:`${OPEN_PRICES}/prices/${row.id}`})),stale:!!data._staleCache,url};
    },
    request,
  };
}
export function normalizeOpenPrice(row,product) {
  if(row.currency!=='EUR'||!row.date||String(row.product_code)!==String(product.barcode)||!row.id)return null;
  // Les prix de catégories au kg demandent un format séparé, jamais une boîte fictive.
  if(row.price_per&&row.price_per!=='UNIT')return null;
  let value;try {value=cents(row.price);}catch{return null;}
  if(value<0)return null;
  const location=row.location??{},store=location.osm_name||location.name||String(row.location_id??'Magasin non précisé');
  return validObservation({id:`op-${row.id}`,productId:product.id,cents:value,currency:'EUR',date:row.date,store,
    locationId:row.location_id??null,source:'open_prices',evidence:`https://prices.openfoodfacts.org/prices/${row.id}`,
    promotion:!!row.price_is_discounted,memberOnly:row.discount_type==='LOYALTY_PROGRAM',discountType:row.discount_type??null,retrievedOn:today(),license:'ODbL'});
}
export function normalizeCategoryRate(row,name) {
  if(row.type!=='CATEGORY'||!['KILOGRAM','UNIT'].includes(row.price_per)||row.currency!=='EUR'||!row.category_tag)return null;
  const weight=row.price_per==='KILOGRAM',id=`op-rate-${row.id}`;
  const product={id,name:`${name} · référence de catégorie`,quantityLabel:weight?'Vente au poids · prix au kg':'Unité de vente observée, contenu à vérifier',saleMode:weight?'weight':'fixed',
    content:{amount:weight?'1000':'1',unit:weight?'g':'unit',evidence:`Open Prices ${row.id} · price_per=${row.price_per}`},category:row.category_tag,
    labels:row.labels_tags??[],origins:row.origins_tags??[],source:'open_prices',sourceURL:`${OPEN_PRICES}/prices/${row.id}`,license:'ODbL',retrievedOn:today(),allergens:null};
  const observation=validObservation({id:`op-${row.id}`,productId:id,cents:cents(row.price),currency:'EUR',date:row.date,store:row.location?.osm_name||row.location?.name||String(row.location_id||''),
    locationId:row.location_id??null,source:'open_prices',evidence:`${OPEN_PRICES}/prices/${row.id}`,categoryBased:true,promotion:!!row.price_is_discounted,memberOnly:row.discount_type==='LOYALTY_PROGRAM',retrievedOn:today(),license:'ODbL'});
  return {product,observation};
}
