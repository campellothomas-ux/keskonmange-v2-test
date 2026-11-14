import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createState,command,createClient,STORAGE_KEY} from '../src/state.mjs';
import {calculateCart,generateMenu,productsOf} from '../src/economy.mjs';
import {originals,engineRecipes,qualifiedRecipe,ingredients,equipmentNeeded} from '../src/catalog.mjs';
import {selectReference,today,parseNetQuantity,validObservation} from '../src/prices.mjs';
import {parseReceipt,validateReceipt,deleteReceipt} from '../src/receipts.mjs';
import {createSources,normalizeCategoryRate} from '../src/sources.mjs';
import {fixtureState,legacyMeal} from './helpers.mjs';
const productFor=(s,id)=>s.v3.privateProducts.find(p=>s.v3.bindings[p.id]?.ingredientId===id);

test('98 originaux préservés, 50 conversions qualifiées techniquement, aucun prix réel inventé',async()=>{
  const s=createState();assert.equal(Object.keys(originals).length,98);assert.equal(s.recipes.length,98);assert.equal(s.recipes.filter(r=>qualifiedRecipe(s,r.id)).length,50);
  assert.equal(s.v3.public.observations.length,0);assert.equal(s.v3.observations.length,0);
  const bytes=await readFile(new URL('../data/original-v1.json',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),'606b728465394408ed1f1ce88d1f23529066e28a393fadf54959693fa5948940');
});
test('addition exacte de trois demi-oignons avant choix des unités entières',()=>{
  const s=fixtureState();for(let n=0;n<3;n++)legacyMeal(s,{id:`oignon-${n}`});
  const i=productFor(s,'i_oignon');s.v3.bindings[i.id].amount='1';const before=JSON.stringify(s);
  const c=calculateCart(s),row=c.rows.find(r=>r.ingredientId==='i_oignon');assert.equal(c.requirements.needs.i_oignon,'3/2');assert.equal(row.quantity,2);assert.equal(row.bought,'2');assert.equal(JSON.stringify(s),before);
});
test('achat couvrant et achat supplémentaire distincts, aucun double compte',()=>{
  let s=fixtureState();legacyMeal(s,{ingredientId:'i_yaourt_grec_nature',amount:333,unit:'g'});const p=productFor(s,'i_yaourt_grec_nature'),price=s.v3.observations.find(o=>o.productId===p.id).cents;
  s=command(s,{type:'addManual',name:'yaourt',quantity:1,unit:'pot',productId:p.id,intent:'cover'});
  let c=calculateCart(s);assert.equal(c.rows.length,1);assert.equal(c.rows[0].quantity,1);assert.equal(c.totalCents,price);assert.equal(c.rows[0].surplus,'167');
  s.shopping.manual[0].intent='extra';c=calculateCart(s);assert.equal(c.rows.length,1);assert.equal(c.rows[0].quantity,2);assert.equal(c.totalCents,price*2);assert.equal(c.rows[0].surplus,'167');
});
test('les achats manuels sans correspondance culinaire restent chiffrables',()=>{
  let s=createState();s=command(s,{type:'personalProduct',name:'Biscuits déclarés par le foyer',amount:'200',unit:'g',price:'1.75'});const p=s.v3.privateProducts[0];
  s=command(s,{type:'addManual',name:'biscuits',quantity:2,unit:'paquet',productId:p.id});let c=calculateCart(s);assert.equal(c.totalCents,350);
  s=command(s,{type:'editManual',id:s.shopping.manual[0].id,patch:{quantite:3}});assert.equal(calculateCart(s).totalCents,525);
});
test('prix inconnu conservé, total partiel jamais présenté comme budget respecté',()=>{
  let s=createState();s=command(s,{type:'addManual',name:'biscuits',quantity:1,unit:'paquet'});let c=calculateCart(s);assert.equal(c.totalCents,null);assert.equal(c.coverage.priced,0);
  s=command(s,{type:'editManual',id:s.shopping.manual[0].id,patch:{unitPriceCents:1500,quantite:2}});c=calculateCart(s);assert.equal(c.totalCents,3000);assert.equal(c.remainingCents,7000);
});
test('achat sans catalogue : quantité modifiable sans écraser le besoin culinaire exact',()=>{
  let s=createState();legacyMeal(s,{id:'achat-sans-catalogue',amount:1.5});
  const initial=calculateCart(s),row=initial.rows[0];s=command(s,{type:'unreferencedQuantity',id:row.id,quantity:2});
  const c=calculateCart(s);assert.equal(c.rows[0].quantity,'2');assert.equal(c.rows[0].necessary,'3/2');assert.equal(c.totalCents,null);
  assert.equal(s.recipes.at(-1).ingredients[0].quantite,1.5);
});
test('stock exact déduit une seule fois et changement de format sans toucher à la cuisine',()=>{
  let s=fixtureState();legacyMeal(s,{ingredientId:'i_yaourt_grec_nature',amount:333,unit:'g'});s=command(s,{type:'stock',ingredientId:'i_yaourt_grec_nature',quantity:'100'});
  const p=productFor(s,'i_yaourt_grec_nature'),before=JSON.stringify(s.recipes);s=command(s,{type:'purchaseQuantity',productId:p.id,quantity:2});const c=calculateCart(s);
  assert.equal(c.meta.i_yaourt_grec_nature.toBuy,'233');assert.equal(c.rows[0].quantity,2);assert.equal(JSON.stringify(s.recipes),before);
});
test('un achat personnalisé insuffisant ne devient pas un menu déclaré complet',()=>{
  let s=fixtureState();legacyMeal(s,{ingredientId:'i_yaourt_grec_nature',amount:666,unit:'g'});const p=productFor(s,'i_yaourt_grec_nature');
  s=command(s,{type:'purchaseQuantity',productId:p.id,quantity:1});const c=calculateCart(s);assert.equal(c.totalCents,null);assert.ok(c.shortfalls.includes('yaourt grec nature'));
});
test('vente au poids : estimation au kg, masse prévue sans conditionnement fictif',()=>{
  let s=createState();s=command(s,{type:'personalProduct',name:'Bananes au poids (TEST)',amount:1000,unit:'g',saleMode:'weight',price:'2.50'});const p=s.v3.privateProducts[0];
  s=command(s,{type:'addManual',name:'bananes',quantity:600,unit:'g',productId:p.id});const c=calculateCart(s);assert.equal(c.totalCents,150);assert.equal(c.rows[0].weight,true);assert.equal(c.rows[0].quantity,600);
});
test('générateur global : sept repas, paniers comparés, achats supplémentaires inclus et acceptation séparée',()=>{
  let s=fixtureState();s=command(s,{type:'addManual',name:'entretien TEST',quantity:1,unit:'unité'});s=command(s,{type:'editManual',id:s.shopping.manual[0].id,patch:{unitPriceCents:2000}});
  const before=JSON.stringify(s.plan),p=generateMenu(s,{meals:7,diners:2,maxMinutes:60});assert.equal(p.plan.length,7);assert.ok(p.search.evaluated>1);assert.equal(JSON.stringify(s.plan),before);assert.equal(p.cart.complete,true);assert.ok(p.cart.totalCents>=2000);assert.ok(p.cart.totalCents<=10000);assert.equal(p.budgetStatus,'estimated_within_budget');
  const accepted=command(s,{type:'acceptMenu',proposal:p});assert.equal(accepted.plan.length,7);assert.equal(accepted.shopping.manual.length,1);
  const changed=command(s,{type:'budget',value:'95'});assert.throws(()=>command(changed,{type:'acceptMenu',proposal:p}),/changé/);
});
test('quiche exclue automatiquement pour cinq convives, sélection manuelle conservée',()=>{
  const s=fixtureState(),r=engineRecipes.find(r=>r.id.includes('quiche'));s.plan=[{id:'q',recipeId:r.id,portions:5}];
  const c=calculateCart(s);assert.equal(c.requirements.preparations[0].producedPortions,'8');
  const p=generateMenu(s,{meals:7,diners:5,maxMinutes:120});assert.ok(p.plan.every(m=>m.recipeId!==r.id));
});
test('dix repas et remplacement ciblé : les autres choix proposés restent conservés',()=>{
  const s=fixtureState(),first=generateMenu(s,{meals:10,diners:2,maxMinutes:60});assert.equal(first.plan.length,10);
  const shadow=structuredClone(s);shadow.plan=first.plan;shadow.recipes=shadow.recipes.filter(r=>r.id!==first.plan[0].recipeId);
  const next=generateMenu(shadow,first.criteria,{replaceMealId:first.plan[0].id});
  assert.notEqual(next.plan[0].recipeId,first.plan[0].recipeId);
  assert.deepEqual(next.plan.slice(1).map(m=>m.recipeId),first.plan.slice(1).map(m=>m.recipeId));
  assert.equal(s.plan.length,0);
});
test('les équipements explicitement demandés dans les étapes filtrent le générateur',()=>{
  const s=fixtureState();s.v3.profile.equipment=['plaques','poêle','casserole'];
  const p=generateMenu(s,{meals:7,diners:2,maxMinutes:60});
  for(const meal of p.plan)assert.ok(equipmentNeeded(engineRecipes.find(r=>r.id===meal.recipeId)).every(e=>s.v3.profile.equipment.includes(e)));
});
test('vider conserve planning, recettes et favoris ; régénération explicite',()=>{
  let s=fixtureState();s.plan=[{id:'m',recipeId:engineRecipes[0].id,portions:2}];s.favorites=[engineRecipes[0].id];const before=JSON.stringify(s.plan);
  s=command(s,{type:'clearShopping'});assert.equal(JSON.stringify(s.plan),before);assert.equal(s.favorites.length,1);assert.equal(calculateCart(s).rows.length,0);
  s=command(s,{type:'restoreRows'});assert.ok(calculateCart(s).rows.length>0);
});
test('tickets : brouillon, remise affectée, confirmation, trois références améliorées et suppression',()=>{
  let s=fixtureState();const ids=['i_riz_basmati','i_lait','i_yaourt_grec_nature'];
  for(const o of s.v3.observations)o.store='TEST MAGASIN';
  const draft=parseReceipt('TEST MAGASIN\n14/11/2026\nRIZ 1,80\nLAIT 1,20\nYAOURT 2,50\nBISCUITS 4,00\nREMISE -0,40\nTOTAL 9,10');
  draft.date=today();ids.forEach((id,k)=>draft.lines[k].productId=productFor(s,id).id);
  assert.throws(()=>validateReceipt(draft,{id:'t',products:productsOf(s)}),/confirmation/);
  assert.throws(()=>validateReceipt(draft,{id:'t',products:productsOf(s),confirmed:true}),/remise/);
  draft.lines[4].appliesTo=draft.lines[3].id;
  const before=s.v3.receipts.length;s=command(s,{type:'confirmReceipt',draft});assert.equal(s.v3.receipts.length,before+1);
  for(const [k,id] of ids.entries()){const ref=selectReference(productFor(s,id),s.v3.observations,{store:'TEST MAGASIN'});assert.equal(ref.cents,[180,120,250][k]);assert.equal(ref.source,'receipt');}
  const clean=command(s,{type:'deleteReceipt',id:s.v3.receipts[0].id});assert.equal(clean.v3.receipts.length,0);assert.ok(clean.v3.observations.every(o=>!o.receiptId));
});
test('promotions exceptionnelles et prix trop anciens ne remplacent pas une référence admissible',()=>{
  const p={id:'p'},base={productId:'p',currency:'EUR',store:'TEST',source:'receipt',evidence:'TEST',date:today()};
  const rows=[{...base,id:'regular',cents:200},{...base,id:'promotion',cents:1,promotion:true},{...base,id:'old',date:'2000-01-01',cents:1}];
  assert.equal(selectReference(p,rows,{store:'TEST'}).cents,200);assert.equal(selectReference(p,[rows[2]],{store:'TEST'}).cents,null);
  assert.equal(selectReference(p,[{...base,id:'loyalty',cents:10,promotion:true,memberOnly:true}],{store:'TEST',allowPromotions:true}).cents,null);
  const pub={...base,source:'open_prices',locationId:10,id:'op-test',cents:190};assert.equal(selectReference(p,[pub],{store:'TEST'}).kind,'open_prices');assert.equal(selectReference(p,[pub],{store:'TEST',storeLocationId:10}).kind,'recent_store');
  const median=selectReference(p,[{...base,id:'newest',cents:300,date:'2026-11-14'},{...base,id:'median',cents:200,date:'2026-10-01'},{...base,id:'other',cents:100,date:'2026-10-02'}],{store:'TEST',asOf:'2026-11-14'});
  assert.equal(median.cents,200);assert.equal(median.date,'2026-10-01');
});
test('sources publiques : opt-in, cache et hôtes limités, sans aucun envoi de ticket',async()=>{
  let calls=0;const cache=new Map(),api=createSources({enabled:()=>true,cache,wait:async()=>{},fetcher:async url=>{calls++;assert.ok(url.startsWith('https://world.openfoodfacts.org/'));return {ok:true,text:async()=>JSON.stringify({status:1,product:{code:'3017620422003',product_name:'PRODUIT SYNTHÉTIQUE API DE TEST',quantity:'750 g'}})};}});
  const p=await api.product('3017620422003');assert.equal(p.content.amount,'750');await api.product('3017620422003');assert.equal(calls,1);
  assert.throws(()=>api.request('https://example.invalid/private'),/non autorisé/);
  await assert.rejects(createSources().product('3017620422003'),/Activez/);
  assert.equal(parseNetQuantity('2 x 125 g').amount,'250');assert.equal(parseNetQuantity('format inconnu'),null);
  assert.throws(()=>validObservation({id:'bad-date',productId:'p',cents:100,currency:'EUR',source:'manual',evidence:'TEST',date:'2026-02-31'}),/invalide/);
});
test('persistance isolée, conservation des personnalisations et quota sans faux succès',async()=>{
  const map=new Map([['v2-original','favoris originaux']]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},states=[];
  const client=createClient({storage,callbacks:{state:s=>states.push(s)}});await client.start();await client.mutate(s=>command(s,{type:'budget',value:'90'}));
  const saved=map.get(STORAGE_KEY);assert.equal(map.get('v2-original'),'favoris originaux');assert.equal(JSON.parse(saved).v3.budgetCents,9000);
  storage.setItem=()=>{throw Error('quota');};await assert.rejects(client.mutate(s=>command(s,{type:'budget',value:'10'})),/quota/);assert.equal(map.get(STORAGE_KEY),saved);
});
