import {baseState,clone,uid,addMeal,editMeal,removeMeal,changeRayon} from '../../../core.mjs';
import publicSeed from '../data/public-prices.json' with {type:'json'};
import {uiRecipes,allIngredientById,qualifiedRecipe} from './catalog.mjs';
import {calculateCart,productsOf} from './economy.mjs';
import {norm,cents,today,validObservation} from './prices.mjs';
import {validateReceipt,deleteReceipt} from './receipts.mjs';

export const STORAGE_KEY='keskonmange:v3:integrated:1';
export function createState() {
  return {...baseState(uiRecipes),v3:{version:1,budgetCents:10000,profile:{store:'',storeLocationId:'',diet:'',allergies:'',exclusions:'',equipment:['four','plaques','poêle','casserole'],range:'indifférent',allowPromotions:false,allowMemberPrices:false,allowOpenData:false},
    public:clone(publicSeed),privateProducts:[],observations:[],bindings:{},aliases:{},receipts:[],pantry:{},allergenReviews:{},checked:{},productChoices:{},purchaseOverrides:{},rowOverrides:{},excludedRows:[],nextId:1,revision:0,lastReprice:null}};
}
export function validateState(s) {
  if(!s||s.version!==2||s.v3?.version!==1||!Array.isArray(s.recipes)||!Array.isArray(s.plan)||!Array.isArray(s.shopping?.manual)||!s.v3.profile||!s.v3.public)throw Error('Sauvegarde V3 incompatible, conservée sans écriture.');
  if(!Number.isSafeInteger(s.v3.budgetCents)||s.v3.budgetCents<0||s.v3.budgetCents>10000000)throw Error('Budget invalide.');
  if(s.plan.length>30||s.plan.some(m=>!s.recipes.some(r=>r.id===m.recipeId)||!Number.isInteger(m.portions)||m.portions<1||m.portions>40))throw Error('Planning invalide.');
  for(const o of s.v3.observations)validObservation(o);
  return s;
}
function requireValue(condition,message){if(!condition)throw Error(message);}
export function command(state,cmd) {
  const repricing=['manualPrice','confirmReceipt','deleteReceipt','personalProduct','savePublic'].includes(cmd.type),before=repricing?calculateCart(state):null;
  let s=clone(state);s.v3.revision++;
  switch(cmd.type) {
    case 'budget': s.v3.budgetCents=cents(cmd.value);requireValue(s.v3.budgetCents>=0,'Budget positif attendu.');break;
    case 'profile': s.v3.profile={...s.v3.profile,...cmd.patch};break;
    case 'addMeal': s=addMeal(s,cmd.recipeId,Number(cmd.portions));break;
    case 'portions': s=editMeal(s,cmd.mealId,Number(cmd.portions));break;
    case 'removeMeal': s=removeMeal(s,cmd.mealId);break;
    case 'moveMeal': {
      const at=s.plan.findIndex(m=>m.id===cmd.mealId),to=at+cmd.delta;
      if(at>=0&&to>=0&&to<s.plan.length)[s.plan[at],s.plan[to]]=[s.plan[to],s.plan[at]];break;
    }
    case 'acceptMenu': {
      requireValue(JSON.stringify(s.plan)===cmd.proposal.basePlan,'Le planning a changé. Recalculez la proposition avant de la confirmer.');
      requireValue(cmd.proposal.baseRevision===s.v3.revision-1,'Les achats, prix ou préférences ont changé. Recalculez ce menu avant de le confirmer.');
      s.plan=cmd.proposal.plan.map(m=>({...m,id:uid('meal')}));break;
    }
    case 'addManual': {
      const name=String(cmd.name??'').trim(),quantity=Number(cmd.quantity??1);
      requireValue(name&&name.length<=150&&Number.isFinite(quantity)&&quantity>0&&quantity<=100000,'Nom et quantité valides obligatoires.');
      const product=productsOf(s).find(p=>p.id===cmd.productId);
      if(product&&product.saleMode!=='weight')requireValue(Number.isInteger(quantity),'Les conditionnements doivent rester entiers.');
      const line={id:uid('manual'),nom:name,quantite:quantity,unite:String(cmd.unit||'unité'),ingredientId:cmd.ingredientId||'',rayon:cmd.rayon||'a_classer',
        productId:product?.id||'',intent:cmd.intent==='cover'?'cover':'extra',totalCents:cmd.total===''||cmd.total===undefined?null:cents(cmd.total),checked:false};
      if(cmd.mergeId) {
        const existing=s.shopping.manual.find(m=>m.id===cmd.mergeId);
        requireValue(existing&&existing.unite===line.unite&&existing.productId===line.productId&&existing.intent===line.intent,'Ces lignes ne peuvent pas être fusionnées sans conversion ou choix explicite de produit.');
        existing.quantite+=line.quantite;
        existing.totalCents=existing.totalCents!==null&&line.totalCents!==null?existing.totalCents+line.totalCents:null;
      }else s.shopping.manual.push(line);
      break;
    }
    case 'editManual': {
      const m=s.shopping.manual.find(m=>m.id===cmd.id);requireValue(m,'Article introuvable.');
      if(cmd.patch.unite&&cmd.patch.unite!==m.unite&&cmd.patch.unitPriceCents===undefined){delete m.unitPriceCents;delete m.priceDate;delete m.priceEvidence;}
      Object.assign(m,cmd.patch);
      requireValue(m.nom?.trim()&&Number.isFinite(m.quantite)&&m.quantite>0,'Nom et quantité valides obligatoires.');
      if(m.unitPriceCents!==undefined)requireValue(Number.isSafeInteger(m.unitPriceCents)&&m.unitPriceCents>=0,'Prix unitaire positif attendu.');
      if(cmd.patch.unitPriceCents!==undefined){m.priceDate=today();m.priceEvidence='Prix indicatif par unité saisi par le foyer';}break;
    }
    case 'removeManual': s.shopping.manual=s.shopping.manual.filter(m=>m.id!==cmd.id);break;
    case 'check': s.v3.checked[cmd.id]={checked:!!cmd.checked,signature:cmd.signature||''};break;
    case 'rayon': s=changeRayon(s,cmd.ingredientId,cmd.rayon);break;
    case 'excludeRow': if(!s.v3.excludedRows.includes(cmd.id))s.v3.excludedRows.push(cmd.id);break;
    case 'restoreRows': s.v3.excludedRows=[];break;
    case 'clearShopping': s.v3.excludedRows=[...new Set([...s.v3.excludedRows,...calculateCart(s).rows.filter(r=>!r.manual).map(r=>r.id)])];s.shopping.manual=[];s.v3.checked={};s.v3.purchaseOverrides={};break;
    case 'chooseProduct': {
      requireValue(s.v3.bindings[cmd.productId]?.ingredientId===cmd.ingredientId,'Le produit doit être explicitement associé à cet ingrédient.');
      s.v3.productChoices[cmd.ingredientId]=cmd.productId;break;
    }
    case 'purchaseQuantity': {
      const p=productsOf(s).find(p=>p.id===cmd.productId);
      requireValue(p&&(p.saleMode==='weight'?Number.isFinite(cmd.quantity):Number.isInteger(cmd.quantity))&&cmd.quantity>0&&cmd.quantity<=100000,'Quantité d’achat valide attendue ; les conditionnements restent entiers.');
      s.v3.purchaseOverrides[cmd.productId]=cmd.quantity;break;
    }
    case 'rowLabel': s.v3.rowOverrides[cmd.id]={...(s.v3.rowOverrides[cmd.id]??{}),displayName:String(cmd.name).trim()};break;
    case 'unreferencedQuantity': {
      requireValue(Number.isFinite(cmd.quantity)&&cmd.quantity>0&&cmd.quantity<=100000,'Quantité d’achat positive attendue.');
      s.v3.rowOverrides[cmd.id]={...(s.v3.rowOverrides[cmd.id]??{}),purchaseQuantity:String(cmd.quantity)};break;
    }
    case 'allergenReview': {
      requireValue(allIngredientById.has(cmd.ingredientId),'Ingrédient inconnu.');
      s.v3.allergenReviews[cmd.ingredientId]={confirmed:true,allergens:String(cmd.allergens||'').split(',').map(x=>x.trim()).filter(Boolean),date:today(),evidence:'Composition vérifiée et confirmée par le foyer'};break;
    }
    case 'stock': {
      const i=allIngredientById.get(cmd.ingredientId);requireValue(i,'Ingrédient inconnu.');
      if(cmd.quantity==='')delete s.v3.pantry[i.id];else {requireValue(Number(cmd.quantity)>=0,'Stock positif attendu.');s.v3.pantry[i.id]=String(cmd.quantity);}break;
    }
    case 'bindProduct': {
      const p=productsOf(s).find(p=>p.id===cmd.productId),i=allIngredientById.get(cmd.ingredientId);
      requireValue(p&&i&&Number(cmd.amount)>0,'Produit, ingrédient et quantité utilisable nécessaires.');
      s.v3.bindings[p.id]={ingredientId:i.id,amount:String(cmd.amount),confirmed:true,evidence:String(cmd.evidence||'Quantité utilisable lue et confirmée par le foyer'),confirmedOn:today(),range:cmd.range||'',...(cmd.increment?{increment:String(cmd.increment)}:{})};break;
    }
    case 'savePublic': {
      const before=calculateCart(s);
      for(const p of cmd.products??[])s.v3.public.products=[...s.v3.public.products.filter(x=>x.id!==p.id),p];
      for(const o of cmd.observations??[])s.v3.public.observations=[...s.v3.public.observations.filter(x=>x.id!==o.id),validObservation(o)];
      const after=calculateCart(s);s.v3.lastReprice={before:before.totalCents,after:after.totalCents,date:today(),source:'Open Prices'};break;
    }
    case 'personalProduct': {
      requireValue(cmd.name?.trim()&&Number(cmd.amount)>0&&['g','ml','unit'].includes(cmd.unit),'Nom et conditionnement explicites nécessaires.');
      if(cmd.saleMode==='weight')requireValue(cmd.unit==='g'&&Number(cmd.amount)===1000,'Pour une vente au poids, indiquez la référence de prix pour 1 000 g (un kilogramme).');
      const p={id:uid('personal'),name:cmd.name.trim(),brand:cmd.brand||'',quantityLabel:cmd.saleMode==='weight'?'Vente au poids · prix au kg':`${cmd.amount} ${cmd.unit}`,saleMode:cmd.saleMode||'fixed',content:{amount:String(cmd.amount),unit:cmd.unit,evidence:'Conditionnement déclaré par le foyer'},source:'personal',barcode:cmd.barcode||'',allergens:null};
      s.v3.privateProducts.push(p);
      if(cmd.ingredientId)s.v3.bindings[p.id]={ingredientId:cmd.ingredientId,amount:String(cmd.usableAmount||cmd.amount),confirmed:true,evidence:'Quantité utilisable confirmée par le foyer',confirmedOn:today(),range:cmd.range||''};
      if(cmd.price!==undefined&&cmd.price!=='')s.v3.observations.push(validObservation({id:uid('manual-price'),productId:p.id,cents:cents(cmd.price),currency:'EUR',date:cmd.date||today(),store:cmd.store||s.v3.profile.store,source:'manual',evidence:'Prix déclaré manuellement par le foyer',promotion:!!cmd.promotion}));
      break;
    }
    case 'manualPrice': {
      const p=productsOf(s).find(p=>p.id===cmd.productId);requireValue(p,'Produit inconnu.');
      s.v3.observations.push(validObservation({id:uid('manual-price'),productId:p.id,cents:cents(cmd.price),currency:'EUR',date:cmd.date||today(),store:cmd.store??s.v3.profile.store,source:'manual',evidence:'Prix déclaré manuellement par le foyer',promotion:!!cmd.promotion}));break;
    }
    case 'confirmReceipt': {
      const staged=(cmd.draft.newProducts??[]).filter(x=>cmd.draft.lines.some(l=>!l.ignore&&l.productId===x.product.id)),id=cmd.replaceId||uid('receipt'),validated=validateReceipt(cmd.draft,{id,products:[...productsOf(s),...staged.map(x=>x.product)],confirmed:true});
      for(const item of staged){requireValue(item.product?.id&&item.product.name&&Number(item.product.content?.amount)>0,'Référence de ticket invalide.');s.v3.privateProducts.push(item.product);if(item.binding)s.v3.bindings[item.product.id]=item.binding;}
      const clean=deleteReceipt({receipts:s.v3.receipts,observations:s.v3.observations},id);
      s.v3.receipts=[...clean.receipts,validated.receipt];s.v3.observations=[...clean.observations,...validated.observations];
      for(const line of validated.receipt.lines)if(line.productId&&!line.discount)s.v3.aliases[`${norm(validated.receipt.store)}|${norm(line.name)}`]={productId:line.productId,confirmedOn:today()};
      break;
    }
    case 'deleteReceipt': {
      const clean=deleteReceipt({receipts:s.v3.receipts,observations:s.v3.observations},cmd.id);
      s.v3.receipts=clean.receipts;s.v3.observations=clean.observations;break;
    }
    default: throw Error('Action V3 inconnue.');
  }
  if(repricing){const after=calculateCart(s);s.v3.lastReprice={before:before.totalCents,after:after.totalCents,date:today(),source:cmd.type==='savePublic'?'Open Prices':'Historique / prix du foyer'};}
  return validateState(s);
}

export function loadState(storage) {
  const raw=storage.getItem(STORAGE_KEY);return raw===null?createState():validateState(JSON.parse(raw));
}
export function createClient({storage,callbacks={}}) {
  let ready=false,state,revision=0;let queue=Promise.resolve();
  const save=next=>{validateState(next);const raw=JSON.stringify(next);if(raw.length>4500000)throw Error('Sauvegarde trop volumineuse. Supprimez des textes bruts de tickets ou exportez vos données.');storage.setItem(STORAGE_KEY,raw);state=clone(next);callbacks.state?.(clone(state));};
  return {get ready(){return ready;},async start(){state=loadState(storage);save(state);ready=true;callbacks.connection?.(true);},
    mutate(fn){const work=queue.catch(()=>{}).then(()=>{if(!ready)throw Error('Sauvegarde indisponible.');const latest=loadState(storage);const next=fn(latest);next.v3.revision=latest.v3.revision+1;save(next);revision++;return clone(next);});queue=work;return work;},
    async reset(){save(createState());ready=true;callbacks.connection?.(true);},signOut:async()=>{},signInGoogle:async()=>{throw Error('Aucun compte Firebase dans cet espace.');}};
}
