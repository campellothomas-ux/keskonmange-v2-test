/* Interface V2 conservée : ses composants et modales servent aussi aux ajouts V3. */
import {createState,createClient,command as change,STORAGE_KEY} from './state.mjs';
import {calculateCart,productsOf,observationsOf,generateMenu,interpretRequest} from './economy.mjs';
import {qualifiedRecipe,allIngredients,allIngredientById,originals,unitLabel,number,ingredients} from './catalog.mjs';
import {createSources,normalizeOpenPrice,normalizeCategoryRate} from './sources.mjs';
import {money,cents,norm,selectReference,today} from './prices.mjs';
import {extractReceipt} from './recognition.mjs';
import {parseReceipt} from './receipts.mjs';
import {renderCooking} from '../../engine/src/cooking.mjs';
import {addManualItem,baseState,RAYONS,uid} from '../../../core.mjs';

const native={library:renderLibrary,planning:renderPlanning,details:recipeDetails,cook:renderCook,view:renderView};
let proposal=null,draft=null,editingReceipt=null,pendingManual=null,networkResults=[],lookupIngredient='',volatile=false;
const sources=createSources({enabled:()=>!!STATE.v3?.profile.allowOpenData});
const e=value=>esc(String(value??''));
const qty=(q,unit='')=>q===undefined||q===null?'':`${number(String(q)).toLocaleString('fr-FR',{maximumFractionDigits:2})} ${unit}`;
const btn=(label,action,attrs='',ghost=true)=>`<button type="button" class="button ${ghost?'ghost':''} small" data-action="${action}" ${attrs}>${label}</button>`;
const options=(values,current,blank='Choisir…')=>`<option value="">${e(blank)}</option>`+values.map(([id,label])=>`<option value="${e(id)}" ${id===current?'selected':''}>${e(label)}</option>`).join('');
const field=(label,name,value='',type='text',attrs='')=>`<div class="form-group"><label>${label}<input class="field" name="${name}" value="${e(value)}" type="${type}" ${attrs}></label></div>`;
const ingredientOptions=(value='')=>options(allIngredients.map(i=>[i.id,`${i.name} · ${unitLabel(i)}${i.basis==='drained'?' égoutté':''}`]),value,'Ingrédient correspondant');
const productOptions=(value='',includeDraft=true)=>options([...productsOf(STATE),...(includeDraft?draft?.newProducts?.map(x=>x.product)??[]:[])].map(p=>[p.id,`${p.name} · ${p.quantityLabel||'format à confirmer'}`]),value,'Ne pas utiliser comme référence tarifaire');
const error=err=>showToast(err?.message||String(err));
const transact=(cmd,message)=>update(s=>change(s,cmd),message);
const lineSignature=r=>JSON.stringify([r.quantity,r.totalCents,r.bought]);
const currentCart=()=>calculateCart(STATE);
const referenceFor=p=>selectReference(p,observationsOf(STATE),{...STATE.v3.profile,storeLocationId:STATE.v3.profile.storeLocationId});
const closeIf=async promise=>{if(await promise)closeModal();};

function budgetHTML(cart=currentCart()) {
  return `<div class="km3-metrics"><div class="line-card"><div><div class="footnote">Budget global</div><strong>${money(cart.budgetCents)}</strong></div></div><div class="line-card"><div><div class="footnote">${cart.complete?'Panier estimé':'Montant connu, panier incomplet'}</div><strong>${cart.complete?'≈ ':''}${money(cart.knownSubtotalCents)}</strong></div></div><div class="line-card"><div><div class="footnote">${cart.remainingCents<0?'Dépassement estimé':cart.complete?'Reste estimé':'Reste maximal avant prix manquants'}</div><strong>${cart.remainingCents<0?'+':''}${money(Math.abs(cart.remainingCents))}</strong></div></div></div>
    <p class="footnote">${cart.coverage.priced}/${cart.coverage.total} lignes chiffrées (${Math.round(cart.coverage.ratio*100)} %). Estimation, jamais une garantie du montant en caisse. ${cart.missing.length?'Besoins à préciser : '+e(cart.missing.join(', '))+'.':''}</p>${cart.shortfalls?.length?`<div class="notice amber">Quantités d’achat insuffisantes pour le menu : ${e(cart.shortfalls.join(', '))}. Vérifiez les quantités personnalisées.</div>`:''}
    ${cart.remainingCents<0?`<div class="notice amber">Le montant ${cart.complete?'estimé':'déjà connu'} dépasse le budget. ${btn('Chercher un menu moins cher','v3-reoptimize')}</div>`:''}`;
}
function renderPlanningV3() {
  let html=native.planning();
  html=html.replace('Actualiser les courses','Voir les courses').replace('Mettre à jour les courses','Voir les courses');
  for(const [index,m] of STATE.plan.entries()) {
    const token=`data-action="remove-meal" data-id="${idsel(m.id)}"`;
    const mark=`<button type="button" class="remove-small" data-action="v3-move" data-id="${e(m.id)}" data-delta="-1" aria-label="Monter ce repas" ${index===0?'disabled':''}>↑</button><button type="button" class="remove-small" data-action="v3-move" data-id="${e(m.id)}" data-delta="1" aria-label="Descendre ce repas" ${index===STATE.plan.length-1?'disabled':''}>↓</button>`;
    const at=html.indexOf('<button class="remove-small" '+token);
    if(at>=0)html=html.slice(0,at)+mark+html.slice(at);
  }
  return budgetHTML()+html+`<p class="footnote">Les besoins et le panier sont recalculés automatiquement après chaque changement.</p>`;
}
function renderCoursesV3() {
  const cart=currentCart();
  let html=`<div class="eyebrow">LE PANIER GLOBAL DU FOYER</div><div class="row-between page-heading"><h1 class="page-title">Les courses<span class="title-period">.</span></h1><div>${btn('Importer un ticket','v3-ticket-open')}${btn('Vider la liste','v3-clear-shopping')}</div></div>${budgetHTML(cart)}
    <form id="km3-manual" class="add-manual"><input class="field" name="article" required aria-label="Nouvel article" placeholder="Ajouter un article (ex. 2 bananes)"><button class="button" type="submit">${icon('plus')} Ajouter</button></form>
    <div class="shopping-summary"><span>${cart.rows.length} lignes au panier</span><span>${cart.rows.filter(r=>STATE.v3.checked[r.id]?.checked).length} cochées</span></div>`;
  if(!cart.rows.length)html+=`<div class="empty-state"><h3>Votre liste est prête à être remplie.</h3><p>Ajoutez des recettes au planning ou des achats supplémentaires.</p>${btn('Choisir des recettes','nav','data-view="library"')}</div>`;
  for(const [rayon,label,emoji] of RAYONS) {
    const rows=cart.rows.filter(r=>(r.rayon||'a_classer')===rayon);if(!rows.length)continue;
    html+=`<div class="rayon-group"><h3 class="rayon-head"><span class="rayon-emoji">${emoji}</span>${e(label)}</h3><div class="list-stack shopping-stack">`;
    for(const r of rows) {
      const check=STATE.v3.checked[r.id],checked=!!check?.checked,changed=checked&&check.signature!==lineSignature(r),i=allIngredientById.get(r.ingredientId);
      html+=`<div class="shopping-row ${checked?'is-bought':''}"><button class="shopping-check ${checked?'checked':''}" data-action="v3-check" data-id="${e(r.id)}" aria-label="${checked?'Décocher':'Cocher'} ${e(r.name)}">${checked?icon('check'):''}</button>
        <div class="shopping-content"><div class="line-title">${e(r.name)}</div><div class="line-sub">${r.necessary!==null?`Cuisine : ${qty(r.necessary,i?unitLabel(i):r.unit)} · `:''}${r.weight?`Poids prévu : ${qty(r.quantity,'g')}, à peser en magasin`:r.product?`Achat : ${r.quantity} × ${e(r.product.quantityLabel)}`:`${qty(r.quantity,r.unit)} · achat à préciser`}</div><div class="line-sub">${r.totalCents===null?'Prix inconnu':'≈ '+money(r.totalCents)}${r.surplus?` · surplus ${qty(r.surplus,i?unitLabel(i):'')}`:''}${changed?' · quantité ou prix modifié, à vérifier':''}</div></div>
        <button type="button" class="shopping-edit" data-action="v3-row" data-id="${e(r.id)}">Détails</button>${r.manualIds?.length===1?btn('Retirer','v3-delete-manual',`data-id="${e(r.manualIds[0])}"`):''}</div>`;
    }
    html+='</div></div>';
  }
  if(cart.excluded.length)html+=`<div class="notice amber">${cart.excluded.length} ligne(s) retirée(s) de la liste, sans suppression du planning. ${btn('Régénérer les besoins','v3-restore-shopping')}</div>`;
  if(STATE.v3.lastReprice)html+=`<p class="footnote">Dernière réévaluation (${e(STATE.v3.lastReprice.date)}) : ${money(STATE.v3.lastReprice.before)} → ${money(STATE.v3.lastReprice.after)}.</p>`;
  return html;
}
function generatorHTML() {
  return `<section class="discovery-panel km3-generator"><div class="eyebrow">CRÉER MON MENU</div><h2 class="section-title">Bien manger, dans mon budget.</h2><p class="intro">Le moteur compare des paniers complets, achats supplémentaires inclus. Vous gardez le dernier mot.</p>
    <form id="km3-generator"><div class="form-grid">${field('Budget global (€)','budget',(STATE.v3.budgetCents/100).toFixed(2),'number','min="0" step="0.01" required')}${field('Nombre de repas','meals',7,'number','min="1" max="10" required')}${field('Convives','diners',2,'number','min="1" max="12" required')}${field('Temps maximal par recette (min)','maxMinutes',60,'number','min="1" max="240" required')}</div>
    <div class="form-grid"><div class="form-group"><label>Type de repas<select class="field" name="diet"><option value="">Tous</option><option value="vegetarien" ${STATE.v3.profile.diet==='vegetarien'?'selected':''}>Végétarien</option></select></label></div><div class="form-group"><label>Demande facultative<input class="field" name="request" placeholder="7 repas pour 2 personnes, 100 euros, 30 min"></label></div></div>
    <p class="footnote">Allergies, exclusions et équipements : réglages dans Profil. Interprétation du texte limitée et locale, sans IA simulée.</p><button class="button" type="submit">Générer mon menu</button></form><div id="km3-generator-status" role="status"></div></section>`;
}
function renderProfileV3() {
  const p=STATE.v3.profile;
  return `<div class="eyebrow">VOTRE FOYER</div><h1 class="page-title">Profil<span class="title-period">.</span></h1><p class="intro">Préférences locales, prix et historique. Aucun compte supplémentaire.</p>
    <form id="km3-profile"><div class="form-grid">${field('Magasin de référence','store',p.store)}${field('Budget global (€)','budget',(STATE.v3.budgetCents/100).toFixed(2),'number','min="0" step="0.01" required')}<div class="form-group"><label>Gamme préférée<select class="field" name="range">${options([['indifférent','Indifférent'],['premier_prix','Premier prix'],['distributeur','Marque de distributeur'],['nationale','Marque nationale']],p.range)}</select></label></div><div class="form-group"><label>Préférence alimentaire<select class="field" name="diet">${options([['tous','Tous les repas'],['vegetarien','Végétarien']],p.diet||'tous')}</select></label></div></div>
    ${field('Allergies (séparées par des virgules)','allergies',p.allergies)}${field('Ingrédients exclus (séparés par des virgules)','exclusions',p.exclusions)}
    <div class="form-group"><label>Équipements disponibles</label><div class="facet-choices">${['four','plaques','poêle','casserole','airfryer','mixeur'].map(x=>`<label class="facet-chip"><input type="checkbox" name="equipment" value="${x}" ${p.equipment.includes(x)?'checked':''}> ${e(x)}</label>`).join('')}</div></div>
    <div class="notice">Une allergie active exclut de la génération les ingrédients dont la composition n’a pas été revue. Vérifiez les étiquettes ; les correspondances ne valent pas une certification d’absence d’allergène. ${btn('Vérifier une composition','v3-allergen-review')}</div>
    <p><label><input type="checkbox" name="allowPromotions" ${p.allowPromotions?'checked':''}> Inclure les observations promotionnelles dans les estimations</label></p>
    <p><label><input type="checkbox" name="allowMemberPrices" ${p.allowMemberPrices?'checked':''}> Je peux bénéficier des prix fidélité et souhaite les inclure</label></p>
    <p><label><input type="checkbox" name="allowOpenData" ${p.allowOpenData?'checked':''}> Autoriser les recherches publiques Open Food Facts / Open Prices</label></p>
    <p class="footnote">Ces recherches transmettent uniquement les mots ou codes produits choisis. Aucune photo, aucun PDF de ticket, prix personnel ou identifiant du foyer n’est envoyé. Les services peuvent journaliser les requêtes et l’adresse IP.</p><button class="button" type="submit">Enregistrer mes préférences</button></form>
    <h2 class="section-title">Mes références de prix</h2><div class="row-between">${btn('Rechercher un produit public','v3-public-search')}${btn('Ajouter une référence personnelle','v3-product-new')}${btn('Déclarer un stock','v3-stock')}</div>
    ${productsOf(STATE).length?productsOf(STATE).map(product=>{const ref=referenceFor(product);return `<div class="line-card"><div><div class="line-title">${e(product.name)}</div><div class="line-sub">${e(product.quantityLabel)} · ${money(ref.cents)} · ${e(ref.kind)}</div></div>${btn('Voir / modifier','v3-product',`data-id="${e(product.id)}"`)}</div>`;}).join(''):'<p class="empty-small">Aucune référence pour le moment. Recherchez des produits réels, renseignez des prix ou importez un ticket.</p>'}
    <h2 class="section-title">Mes tickets</h2>${btn('Importer un ticket','v3-ticket-open')} ${STATE.v3.receipts.length?STATE.v3.receipts.map(r=>`<div class="line-card"><div><div class="line-title">${e(r.store)}</div><div class="line-sub">${e(r.date)} · ${money(r.totalCents)} · ${r.lines.length} lignes</div></div>${btn('Vérifier / corriger','v3-ticket-edit',`data-id="${e(r.id)}"`)}${btn('Supprimer','v3-ticket-delete',`data-id="${e(r.id)}"`)}</div>`).join(''):'<p class="empty-small">Les tickets ne sont ajoutés à l’historique qu’après votre confirmation.</p>'}
    <p class="footnote">Données ouvertes : Open Food Facts et Open Prices, ODbL. Historique du foyer séparé et privé. Aucune publication automatique.</p>${btn('Confidentialité et sources','v3-about')}`;
}

function renderAll() {
  if(!STATE.v3)return native.view();
  renderNav();const stage=document.getElementById('stage');
  stage.innerHTML=UI.view==='planning'?renderPlanningV3():UI.view==='courses'?renderCoursesV3():UI.view==='profile'?renderProfileV3():generatorHTML()+native.library();
}
renderView=renderAll;
recipeDetails=id=>{
  native.details(id);const recipe=qualifiedRecipe(STATE,id);if(!document.querySelector('.detail-columns'))return;
  if(recipe) {
    const cooking=renderCooking(recipe,{id:'preview',recipeId:id,diners:UI.detailServings,leftovers:'keep',indivisiblePolicy:'ceil'},ingredients);
    document.querySelector('.detail-columns').innerHTML=`<section><h3 class="section-title">Ingrédients</h3>${cooking.ingredients.map(g=>`<div class="ingrow"><span>${e(allIngredientById.get(g.ingredientId)?.name)}</span><strong>${e(g.text)}</strong></div>`).join('')}</section><section><h3 class="section-title">Préparation</h3><ol class="steps">${cooking.steps.map(s=>`<li>${e(s.text)}</li>`).join('')}</ol></section>`;
    const cart=calculateCart({...STATE,plan:[]},{plan:[{id:'preview',recipeId:id,portions:UI.detailServings}]}),prep=cart.requirements.preparations[0];
    const notice=document.createElement('p');notice.className='notice';notice.textContent=`${recipe.production.mode==='batch'?'Préparation entière : ':''}${prep.producedPortions} part(s) préparée(s) pour ${UI.detailServings} convive(s). ${number(prep.producedPortions)>UI.detailServings?'Le surplus est imposé par le rendement ; cette recette reste un choix manuel. ':''}Validation culinaire en attente.`;
    document.querySelector('.detail-body').append(notice);
  }else {
    const notice=document.createElement('p');notice.className='notice amber';notice.textContent='Recette originale ou modifiée non qualifiée : les quantités sont proportionnelles, les étapes chiffrées demandent une vérification. Exclue du générateur automatique.';document.querySelector('.detail-body').append(notice);
  }
  document.querySelector('.detail-body').insertAdjacentHTML('beforeend',btn('Voir l’original et la traçabilité','v3-original',`data-id="${e(id)}"`));
};
renderCook=()=>{
  native.cook();const recipe=qualifiedRecipe(STATE,UI.recipeId);if(!recipe)return;
  const cooking=renderCooking(recipe,{id:'cook',recipeId:recipe.id,diners:UI.detailServings,leftovers:'keep',indivisiblePolicy:'ceil'},ingredients);
  const step=document.querySelector('.cook-step');if(step)step.textContent=cooking.steps[UI.cookStep]?.text||'Étape à vérifier.';
  const rows=document.querySelector('.cook-ingredients');if(rows)rows.innerHTML=`<h3>Quantités finales</h3>${cooking.ingredients.map(g=>`<div class="ingrow"><span>${e(allIngredientById.get(g.ingredientId)?.name)}</span><strong>${e(g.text)}</strong></div>`).join('')}`;
};

function proposalModal() {
  if(!proposal)return;
  UI.modal='proposal';
  openModal(head('Votre proposition de menu','À CONFIRMER')+budgetHTML(proposal.cart)+`<div class="notice">${proposal.cart.complete?'Coût estimé sur les références disponibles.':'Les données manquantes empêchent de conclure au respect du budget.'} ${proposal.search.evaluated} paniers comparés. Recherche bornée, sans garantie d’optimalité globale.</div>`+
    proposal.plan.map(m=>`<div class="line-card"><div><div class="line-title">${e(STATE.recipes.find(r=>r.id===m.recipeId)?.nom)}</div><div class="line-sub">${m.portions} convive(s)</div></div>${btn('Remplacer','v3-proposal-replace',`data-id="${e(m.id)}"`)}</div>`).join('')+
    `<div class="modal-footer"><button class="button ghost" data-action="close-modal">Annuler</button><button class="button" data-action="v3-proposal-accept">Accepter ce menu</button></div>`);
}
async function runGenerator(criteria,replaceMealId=null) {
  showToast('Comparaison des paniers en cours…');await new Promise(r=>setTimeout(r,40));
  proposal=generateMenu(STATE,criteria,{replaceMealId});proposalModal();
}
function ticketOpen() {
  UI.modal='ticket-import';
  openModal(head('Importer un ticket','LECTURE SUR CET APPAREIL')+`<div class="notice">La photo et le PDF restent sur cet appareil. Extraction PDF ou OCR local, sans envoi à un service tiers. Vous vérifiez les lignes avant tout enregistrement.</div><form id="km3-ticket-file"><div class="form-group"><label>Photo, PDF, JSON, CSV ou texte<input class="field" type="file" name="ticket" accept="image/jpeg,image/png,application/pdf,.json,.csv,.txt" required></label></div><button class="button" type="submit">Lire le ticket</button></form><p id="km3-ocr-progress" role="status"></p><div class="form-group"><label>Ou coller le texte<textarea class="field" id="km3-ticket-text" rows="7"></textarea></label></div>${btn('Analyser le texte','v3-ticket-text')}`);
}
function reviewTicket() {
  if(!draft)return;UI.modal='receipt-review';
  openModal(head('Vérifier le ticket','AUCUN ENREGISTREMENT AVANT CONFIRMATION')+`<div class="notice">Lecture ${e(draft.format)}${draft.confidence!==null?' · confiance OCR indicative '+Math.round(draft.confidence)+' %':''}. Corrigez les noms, quantités et prix. Les remises doivent être affectées à une ligne pour créer un prix net fiable.</div>
    <form id="km3-ticket-review"><div class="form-grid">${field('Magasin','store',draft.store,'text','required')}${field('Date','date',draft.date,'date','required')}${field('Total du ticket (€)','total',draft.totalCents===null?'':(draft.totalCents/100).toFixed(2),'number','min="0" step="0.01" required')}</div>
    ${draft.lines.map((line,k)=>`<section class="line-card km3-receipt-row"><div style="width:100%"><div class="form-grid">${field('Article','line-name-'+k,line.name,'text','required')}${field('Quantité (kg si vente au poids)','line-quantity-'+k,line.quantity,'number','min="0.001" step="any" required')}${field('Prix de la ligne (€)','line-price-'+k,(line.lineCents/100).toFixed(2),'number','step="0.01" required')}</div>
      ${!line.discount?`<label>Mode de quantité<select class="field" name="line-mode-${k}"><option value="fixed">Nombre d’articles / conditionnements</option><option value="weight" ${line.saleMode==='weight'?'selected':''}>Kilogrammes réellement achetés</option></select></label>`:''}
      <div class="form-group"><label>${line.discount?'Affecter la remise à':'Produit / conditionnement confirmé'}<select class="field" name="line-product-${k}">${line.discount?options(draft.lines.filter(l=>!l.discount).map(l=>[l.id,l.name]),line.appliesTo,'Remise globale non affectée'):productOptions(line.productId)}</select></label></div>
      <div class="row-between"><label><input type="checkbox" name="line-ignore-${k}" ${line.ignore?'checked':''}> Ignorer cette ligne</label>${!line.discount?btn('Créer une référence pour cet article','v3-receipt-product',`data-index="${k}"`):'<span class="mini-tag">Remise</span>'}${btn('Supprimer la ligne','v3-ticket-line-delete',`data-index="${k}"`)}</div></div></section>`).join('')}
    <p><label><input type="checkbox" name="acceptDifference" ${draft.acceptDifference?'checked':''}> Je confirme l’écart éventuel entre les lignes retenues et le total</label></p><p><label><input type="checkbox" name="skipObservations" ${draft.skipObservations?'checked':''}> Enregistrer uniquement le ticket, sans créer de références tarifaires</label></p>
    <p><label><input type="checkbox" name="confirm" required> J’ai vérifié ce ticket et ses correspondances</label></p><div class="modal-footer"><button type="button" class="button ghost" data-action="close-modal">Annuler</button><button class="button" type="submit">Confirmer le ticket</button></div></form>`);
}
function readReview() {
  const form=document.getElementById('km3-ticket-review');if(!form)return draft;
  const f=new FormData(form);draft.store=String(f.get('store')||'');draft.date=String(f.get('date')||'');draft.totalCents=f.get('total')===''?null:cents(f.get('total'));
  draft.acceptDifference=f.has('acceptDifference');draft.skipObservations=f.has('skipObservations');
  draft.lines.forEach((line,k)=>{line.ignore=f.has('line-ignore-'+k);if(line.ignore)return;line.name=String(f.get('line-name-'+k));line.quantity=String(f.get('line-quantity-'+k));line.lineCents=cents(f.get('line-price-'+k));if(line.discount)line.appliesTo=String(f.get('line-product-'+k)||'');else {line.productId=String(f.get('line-product-'+k)||'');line.saleMode=String(f.get('line-mode-'+k)||'fixed');}});return draft;
}
function productForm({lineIndex=null,product=null,ingredientId=''}={}) {
  const line=lineIndex!==null?draft.lines[lineIndex]:null;
  UI.modal='product';
  openModal(head(line?'Référence du ticket':product?'Associer un produit':'Référence personnelle','CONDITIONNEMENT EXPLICITE')+
    `<p class="footnote">Renseignez un format réellement lu sur le produit. Aucun poids par pièce ou poids égoutté n’est deviné.</p><form id="km3-product" data-product="${e(product?.id||'')}" data-line="${lineIndex??''}">
    ${field('Nom du produit','name',product?.name||line?.name||'','text','required')}${field('Marque (facultatif)','brand',product?.brand||'')}
    <div class="form-grid">${field('Contenu net du conditionnement','amount',product?.content?.amount||line?.contentAmount||'','number','min="0.001" step="any" required')}<div class="form-group"><label>Unité<select class="field" name="unit">${options([['g','g'],['ml','ml'],['unit','pièces / unités']],product?.content?.unit||line?.contentUnit||'g')}</select></label></div></div>
    <div class="form-grid"><div class="form-group"><label>Mode de vente<select class="field" name="saleMode"><option value="fixed">Conditionnement fixe</option><option value="weight" ${line?.saleMode==='weight'||product?.saleMode==='weight'?'selected':''}>Vente au poids — référence 1 000 g et prix au kg</option></select></label></div><div class="form-group"><label>Gamme confirmée<select class="field" name="range">${options([['premier_prix','Premier prix'],['distributeur','Distributeur'],['nationale','Marque nationale']],'','Non renseignée')}</select></label></div></div>
    <div class="form-group"><label>Ingrédient correspondant<select class="field" name="ingredientId">${ingredientOptions(ingredientId)}</select></label></div>
    ${field('Quantité utilisable par conditionnement, dans l’unité de l’ingrédient choisi','usableAmount','','number','min="0.001" step="any"')}
    <p class="footnote">Pour une conserve égouttée ou un produit en pièces, renseignez la quantité utilisable explicitement. L’association reste distincte de la quantité de cuisine.</p>
    ${!product&&!line?field('Prix par conditionnement (€), facultatif','price','','number','min="0" step="0.01"'):''}
    <p><label><input type="checkbox" name="confirmed" required> Je confirme ce conditionnement et cette correspondance</label></p><button class="button" type="submit">${line?'Utiliser pour ce ticket':'Enregistrer la référence'}</button></form>`);
}
function rowModal(id) {
  const row=currentCart().rows.find(r=>r.id===id);if(!row)return;UI.modal='cart-row';
  const i=allIngredientById.get(row.ingredientId),pureManual=row.manualIds?.length===1&&row.necessary===null,compatible=productsOf(STATE).filter(p=>pureManual||STATE.v3.bindings[p.id]?.ingredientId===row.ingredientId);
  openModal(head(row.name,'BESOIN ET ACHAT')+`<p>${row.necessary!==null?'Quantité nécessaire en cuisine : '+qty(row.necessary,i?unitLabel(i):row.unit)+'.':''}</p>
    ${row.product?`<p>Conditionnement documenté : ${e(row.product.quantityLabel)}. Achat : ${row.weight?qty(row.quantity,'g'):row.quantity+' conditionnement(s)'}. Prix : ≈ ${money(row.totalCents)}.</p>`:row.totalCents!==null?`<p>Estimation manuelle : ≈ ${money(row.totalCents)}. ${e(row.priceEvidence||'Prix saisi par le foyer')} · ${e(row.priceDate||'date non renseignée')}. Conditionnement à préciser.</p>`:'<div class="notice amber">Quantité d’achat ou prix à préciser. Cette ligne reste comprise dans les données manquantes du budget.</div>'}
    ${row.reference?`<p class="footnote">${e(row.reference.reason)}<br>Source : ${e(row.reference.source)} · ${e(row.reference.date)} · ${e(row.reference.store)}${row.reference.observations.map(o=>`<br>${e(o.evidence)}`).join('')}</p>`:''}
    <form id="km3-row" data-id="${e(id)}" data-ingredient="${e(row.ingredientId||'')}"><div class="form-group"><label>Produit / format<select class="field" name="productId">${options(compatible.map(p=>[p.id,`${p.name} · ${p.quantityLabel}`]),row.product?.id,'Choix automatique du moteur')}</select></label></div>
    ${field('Nom affiché de l’article','name',row.name)}
    ${field(row.weight?'Poids prévu à acheter (g)':'Quantité à acheter (conditionnements si produit choisi)','quantity',number(String(row.quantity)),'number','min="0.001" step="any" required')}
    ${pureManual?field('Unité de la quantité saisie','unit',row.weight?'g':STATE.shopping.manual.find(m=>m.id===row.manualIds[0])?.unite||row.unit):''}
    <div class="form-group"><label>Rayon<select class="field" name="rayon">${options(RAYONS.map(([id,label])=>[id,label]),row.rayon)}</select></label></div>
    ${!row.product&&row.manualIds?.length===1?field('Prix indicatif par unité saisie (€)','unitPrice','','number','min="0" step="0.01"'):''}
    <button class="button" type="submit">Enregistrer</button></form><div class="modal-footer">${btn('Chercher un produit public','v3-public-search',`data-ingredient="${e(row.ingredientId||'')}"`)}${btn('Retirer de la liste','v3-exclude',`data-id="${e(id)}"`)}</div>`);
}
function manualChoice(fields) {
  pendingManual=fields;
  const matches=STATE.shopping.manual.filter(m=>norm(m.nom)===norm(fields.name)||norm(m.nom).includes(norm(fields.name))||norm(fields.name).includes(norm(m.nom)));
  const candidates=productsOf(STATE).filter(p=>norm(p.name).includes(norm(fields.name))||norm(fields.name).includes(norm(p.name))).slice(0,8);
  if(!matches.length&&!candidates.length)return transact({type:'addManual',...fields},'Article ajouté');
  UI.modal='manual-match';openModal(head('Préciser cet achat','ÉVITER LES DOUBLONS')+`<p>Des libellés proches peuvent désigner des produits différents. Vérifiez la composition, les allergènes et le format avant de choisir.</p>`+
    matches.map(m=>`<div class="line-card"><div>${e(m.nom)} · ${qty(m.quantite,m.unite)}</div>${btn('Fusionner avec cette ligne','v3-manual-merge',`data-id="${e(m.id)}"`)}</div>`).join('')+
    candidates.map(p=>`<div class="line-card"><div>${e(p.name)} · ${e(p.quantityLabel)}</div>${btn('Achat supplémentaire','v3-manual-product',`data-id="${e(p.id)}" data-intent="extra"`)}${btn('Couvre un besoin du planning','v3-manual-product',`data-id="${e(p.id)}" data-intent="cover"`)}</div>`).join('')+
    `<div class="modal-footer">${btn('Garder un article séparé','v3-manual-separate')}</div>`);
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button||!STATE.v3)return;
  const a=button.dataset.action,id=button.dataset.id,intercept=['add-to-plan','meal-portions','remove-meal','refresh-courses','clear-courses-confirm','clear-courses','sign-out'];
  if(!a.startsWith('v3-')&&!intercept.includes(a))return;
  event.preventDefault();event.stopImmediatePropagation();
  (async()=>{
    if(a==='add-to-plan')return closeIf(transact({type:'addMeal',recipeId:id,portions:UI.detailServings},'Repas ajouté, panier recalculé'));
    if(a==='meal-portions'){const m=STATE.plan.find(m=>m.id===id);return transact({type:'portions',mealId:id,portions:m.portions+Number(button.dataset.delta)});}
    if(a==='remove-meal')return transact({type:'removeMeal',mealId:id},'Repas retiré, panier recalculé');
    if(a==='refresh-courses'){UI.view='courses';return renderView();}
    if(a==='v3-move')return transact({type:'moveMeal',mealId:id,delta:Number(button.dataset.delta)});
    if(a==='v3-check'){const row=currentCart().rows.find(r=>r.id===id);return transact({type:'check',id,checked:!STATE.v3.checked[id]?.checked,signature:lineSignature(row)});}
    if(a==='v3-row')return rowModal(id);
    if(a==='v3-exclude')return closeIf(transact({type:'excludeRow',id},'Ligne retirée ; besoin de cuisine conservé'));
    if(a==='v3-delete-manual')return transact({type:'removeManual',id},'Achat supplémentaire retiré');
    if(a==='v3-restore-shopping')return transact({type:'restoreRows'},'Besoins régénérés');
    if(['v3-clear-shopping','clear-courses-confirm'].includes(a)){UI.modal='clear';return openModal(head('Vider la liste de courses ?','CONFIRMATION')+'<p>Les recettes et le planning seront conservés. Les besoins pourront être régénérés.</p><div class="modal-footer"><button class="button ghost" data-action="close-modal">Annuler</button><button class="button danger" data-action="v3-confirm-clear">Vider la liste</button></div>');}
    if(a==='v3-confirm-clear')return closeIf(transact({type:'clearShopping'},'Liste vidée'));
    if(a==='v3-reoptimize'){UI.view='library';renderView();return runGenerator({meals:STATE.plan.length||7,diners:STATE.plan[0]?.portions||2,maxMinutes:240,diet:STATE.v3.profile.diet});}
    if(a==='v3-proposal-accept'){if(await transact({type:'acceptMenu',proposal},'Menu accepté, panier recalculé')){closeModal();proposal=null;UI.view='planning';renderView();}return;}
    if(a==='v3-proposal-replace'){
      const selected=proposal.plan.find(m=>m.id===id),rejected=selected.recipeId;
      const shadow=structuredClone(STATE);shadow.plan=structuredClone(proposal.plan);shadow.recipes=shadow.recipes.filter(r=>r.id!==rejected);proposal=generateMenu(shadow,proposal.criteria,{replaceMealId:id});proposal.basePlan=JSON.stringify(STATE.plan);return proposalModal();
    }
    if(a==='v3-manual-separate')return closeIf(transact({type:'addManual',...pendingManual},'Article séparé ajouté'));
    if(a==='v3-manual-merge')return closeIf(transact({type:'addManual',...pendingManual,mergeId:id},'Lignes fusionnées après confirmation'));
    if(a==='v3-manual-product'){
      const product=productsOf(STATE).find(p=>p.id===id);
      if(button.dataset.intent==='cover'&&!STATE.v3.bindings[id]?.confirmed)throw Error('Associez d’abord ce produit à un ingrédient du planning dans Profil. Aucun besoin ne sera déduit sans correspondance confirmée.');
      if(product?.saleMode==='weight'&&!['g','kg'].includes(pendingManual.unit))return openModal(head('Quel poids prévoyez-vous ?')+`<p>Le prix est observé au kilogramme. Aucun poids par fruit n’est deviné.</p><form id="km3-manual-weight" data-product="${e(id)}" data-intent="${e(button.dataset.intent)}">${field('Poids prévu à acheter (g)','quantity','','number','min="1" step="any" required')}<button class="button" type="submit">Ajouter ce poids au panier</button></form>`);
      return closeIf(transact({type:'addManual',...pendingManual,productId:id,intent:button.dataset.intent},'Achat précisé'));
    }
    if(a==='v3-ticket-open'){draft=null;editingReceipt=null;return ticketOpen();}
    if(a==='v3-ticket-text'){draft=parseReceipt(document.getElementById('km3-ticket-text').value,{format:'text'});return reviewTicket();}
    if(a==='v3-ticket-edit'){const receipt=STATE.v3.receipts.find(r=>r.id===id);draft={...structuredClone(receipt),notes:[],rawText:receipt.rawText||'',status:'draft',confidence:null};editingReceipt=id;return reviewTicket();}
    if(a==='v3-ticket-delete'){UI.modal='delete-ticket';return openModal(head('Supprimer ce ticket ?')+`<p>Ses observations tarifaires seront retirées des prochaines estimations. Les autres tickets restent conservés.</p><button class="button danger" data-action="v3-ticket-delete-confirm" data-id="${e(id)}">Confirmer la suppression</button>`);}
    if(a==='v3-ticket-delete-confirm')return closeIf(transact({type:'deleteReceipt',id},'Ticket et observations supprimés'));
    if(a==='v3-receipt-product'){readReview();return productForm({lineIndex:Number(button.dataset.index)});}
    if(a==='v3-ticket-line-delete'){readReview();const [removed]=draft.lines.splice(Number(button.dataset.index),1);for(const line of draft.lines)if(line.appliesTo===removed.id)line.appliesTo='';return reviewTicket();}
    if(a==='v3-product-new')return productForm();
    if(a==='v3-product'){const p=productsOf(STATE).find(p=>p.id===id),ref=referenceFor(p);return openModal(head(p.name,'RÉFÉRENCE TARIFAIRE')+`<p>${e(p.quantityLabel)} · ${money(ref.cents)}</p><p>${e(ref.reason)}</p>${btn('Vérifier la correspondance','v3-bind',`data-id="${e(id)}"`)}<form id="km3-price" data-product="${e(id)}">${field(p.saleMode==='weight'?'Prix au kilogramme (€)':'Prix par conditionnement (€)','price','','number','min="0" step="0.01" required')}${field('Date du prix','date',today(),'date','required')}${field('Magasin','store',STATE.v3.profile.store)}<label><input type="checkbox" name="promotion"> Promotion</label><button class="button" type="submit">Enregistrer ce prix manuel</button></form><p class="footnote">${ref.observations.map(o=>e(o.evidence)+(o.locationId?btn('Choisir ce lieu comme magasin','v3-store-from-price',`data-id="${e(o.id)}"`):'')).join('<br>')}</p>`);}
    if(a==='v3-store-from-price'){const obs=observationsOf(STATE).find(o=>o.id===id);if(!obs?.locationId)throw Error('Lieu non identifié.');return closeIf(transact({type:'profile',patch:{store:obs.store,storeLocationId:obs.locationId}},'Magasin de référence identifié par son lieu Open Prices'));}
    if(a==='v3-bind')return productForm({product:productsOf(STATE).find(p=>p.id===id),ingredientId:STATE.v3.bindings[id]?.ingredientId||lookupIngredient});
    if(a==='v3-public-search'){lookupIngredient=button.dataset.ingredient||'';UI.modal='public-search';return openModal(head('Rechercher une référence réelle','OPEN FOOD FACTS / OPEN PRICES')+`<p class="footnote">Seule votre recherche ou le code produit sera envoyé. Aucun ticket n’est transmis.</p><form id="km3-public-search">${field('Nom ou code-barres','query')}<div class="form-group"><label>Ou rechercher une catégorie brute<select class="field" name="category">${options([['en:bananas','Bananes'],['en:apples','Pommes'],['en:carrots','Carottes'],['en:potatoes','Pommes de terre'],['en:onions','Oignons'],['en:tomatoes','Tomates']],'','Produit emballé par nom ou code')}</select></label></div><button class="button" type="submit">Rechercher</button></form><div id="km3-public-results" role="status"></div>`);}
    if(a==='v3-category-product'){
      const item=networkResults[Number(button.dataset.index)];if(!item?.product)throw Error('Référence de catégorie introuvable.');
      await transact({type:'savePublic',products:[item.product],observations:[item.observation]},'Observation réelle de catégorie enregistrée');
      return productForm({product:item.product,ingredientId:lookupIngredient});
    }
    if(a==='v3-open-product'){
      button.disabled=true;showToast('Consultation des deux services…');
      const product=await sources.product(id),response=await sources.prices({barcode:id});
      const observations=response.items.flatMap(row=>{try{const o=normalizeOpenPrice(row,product);return o?[o]:[];}catch{return [];}});
      if(await transact({type:'savePublic',products:[product],observations},`${observations.length} observation(s) datée(s) ${response.stale||product.staleCache?'issues du cache, service indisponible':'importée(s)'}`))productForm({product,ingredientId:lookupIngredient});return;
    }
    if(a==='v3-stock')return openModal(head('Déclarer un stock disponible')+`<p>Aucune quantité n’est présumée. Utilisez l’unité de référence affichée.</p><form id="km3-stock"><div class="form-group"><label>Ingrédient<select class="field" name="ingredientId" required>${ingredientOptions()}</select></label></div>${field('Quantité disponible','quantity','','number','min="0" step="any" required')}<button class="button" type="submit">Enregistrer le stock</button></form>`);
    if(a==='v3-allergen-review')return openModal(head('Confirmer une composition')+`<p>Recopiez les allergènes de l’étiquette ou de l’ingrédient vérifié. Une liste vide signifie votre confirmation d’absence des allergènes surveillés, pas une déduction automatique.</p><form id="km3-allergens"><select class="field" name="ingredientId" required>${ingredientOptions()}</select>${field('Allergènes déclarés (séparés par des virgules)','allergens')}<label><input type="checkbox" name="confirm" required> J’ai vérifié la composition</label><button class="button" type="submit">Confirmer cette vérification</button></form>`);
    if(a==='v3-original'){const r=originals[id],strict=qualifiedRecipe(STATE,id);return openModal(head('Original et traçabilité','DONNÉES CONSERVÉES')+`<p>${strict?'Conversion technique V3 disponible ; validation culinaire en attente.':'Original non qualifié pour le générateur.'}</p><pre class="mono km3-source">${e(JSON.stringify({originalV1:r,corrections:strict?.ingredients.map(g=>g.trace)||[],rendement:strict?.productionTrace||null},null,2))}</pre>`);}
    if(a==='v3-about')return openModal(head('Confidentialité et sources')+'<p>Les budgets, préférences et tickets restent dans le stockage de cet appareil. Les photos et PDF sont lus localement par PDF.js et Tesseract.js (Apache-2.0). Aucun ticket n’est publié sur Open Prices.</p><p>Produits : Open Food Facts. Prix observés : Open Prices. Données ouvertes ODbL, attribution conservée, collection publique séparée de l’historique privé. Les prix restent des estimations, avec date et provenance.</p><p>Aucune connexion Firebase ni migration. Le connecteur E.Leclerc non officiel proposé dépend de protections et d’une connexion ; il n’est pas utilisé. Aucun scraping Lidl n’est exécuté.</p>'+`<details><summary>Licences des composants embarqués</summary><pre class="mono km3-source">${e(JSON.parse(document.getElementById('km3-licenses').textContent))}</pre></details>`);
    if(a==='sign-out')return showToast('Espace local : aucun compte connecté.');
  })().catch(err=>{button.disabled=false;error(err);});
},true);

document.addEventListener('submit',event=>{
  const form=event.target;if(!form.id.startsWith('km3-'))return;event.preventDefault();event.stopImmediatePropagation();
  const f=new FormData(form),value=name=>String(f.get(name)??'');
  (async()=>{
    if(form.id==='km3-generator'){
      const interpreted=interpretRequest(value('request')),criteria={meals:Number(value('meals')),diners:Number(value('diners')),maxMinutes:Number(value('maxMinutes')),diet:value('diet')};
      if(value('request').trim())Object.assign(criteria,interpreted.criteria);
      const budget=interpreted.criteria.budgetCents!==undefined?String(interpreted.criteria.budgetCents/100):value('budget');
      if(await transact({type:'budget',value:budget})){if(value('request'))showToast(interpreted.notes[0]);await runGenerator(criteria);}return;
    }
    if(form.id==='km3-profile'){
      const patch={store:value('store'),storeLocationId:value('store')===STATE.v3.profile.store?STATE.v3.profile.storeLocationId:'',range:value('range')||'indifférent',diet:value('diet')==='tous'?'':value('diet'),allergies:value('allergies'),exclusions:value('exclusions'),equipment:f.getAll('equipment'),allowOpenData:f.has('allowOpenData'),allowPromotions:f.has('allowPromotions'),allowMemberPrices:f.has('allowMemberPrices')};
      await transact({type:'profile',patch});return transact({type:'budget',value:value('budget')},'Préférences enregistrées');
    }
    if(form.id==='km3-manual'){
      const parsed=addManualItem(baseState(),value('article')).shopping.manual[0];
      return manualChoice({name:parsed.nom,quantity:parsed.quantite,unit:parsed.unite});
    }
    if(form.id==='km3-manual-weight')return closeIf(transact({type:'addManual',...pendingManual,quantity:Number(value('quantity')),unit:'g',productId:form.dataset.product,intent:form.dataset.intent},'Poids prévu ajouté'));
    if(form.id==='km3-public-search'){
      const target=document.getElementById('km3-public-results');target.textContent='Recherche en cours…';
      if(value('category')){
        const name=form.querySelector('[name="category"] option:checked').textContent,response=await sources.prices({category:value('category')});
        networkResults=response.items.flatMap(row=>{try{const item=normalizeCategoryRate(row,name);return item?[item]:[];}catch{return [];}});
        target.innerHTML=networkResults.length?networkResults.map((item,k)=>`<div class="line-card"><div>${e(item.product.name)}<div class="line-sub">${money(item.observation.cents)} ${item.product.saleMode==='weight'?'/ kg':'/ unité de vente'} · ${e(item.observation.date)} · ${e(item.observation.store)}${item.observation.promotion?' · promotion':''}</div></div>${btn('Utiliser cette référence indicative','v3-category-product',`data-index="${k}"`)}</div>`).join(''):'<p>Aucune observation exploitable pour cette catégorie.</p>';return;
      }
      if(/^\d{8,14}$/.test(value('query'))){target.innerHTML=btn('Consulter ce code-barres','v3-open-product',`data-id="${e(value('query'))}"`);return;}
      const result=await sources.search(value('query'));networkResults=result.items;
      target.innerHTML=result.items.length?result.items.map(p=>`<div class="line-card"><div>${e(p.name)}<div class="line-sub">${e(p.brand)} · ${e(p.quantity)} · ${p.priceCount??'?'} observation(s)</div></div>${btn('Voir le produit et les prix','v3-open-product',`data-id="${e(p.code)}"`)}</div>`).join(''):'<p>Aucun produit avec prix trouvé. Essayez un code-barres ou créez une référence personnelle.</p>';return;
    }
    if(form.id==='km3-product'){
      const ingredientId=value('ingredientId'),i=allIngredientById.get(ingredientId),amount=value('amount'),usable=value('usableAmount');
      if(i&&(i.basis==='drained'||i.unit!==value('unit'))&&!usable)throw Error('Renseignez explicitement la quantité utilisable dans l’unité de l’ingrédient, notamment le poids égoutté.');
      if(form.dataset.line!==''){
        const index=Number(form.dataset.line),product={id:uid('ticket-product'),name:value('name'),brand:value('brand'),saleMode:value('saleMode'),quantityLabel:value('saleMode')==='weight'?'Vente au poids · prix au kg':`${amount} ${value('unit')}`,content:{amount,unit:value('unit'),evidence:'Étiquette / format confirmé pendant la vérification du ticket'},source:'personal',allergens:null};
        draft.newProducts??=[];draft.newProducts.push({product,binding:i?{ingredientId:i.id,amount:usable||amount,confirmed:true,evidence:'Quantité utilisable confirmée pendant la vérification',confirmedOn:today()}:null});draft.lines[index].productId=product.id;return reviewTicket();
      }
      if(form.dataset.product){if(!ingredientId){closeModal();showToast('Référence conservée pour les achats manuels, sans conversion culinaire.');return;}await transact({type:'bindProduct',productId:form.dataset.product,ingredientId,amount:usable||amount,range:value('range')});closeModal();return;}
      return closeIf(transact({type:'personalProduct',name:value('name'),brand:value('brand'),amount,unit:value('unit'),ingredientId,usableAmount:usable||amount,price:value('price'),saleMode:value('saleMode'),range:value('range')},'Référence personnelle créée'));
    }
    if(form.id==='km3-price')return closeIf(transact({type:'manualPrice',productId:form.dataset.product,price:value('price'),date:value('date'),store:value('store'),promotion:f.has('promotion')},'Prix manuel enregistré, panier réévalué'));
    if(form.id==='km3-stock')return closeIf(transact({type:'stock',ingredientId:value('ingredientId'),quantity:value('quantity')},'Stock déclaré, panier recalculé'));
    if(form.id==='km3-allergens')return closeIf(transact({type:'allergenReview',ingredientId:value('ingredientId'),allergens:value('allergens')},'Composition confirmée pour le foyer'));
    if(form.id==='km3-row'){
      const row=currentCart().rows.find(r=>r.id===form.dataset.id);if(!row)throw Error('Ligne modifiée : rouvrez ses détails.');
      if(row.manualIds?.length===1&&row.necessary===null)await transact({type:'editManual',id:row.manualIds[0],patch:{nom:value('name')||row.name,quantite:Number(value('quantity')),unite:value('unit')||row.unit,rayon:value('rayon'),...(value('productId')?{productId:value('productId')}:{}) ,...(value('unitPrice')?{unitPriceCents:cents(value('unitPrice'))}:{})}});
      else if(row.product)await transact({type:'purchaseQuantity',productId:value('productId')||row.product.id,quantity:Number(value('quantity'))});
      else await transact({type:'unreferencedQuantity',id:row.id,quantity:Number(value('quantity'))});
      await transact({type:'rowLabel',id:row.id,name:value('name')});
      if(value('productId')&&row.ingredientId)await transact({type:'chooseProduct',ingredientId:row.ingredientId,productId:value('productId')});
      if(row.ingredientId)await transact({type:'rayon',ingredientId:row.ingredientId,rayon:value('rayon')});closeModal();return;
    }
    if(form.id==='km3-ticket-file'){
      const file=f.get('ticket'),progress=document.getElementById('km3-ocr-progress');form.querySelector('button').disabled=true;
      try {draft=await extractReceipt(file,{onProgress:(message,p)=>{if(progress)progress.textContent=`${message} ${Math.round(p*100)} %`;}});
        for(const line of draft.lines){const alias=STATE.v3.aliases[`${norm(draft.store)}|${norm(line.name)}`];if(alias)line.productId=alias.productId;}
        reviewTicket();
      }finally{if(document.contains(form))form.querySelector('button').disabled=false;}return;
    }
    if(form.id==='km3-ticket-review'){
      readReview();if(!f.has('confirm'))throw Error('Vérification humaine obligatoire.');
      if(await transact({type:'confirmReceipt',draft,replaceId:editingReceipt},'Ticket confirmé, historique et estimations mis à jour')){draft=null;editingReceipt=null;closeModal();UI.view='profile';renderView();}return;
    }
  })().catch(error);
},true);

document.addEventListener('change',event=>{
  if(event.target.matches('#km3-ticket-review [name^="line-ignore-"]')) {
    const section=event.target.closest('.km3-receipt-row');
    for(const input of section.querySelectorAll('input,select'))if(input!==event.target)input.disabled=event.target.checked;
  }
  if(event.target.matches('#km3-row [name="productId"]')) {
    const form=event.target.form,product=productsOf(STATE).find(p=>p.id===event.target.value),input=form.elements.namedItem('quantity');
    if(product?.saleMode==='weight'){
      input.closest('label').firstChild.textContent='Poids prévu à acheter (g)';input.value='';
      const unit=form.elements.namedItem('unit');if(unit)unit.value='g';
    }else if(product){input.closest('label').firstChild.textContent='Nombre de conditionnements à acheter';if(form.elements.namedItem('unit'))form.elements.namedItem('unit').value='conditionnement';}
  }
});

async function boot() {
  const nativeStatus=setStatus;
  setStatus=text=>nativeStatus(/Synchronisé|Synchronisation|Connecté/.test(text)?(volatile?'Session locale':'Local · V3'):text);
  let persistent;const memory=new Map();
  const notice=document.createElement('div');notice.className='notice';notice.innerHTML='<strong>V3 · espace isolé</strong> — Aucune connexion Firebase. <span id="km3-save-state">Données enregistrées sur cet appareil.</span>';
  document.querySelector('.app').insertBefore(notice,document.querySelector('.stage'));
  const warn=()=>{volatile=true;document.getElementById('km3-save-state').textContent='Sauvegarde indisponible : données temporaires dans cette fenêtre.';};
  try{persistent=localStorage;}catch{warn();}
  const storage={getItem(key){if(key!==STORAGE_KEY)throw Error('Clé non autorisée.');if(!volatile)try{const raw=persistent.getItem(key);if(raw!==null)memory.set(key,raw);return raw;}catch{warn();}return memory.get(key)??null;},
    setItem(key,value){if(key!==STORAGE_KEY)throw Error('Clé non autorisée.');if(!volatile)try{persistent.setItem(key,value);}catch{warn();}memory.set(key,value);}};
  gate('KeskonMange V3','Chargement de votre espace local…');
  try {
    if('KM_STAGING_CONFIG' in window)throw Error('Configuration Firebase détectée : démarrage refusé.');
    SYNC=createClient({storage,callbacks:{state(next){STATE=next;renderView();unGate();if(STATE.v3.testMode)notice.querySelector('strong').textContent='V3 · DONNÉES SYNTHÉTIQUES DE TEST';setStatus(volatile?'Session locale':'Local · V3');},connection(ready){SYNC_CONNECTED=ready;}}});
    await SYNC.start();
  }catch(err){gate('Sauvegarde locale à vérifier',err.message);setStatus('Erreur locale');}
  const account=document.querySelector('[data-action="sign-out"]');account.title='Espace local, aucun compte connecté';account.setAttribute('aria-label',account.title);
}
boot();
