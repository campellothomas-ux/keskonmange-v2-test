import {readFile,writeFile} from 'node:fs/promises';
import {createState,change,evaluate,catalog} from '../src/state.mjs';
const root=new URL('../',import.meta.url),libraryRoot=new URL('../../library/',import.meta.url);
const [engine,unit,browserText]=await Promise.all([
  readFile(new URL('reports/engine-tests.tap',root),'utf8'),readFile(new URL('reports/unit-tests.tap',root),'utf8'),
  readFile(new URL('reports/browser-tests.json',root),'utf8')]);
const browser=JSON.parse(browserText);
function passed(tap,count){return new RegExp(`# tests ${count}\\b`).test(tap)&&new RegExp(`# pass ${count}\\b`).test(tap)&&/# fail 0\b/.test(tap);}
if(!passed(engine,117)||!passed(unit,65)||browser.status!=='passed'||browser.counts.passed!==12)throw Error('Reports do not match required successful checks.');
const categories={viande:'Viande',poisson:'Poisson',vegetarien:'Végétarien'},modes={adjustable:'Ajustable',unit:'Unités entières',batch:'Préparation entière'};
const individual=catalog.recipes.map(r=>({id:r.id,sourceIndex:r.library.sourceIndex,name:r.name,priority:r.library.priority,
  category:r.library.category,sourceReference:r.originalV1.personnes,production:r.production,
  technicalChecks:{status:'passed',diners:[1,2,3,4,5,7,10,12]},culinaryStatus:'pending',
  adjustments:r.library.adjustments,reservations:r.library.reservations}));
await writeFile(new URL('data/conversion-audit.json',libraryRoot),JSON.stringify({version:1,sourceArchiveSha256:catalog.sourceArchiveSha256,
  baseCommit:catalog.baseCommit,recipes:50,checks:400,technicalStatus:'passed',culinaryStatus:'pending',individual},null,2)+'\n');
const rows=catalog.recipes.map(r=>{
  const reserves=[...r.library.adjustments.map(a=>`${r.originalV1.ingredients[a.ingredientIndex].nom} : ${a.sourceQuantity} → ${a.proposedQuantity} ${a.unit} (démo non validée)`),
    ...r.library.reservations.filter(s=>!s.startsWith('Recette non essayée'))];
  return `| ${r.library.sourceIndex} | ${r.name} | ${r.library.priority}${r.library.pilot?' · pilote':''} | ${categories[r.library.category]} | ${r.originalV1.personnes} | ${modes[r.production.mode]} | ${reserves.length?reserves.join(' '):'Quantités source conservées ; essai culinaire en attente.'} |`;
});
const counts=Object.fromEntries(Object.keys(categories).map(k=>[k,catalog.recipes.filter(r=>r.library.category===k).length]));
const inventory=`# Inventaire des 50 recettes V3\n\nCinq pilotes conservés, 26 P3 et 19 P2 supplémentaires. Les six P3 écartées avaient des associations de protéines très chargées, une répartition contradictoire d’ingrédients, des tortillas fractionnaires ou une unité de salade ambiguë. Les 48 exclusions, dont le dessert exceptionnel, sont identifiées dans [selection.json](data/selection.json).\n\n**Validation technique : 50 fiches × 8 tailles de tablée = 400 cas vérifiés. Validation culinaire : aucune des 50 fiches n’est déclarée essayée en conditions réelles.** P3 est une priorité de revue, pas un label de validation.\n\nDiversité : ${counts.viande} viandes, ${counts.poisson} poissons/crustacés, ${counts.vegetarien} végétariennes. ${catalog.recipes.filter(r=>r.library.tags.includes('rapide')).length} recettes indiquées à 25 minutes ou moins dans la source ; durées indicatives, certains refroidissements peuvent nécessiter de l’avance. Préparations entières, unités et portions ajustables sont représentées.\n\n15 ajustements de quantité sur 14 recettes sont utilisés explicitement dans la démo, tous **non validés en cuisine**. Les valeurs originales et propositions sont conservées ; aucun champ de validation n’est promu. La bolognaise utilise 270 g de pâtes pour trois dans cette démo, avec l’original à 350 g et la proposition source consultables. Le fichier pilote du lot 4 reste inchangé.\n\nLes quantités exprimées en bottes restent des fractions de bottes ; aucun poids de botte n’est inventé. Les œufs battus peuvent être fractionnés pour cuisiner, avec une note explicite et des achats arrondis après agrégation. Les unités entières restent imposées aux pains, tortillas, steaks en pièces et portions de poisson entières. Les masses et pièces non convertibles restent séparées, ainsi que les cuillères à café et à soupe.\n\n| N° V1 | Recette | Revue | Famille | Référence V1 | Production V3 | Réserves spécifiques |\n|---:|---|---|---|---:|---|---|\n${rows.join('\n')}\n\nLes [50 originales sélectionnées et leur revue](data/selected-source-review.json), la [conversion native](data/library-v3.json) et l’[audit individuel](data/conversion-audit.json) restent consultables séparément. Les variantes choisies (épinards frais, colin, persil, penne, haricots verts frais) n’impliquent aucune équivalence de rendement avec leurs alternatives. Pour les conserves, les besoins portent sur la quantité servie égouttée ; le poids brut d’achat n’est pas déduit.\n`;
await writeFile(new URL('INVENTORY.md',libraryRoot),inventory);
let state=createState();for(const index of [68,4,6,7,8,15,16,37,53,83]){
  const r=catalog.recipes.find(r=>r.library.sourceIndex===index);state=change(state,{type:'addRecipe',recipeId:r.id,diners:index===68?4:2});
}
state=change(state,{type:'addManual',label:'Liquide vaisselle',quantity:'1 flacon'});
const e=evaluate(state);
await writeFile(new URL('reports/lot5-scenario.json',root),JSON.stringify({version:1,menu:state.menu,
  ingredientQuantitiesComplete:e.coverage.ingredientQuantitiesComplete,preparations:e.requirements.preparations,
  priceCents:e.basket.amount.totalCents,requirements:e.requirements.needs,
  shopping:e.shopping.calculated.map(r=>({ingredientId:r.ingredientId,label:r.label,referenceNeed:r.referenceNeed,
    needed:r.culinaryNeed.text,minimumPurchase:r.purchaseDisplay.text,commercial:r.commercial})),manual:state.shopping.manual},null,2)+'\n');
console.log(JSON.stringify({engineTests:117,libraryAndStateTests:65,browserFlows:12,recipeCases:400,recipeCounts:counts,
  everydayExampleMeals:state.menu.meals.length,shoppingItems:e.shopping.calculated.length,priceCents:e.basket.amount.totalCents}));
