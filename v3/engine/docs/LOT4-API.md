# LOT 4 — Quantités, cuisine et courses

Module ES existant, sans dépendance ajoutée. Les appels sont purs : aucune écriture
réseau, Firebase ou interface V2. Les chaînes de fractions passent par `Q`.

## Utiliser les cinq pilotes

```js
import {
  initialMenu, emptyStock, evaluateMixedMenu, renderCooking, suggestRecipes
} from './src/index.mjs';
// Charger fixtures/pilot-v3.json selon l'environnement de l'appelant.
const context = {
  recipes: pilots.recipes, ingredients: pilots.ingredients,
  products: [], state: emptyStock(),
  session: {storeId: 'offline-no-catalog', asOf: '2026-11-13'}
};
const menu = initialMenu('semaine');
menu.meals = pilots.recipes.map((recipe, k) => ({
  id: `repas-${k}`, recipeId: recipe.id,
  diners: [4, 3, 3, 2, 2][k], leftovers: 'discard'
}));
const result = evaluateMixedMenu(context, menu);
const cooking = renderCooking(context.recipes[3], menu.meals[3], context.ingredients);
const choices = suggestRecipes(context, {diners: 5});
```

`session` reste exigée par le contrat existant, même sans catalogue. Ici son
identifiant désigne une session locale sans magasin renseigné, aucune enseigne
ou référence commerciale supposée.

## Trois quantités séparées

| Champ | Sens | Arrondi |
|---|---|---|
| `requirements.needs[id]` | Quantité de référence exacte consommée/préparée | Aucun arrondi d'affichage |
| `ingredientNeeds[].culinaryNeed` | Présentation culinaire + copie explicite de la référence | Décimal ou fraction, approximation signalée |
| `quantity.amount` sur une ligne sans SKU | Besoin exact restant après stock | Aucun |
| `purchaseQuantity` | Minimum après arrondi des pièces entières | Après agrégation et stock |
| `minimumPurchaseSurplus` | Différence achat minimal / besoin restant | Conservée séparément |
| `commercial` | Conditionnement, SKU, nombre de paquets, prix | `null` sans donnée vérifiée |
| `basket.quantities[].bought` | Quantité commerciale déterminée par le moteur de formats | `null` si impossible à déterminer |

Sans catalogue, `shopping.calculated` contient des lignes `kind: 'ingredient_need'`
avec nom, `ingredientId`, quantité et unité ; aucune propriété `productId` fictive.
Le nombre d'œufs, de pains ou d'oignons indiqué est un minimum d'unités ; aucun
paquet de six ou lot de légumes n'est supposé. Une masse égouttée ne devient pas
un poids brut de boîte. Une quantité d'huile en cuillères ne donne pas le volume
d'une bouteille. Les ingrédients déjà couverts par le stock ne génèrent pas d'achat.

`coverage.ingredientQuantitiesComplete` décrit le calcul des ingrédients.
`coverage.quantitiesComplete` et `coverage.complete`, conservés pour compatibilité,
incluent les formats commerciaux et les conflits de lignes cochées. Ils peuvent
rester faux alors que la liste des ingrédients est entièrement calculée. Le statut
global `partial` et le prix `null` ne signifient donc pas que la recette est absente.
`purchaseIssues` explique les formats manquants ; ne pas masquer les lignes pour
ce motif. Les cases cochées restent protégées et les ajouts manuels restent séparés.

La confirmation d'une ligne sans SKU conserve le fonctionnement du lot 3 : achat
non suivi physiquement tant que le contenu réellement acheté n'est pas vérifié.
Elle ne crée aucun stock à partir d'un minimum indicatif.

## Affichage naturel configurable

`formatCulinaryQuantity(ingredient, amount, options)` renvoie `referenceQuantity`,
`displayQuantity`, `text`, `approximate` et `evidence`. Les ingrédients déjà en
pièces ou gousses utilisent leurs unités d'origine et les fractions simples.
Les très petites valeurs ne sont jamais affichées comme zéro.

Une conversion facultative `ingredient.culinary.pieceConversion` contient :

```text
basis             même base que l'ingrédient en grammes
gramsPerPiece     chaîne exacte, fournie par une référence documentée
singular/plural   nom de la pièce et, si nécessaire, son calibre
evidence          référence ou résumé de la mesure utilisée
maxRelativeError  tolérance relative explicite ; défaut 1/10, maximum 1/4
```

L'appel peut aussi fournir `options.pieceConversions`, par identifiant d'ingrédient.
Seules les fractions simples assez proches sont affichées ; sinon l'unité initiale
reste utilisée. `precise: true` conserve la quantité exacte et désactive la
conversion d'affichage. `decimalPlaces` (0 à 6, défaut 2) ne modifie jamais la référence.
Les conversions d'affichage sont des approximations : elles n'autorisent pas une
conversion commerciale ou une modification du stock. Une équivalence de calcul
entre pièces et masse exige toujours `ingredient.conversions` avec preuve, base
et `countKind` correspondants, selon le contrat existant.

**Aucun poids par pièce réel n'est activé dans les pilotes.** Les nombres 80 g par
oignon utilisés dans les tests sont des données artificielles clairement identifiées.

## Accompagnements et choix automatiques

Une ligne peut porter `scaling: {mode: 'diners', referencePortions: '...'}`.
Elle suit alors les convives, indépendamment des lots du plat principal. Sans ce
champ, elle suit la production, comme avant le lot 4. La salade de quiche conserve
sa référence V1 de 100 g pour 2,5 convives ; elle n'est pas ramenée silencieusement
à 100 g pour quatre. Riz, pâtes et frites ont aussi leur dimensionnement indépendant.

Les cinq pilotes portent `automaticPolicy: {allowExtraProduction: false,
allowSurplus: false}`. Choix conservateur : aucune part cuite excédentaire dans les
suggestions, aucun seuil arbitraire de gaspillage acceptable. Quiche pour cinq :
exclue automatiquement, calcul manuel toujours possible à huit parts. L'évaluation
expose `automaticExclusion` et les parts conservées/jetées. Les moteurs existants
de suggestions, de remplacement et de recherche conjointe respectent ces champs.

`suggestRecipes(context, {diners, limit, leftovers})` propose des recettes
calculables selon leurs contraintes et rendements, même sans prix. Il ne compare
pas les coûts et n'annonce pas d'optimum. `requestSuggestions` conserve sa fonction
de recherche de gains mesurables ; sans gain connu, aucune suggestion artificielle.

## Étapes synchronisées

`renderCooking` utilise des `cookingSteps` structurées. Chaque étape contient
`quantityBindingsReviewed: true`, `sourceStep` et `parts`, composée de textes et
de `{ingredientId, precise?: true}`. Les quantités sont prises dans le même calcul
de production que les courses. Les durées, températures et tailles de découpe
restent littérales ; aucune substitution aveugle des nombres.

Une étape sans validation des liaisons ou avec un ingrédient inconnu est omise des
étapes utilisables et signalée dans `issues`; statut `needs_review`. Le texte V1
reste dans `originalV1.etapes`. Les `cookingAuxiliaries` couvrent uniquement les
mesures explicites nécessaires aux étapes mais hors achats : ici les 150 ml d'eau
du gratin, proportionnels à la production. L'ajustement final de l'eau « si
nécessaire » reste une indication qualitative de la source.

La conversion des cinq pilotes est figée par empreintes des originaux : toute
modification d'une source refuse de réutiliser automatiquement les liaisons
éditoriales. Il faut alors revoir la conversion explicitement.
