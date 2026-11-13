// Curated conversion of the five pilots only. Never an importer for the 98 recipes.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Q,requireThat} from '../src/exact.mjs';

const slug=s=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/œ/g,'oe').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
// Spelling/plural aliases only, no mass/count or culinary yield equivalence.
const aliases={'Boeuf hache 5%':'Bœuf haché 5 % MG','Boeuf hache 5% MG':'Bœuf haché 5 % MG',
  'Concentre de tomate':'Concentré de tomate','Concentre de tomates':'Concentré de tomate'};
const id=name=>`i_${slug(aliases[name]??name)}`;
const pieceLabels={
  'Pâte brisée':['pâte brisée','pâtes brisées'], 'Œufs':['œuf','œufs'],
  'Poivron rouge':['poivron rouge','poivrons rouges'],Oignon:['oignon','oignons'],Carotte:['carotte','carottes'],
  'Pains à burger':['pain à burger','pains à burger'],
  'Steaks hachés de bœuf 5 % MG':['steak haché de bœuf 5 % MG','steaks hachés de bœuf 5 % MG'],
  'Cheddar en tranches':['tranche de cheddar','tranches de cheddar'],Tomates:['tomate','tomates'],
  'Oignon rouge':['oignon rouge','oignons rouges'],Ail:['gousse d’ail','gousses d’ail']};
const indivisible=new Set(['Pâte brisée','Œufs','Pains à burger','Steaks hachés de bœuf 5 % MG','Cheddar en tranches']);
const measures={cas:'c. à soupe',cc:'cc',pincee:'pincée'};
const policies={allowExtraProduction:false,allowSurplus:false};

// Each array is one reviewed step. Objects are quantities, strings remain literal.
// Step indices refer to the untouched originalV1.etapes array.
const plans=[
  {mode:'batch',reference:'1',portions:'4',label:'quiche entière',sides:[6],sideReference:'2.5',
    productionEvidence:'LOT 4 : une préparation entière produit quatre parts, confirmé par l’utilisateur.',
    steps:[
      [0,'Préchauffer le four à 180 °C en chaleur tournante.'],
      [1,'Dérouler ',0,' dans un moule de 24 à 26 cm par quiche ; conserver le papier et piquer le fond.'],
      [2,'Étaler ',7,' sur le fond de chaque tarte, en répartissant la quantité totale.'],
      [3,'Couper ',1,' et répartir sur la pâte avec ',5,'.'],
      [4,'Battre ',2,' avec ',3,' et ',4,'. Ajouter ',8,' et ',9,'.'],
      [5,'Verser l’appareil en le répartissant entre les quiches préparées.'],
      [6,'Enfourner 30 à 35 minutes, jusqu’à ce que le centre soit pris et le dessus doré.'],
      [7,'Laisser reposer 5 minutes, découper chaque quiche en quatre parts et servir avec ',6,'.']],
    omitted:[{sourceStep:8,reason:'Conseil personnel de course conservé dans l’original ; hors du mode cuisine familial.'}]},
  {mode:'adjustable',reference:'3',portions:'1',label:'portion',sides:[1],sideReference:'3',
    steps:[
      [0,'Cuire ',1,' selon les indications du paquet.'],
      [1,'Émincer ',6,', hacher ',7,' et couper ',5,' en petits morceaux.'],
      [2,'Chauffer ',12,' puis cuire l’oignon et le poivron 4 à 5 minutes.'],
      [3,'Ajouter ',0,' et faire colorer en émiettant.'],
      [4,'Ajouter l’ail, ',8,', ',9,', ',10,' et ',11,' ; cuire 1 minute en mélangeant.'],
      [5,'Ajouter ',4,', ',2,' et ',3,'. Assaisonner avec ',13,'.'],
      [6,'Laisser mijoter 12 à 15 minutes à feu moyen sans couvrir, jusqu’à épaississement.'],
      [7,'Servir le chili avec le riz basmati préparé.']]},
  {mode:'adjustable',reference:'3',portions:'1',label:'portion',sides:[1],sideReference:'3',
    steps:[
      [0,'Émincer ',4,', ',5,' et ',3,' ; faire revenir 3 minutes dans ',8,'.'],
      [1,'Ajouter ',0,' ; émietter et cuire 5 minutes jusqu’à disparition de la couleur rose.'],
      [2,'Ajouter ',6,', ',2,', ',7,' et ',9,'. Laisser mijoter 15 minutes à feu doux.'],
      [3,'Cuire ',1,' al dente dans l’eau bouillante salée ; égoutter.'],
      [4,'Mélanger les pâtes et la sauce bolognaise ; servir chaud.']]},
  {mode:'unit',reference:'4',portions:'1',label:'burger',sides:[3,10,11],sideReference:'4',
    steps:[
      [0,'Préchauffer le four à 210 °C en chaleur tournante et préparer une plaque.'],
      [1,'Éplucher ',3,' et couper en frites de 1 cm d’épaisseur ; sécher soigneusement.'],
      [2,'Mélanger les frites avec ',10,' et ',11,'. Étaler en une seule couche ; adapter le nombre de plaques.'],
      [3,'Cuire 25 à 35 minutes, retourner à mi-cuisson, vérifier que les frites sont tendres. Ajouter ',12,'.'],
      [4,'Mélanger ',7,', ',8,' et ',9,' pour la sauce ; réserver au frais.'],
      [5,'Laver ',4,' et ',5,' ; couper les tomates et émincer ',6,'.'],
      [6,'Cuire ',1,' dans une poêle antiadhésive selon leur épaisseur ; assurer une cuisson complète à cœur pour les enfants. Ajouter ',13,'.'],
      [7,'Répartir ',2,' sur les steaks pendant la dernière minute ; couvrir pour faire fondre.'],
      [8,'Ouvrir ',0,' en deux et toaster 1 à 2 minutes, face coupée vers le bas.'],
      [9,'Assembler les burgers avec les ingrédients préparés et la sauce.'],
      [10,'Servir avec les frites ; adapter la taille des morceaux aux convives.']]},
  {mode:'adjustable',reference:'4',portions:'1',label:'portion',sides:[],
    productionEvidence:'LOT 4 : redimensionnement proportionnel explicite, aucun composant imposant un lot entier. Essai dans un plat plus petit encore requis.',
    steps:[
      [0,'Préchauffer le four à 200 °C. Préparer ',1,' : laver, retirer les graines et couper en petits cubes. Peau conservable si fine.'],
      [1,'Émincer ',6,' et hacher ',7,'. Chauffer ',8,' ; faire revenir l’oignon 3 minutes puis l’ail 30 secondes.'],
      [2,'Ajouter le potimarron et ','water','. Couvrir et cuire 15 à 20 minutes jusqu’à tendreté.'],
      [3,'Ajouter ',3,' rincés et égouttés puis ',5,'. Mixer en sauce ; ajouter de l’eau si nécessaire. Assaisonner avec ',9,', ',10,' et ',11,'.'],
      [4,'Préparer ',2,' : frais, faire tomber 2 à 3 minutes ; surgelés, décongeler puis retirer l’excédent d’eau. Choisir une variante, sans conversion de rendement entre les deux.'],
      [5,'Cuire ',0,' selon le paquet, généralement 2 à 3 minutes ; égoutter.'],
      [6,'Mélanger les gnocchis, épinards et sauce dans un plat adapté à la quantité ; conserver une épaisseur comparable.'],
      [7,'Répartir ',4,' égouttée et déchirée sur le dessus.'],
      [8,'Enfourner 12 à 15 minutes jusqu’à fonte et légère coloration ; laisser reposer 3 minutes. Vérifier la cuisson pour le plat choisi.']]}
];

export function convertPilots(source) {
  requireThat(source.recipes?.length===5,'PILOT_SCOPE_REQUIRED','exactly five pilots');
  const ingredients=new Map();
  const recipes=source.recipes.map((r,k)=>{
    const v=r.originalV1,p=plans[k];
    const hashes=['aed691fcda3c138b1f92b69ae7c0595fd1797c2544a48024bdcc35048035613b',
      '2a5f9bd5ed4bec4098dc24cceeb72ace8f761144903151a1fa8016344b94a1e3',
      '705606ed436b5ad16cdd22ba3d4d013aca6c9552caef7fee941fbc3113373254',
      '89b0457dc582f669eedd58b4204834d435281b4bd649c63e53c826cb94e03494',
      '00454e031be9e52f9bc32e208c5aea1cba7474a40b19260debd3b2bf00fe86c1'];
    requireThat(createHash('sha256').update(JSON.stringify(v)).digest('hex')===hashes[k],'PILOT_SOURCE_CHANGED',r.id);
    // Guard curated numeric bindings against accidental reordering of the input.
    requireThat(r.id===['r_quiche_jambon_fromage_et_salade_verte','r_chili_con_carne_express_et_riz_basmati',
      'r_pates_bolognaise_economique','r_cheeseburgers_maison_et_frites_de_patate','r_gratin_de_gnocchis_au_potimarron___pinar'][k],
      'PILOT_SOURCE_CHANGED',r.id);
    const rows=v.ingredients.map((g,index)=>{
      const ingredientId=id(g.nom),unit=['g','ml'].includes(g.unite)?g.unite:'unit';
      const basis=slug(g.nom).includes('egoutt')?'drained':'net';
      const countKind=unit==='unit'?(measures[g.unite]?`measure:${g.unite}`:`piece:${slug(g.nom)}`):undefined;
      const labels=pieceLabels[g.nom];
      const displayName=(aliases[g.nom]??g.nom).toLocaleLowerCase('fr');
      const ingredient={id:ingredientId,name:displayName,unit,basis,...(countKind?{countKind}:{}),
        ...(indivisible.has(g.nom)?{indivisible:true}:{}),
        culinary:{...(labels?{singular:labels[0],plural:labels[1]}:{}),
          ...(!labels&&measures[g.unite]?{measure:measures[g.unite]}:{}),
          joiner:/^[aeiouéèêœ]|^huile/i.test(displayName)?'d’':'de '},
        ...(g.unite==='piece'?{purchasePolicy:{wholeUnits:true,evidence:'LOT 4 : achat minimal en pièces entières ; aucun conditionnement inféré.'}}:{}),
        basisEvidence:{status:basis==='drained'?'explicit_source':'source_basis_unspecified',
          interpretation:basis==='drained'?'Mention égoutté dans le nom original.':'Quantité recette telle qu’écrite, sans coefficient brut/net.'}};
      if(ingredients.has(ingredientId))requireThat(JSON.stringify(ingredients.get(ingredientId))===JSON.stringify(ingredient),'INGREDIENT_IDENTITY_CONFLICT',ingredientId);
      ingredients.set(ingredientId,ingredient);
      const proposed=r.review.ingredientChangeProposals.filter(c=>c.ingredientIndex===index);
      return {ingredientId,quantity:{amount:Q.of(String(g.qte)).toString(),unit,basis,...(countKind?{countKind}:{})},
        ...(p.sides.includes(index)?{scaling:{mode:'diners',referencePortions:p.sideReference}}:{}),
        trace:{sourceIngredientIndex:index,original:{name:g.nom,amount:String(g.qte),unit:g.unite},
          identityNormalization:aliases[g.nom]?{kind:'spelling_and_plural_only',canonicalName:aliases[g.nom],
            reason:'Même bœuf haché à 5 % ou même concentré de tomate ; steaks en pièces distincts.'}:null,
          proposed:structuredClone(proposed),validated:null,effective:{amount:String(g.qte),unit:g.unite,decision:'original_preserved'},
          quantityValidationStatus:'source_preserved_not_culinary_validated'}};
    });
    const recipe={id:r.id,name:r.name,source:{archive:'KeskonMange_V3_REVISE_98_DOSSIER.zip',
      archiveSha256:'3dda40f91991647262dd4e75f0ad5b96547ac6fe96a49a63867e1d0ebdfa8dca',
      reviewFile:'pilot-source-review.json',sourceIndex:r.sourceIndex},
      originalV1:structuredClone(v),review:structuredClone(r.review),
      production:{version:1,mode:p.mode,unitLabel:p.label,referenceUnits:p.reference,portionsPerUnit:p.portions,
        minUnits:p.mode==='adjustable'?'1/4':'1',stepUnits:p.mode==='adjustable'?'1/4':'1'},
      productionTrace:{originalPeople:String(v.personnes),proposedServings:r.review.proposedServings,
        sourceCandidate:r.review.productionModeCandidate,validated:k===0?{partsPerWhole:'4',evidence:p.productionEvidence}:null,
        decision:p.productionEvidence??'Proportionnalité des quantités V1 ; aucune réduction de portion appliquée.',
        culinaryTrialStatus:'pending'},
      automaticPolicy:{...policies},ingredients:rows,
      cookingSteps:p.steps.map(([sourceStep,...parts])=>({sourceStep,quantityBindingsReviewed:true,
        parts:parts.map(x=>typeof x==='number'?{ingredientId:rows[x].ingredientId}:x==='water'?{ingredientId:'i_eau_cuisine'}:x)})),
      instructionTrace:{method:'curated_ingredient_bindings',originalStepsPreserved:true,omitted:p.omitted??[],
        adaptations:'Quantités liées aux ingrédients ; détails personnels hors cuisine généralisés, temps/températures conservés.'},
      openIssues:['Quantités V1 préservées ; validation culinaire et éventuelles corrections encore à confirmer.',
        'Aucune conversion des mesures cas/cc/pincée vers g ou ml ; aucun poids par pièce présumé.']};
    if(k===0)recipe.openIssues.push('Salade : 100 g pour les 2,5 convives déclarés en V1 ; dimensionnement indépendant, à confirmer en cuisine.');
    if(k===4) {
      ingredients.set('i_eau_cuisine',{id:'i_eau_cuisine',name:'eau de cuisson',unit:'ml',basis:'net',shoppingRequired:false,culinary:{joiner:'d’'}});
      recipe.cookingAuxiliaries=[{ingredientId:'i_eau_cuisine',quantity:{amount:'150',unit:'ml',basis:'net'},
        trace:{sourceStep:2,sourceApproximate:true,decision:'Quantité explicitement présente dans l’étape originale, hors achats.'}}];
      recipe.openIssues.push('Choisir épinards frais ou surgelés ; poids de référence avant/après égouttage non précisé.',
        'Confirmer le poids de potimarron préparé et de mozzarella égouttée ; aucun coefficient de perte supposé.',
        'Plat plus petit : calcul proportionnel vérifié, essai culinaire encore requis.');
    }
    return recipe;
  });
  return {schema:'keskonmange-v3-pilots/1',status:'TECHNICALLY_EXECUTABLE_CULINARY_REVIEW_PENDING',
    sourceReviewSchema:source.schema,sourceV1Sha256:source.source.sha256,recipes,ingredients:[...ingredients.values()],
    pieceConversions:[],products:[],notes:['Aucun catalogue commercial.','Aucune correction quantitative proposée promue en validation.',
      'Normalisation de graphie documentée : bœuf haché 5 % et concentré de tomate. Aucune équivalence poids/pièce.']};
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const source=JSON.parse(await readFile(new URL('../fixtures/pilot-source-review.json',import.meta.url),'utf8'));
  const converted=convertPilots(source);
  await writeFile(new URL('../fixtures/pilot-v3.json',import.meta.url),`${JSON.stringify(converted,null,2)}\n`);
  console.log(`Converted ${converted.recipes.length} pilots, ${converted.ingredients.length} ingredient identities; no proposed quantity correction applied.`);
}
