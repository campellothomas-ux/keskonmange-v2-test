import {Q} from '../../engine/src/exact.mjs';
import {productionRequirements} from '../../engine/src/production.mjs';
import {jointBasket} from '../../engine/src/joint-packages.mjs';
import {optimizeMenuJoint} from '../../engine/src/joint-optimizer.mjs';
import {initialMenu} from '../../engine/src/menu-evaluation.mjs';
import {emptyStock} from '../../engine/src/ledger.mjs';
import {choosePackages,priceLines} from '../../engine/src/packages.mjs';
import {ingredientMap,validateCatalog} from '../../engine/src/model.mjs';
import {ingredients,allIngredientById,engineById,qualifiedRecipe,number,unitLabel,equipmentNeeded} from './catalog.mjs';
import {norm,selectReference,today} from './prices.mjs';

export const productsOf = state => [...(state.v3.public.products??[]),...(state.v3.privateProducts??[])];
export const observationsOf = state => [...(state.v3.public.observations??[]),...(state.v3.observations??[])];
export function menuOf(state,plan=state.plan) {return {...initialMenu('household-menu'),meals:plan.map(m=>({id:m.id,recipeId:m.recipeId,diners:m.portions??m.diners,leftovers:'keep',selection:'user',indivisiblePolicy:'ceil'}))};}
export function demandOf(state,plan=state.plan) {
  const needs={},preparations=[],issues=[];
  for(const m of plan) {
    const r=qualifiedRecipe(state,m.recipeId),servings=m.portions??m.diners;
    if(r) {
      const req=productionRequirements([r],[{id:m.id,recipeId:r.id,diners:servings,leftovers:'keep',indivisiblePolicy:'ceil'}],ingredients);
      for(const [id,q] of Object.entries(req.needs))needs[id]=Q.of(needs[id]??0).add(q).toString();
      preparations.push(...req.preparations);
    }else {
      const ui=state.recipes.find(r=>r.id===m.recipeId);if(!ui){issues.push({recipeId:m.recipeId,message:'Recette manquante.'});continue;}
      issues.push({recipeId:ui.id,message:'Recette V1 ou modifiée : rendement et étapes à qualifier, calcul proportionnel provisoire.'});
      for(const g of ui.ingredients) {
        const unitFactor={kg:1000,l:1000,cl:10}[g.unite]??1;
        needs[g.ingredientId]=Q.of(needs[g.ingredientId]??0).add(Q.of(String(g.quantite)).mul(String(servings)).div(String(ui.portions)).mul(String(unitFactor))).toString();
      }
    }
  }
  return {needs,preparations,individual:[],issues};
}
export function engineOffers(state) {
  const session={storeId:'household-estimate',asOf:today()},refs={},offers=[],byId=new Map(),evaluationIngredients=[...ingredients];
  for(const product of productsOf(state)) {
    let binding=state.v3.bindings[product.id],i=allIngredientById.get(binding?.ingredientId);
    if(!binding?.confirmed||!i||!binding.amount) {
      // Une unité commerciale observée est achetable même sans correspondance
      // culinaire. Aucun poids ni nombre d’œufs n’est déduit de ce compteur.
      i={id:`commercial-${product.id}`,name:product.name,unit:product.saleMode==='weight'?'g':'unit',basis:'net',...(product.saleMode==='weight'?{}:{countKind:`commercial:${product.id}`})};
      binding={amount:product.saleMode==='weight'?'1000':'1',evidence:'Unité commerciale de cette référence ; aucune conversion vers les besoins culinaires.'};
    }
    if(!evaluationIngredients.some(x=>x.id===i.id))evaluationIngredients.push(i);
    const reference=selectReference(product,observationsOf(state),{store:state.v3.profile.store,storeLocationId:state.v3.profile.storeLocationId,allowPromotions:state.v3.profile.allowPromotions,allowMemberPrices:state.v3.profile.allowMemberPrices});
    const p={id:product.id,ingredientId:i.id,storeId:session.storeId,mode:product.saleMode==='weight'?'weight':'fixed',saleUnit:product.quantityLabel||'conditionnement confirmé',
      content:{amount:String(binding.amount),unit:i.unit,basis:i.basis,...(i.countKind?{countKind:i.countKind}:{})},contentVerified:true,
      contentEvidence:binding.evidence||`Format explicitement confirmé pour ${product.name}`,price:{kind:reference.cents===null?'unknown':'estimated',cents:reference.cents,currency:'EUR',storeId:session.storeId,...(reference.date?{observedOn:reference.date}:{})}};
    if(p.mode==='weight') {
      if(i.unit!=='g')continue;
      p.increment={amount:String(binding.increment||'1'),unit:'g',basis:i.basis};
      p.priceQuantity={amount:String(binding.amount),unit:'g',basis:i.basis};
      p.incrementKnown=!!binding.increment;
    }
    refs[p.id]=reference;offers.push(p);byId.set(p.id,product);
  }
  return {session,offers,refs,byId,evaluationIngredients};
}
export function calculateCart(state,{plan=state.plan}={}) {
  const requirements=demandOf(state,plan),{offers,session,refs,byId,evaluationIngredients}=engineOffers(state);
  const free=Object.fromEntries(Object.entries(state.v3.pantry).filter(([,q])=>Q.of(q).cmp(0)>=0)),manualLines=[],weightManual={},unbound=[],covered={},extras={},manualOwners={};
  for(const item of state.shopping.manual) {
    const offer=offers.find(p=>p.id===item.productId);
    if(offer?.mode==='weight') {
      if(!['g','kg'].includes(item.unite))throw Error('Pour une vente au poids, indiquez les grammes ou kilogrammes de cet achat manuel.');
      const mass=Q.of(String(item.quantite)).mul(item.unite==='kg'?'1000':'1').mul(offer.priceQuantity.amount).div('1000');
      weightManual[offer.id]=Q.of(weightManual[offer.id]??0).add(mass).toString();(manualOwners[offer.id]??=[]).push(item.id);
      if(item.intent==='cover')covered[offer.ingredientId]=Q.of(covered[offer.ingredientId]??0).add(mass).toString();
      else extras[offer.ingredientId]=Q.of(extras[offer.ingredientId]??0).add(mass).toString();
    }else if(offer&&Number.isInteger(item.quantite)&&item.quantite>0) {
      manualLines.push({productId:offer.id,count:item.quantite});
      (manualOwners[offer.id]??=[]).push(item.id);
      if(item.intent==='cover')covered[offer.ingredientId]=Q.of(covered[offer.ingredientId]??0).add(Q.of(offer.content.amount).mul(String(item.quantite))).toString();
      else extras[offer.ingredientId]=Q.of(extras[offer.ingredientId]??0).add(Q.of(offer.content.amount).mul(String(item.quantite))).toString();
    }else unbound.push({id:item.id,manual:true,name:item.nom,necessary:null,quantity:item.quantite,unit:item.unite||'unité',rayon:state.rayonOverrides[item.ingredientId]||item.rayon||'a_classer',
      totalCents:Number.isSafeInteger(item.unitPriceCents)?Number(Q.of(item.unitPriceCents).mul(String(item.quantite)).ceil()):Number.isSafeInteger(item.totalCents)?item.totalCents:null,source:item.unitPriceCents!==undefined||item.totalCents!==null&&item.totalCents!==undefined?'manual':'unknown',priceDate:item.priceDate,priceEvidence:item.priceEvidence,product:null,manualIds:[item.id]});
  }
  const known={},unknown=[],needed={},meta={};
  for(const [id,q] of Object.entries(requirements.needs)) {
    const i=allIngredientById.get(id),stock=Q.of(free[id]??0),manualCover=Q.of(covered[id]??0),afterStock=Q.of(q).sub(stock).cmp(0)>0?Q.of(q).sub(stock):Q.of(0),toBuy=afterStock.sub(manualCover).cmp(0)>0?afterStock.sub(manualCover):Q.of(0);
    needed[id]=toBuy.toString();meta[id]={required:q,fromStock:Q.of(q).cmp(stock)<0?q:stock.toString(),covered:manualCover.toString(),toBuy:toBuy.toString()};
    if(toBuy.cmp(0)===0)continue;
    if(offers.some(p=>p.ingredientId===id))known[id]=toBuy.toString();
    else {const row=state.recipes.flatMap(r=>r.ingredients).find(g=>g.ingredientId===id),displayUnit=i?unitLabel(i):({kg:'g',l:'ml',cl:'ml'}[row?.unite]||row?.unite||'');unknown.push({id:`need-${id}`,ingredientId:id,name:i?.name||row?.nom||id,
      necessary:q,quantity:toBuy.toString(),unit:displayUnit,rayon:state.rayonOverrides[id]||row?.meta?.rayon||'a_classer',
      totalCents:null,source:'unknown',product:null,surplus:null});
    }
  }
  // Les stocks et les achats couvrants ont déjà été déduits une seule fois.
  const weightNeeds=Object.fromEntries(Object.entries(known).filter(([id])=>offers.some(p=>p.ingredientId===id&&p.mode==='weight')));
  const fixedNeeds=Object.fromEntries(Object.entries(known).filter(([id])=>!(id in weightNeeds)));
  for(const offer of offers)if(offer.mode==='weight'&&!offer.incrementKnown)offer.increment.amount=weightNeeds[offer.ingredientId]||weightManual[offer.id]||'1';
  let catalog=validateCatalog(offers,evaluationIngredients,session);const map=ingredientMap(evaluationIngredients);
  const basket=jointBasket({ingredients:evaluationIngredients,products:offers,session,state:emptyStock(),manual:manualLines,maxStates:30000,maxPortfolioStates:5000,policy:{}},
    {needs:fixedNeeds,preparations:requirements.preparations,individual:[]});
  let menuLines=basket.menu.lines.map(l=>({productId:l.productId,count:l.count}));
  for(const [id,amount] of Object.entries(weightNeeds)) {
    const opts=catalog.filter(p=>p.ingredientId===id),sets=[...opts.filter(p=>p.mode==='weight').map(p=>[p]),opts.filter(p=>p.mode==='fixed')].filter(s=>s.length);
    const candidates=sets.map(options=>{const cover=choosePackages(amount,options,map);return {...cover,priced:priceLines(cover.lines,catalog,map,session)};});
    candidates.sort((a,b)=>(a.priced.totalCents===null)-(b.priced.totalCents===null)||(a.priced.totalCents??Infinity)-(b.priced.totalCents??Infinity));
    menuLines.push(...candidates[0].lines);
  }
  for(const [ingredientId,productId] of Object.entries(state.v3.productChoices??{})) {
    if(!known[ingredientId])continue;
    const chosen=catalog.find(p=>p.id===productId&&p.ingredientId===ingredientId);if(!chosen)continue;
    menuLines=menuLines.filter(l=>offers.find(p=>p.id===l.productId)?.ingredientId!==ingredientId);
    menuLines.push(...choosePackages(known[ingredientId],[chosen],map).lines);
  }
  if(state.v3.profile.range!=='indifférent')for(const [id,amount] of Object.entries(known)) {
    if(state.v3.productChoices?.[id])continue;
    const preferred=catalog.filter(p=>p.ingredientId===id&&p.mode==='fixed'&&state.v3.bindings[p.id]?.range===state.v3.profile.range);
    if(preferred.length){menuLines=menuLines.filter(l=>catalog.find(p=>p.id===l.productId)?.ingredientId!==id);menuLines.push(...choosePackages(amount,preferred,map).lines);}
  }
  let selectedLines=[...menuLines,...manualLines];
  for(const offer of offers.filter(p=>p.mode==='weight')) {
    const mass=selectedLines.filter(l=>l.productId===offer.id).reduce((a,l)=>a.add(Q.of(offer.increment.amount).mul(l.count)),Q.of(weightManual[offer.id]??0));
    selectedLines=selectedLines.filter(l=>l.productId!==offer.id);
    if(mass.cmp(0)>0){offer.increment.amount=mass.toString();selectedLines.push({productId:offer.id,count:1});}
  }
  for(const [productId,count] of Object.entries(state.v3.purchaseOverrides??{}))if(selectedLines.some(l=>l.productId===productId)){
    const offer=offers.find(p=>p.id===productId);
    if(offer.mode==='weight'){offer.increment.amount=Q.of(String(count)).mul(offer.priceQuantity.amount).div('1000').toString();selectedLines=[...selectedLines.filter(l=>l.productId!==productId),{productId,count:1}];}
    else selectedLines=[...selectedLines.filter(l=>l.productId!==productId),{productId,count}];
  }
  catalog=validateCatalog(offers,evaluationIngredients,session);
  const priced=priceLines(selectedLines,catalog,map,session);
  const rows=priced.lines.map(line=>{
    const offer=offers.find(p=>p.id===line.productId),p=byId.get(line.productId),i=map.get(offer.ingredientId),reference=refs[line.productId];
    return {id:`product-${p.id}`,ingredientId:i.id,name:p.name,necessary:requirements.needs[i.id]??null,quantity:offer.mode==='weight'?number(Q.of(line.acquired).mul('1000').div(offer.priceQuantity.amount)):line.count,unit:offer.mode==='weight'?'g':offer.saleUnit,
      bought:line.acquired,weight:offer.mode==='weight',reference,product:p,totalCents:line.costCents,
      source:reference.source||'unknown',rayon:state.rayonOverrides[i.id]||state.shopping.manual.find(m=>manualOwners[p.id]?.includes(m.id))?.rayon||state.recipes.flatMap(r=>r.ingredients).find(g=>g.ingredientId===i.id)?.meta?.rayon||'a_classer',
      manualIds:manualOwners[p.id]??[],surplus:null};
  });
  // Le surplus est calculé sur l’achat total, après agrégation, pas par recette.
  for(const [id,q] of Object.entries(requirements.needs)) {
    const group=rows.filter(r=>r.ingredientId===id),bought=group.reduce((a,r)=>a.add(r.bought),Q.of(0)),used=Q.of(q).sub(meta[id]?.fromStock??0).add(extras[id]??0);
    if(group.length&&bought.cmp(used)>0)group[0].surplus=bought.sub(used).toString();
  }
  const all=[...rows,...unknown,...unbound].map(r=>({...r,name:state.v3.rowOverrides[r.id]?.displayName||r.name,
    ...(!r.product&&!r.manual&&state.v3.rowOverrides[r.id]?.purchaseQuantity?{quantity:state.v3.rowOverrides[r.id].purchaseQuantity}:{})})),selected=all.filter(r=>!state.v3.excludedRows.includes(r.id)),excludedRows=all.filter(r=>state.v3.excludedRows.includes(r.id));
  const shortfalls=selected.filter(r=>!r.product&&!r.manual&&needed[r.ingredientId]&&Q.of(r.quantity).cmp(needed[r.ingredientId])<0).map(r=>r.name);
  for(const [id,q] of Object.entries(requirements.needs)) {
    if(!known[id])continue;
    const acquired=selected.filter(r=>r.ingredientId===id&&r.bought).reduce((a,r)=>a.add(r.bought),Q.of(0));
    const target=Q.of(q).sub(meta[id]?.fromStock??0).add(extras[id]??0);
    if(acquired.cmp(target)<0)shortfalls.push(allIngredientById.get(id)?.name||id);
  }
  const missing=selected.filter(r=>r.totalCents===null),subtotal=selected.reduce((a,r)=>a+(r.totalCents??0),0),complete=missing.length===0&&excludedRows.length===0&&shortfalls.length===0;
  return {rows:selected,excluded:all.filter(r=>state.v3.excludedRows.includes(r.id)),requirements,meta,knownSubtotalCents:subtotal,totalCents:complete?subtotal:null,
    budgetCents:state.v3.budgetCents,remainingCents:state.v3.budgetCents-subtotal,shortfalls,coverage:{priced:selected.length-missing.length,total:all.length,ratio:all.length?(selected.length-missing.length)/all.length:1},
    complete,missing:[...missing,...excludedRows].map(r=>r.name),sourceAmounts:selected.reduce((a,r)=>{a[r.source]=(a[r.source]??0)+(r.totalCents??0);return a;},{}),basket:{...basket,cart:priced}};
}

export function interpretRequest(text) {
  const s=norm(text),result={},notes=[];let m;
  if(m=s.match(/(\d+)\s*(?:euros?|eur|e)\b/))result.budgetCents=Number(m[1])*100;
  if(m=s.match(/(\d+)\s*repas/))result.meals=Number(m[1]);
  if(m=s.match(/(\d+)\s*(?:personnes|convives|parts)/))result.diners=Number(m[1]);
  if(m=s.match(/(\d+)\s*(?:min|minutes)/))result.maxMinutes=Number(m[1]);
  if(/vegetarien/.test(s))result.diet='vegetarien';
  notes.push('Interprétation locale limitée aux nombres, repas, convives, minutes et au mot « végétarien ». Vérifiez les champs ; aucune IA externe.');
  return {criteria:result,notes};
}
export function generateMenu(state,criteria,{replaceMealId=null}={}) {
  const meals=Number(criteria.meals),diners=Number(criteria.diners),maxMinutes=Number(criteria.maxMinutes||240);
  if(!Number.isInteger(meals)||meals<1||meals>10||!Number.isInteger(diners)||diners<1||diners>12)throw Error('Choisissez 1 à 10 repas et 1 à 12 convives.');
  const profile=state.v3.profile,excluded=String(profile.exclusions||'').split(',').map(norm).filter(Boolean);
  let recipes=state.recipes.map(r=>qualifiedRecipe(state,r.id)).filter(Boolean).filter(r=>r.minutes<=maxMinutes);
  if(criteria.diet==='vegetarien'||profile.diet==='vegetarien')recipes=recipes.filter(r=>r.category==='vegetarien');
  recipes=recipes.filter(r=>!r.ingredients.some(g=>excluded.some(x=>norm(allIngredientById.get(g.ingredientId)?.name).includes(x))));
  // Une allergie active interdit une composition inconnue ; aucune assimilation de variantes.
  const allergy=String(profile.allergies||'').split(',').map(norm).filter(Boolean);
  if(allergy.length)recipes=recipes.filter(r=>r.ingredients.every(g=>state.v3.allergenReviews[g.ingredientId]?.confirmed&&
    !allergy.some(a=>(state.v3.allergenReviews[g.ingredientId].allergens??[]).some(x=>norm(x).includes(a)))));
  const equipment=profile.equipment??['four','plaques','poêle','casserole'];
  recipes=recipes.filter(r=>equipmentNeeded(r).every(item=>equipment.includes(item)));
  if(!recipes.length)throw Error('Aucune recette techniquement qualifiée ne respecte ces contraintes. Vérifiez les exclusions, équipements et compositions allergènes.');
  const {offers,session,evaluationIngredients}=engineOffers(state);
  const pricedIds=new Set(offers.filter(p=>p.price.cents!==null).map(p=>p.ingredientId));
  const fullyPriced=recipes.filter(r=>r.ingredients.every(g=>pricedIds.has(g.ingredientId)||Q.of(state.v3.pantry[g.ingredientId]??0).cmp(g.quantity.amount)>=0));
  if(fullyPriced.length>=meals)recipes=fullyPriced;
  const context={ingredients:evaluationIngredients,recipes,products:offers,session,state:emptyStock(),constraints:{maxRepeats:1,minDistinct:meals},
    policy:{preferredRecipeIds:state.favorites,preferencePenaltyCents:10,repeatPenaltyCents:100,familyRepeatPenaltyCents:20},budget:{cents:state.v3.budgetCents,strict:false}};
  const slots=Array.from({length:meals},(_,k)=>({id:`proposal-${k+1}`,diners,leftovers:'keep',indivisiblePolicy:'ceil',
    ...(replaceMealId&&state.plan[k]&&state.plan[k].id!==replaceMealId?{recipeId:state.plan[k].recipeId,locks:{recipe:true}}:{})}));
  const result=optimizeMenuJoint(context,{slots,strategy:'diverse',maxEvaluations:180,seedCount:10,allowProductionAdjustments:false,maxNodes:30000,
    evaluateCandidate:(ctx,menu)=>{
      const plan=menu.meals.map(m=>({id:m.id,recipeId:m.recipeId,portions:m.diners})),cart=calculateCart(state,{plan});
      const over=Math.max(0,cart.knownSubtotalCents-state.v3.budgetCents),families=new Set(menu.meals.map(m=>engineById.get(m.recipeId)?.category));
      // Pénalité de données manquantes = priorité de recherche, jamais un prix fictif.
      const uncertainty=cart.missing.length*1000000,preferred=new Set(ctx.policy.preferredRecipeIds??[]),preference=preferred.size?menu.meals.filter(m=>!preferred.has(m.recipeId)).length*10:0;
      const score=cart.knownSubtotalCents+over*100+uncertainty+(menu.meals.length-families.size)*20+preference;
      return {score:String(score),basket:{cart:{totalCents:cart.totalCents},packageOptimal:false},cart,coverage:cart.coverage};
    }});
  if(!result.solution)throw Error('Aucune combinaison trouvée dans la limite de recherche. Diminuez les contraintes ou le nombre de repas.');
  const cart=result.solution.evaluation.cart;
  return {id:`proposal-${Date.now()}`,basePlan:JSON.stringify(state.plan),baseRevision:state.v3.revision,criteria:{...criteria},plan:result.solution.menu.meals.map(m=>({id:m.id,recipeId:m.recipeId,portions:m.diners})),cart,search:result.search,
    budgetStatus:!cart.complete?'incomplete':cart.remainingCents>=0?'estimated_within_budget':'estimated_over_budget'};
}
