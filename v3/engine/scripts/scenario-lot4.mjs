import {readFile,writeFile} from 'node:fs/promises';
import {initialMenu,emptyStock,createShopping,addShoppingItem,checkShoppingItem,evaluateMixedMenu,renderCooking,
  suggestRecipes,requestSuggestions,changeMixedMenu} from '../src/index.mjs';

const f=JSON.parse(await readFile(new URL('../fixtures/pilot-v3.json',import.meta.url),'utf8'));
const c={recipes:f.recipes,ingredients:f.ingredients,products:[],state:emptyStock(),
  session:{storeId:'offline-no-catalog',asOf:'2026-11-13'}};
const m=initialMenu('lot4-example'),diners=[4,3,3,2,2];
m.meals=f.recipes.map((r,k)=>({id:`meal-${k}`,recipeId:r.id,diners:diners[k],leftovers:'discard'}));
let s=addShoppingItem(createShopping('lot4-list'),{id:'manual-soap',label:'Savon',quantity:{amount:'1',unit:'pièce'}});
s=checkShoppingItem(s,'manual-soap',true);
const evaluation=evaluateMixedMenu(c,m,s);
const cooking=m.meals.map((meal,k)=>({recipeName:f.recipes[k].name,...renderCooking(f.recipes[k],meal,c.ingredients)}));
const halfMenu=structuredClone(m);halfMenu.meals[1].diners='1.5';halfMenu.meals[2].diners='1.5';
const halfEvaluation=evaluateMixedMenu(c,halfMenu),withStock=structuredClone(c);withStock.state.physical.i_oignon='1/2';
const stockEvaluation=evaluateMixedMenu(withStock,halfMenu);
const onion=e=>e.ingredientNeeds.find(n=>n.ingredientId==='i_oignon');
const changed=changeMixedMenu(c,m,evaluation.shopping,[{type:'updateMeal',mealId:'meal-3',patch:{diners:3}}]);
const report={version:1,sourceCommit:'f8f3262b34487cbb446e61372dfa83b884961be4',scope:'Five pilots, local engine only',
  validation:{arithmetic:'tested',culinary:'pending',priceAndCommercialFormats:'unknown'},
  menu:m,preparations:evaluation.requirements.preparations,
  coverage:{ingredientsComplete:evaluation.coverage.ingredientQuantitiesComplete,
    commercialComplete:evaluation.coverage.complete,missingIngredientNeeds:evaluation.coverage.unknownNeeds},
  amount:evaluation.basket.amount,shopping:evaluation.shopping,ingredientNeeds:evaluation.ingredientNeeds,cooking,
  rounding:{threeHalvesNoStock:onion(halfEvaluation),threeHalvesWithHalfInStock:onion(stockEvaluation)},
  suggestionsForFive:suggestRecipes(c,{diners:5}),
  automaticExtraPortions:requestSuggestions(c,m,evaluation.shopping,{kinds:['portions']}),
  changeToThreeBurgers:{menu:changed.menu,ingredients:changed.evaluation.requirements.individual[3],
    cooking:renderCooking(f.recipes[3],changed.menu.meals[3],c.ingredients),manualItems:changed.shopping.manual},
  openIssues:f.recipes.map(r=>({recipeId:r.id,issues:r.openIssues}))};
await writeFile(new URL('../reports/lot4-scenario.json',import.meta.url),`${JSON.stringify(report,null,2)}\n`);
const planning=m.meals.map((meal,k)=>`| ${k+1} | ${f.recipes[k].name} | ${meal.diners} | ${evaluation.requirements.preparations[k].producedPortions} |`).join('\n');
const list=evaluation.shopping.calculated.map(r=>`| ${r.label} | ${r.culinaryNeed.text} | ${r.referenceNeed} ${r.quantity.countKind??r.quantity.unit} | ${r.purchaseDisplay.text} |`).join('\n');
const example=`# LOT 4 — Exemple reproductible\n\nCalcul local, aucun catalogue, aucun prix inventé. Stocks initiaux vides. Toutes les quantités de référence V1 sont conservées. Validation culinaire encore en attente.\n\n| Repas | Recette | Convives | Parts préparées |\n|---|---|---:|---:|\n${planning}\n\nAucun reste cuisiné sur ce planning. Le riz et la salade sont dimensionnés indépendamment du plat principal. La salade de quiche reste fondée sur les 100 g pour 2,5 convives V1, soit 160 g pour quatre.\n\n## Liste de courses\n\n42 besoins regroupés, plus l’ajout manuel « Savon — 1 pièce » conservé coché. La quantité d’achat ci-dessous est le besoin minimal après arrondi des pièces, sans prétendre connaître un conditionnement commercial. Les masses égouttées restent exprimées en masse égouttée : le poids brut d’une boîte est inconnu. Les gousses ne sont pas converties en têtes d’ail, ni les cuillères en bouteilles. Prix total : **inconnu**, pas zéro euro.\n\n| Ingrédient | Besoin pour cuisiner | Référence exacte | Minimum à prévoir |\n|---|---|---|---|\n${list}\n\n## Changements et arrondis\n\n- Trois demi-oignons : 3/2 oignon consommé ; 2 oignons entiers à prévoir. Avec 1/2 oignon disponible : 1 oignon à prévoir. Aucun arrondi par recette.\n- Burgers pour deux : 2 pains, 2 steaks, 2 tranches de cheddar, 450 g de patates douces et 1 c. à soupe d’huile. L’étape utilise cette même cuillère.\n- Passage à trois burgers : 3 unités de chaque composant, 675 g de patates douces, 1 ½ c. à soupe d’huile ; l’ajout manuel demeure coché.\n- Bolognaise pour deux (variante testée) : 700/3 g de pâtes, affichage « environ 233,33 g », référence toujours 700/3 g. La proposition à 270 g pour trois reste non validée.\n- Quiche pour cinq : 2 quiches, 8 parts ; exclue des suggestions automatiques. Sélection manuelle possible avec 3 parts excédentaires explicites.\n- Gratin pour deux : 375 g de gnocchis et 300 g de potimarron, avec un plat adapté. L’eau mentionnée dans l’étape source passe de 150 à 75 ml et reste hors achats.\n\nLes 42 lignes et toutes les étapes recalculées sont disponibles dans [lot4-scenario.json](../reports/lot4-scenario.json). Aucune conversion grammes/pièces réelle n’est activée faute de référence documentée dans le dossier. Les unités naturelles ici proviennent directement des pièces et gousses V1.\n`;
await writeFile(new URL('../docs/LOT4-EXAMPLE.md',import.meta.url),example);
console.log(JSON.stringify({recipes:f.recipes.length,ingredientNeeds:evaluation.shopping.calculated.length,manualItems:evaluation.shopping.manual.length,
  ingredientQuantitiesComplete:evaluation.coverage.ingredientQuantitiesComplete,totalCents:evaluation.basket.amount.totalCents,
  cookingComplete:cooking.every(c=>c.status==='complete'),suggestionsForFive:report.suggestionsForFive.suggestions.length},null,2));
