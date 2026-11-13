import {findRecipes} from '../../library/index.mjs';
import {catalog,loadState,saveState,evaluate,details,change,suggestions,culinaryLabel} from './state.mjs';

const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
  recipes:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M20 4h-4a3 3 0 0 0-3 3m0 14a4 4 0 0 1 4-2h3V4',
  planning:'M8 3h8v4H8z M8 5H5v16h14V5h-3 M8 12l1 1 2-2 M13 12h3 M8 17l1 1 2-2 M13 17h3',
  courses:'M5 7h14l1 14H4z M9 8V6a3 3 0 0 1 6 0v2',
  suggestions:'m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z M20 2v4 M18 4h4',
  search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus:'M12 5v14 M5 12h14',minus:'M5 12h14',close:'m6 6 12 12 M6 18 18 6',
  arrow:'M4 12h15 m-5-5 5 5-5 5',chevron:'m9 5 7 7-7 7',
  clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  people:'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M17 4a4 4 0 0 1 0 8 M19 16a5 5 0 0 1 3 5',
  check:'m5 12 4 4L19 6',trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  local:'M7 3h10v18H7z M10 18h4',leaf:'M20 3C9 2 3 8 5 15c2 7 15 6 15-12z M5 21 16 8',
  fish:'M5 12c3-7 10-7 14 0-4 7-11 7-14 0z M5 12 1 7v10z M15 10h.1 M10 6l1-3 3 3',
  viande:'M4 3v6a3 3 0 0 0 6 0V3 M7 3v18 M17 3c-4 3-4 9 0 10h2 M19 3v18',
  bowl:'M3 11h18c-1 10-17 10-18 0z M8 21h8 M8 3c-3 3 3 3 0 6 M14 3c-3 3 3 3 0 6',
  info:'M12 11v6 M12 7h.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]??paths.bowl}"/></svg>`;
const categoryLabel={viande:'Viande',poisson:'Poisson',vegetarien:'Végétarien'};
const art=r=>`<div class="recipe-art art-${r.library.category}" aria-hidden="true"><span class="art-ring"></span><span class="art-dots"></span>${icon(r.library.category==='vegetarien'?'leaf':r.library.category==='poisson'?'fish':'bowl','food-icon')}<span class="art-caption">${h(categoryLabel[r.library.category])}</span></div>`;
const loaded=loadState({getItem:key=>window.localStorage.getItem(key)});
let state=loaded.state;
const ui={view:'recipes',query:'',filter:'tous',detail:null,suggestionDiners:2,ideas:null,error:loaded.error,saved:loaded.error?false:null,stale:false};
let computed;
const dialog=document.querySelector('#recipe-dialog'),app=document.querySelector('#app');
let toastTimer;
function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),3000);}
function persist(){const result=saveState({setItem:(key,value)=>window.localStorage.setItem(key,value)},state);ui.saved=result.saved;ui.error=result.error;}
function perform(command,{message=null,draw=true}={}){
  if(ui.stale){toast('Rechargez la page pour reprendre la dernière sauvegarde de l’autre onglet.');return false;}
  try{state=change(state,command);persist();if(draw)render();if(message)toast(message);return true;}
  catch(e){ui.error=friendlyError(e);if(draw)render();else toast(ui.error);return false;}
}
function friendlyError(e){
  const messages={INVALID_DINERS:'Choisissez un nombre entier entre 1 et 12 personnes.',MEAL_LIMIT:'Votre planning contient déjà 30 repas. Retirez un repas pour en ajouter un autre.',
    INVALID_MANUAL_ITEM:'Indiquez le nom de l’article et une quantité courte, par exemple « 1 paquet ».',
    UNKNOWN_RECIPE:'Cette recette n’est plus disponible. Choisissez-en une dans la bibliothèque.',
    UNKNOWN_SHOPPING_ITEM:'Cette ligne a changé. Revenez à la liste de courses.',
    PRODUCTION_STEP_INVALID:'Cette préparation doit rester entière. Modifiez le nombre de personnes plutôt que de fractionner le plat.'};
  return messages[e?.code]??'Le calcul n’a pas pu être terminé. Vos données précédentes sont conservées ; essayez avec un autre nombre de personnes.';
}
function navigation(){return `<nav class="navigation" aria-label="Navigation principale">${[
  ['recipes','recipes','Recettes'],['planning','planning','Planning'],['courses','courses','Courses'],['suggestions','suggestions','Idées']
].map(([id,glyph,label])=>`<button type="button" data-view="${id}" ${ui.view===id?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span>${id==='planning'&&state.menu.meals.length?`<span class="nav-count">${state.menu.meals.length}</span>`:''}</button>`).join('')}</nav>`;}
function header(){return `<header class="topbar"><div class="topbar-inner"><button class="brand" data-view="recipes" aria-label="KeskonMange, accueil">${icon('leaf')}<span>keskonmange<span class="brand-dot">.</span></span><span class="version-label">V3</span></button>${navigation()}<span class="local-status ${ui.saved===false?'unsaved':''}">${icon(ui.saved===true?'check':'local')}<span>${ui.saved===false?'Non enregistré':ui.saved===true?'Enregistré':'Sur cet appareil'}</span></span></div></header><div class="mobile-navigation">${navigation()}</div>`;}
function notice(){return ui.error?`<div class="notice error" role="alert">${icon('info')}<p>${h(ui.error)}</p>${ui.stale?'<button class="secondary-button" data-action="reload">Recharger</button>':`<button class="icon-button" data-action="dismiss-error" aria-label="Fermer le message">${icon('close')}</button>`}</div>`:'';}
function recipeCard(r,{suggestion=false}={}){
  const planned=state.menu.meals.some(m=>m.recipeId===r.id),label=suggestion?'Voir cette idée':'Voir la recette';
  return `<article class="recipe-card" data-recipe-card="${h(r.id)}"><button class="recipe-open" data-action="open-recipe" data-recipe="${h(r.id)}" data-suggestion="${suggestion}" aria-label="${label} : ${h(r.name)}">${art(r)}<div class="recipe-card-body"><div class="recipe-meta">${icon('clock')} ${r.library.minutes} min<span>·</span>${h(categoryLabel[r.library.category])}</div><h3>${h(r.name)}</h3></div></button><div class="recipe-card-footer"><span>${r.library.adjustments.length?'Quantités ajustées à essayer':'À essayer en cuisine'}</span><button class="${suggestion?'small-button':'icon-button add-button'}" data-action="${suggestion?'add-idea':'quick-add'}" data-recipe="${h(r.id)}" aria-label="Ajouter ${h(r.name)} au planning" ${suggestion&&planned?'disabled':''}>${suggestion?(planned?'Ajouté':`Ajouter ${icon('plus')}`):icon('plus')}</button></div></article>`;
}
function recipeResults(){return findRecipes({query:ui.query,filter:ui.filter});}
function gridContent(rows){return rows.length?rows.map(r=>recipeCard(r)).join(''):`<div class="empty-state empty-grid">${icon('search')}<h2>Aucune recette trouvée</h2><p>Essayez un ingrédient, un autre mot ou un filtre plus large.</p><button class="secondary-button" data-action="reset-search">Voir les 50 recettes</button></div>`;}
function recipePage(){
  const rows=recipeResults();
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">LES REPAS, SIMPLEMENT</p><h1 tabindex="-1">On mange quoi<span class="soft-accent"> ?</span></h1><p class="hero-subtitle">Des idées pour tous les jours.<br>Les bonnes quantités, juste ce qu’il faut.</p><div class="hero-pills"><span>${icon('recipes')} 50 recettes</span><span>${icon('check')} Tout reste sur votre appareil</span></div></div><button class="planning-teaser" data-view="planning"><div class="teaser-symbol">${icon('planning')}</div><p>Un peu d’avance, beaucoup plus simple.</p><span>${state.menu.meals.length?`${state.menu.meals.length} repas dans votre planning`:'Votre prochain repas commence ici'} ${icon('arrow')}</span></button></section>
  <section class="library-section" aria-label="Bibliothèque de recettes"><div class="section-heading"><div><p class="eyebrow">À VOTRE GOÛT</p><h2>La bibliothèque</h2></div><span class="result-count" id="result-count" role="status">${rows.length} recette${rows.length>1?'s':''}</span></div>
  <div class="search-box">${icon('search')}<label class="sr-only" for="recipe-search">Rechercher une recette ou un ingrédient</label><input id="recipe-search" type="search" placeholder="Une recette, un ingrédient…" value="${h(ui.query)}" autocomplete="off"><kbd aria-hidden="true">⌕</kbd></div>
  <div class="filters" role="group" aria-label="Filtrer les recettes">${[['tous','Tout'],['rapide','25 min ou moins'],['vegetarien','Végétarien'],['viande','Viande'],['poisson','Poisson'],['pates-riz','Pâtes & riz']].map(([value,label])=>`<button class="filter ${ui.filter===value?'active':''}" aria-pressed="${ui.filter===value}" data-filter="${value}">${label}</button>`).join('')}</div>
  <div class="recipe-grid" id="recipe-grid">${gridContent(rows)}</div></section><p class="catalog-note">${icon('info')} Sélection adaptée pour la démo. Les essais en cuisine restent à confirmer.</p>`;
}
function empty(title,text,button='Choisir des recettes'){return `<div class="empty-state">${icon(ui.view==='courses'?'courses':'planning')}<h2>${title}</h2><p>${text}</p><button class="primary-button" data-view="recipes">${button} ${icon('arrow')}</button></div>`;}
function stepper(count,{kind,id='',recipe='',label='Nombre de personnes'}={}){return `<div class="stepper" role="group" aria-label="${h(label)}"><button class="icon-button" data-action="${kind}-minus" data-id="${h(id)}" data-recipe="${h(recipe)}" aria-label="Retirer une personne${kind==='meal'?` — ${h(label)}`:''}" ${count<=1?'disabled':''}>${icon('minus')}</button><span><strong>${count}</strong> <span>${count>1?'personnes':'personne'}</span></span><button class="icon-button" data-action="${kind}-plus" data-id="${h(id)}" data-recipe="${h(recipe)}" aria-label="Ajouter une personne${kind==='meal'?` — ${h(label)}`:''}" ${count>=12?'disabled':''}>${icon('plus')}</button></div>`;}
function planningPage(){
  const meals=state.menu.meals;
  return `<section class="page-intro"><p class="eyebrow">L’ESPRIT TRANQUILLE</p><h1 tabindex="-1">Votre planning<span class="soft-accent">.</span></h1><p>${meals.length?'Vos repas, dans l’ordre qui vous plaît. Les quantités suivent vos envies.':'Une liste de repas, sans calendrier à remplir.'}</p></section>${!meals.length?empty('La semaine est à vous','Choisissez un premier repas. Les ingrédients se retrouveront directement dans vos courses.'):`<div class="planning-toolbar"><span>${meals.length} repas choisis</span><button class="secondary-button" data-view="recipes">${icon('plus')} Ajouter un repas</button></div><ol class="meal-list">${meals.map((m,index)=>{
    const r=catalog.recipes.find(r=>r.id===m.recipeId),prep=computed.requirements.preparations.find(p=>p.mealId===m.id);
    return `<li class="meal-row" data-meal="${h(m.id)}"><span class="meal-number">${String(index+1).padStart(2,'0')}</span><button class="meal-title" data-action="open-meal" data-id="${h(m.id)}"><span class="meal-category">${categoryLabel[r.library.category]} · ${r.library.minutes} min</span><h2>${h(r.name)}</h2>${prep?.keptPortions!=='0'?`<span class="surplus-note">${h(prep?.producedPortions)} parts préparées, dont ${h(prep?.keptPortions)} à conserver</span>`:''}</button>${stepper(m.diners,{kind:'meal',id:m.id,label:r.name})}<button class="icon-button danger-button" data-action="remove-meal" data-id="${h(m.id)}" aria-label="Supprimer ${h(r.name)} du planning">${icon('trash')}</button></li>`;
  }).join('')}</ol><div class="planning-next"><div>${icon('courses')}<div><h2>Le nécessaire est déjà regroupé.</h2><p>Votre liste de courses évolue avec vos repas.</p></div></div><button class="primary-button" data-view="courses">Voir mes courses ${icon('arrow')}</button></div>`}`;
}
function shoppingRow(row){
  const manual=row.source==='manual',conflict=computed.coverage.checkedConflicts.find(c=>c.intentId===row.id);
  const needed=row.culinaryNeed?.text,rounded=row.purchaseQuantity?.amount!==row.quantity?.amount;
  return `<li class="shopping-row ${row.checked?'is-checked':''}" data-shopping-row="${h(row.id)}"><label><input type="checkbox" data-action="check-item" data-id="${h(row.id)}" ${row.checked?'checked':''}><span class="custom-check">${icon('check')}</span><span class="shopping-copy"><strong>${h(row.label)}</strong><span>${h(culinaryLabel(row))}</span>${!manual&&rounded?`<small>Pour les recettes : ${h(needed)}</small>`:''}${conflict?'<small class="changed-label">Quantité à actualiser</small>':''}</span></label>${manual?`<button class="icon-button danger-button" data-action="remove-manual" data-id="${h(row.id)}" aria-label="Supprimer ${h(row.label)}">${icon('trash')}</button>`:''}</li>`;
}
function shoppingPage(){
  const all=[...state.shopping.calculated,...state.shopping.manual],checked=all.filter(r=>r.checked).length;
  const calculated=[...state.shopping.calculated].sort((a,b)=>a.label.localeCompare(b.label,'fr'));
  const conflicts=computed.coverage.checkedConflicts;
  return `<section class="page-intro"><p class="eyebrow">JUSTE LE NÉCESSAIRE</p><h1 tabindex="-1">Les courses<span class="soft-accent">.</span></h1><p>Tout est regroupé. Il ne reste qu’à cocher.</p></section>
  <div class="shopping-layout"><div class="shopping-main">${conflicts.length?`<section class="notice reconciliation" role="alert"><div>${icon('info')}<div><h2>Votre planning a changé</h2><p>${conflicts.length} article(s) déjà coché(s) ont une nouvelle quantité. Vos cases et anciennes quantités sont conservées.</p><ul>${conflicts.map(c=>{const row=state.shopping.calculated.find(r=>r.id===c.intentId),updated=computed.ingredientNeeds.find(n=>n.ingredientId===c.ingredientId);return `<li>${h(row?.label)} : ${h(row?.purchaseDisplay?.text)} → ${h(updated?.purchaseDisplay?.text??'plus nécessaire')}</li>`;}).join('')}</ul><button class="secondary-button" data-action="acknowledge-shopping">Actualiser les articles cochés</button></div></div></section>`:''}
  ${calculated.length?`<div class="shopping-section-heading"><h2>Pour les repas</h2><span>${calculated.length} articles</span></div><ul class="shopping-list">${calculated.map(shoppingRow).join('')}</ul>`:empty('Une liste qui se fait toute seule','Ajoutez des repas au planning pour retrouver leurs ingrédients ici.')}
  <section class="manual-section"><div class="shopping-section-heading"><h2>Vos ajouts</h2><span>${state.shopping.manual.length} article${state.shopping.manual.length>1?'s':''}</span></div><p>Le pain du petit-déjeuner, le savon… pensez aussi au reste.</p><form id="manual-form" class="manual-form"><div><label for="manual-label">Article</label><input id="manual-label" name="label" placeholder="Par exemple, savon" maxlength="120" required></div><div><label for="manual-quantity">Quantité <span>(facultatif)</span></label><input id="manual-quantity" name="quantity" placeholder="1 pièce" maxlength="80"></div><button class="primary-button" type="submit">${icon('plus')} Ajouter</button></form>${state.shopping.manual.length?`<ul class="shopping-list">${state.shopping.manual.map(shoppingRow).join('')}</ul>`:''}</section></div>
  <aside class="shopping-summary"><div class="summary-icon">${icon('courses')}</div><h2>Prêt pour les courses</h2><p><strong>${checked}</strong> sur ${all.length} articles cochés</p><div class="progress-track"><span style="width:${all.length?checked/all.length*100:0}%"></span></div><div class="price-status"><span>Prix total</span><strong>Inconnu</strong></div><p class="summary-note">La liste fonctionne sans prix magasin. Les quantités indiquent le nécessaire, sans supposer de format de paquet.</p><span class="local-caption">${icon('local')} Vos cases restent sur cet appareil.</span></aside></div>`;
}
function suggestionsPage(){return `<section class="page-intro"><p class="eyebrow">UN PEU D’INSPIRATION</p><h1 tabindex="-1">Et si on changeait<span class="soft-accent"> ?</span></h1><p>Des idées adaptées à votre tablée, quand vous en avez envie.</p></section><section class="suggestion-request"><div class="suggestion-symbol">${icon('suggestions')}</div><div><h2>Combien serez-vous ?</h2><p>Nous évitons les plats entiers qui prépareraient trop de parts.</p></div>${stepper(ui.suggestionDiners,{kind:'suggestion'})}<button class="primary-button" data-action="request-suggestions">Trouver des idées ${icon('arrow')}</button></section>
  ${ui.ideas===null?`<div class="suggestions-waiting">${icon('leaf')}<h2>Un petit coup de pouce, à la demande.</h2><p>Votre planning reste le vôtre.<br>Aucune idée n’y est ajoutée sans votre choix.</p></div>`:ui.ideas.suggestions.length?`<div class="section-heading"><h2>Quelques idées pour ${ui.suggestionDiners}</h2><span class="result-count">À vous de choisir</span></div><div class="recipe-grid suggestions-grid">${ui.ideas.suggestions.map(s=>recipeCard(catalog.recipes.find(r=>r.id===s.recipeId),{suggestion:true})).join('')}</div><p class="catalog-note">Les idées respectent les quantités calculables ; les prix et les essais culinaires restent à confirmer.</p>`:empty('Aucune nouvelle idée adaptée','Essayez un autre nombre de personnes ou choisissez manuellement une recette.','Voir les recettes')}`;}
function render(){
  try{computed=evaluate(state);state={...state,shopping:computed.shopping};}
  catch(e){ui.error=friendlyError(e);computed={requirements:{preparations:[]},coverage:{checkedConflicts:[]},ingredientNeeds:[]};}
  app.innerHTML=`${header()}<main id="main" class="main-content">${notice()}${ui.view==='recipes'?recipePage():ui.view==='planning'?planningPage():ui.view==='courses'?shoppingPage():suggestionsPage()}<footer class="page-footer"><span>keskonmange.</span><p>La cuisine du quotidien, à votre rythme.</p><span>Démo locale · Essais cuisine à confirmer</span></footer></main>`;
}
function openRecipe(id,mealId=null,fromSuggestion=false){
  const m=state.menu.meals.find(m=>m.id===mealId);
  ui.detail={recipeId:id,mealId,count:m?.diners??(fromSuggestion?ui.suggestionDiners:state.preferences[id]??2)};
  renderDialog();if(!dialog.open)dialog.showModal();
}
function renderDialog(){
  if(!ui.detail)return;const d=details(ui.detail.recipeId,ui.detail.count,ui.detail.mealId),r=d.recipe;
  const adjustments=r.library.adjustments;
  dialog.innerHTML=`<div class="dialog-content"><div class="dialog-top"><span class="eyebrow">${categoryLabel[r.library.category]} · ${r.library.minutes} MIN</span><button class="icon-button close-button" data-action="close-recipe" aria-label="Fermer la fiche recette">${icon('close')}</button></div><div class="detail-heading"><div class="detail-symbol art-${r.library.category}">${icon(r.library.category==='vegetarien'?'leaf':r.library.category==='poisson'?'fish':'bowl')}</div><h2 id="recipe-title">${h(r.name)}</h2><p>Du bon, du simple, à partager.</p></div>
  ${ui.saved===false&&ui.error?`<p class="quantity-notice" role="alert">${h(ui.error)}</p>`:''}
  <div class="portions-panel"><span>Votre tablée</span>${stepper(ui.detail.count,{kind:'detail'})}</div>
  ${d.preparation?.keptPortions!=='0'?`<p class="quantity-notice" role="status">${icon('info')} Cette préparation reste entière : ${h(d.preparation?.producedPortions)} parts préparées pour ${ui.detail.count} personnes, soit ${h(d.preparation?.keptPortions)} parts à conserver. L’accompagnement suit votre tablée.</p>`:''}
  ${adjustments.length?`<div class="adjustment-note">${icon('info')}<div><strong>Quantités ajustées pour cette démo</strong><p>Propositions à confirmer en cuisine. Les quantités V1 et les justifications sont conservées ci-dessous.</p></div></div>`:''}
  ${!d.calculated?'<div class="notice error" role="alert">Cette fiche demande une vérification avant de pouvoir recalculer ses étapes.</div>':''}
  <div class="detail-sections"><section><div class="detail-section-title"><h3>Les ingrédients</h3><span>${ui.detail.count} ${ui.detail.count>1?'personnes':'personne'}</span></div><ul class="ingredient-list">${d.ingredients.map(g=>`<li>${icon('check')}<span>${h(g.text)}</span></li>`).join('')}</ul>${d.cooking.notes?.length?`<p class="kitchen-note">${d.cooking.notes.map(h).join(' ')}</p>`:''}</section><section><div class="detail-section-title"><h3>En cuisine</h3><span>${r.library.minutes} min environ</span></div><ol class="cooking-steps">${d.cooking.steps.map(s=>`<li><p>${h(s.text)}</p></li>`).join('')}</ol></section></div>
  <details class="source-details"><summary>Quantités source et points à confirmer ${icon('chevron')}</summary><p>Validation technique effectuée. Validation culinaire en attente pour cette recette.</p>${adjustments.map(a=>`<p class="audit-adjustment"><strong>${h(r.originalV1.ingredients[a.ingredientIndex].nom)} : ${h(a.sourceQuantity)} → ${h(a.proposedQuantity)} ${h(a.unit)}</strong><br>${h(a.reason)}</p>`).join('')}<div class="audit-table-wrap"><table><thead><tr><th>Ingrédient V1</th><th>Original</th><th>Utilisé</th><th>Validation</th></tr></thead><tbody>${r.ingredients.map((g,index)=>`<tr><td>${h(r.originalV1.ingredients[index].nom)}</td><td>${h(g.trace.original.amount)} ${h(g.trace.original.unit)}</td><td>${h(g.quantity.amount)} ${h(catalog.ingredients.find(i=>i.id===g.ingredientId)?.culinary.measure??g.trace.effective.unit)}</td><td>À confirmer</td></tr>`).join('')}</tbody></table></div><ul>${r.library.reservations.map(s=>`<li>${h(s)}</li>`).join('')}</ul></details>
  <div class="detail-actions"><span>${icon('local')} ${ui.saved===false?'Sauvegarde indisponible':'Données locales uniquement'}</span><button class="primary-button" data-action="save-recipe" ${!d.calculated?'disabled':''}>${ui.detail.mealId?'Enregistrer les portions':'Ajouter au planning'} ${icon(ui.detail.mealId?'check':'plus')}</button></div></div>`;
}
function setView(view){ui.view=view;render();window.scrollTo({top:0,behavior:'instant'});document.querySelector('h1')?.focus({preventScroll:true});}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.view){setView(button.dataset.view);return;}
  if(button.dataset.filter){ui.filter=button.dataset.filter;render();return;}
  const action=button.dataset.action,id=button.dataset.id,recipeId=button.dataset.recipe;
  if(action==='open-recipe')openRecipe(recipeId,null,button.dataset.suggestion==='true');
  else if(action==='open-meal'){const m=state.menu.meals.find(m=>m.id===id);openRecipe(m.recipeId,id);}
  else if(action==='close-recipe')dialog.close();
  else if(action==='quick-add'){openRecipe(recipeId);}
  else if(action==='save-recipe'){
    const d=ui.detail;if(!d)return;
    const success=perform(d.mealId?{type:'setDiners',mealId:d.mealId,diners:d.count}:{type:'addRecipe',recipeId:d.recipeId,diners:d.count},
      {message:d.mealId?'Les portions et les courses sont actualisées.':'Repas ajouté au planning.'});
    if(success)dialog.close();
  }else if(action==='add-idea')perform({type:'addRecipe',recipeId,diners:ui.suggestionDiners},{message:'Votre idée est ajoutée au planning.'});
  else if(action==='detail-minus'||action==='detail-plus'){
    ui.detail.count+=action.endsWith('plus')?1:-1;
    perform({type:'rememberDiners',recipeId:ui.detail.recipeId,diners:ui.detail.count},{draw:false});renderDialog();dialog.querySelector(`[data-action="${action}"]`)?.focus();
  }else if(action==='meal-minus'||action==='meal-plus'){
    const meal=state.menu.meals.find(m=>m.id===id);perform({type:'setDiners',mealId:id,diners:meal.diners+(action.endsWith('plus')?1:-1)});
    app.querySelector(`[data-action="${action}"][data-id="${id}"]`)?.focus();
  }else if(action==='suggestion-minus'||action==='suggestion-plus'){
    ui.suggestionDiners+=action.endsWith('plus')?1:-1;ui.ideas=null;render();app.querySelector(`[data-action="${action}"]`)?.focus();
  }else if(action==='request-suggestions'){
    try{ui.ideas=suggestions(state,ui.suggestionDiners);render();toast('Vos idées sont prêtes. Choisissez celles qui vous plaisent.');}
    catch(e){ui.error=friendlyError(e);render();}
  }else if(action==='remove-meal')perform({type:'removeMeal',mealId:id},{message:'Repas retiré du planning.'});
  else if(action==='remove-manual')perform({type:'removeManual',id},{message:'Article retiré.'});
  else if(action==='acknowledge-shopping')perform({type:'acknowledgeShopping'},{message:'Quantités actualisées, cases conservées.'});
  else if(action==='dismiss-error'){ui.error=null;render();}
  else if(action==='reload')window.location.reload();
  else if(action==='reset-search'){ui.query='';ui.filter='tous';render();document.querySelector('#recipe-search')?.focus();}
});
document.addEventListener('change',event=>{
  const input=event.target;if(!input.matches('[data-action="check-item"]'))return;
  const id=input.dataset.id;perform({type:'checkItem',id,checked:input.checked});
  app.querySelector(`[data-action="check-item"][data-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
});
document.addEventListener('input',event=>{
  if(event.target.id!=='recipe-search')return;ui.query=event.target.value;const rows=recipeResults();
  document.querySelector('#result-count').textContent=`${rows.length} recette${rows.length>1?'s':''}`;
  document.querySelector('#recipe-grid').innerHTML=gridContent(rows);
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='manual-form')return;event.preventDefault();const data=new FormData(event.target);
  perform({type:'addManual',label:data.get('label'),quantity:data.get('quantity')},{message:'Article ajouté à vos courses.'});document.querySelector('#manual-label')?.focus();
});
dialog.addEventListener('close',()=>{ui.detail=null;});
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
window.addEventListener('storage',event=>{
  if(event.key!=='keskonmange:v3:lot5')return;
  ui.stale=true;
  ui.error='Le planning a changé dans un autre onglet. Rechargez cette page avant de continuer pour retrouver la dernière sauvegarde.';render();
});
render();
