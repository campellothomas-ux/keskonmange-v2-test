import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Q,requireThat,ingredientMap,productionModel} from '../../engine/src/index.mjs';
import {plans} from '../catalog-plans.mjs';

const folder=new URL('../data/',import.meta.url);
const slug=s=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/œ/g,'oe').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const aliases={
  oeuf:'Œufs',oeufs:'Œufs',tomate:'Tomates',tomates:'Tomates',courgette:'Courgettes',courgettes:'Courgettes',
  carotte:'Carottes',carottes:'Carottes',citron:'Citron',citrons:'Citron',concombre:'Concombre',concombres:'Concombre',
  poivron:'Poivron',poivrons:'Poivron',echalote:'Échalote',ail_frais:'Ail',ail:'Ail',
  blanc_de_poulet:'Filets de poulet',filets_de_poulet:'Filets de poulet',
  boeuf_hache_5:'Bœuf haché 5 % MG',boeuf_hache_5_mg:'Bœuf haché 5 % MG',
  concentre_de_tomate:'Concentré de tomate',concentre_de_tomates:'Concentré de tomate',
  riz_basmati:'Riz basmati',riz_basmati_cru:'Riz basmati',boulgour:'Boulgour',boulgour_cru:'Boulgour',
  pates:'Pâtes',pennes:'Penne',penne:'Penne',pates_courtes_type_fusilli:'Fusilli',
  persil:'Persil frais',persil_frais:'Persil frais',coriandre_fraiche:'Coriandre fraîche',menthe_fraiche:'Menthe fraîche',
  pois_chiches_en_conserve:'Pois chiches égouttés',pois_chiches_en_boite:'Pois chiches égouttés',pois_chiches_egouttes:'Pois chiches égouttés',
  thon_au_naturel_en_conserve:'Thon au naturel égoutté',thon_au_naturel_egoutte:'Thon au naturel égoutté',
  haricots_blancs_egouttes:'Haricots blancs cuits égouttés',haricots_blancs_cuits_egouttes:'Haricots blancs cuits égouttés'
};
const canon=name=>aliases[slug(name)]??name;
const pieceNames={
  oeufs:['œuf','œufs'],tomates:['tomate','tomates'],courgettes:['courgette','courgettes'],carottes:['carotte','carottes'],
  oignon:['oignon','oignons'],oignon_rouge:['oignon rouge','oignons rouges'],citron:['citron','citrons'],
  citron_vert:['citron vert','citrons verts'],concombre:['concombre','concombres'],poivron:['poivron','poivrons'],
  poivron_rouge:['poivron rouge','poivrons rouges'],poivron_jaune:['poivron jaune','poivrons jaunes'],
  avocat:['avocat','avocats'],mangue:['mangue','mangues'],echalote:['échalote','échalotes'],
  grosse_tomate:['grosse tomate','grosses tomates'],aubergine:['aubergine','aubergines'],
  peches:['pêche','pêches'],salade_verte:['salade verte','salades vertes'],
  dos_de_cabillaud:['dos de cabillaud','dos de cabillaud'],pave_de_saumon:['pavé de saumon','pavés de saumon']
};
const measures={cas:'c. à soupe',tbsp:'c. à soupe',cc:'c. à café',pincee:'pincée'};
const pilotCategory={15:'viande',16:'viande',37:'vegetarien',53:'viande',68:'viande'};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function convertLibrary(source,selection,pilots) {
  requireThat(source.recipes.length===50&&selection.selected.length===50,'SELECTION_REQUIRED','50 curated recipes only');
  const ingredients=structuredClone(pilots.ingredients),recipes=[],changes=[];
  // Beaten fractions are usable in panades/omelettes; purchases remain whole eggs.
  // Whole-egg preparations have integer quantities for all supported integer diners.
  const eggs=ingredients.find(i=>i.id==='i_oeufs');eggs.indivisible=false;
  eggs.fractionNote='Pour une fraction d’œuf, battre un œuf et ne prélever que la fraction indiquée. Les courses prévoient des œufs entiers ; conserver séparément le reste cru.';
  for(const i of ingredients)if(i.culinary?.measure==='cc') {
    i.culinary.measure='c. à café';i.culinary.measureEvidence='Convention cc explicitée en cuillère à café dans les étapes 3 et 4 de la fiche V1 57 ; aucune équivalence en ml supposée.';
  }
  for(const i of ingredients)if(i.culinary?.measure==='pincée'){
    i.culinary.displayStep='1/2';i.culinary.displayEvidence='Demi-pincée approximative à l’affichage ; quantité de référence exacte conservée, assaisonnement à goûter.';
  }
  const register=(rawName,rawUnit,basis)=>{
    const name=canon(rawName),key=slug(name),unit=['g','ml'].includes(rawUnit)?rawUnit:'unit';
    const countKind=unit==='unit'?(measures[rawUnit]?`measure:${rawUnit==='tbsp'?'cas':rawUnit}`:rawUnit==='gousse'?'piece:ail':rawUnit==='botte'?`bunch:${key}`:rawUnit==='tranche'?`slice:${key}`:`piece:${key}`):undefined;
    const same=ingredients.find(i=>slug(canon(i.name))===key&&i.unit===unit&&i.basis===basis&&i.countKind===countKind);
    if(same)return same;
    let id=`i_${key}`;if(ingredients.some(i=>i.id===id))id+=`_${unit}_${basis}_${countKind?.replace(/:/g,'_')??''}`;
    const labels=pieceNames[key]??[name.toLocaleLowerCase('fr'),name.toLocaleLowerCase('fr')];
    const culinary={joiner:/^[aeiouéèêœ]|^huile/i.test(name)?'d’':'de '};
    if(rawUnit==='gousse'){culinary.singular='gousse d’ail';culinary.plural='gousses d’ail';}
    else if(rawUnit==='botte'){culinary.singular=`botte de ${name.toLowerCase()}`;culinary.plural=`bottes de ${name.toLowerCase()}`;}
    else if(rawUnit==='tranche'){culinary.singular=`tranche de ${name.toLowerCase()}`;culinary.plural=`tranches de ${name.toLowerCase()}`;}
    else if(measures[rawUnit])culinary.measure=measures[rawUnit];
    else if(unit==='unit'){culinary.singular=labels[0];culinary.plural=labels[1];}
    if(rawUnit==='cc')culinary.measureEvidence='Convention cc explicitée en cuillère à café dans les étapes de la fiche V1 57 ; pas de conversion en ml.';
    if(rawUnit==='pincee'){culinary.displayStep='1/2';culinary.displayEvidence='Demi-pincée approximative à l’affichage uniquement, quantité exacte conservée.';}
    const indivisible=unit==='unit'&&/tortilla|pains|pain_|steaks|filets_de_poulet_epais|dos_de_cabillaud|pave_de_saumon/.test(key);
    const i={id,name:name.toLocaleLowerCase('fr'),unit,basis,...(countKind?{countKind}:{}),...(indivisible?{indivisible:true}:{}),culinary,
      ...(unit==='unit'&&!measures[rawUnit]&&rawUnit!=='gousse'?{purchasePolicy:{wholeUnits:true,evidence:'Minimum en pièces, tranches ou bottes entières après agrégation ; aucun paquet commercial supposé.'}}:{})};
    if(key==='oeufs'){i.indivisible=false;i.fractionNote=eggs.fractionNote;}
    ingredients.push(i);return i;
  };
  for(const record of source.recipes) {
    const chosen=selection.selected.find(s=>s.id===record.id);
    requireThat(chosen&&chosen.sourceIndex===record.sourceIndex&&hash(record.originalV1)===chosen.originalSha256,'SOURCE_CHANGED',record.id);
    const pilot=pilots.recipes.find(r=>r.id===record.id),plan=plans[record.sourceIndex],v=record.originalV1;
    requireThat(pilot||plan,'CONVERSION_PLAN_REQUIRED',record.id);
    let recipe;
    if(pilot) {
      requireThat(hash(pilot.originalV1)===hash(v),'PILOT_SOURCE_CHANGED',record.id);recipe=structuredClone(pilot);
    } else {
      const rows=v.ingredients.map((g,index)=>{
        requireThat(['g','ml','piece','pièce','gousse','tranche','botte','cas','tbsp','cc','pincee'].includes(g.unite),'UNIT_REVIEW_REQUIRED',g.unite);
        const selectedName=plan.choices?.[index]??g.nom;
        const name=canon(selectedName),key=slug(name);
        const drained=/egoutt/.test(key)||/en_boite|en_conserve/.test(slug(g.nom))&&/chiches|lentilles|thon/.test(key);
        const basis=drained?'drained':'net',i=register(name,g.unite,basis),adjust=plan.adjust?.[index];
        const amount=Q.of(adjust?.[0]??String(g.qte)).toString();
        const trace={sourceIngredientIndex:index,original:{name:g.nom,amount:String(g.qte),unit:g.unite},
          proposed:structuredClone(record.review.ingredientChangeProposals.filter(p=>p.ingredientIndex===index)),validated:null,
          effective:{name:i.name,amount,unit:g.unite,decision:adjust?'demo_adjustment_not_culinary_validated':'original_quantity_preserved'},
          justification:adjust?.[1]??(selectedName!==g.nom?'Variante explicitement choisie pour la démo ; quantité source conservée, aucune équivalence de rendement.':'Quantité V1 conservée ; cohérence technique contrôlée, essai culinaire en attente.'),
          identityNormalization:name!==g.nom?{canonicalName:name,reason:'Graphie/pluriel normalisé ou variante éditoriale explicite, sans conversion de masse.'}:null,
          basis:{value:basis,status:/egoutt/.test(slug(g.nom))?'explicit_source':drained?'demo_interpretation_unvalidated':'as_written_no_gross_net_yield',
            evidence:drained?'Quantité servie égouttée ; égouttage demandé par la source, poids brut du contenant inconnu.':'Quantité telle qu’écrite ; aucun facteur brut/net présumé.'}};
        if(adjust) {const proposal={ingredientIndex:index,sourceQuantity:String(g.qte),proposedQuantity:amount,unit:g.unite,reason:adjust[1],status:'demo_applied_not_culinary_validated'};
          trace.proposed.push(proposal);changes.push({recipeId:record.id,...proposal});}
        return {ingredientId:i.id,quantity:{amount,unit:i.unit,basis:i.basis,...(i.countKind?{countKind:i.countKind}:{})},
          ...(plan.sides?.includes(index)?{scaling:{mode:'diners',referencePortions:String(v.personnes)}}:{}),trace};
      });
      recipe={id:record.id,name:record.name,originalV1:structuredClone(v),review:structuredClone(record.review),
        source:{archiveSha256:selection.sourceArchiveSha256,sourceIndex:record.sourceIndex,originalSha256:chosen.originalSha256},
        production:{version:1,mode:plan.mode??'adjustable',referenceUnits:String(v.personnes),portionsPerUnit:'1',minUnits:'1',stepUnits:'1',unitLabel:plan.label??'portion'},
        productionTrace:{originalPeople:String(v.personnes),sourceCandidate:record.review.productionModeCandidate,validated:null,
          decision:plan.mode==='unit'?'Nombre entier de repas individuels, composants entiers conservés.':'Proportionnalité V1, vérifiée techniquement ; rendement à essayer en cuisine.'},
        automaticPolicy:{allowExtraProduction:false,allowSurplus:false},ingredients:rows,
        cookingSteps:plan.steps.map((parts,sourceStep)=>({sourceStep:null,quantityBindingsReviewed:true,
          parts:parts.map(part=>typeof part==='number'?{ingredientId:rows[part].ingredientId}:typeof part==='object'?{ingredientId:rows[part.row].ingredientId,share:part.share}:part)})),
        instructionTrace:{method:'curated_steps_with_exact_ingredient_shares',originalStepsPreserved:true,
          decision:'Étapes regroupées et réécrites après revue de toute la fiche source ; températures et temps conservés, nombres de bols/galettes rendus indépendants des convives.'}};
    }
    // Keep LOT 4 source files unchanged; this explicit demo variant uses the
    // pre-existing culinary proposal, without calling it a validated correction.
    if(record.sourceIndex===53) {
      const row=recipe.ingredients[1];row.quantity.amount='270';row.trace.effective={amount:'270',unit:'g',decision:'demo_adjustment_not_culinary_validated'};
      row.trace.justification='Proposition existante : 90 g de pâtes sèches par portion, avec 150 g de bœuf et la sauce. Valeur de démo à essayer ; 350 g V1 conservés et validation toujours nulle.';
      changes.push({recipeId:recipe.id,ingredientIndex:1,sourceQuantity:'350',proposedQuantity:'270',unit:'g',reason:row.trace.justification,status:'demo_applied_not_culinary_validated'});
      recipe.openIssues=recipe.openIssues.map(s=>s.startsWith('Quantités V1')?'Quantité de démo : 270 g de pâtes pour trois ; original 350 g conservé, proposition non validée.':s);
    }
    if(record.sourceIndex===37) {
      const row=recipe.ingredients[2],fresh=register('Épinards frais','g','net');
      row.trace.variantChoice={original:'Épinards frais ou surgelés',effective:'Épinards frais',status:'demo_choice_not_yield_equivalence'};
      const previous=row.ingredientId;row.ingredientId=fresh.id;
      for(const step of recipe.cookingSteps)for(const part of step.parts)if(typeof part==='object'&&part.ingredientId===previous)part.ingredientId=fresh.id;
      recipe.cookingSteps[4].parts=['Préparer ',{ingredientId:fresh.id},' : laver et faire tomber 2 à 3 minutes, puis retirer l’excès d’eau. Variante fraîche choisie pour cette démo.'];
      recipe.openIssues=recipe.openIssues.map(s=>s.startsWith('Choisir épinards')?'Épinards frais choisis pour la démo ; aucune équivalence de rendement avec le surgelé.':s);
    }
    const category=pilotCategory[record.sourceIndex]??plan.category;
    recipe.library={sourceIndex:record.sourceIndex,priority:record.review.priority,pilot:!!pilot,category,
      technicalStatus:'checked',culinaryStatus:'pending',minutes:v.temps,
      tags:[category,...(v.temps<=25?['rapide']:[]),...(v.ingredients.some(g=>/pates|penne|fusilli|linguine|riz|tagliatelle/.test(slug(g.nom)))?['pates-riz']:[])],
      adjustments:changes.filter(c=>c.recipeId===recipe.id),
      reservations:['Recette non essayée en conditions réelles.',
        ...(record.review.auditFlags.some(f=>/EGOUTTE/.test(f))?['Poids de conserves exprimés égouttés ; conditionnement brut inconnu.']:[]),
        ...(Object.keys(plan?.choices??{}).length?['Variante choisie explicitement pour simplifier la démo.']:[]),
        ...(recipe.openIssues??[]) ]};
    productionModel(recipe);recipes.push(recipe);
  }
  // Unused pilot variants are preserved in their source fixture, not exposed as
  // duplicate shopping ingredients in the selected demo catalog.
  const used=new Set(recipes.flatMap(r=>[...r.ingredients,...(r.cookingAuxiliaries??[])].map(g=>g.ingredientId)));
  const activeIngredients=ingredients.filter(i=>used.has(i.id));ingredientMap(activeIngredients);
  return {schema:'keskonmange-v3-library/1',version:1,sourceArchiveSha256:selection.sourceArchiveSha256,
    baseCommit:selection.baseCommit,validation:{technical:'checked_by_tests',culinary:'pending'},
    recipes,ingredients:activeIngredients,products:[],pieceConversions:[],changes};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const selection=JSON.parse(await readFile(new URL('selection.json',folder),'utf8'));
  let source=JSON.parse(await readFile(new URL('selected-source-review.json',folder),'utf8'));
  if(process.argv[2]) {
    const archive=await readFile(process.argv[2]);requireThat(createHash('sha256').update(archive).digest('hex')===selection.sourceArchiveSha256,'ARCHIVE_CHANGED',process.argv[2]);
    const full=JSON.parse(execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); n=next(n for n in z.namelist() if n.endswith("KeskonMange_V3_bibliotheque_revue_98.json")); print(z.read(n).decode("utf-8"))',process.argv[2]],{maxBuffer:8*1024*1024}));
    const ids=new Set(selection.selected.map(r=>r.id));source={schema:full.schema,source:full.source,recipes:full.recipes.filter(r=>ids.has(r.id))};
    await writeFile(new URL('selected-source-review.json',folder),JSON.stringify(source,null,2)+'\n');
  }
  const pilots=JSON.parse(await readFile(new URL('../../engine/fixtures/pilot-v3.json',import.meta.url),'utf8'));
  const library=convertLibrary(source,selection,pilots);
  await writeFile(new URL('library-v3.json',folder),JSON.stringify(library,null,2)+'\n');
  console.log(JSON.stringify({recipes:library.recipes.length,ingredients:library.ingredients.length,adjustments:library.changes.length,
    P3:selection.additionalP3.length,additionalP2:selection.additionalP2.length,pilots:selection.pilotSourceIndices.length}));
}
