# Lot 2 — contrats métier et future interface

Module version 0.2.0, exports dans `src/index.mjs`. Les API de menu restent pures :
elles retournent des valeurs, sans modifier leurs arguments, sans interface ni
écriture réseau. Les 35 tests et les API du lot 1 gardent leur contrat. Pour les
nouvelles fonctionnalités, employer les API décrites ici plutôt que `optimizeMenus`.

## Contexte de calcul

`context = {recipes, ingredients, products, session, state?, manual?, constraints?,
policy?, budget?, maxStates?, maxPortfolioStates?}` reprend les données du lot 1.
`state` est le stock courant, issu de `emptyStock()` ou du journal. Les références
commerciales appartiennent au seul magasin `session.storeId`. Un prix provenant
d'ailleurs reste une donnée de prix qualifiée ; il ne change pas le magasin vendu.
Le magasin réel habituel pourra être E.Leclerc Saint-Orens, mais les fixtures
utilisent `synthetic-store`, sans inventer de références commerciales réelles.

`manual` représente des ajouts indépendants en plus des achats du menu, pas du
stock déjà acquis ; les lignes sont regroupées avant arrondi du prix au poids.
Les prix, unités, bases et incertitudes suivent [le contrat du lot 1](MODEL.md).
Les coefficients du lot 1 restent explicites : coût + surplus pondérés + variété,
familles, préférences/historique + dépassement budgétaire souple − bonus de stock
périssable utilisé. Aucun coefficient de préférence ou gaspillage caché.

Les limites de ressources sont des erreurs explicites, pas une approximation
quantitative. `maxStates` vaut 100 000 et `maxPortfolioStates` 10 000 par défaut.
La seconde borne limite les combinaisons intermédiaires des frontières d'achat.

## Production des recettes : schéma versionné

```json
{
  "id":"quiche-test",
  "yieldPortions":4,
  "production":{
    "version":1,
    "mode":"batch",
    "unitLabel":"quiche",
    "referenceUnits":"1",
    "portionsPerUnit":"4",
    "minUnits":"1",
    "stepUnits":"1",
    "maxUnits":"3"
  },
  "ingredients":["liste quantifiée selon le contrat existant"]
}
```

Les ingrédients de référence correspondent à `referenceUnits` unités de
préparation, produisant `referenceUnits × portionsPerUnit` portions. Si
`yieldPortions` est présent, cette égalité doit être exacte. Aucun rendement ne
vient du titre ou du nombre de convives.

| Champ/mode | Signification |
|---|---|
| `adjustable` | Une unité = une portion ; `portionsPerUnit` doit valoir 1. Le pas exprime les portions autorisées. |
| `batch` | Une unité = une préparation entière. Les nombres d'unités de référence, minimum et pas sont entiers. |
| `unit` | Une unité = un burger/wrap/etc. entier, avec son rendement explicite. Même grille entière que les lots. |
| `referenceUnits` | Quantité de préparations correspondant aux ingrédients de référence. Exemple : 4 pour un chili de 4 portions ; 1 pour une quiche de 4 portions. |
| `minUnits`, `stepUnits` | Grille autorisée `minUnits + n × stepUnits`, n entier positif ou nul. |
| `maxUnits?` | Plafond explicite de redimensionnement ; absent = pas de plafond de recette déclaré. |
| `unitLabel` | Libellé de préparation, distinct d'une unité physique d'ingrédient. |

Les valeurs quantitatives acceptent les rationnels exacts du lot 1. Pour les modes
`batch` et `unit`, les unités de préparation sont entières, même quand une portion
elle-même est fractionnable. Le nombre minimal de préparations nourrit toujours
les convives. Les œufs restent soumis à la politique explicite `indivisiblePolicy`.

Une recette de chili ajustable dont les ingrédients décrivent 4 portions utilise
`referenceUnits:"4", portionsPerUnit:"1"`. Une préparation individuelle dont les
ingrédients décrivent 6 burgers utilise `referenceUnits:"6"`, pas une réduction
implicite à un burger.

`adaptProductionRecipes(recipes, reviews)` attend une revue par ID :
`{recipeId:{production,evidence}}`. Retour : `{accepted,validationRequired}`,
avec codes stables pour les revues absentes/incohérentes. La fonction ne certifie
pas la vérité d'une donnée renseignée. Aucune revue réelle des modes V2 n'a été
inventée pendant le lot ; les nouvelles fixtures sont explicitement synthétiques.

## Menus, repas et verrous

`initialMenu(id)` retourne `{version:2,id,revision:0,meals:[],reservationIds:{}}`.
Cette version décrit le contrat du moteur ; elle est distincte de l'état de
l'application V2, qui n'est pas modifié.

Un repas : `{id, recipeId, diners, leftovers:"keep"|"discard", productionUnits?,
indivisiblePolicy?, locks?, status?}`.

- `diners` désigne les portions nécessaires ; l'optimisation conserve ce paramètre
  pour chaque repas. Il n'est jamais diminué pour rendre un panier faisable.
- Sans `productionUnits`, la production minimale sur la grille est utilisée.
- Avec ce champ, la production est explicite et vérifiée. En augmentant les
  convives, un recalcul augmente cette valeur seulement jusqu'au minimum requis
  si l'ancienne devient insuffisante. Un verrou de production interdit ce changement.
  En diminuant les convives, une production explicite existante reste conservée.
- `leftovers` distingue les portions conservées des portions abandonnées. Toute
  la préparation consomme ses ingrédients. Les portions conservées sont encore
  prévisionnelles avant cuisson.
- `locks:{recipe?,production?,diners?,leftovers?}` contient des booléens. Chaque
  verrou protège ce paramètre. Le verrou de production protège le nombre de
  **portions produites**, y compris lors d'un changement de recette ; le moteur
  vérifie la grille de la nouvelle recette. Pour figer tout un repas, activer les
  quatre verrous. Les API de proposition ne changent jamais les verrous : leur
  édition appartient à une action utilisateur distincte de la future application.
- `status` vaut `planned` par défaut, puis `cooked` après confirmation. Un repas
  cuisiné ne peut plus être modifié ni remis en achats par une réoptimisation.

`reservationIds` associe les IDs de repas aux réservations appartenant à ce menu.
Lors d'un recalcul, seules ces réservations sont libérées dans une projection
temporaire. Les autres menus continuent à immobiliser leur stock.

## Calculs de production

| Fonction | Entrée → sortie / comportement |
|---|---|
| `productionModel(recipe)` | Vérifie le schéma et retourne ses paramètres en rationnels internes. |
| `resolveProduction(recipe, meal)` | Retourne mode, unités, minimum requis, facteur exact, convives, portions produites/conservées/abandonnées. |
| `stepProduction(recipe, meal, direction)` | `direction` vaut +1/−1 ; retourne une copie du repas avancée d'un pas légal, sans modifier les convives. Refuse un minimum insuffisant ou un verrou. |
| `productionRequirements(recipes, meals, ingredients)` | Retourne `needs` agrégés, `individual` par repas, `preparations` avec rendements et arrondis. |

Exemple bouton `+` : quiche de 4 portions, grille entière → 4, 8, 12 portions.
Pour 5 convives, le minimum est 8. Le bouton `−` ne peut pas repasser à 4. Une
augmentation facultative n'est jamais enregistrée par un simple calcul.

## Évaluation et propositions

`evaluateMenu(context, menu)` retourne `{version, requirements, basket, score,
allocation, metrics}`. `basket.menu` chiffre les achats nécessaires ; `basket.cart`
inclut les ajouts manuels, leurs sources et incertitudes. L'évaluation recalcule
conjointement coût et surplus de tous les conditionnements. Le stock physique
n'est pas modifié. Les besoins des repas `cooked` sont exclus des achats ; les
indicateurs de variété décrivent l'ensemble des recettes du menu.

`allocation` répartit le stock réellement libre entre les repas, dans l'ordre du
planning. Elle ne réserve pas le stock futur à acheter. Cette attribution peut
donc être partielle tout en produisant un panier suffisant. L'ordre influence
l'attribution aux repas, pas la quantité globale de stock utilisée.

Toutes les propositions ont le contrat :

```text
{version:1, kind:"menu-proposal", status:"awaiting_acceptance", reason,
 basis:{menu,stock,context}, stockRevision, menu, evaluation,
 comparison, comparisonUnavailable}
```

Les bases sont des sérialisations canoniques exactes, sans hash pouvant entrer en
collision. Elles protègent contre un menu, catalogue, prix, politique ou stock
changé depuis la proposition. Leur taille fait partie des limites documentées.
Le menu candidat a la révision suivante ; il n'est pas enregistré.

| Fonction | Contrat |
|---|---|
| `proposeMenu(context, menu, meals, options?)` | Évalue une liste candidate ; respecte les verrous. `reason` identifie l'intention ; `includeComparison:false` permet un candidat sans calcul de baseline. |
| `recalculateMenu(context, menu, changes)` | `changes:[{mealId,diners?,productionUnits?,leftovers?}]`. Ne change ni recette, ni repas non demandé. Retourne une proposition avec panier global recalculé. |
| `compareEvaluations(context, before, after)` | Différences de prix, score, quantités, paquets, stock, portions préparées/conservées et variété. Les quantités restent ventilées par ingrédient et unité. |
| `acceptMenuProposal(context, menu, proposal, {eventId})` | Retourne `{menu,stock,evaluation,replayed:false}` après validation des bases et de l'évaluation. Rejeu identique : `{menu,stock,replayed:true}` sans revenir à un ancien planning. |
| `cancelMenuChange(context, menu, {eventId,targetId})` | Annule une transition de planning ou cuisson associée à un menu. Restaure contenu/réservations avec une nouvelle révision ; exige l'annulation préalable des dépendances. Rejeu idempotent. |

Une baseline rendue incompatible par une nouvelle contrainte peut être remplacée
par une proposition valide. Si la baseline n'est plus calculable, `comparison:null`
et `comparisonUnavailable:{code,detail}` remplacent toute différence inventée.
La proposition valide reste soumise à acceptation.

L'application devra sauvegarder **ensemble le menu et le stock retournés** dans
une transaction. Ces fonctions n'écrivent rien elles-mêmes. Une annulation
restaure l'intention précédente ; avant un nouveau calcul/cuisson, les contraintes
actuelles devront toujours être revérifiées.

## Suggestions de production

`suggestPortions(context, menu, {mealId,maxSteps=3,limit=3,maxExtraCostCents=0,
minSavingCents=1,minIngredientGain={}})` retourne
`{status:"proposals",suggestions,rejected,applied:false}`.

Le moteur avance sur la grille de la recette, au plus 20 pas, puis évalue chaque
menu complet. Il exige un bénéfice mesuré : économie, diminution de surplus
périssable, utilisation supplémentaire d'un stock périssable ou moins de paquets.
`minIngredientGain` permet un seuil par ingrédient dans son unité canonique ; zéro
signifie un gain exact strictement positif. Pas d'addition de grammes et de pièces.
Le coût supplémentaire est refusé par défaut. Les restes doivent être destinés
à être conservés ; sinon la fonction renvoie `LEFTOVER_KEEP_REQUIRED` sans suggestion.

Les bénéfices distinguent `saving`, `unchangedPurchases`, `reducedPerishable` et
`morePerishableStockUsed`. Une portion sans achat supplémentaire est une meilleure
utilisation du panier, pas une baisse de prix. Si un surcoût est explicitement
autorisé, le libellé devient `surplus_reduction_with_extra_cost`, sans annoncer
une économie. Si les prix sont inconnus, aucun gain monétaire n'est affirmé ; un
gain quantitatif avec achats strictement identiques reste identifiable.

## Remplacement d'un repas

`replacementAlternatives(context, menu, {mealId,rejectedRecipeIds=[],limit=3,
maxEvaluations=100})` retourne `{status:"proposals",alternatives,evaluated,limited,
failures,applied:false,presentation}`.

Les autres repas et tous leurs paramètres sont copiés à l'identique. Les convives
du repas ciblé sont conservés. Une production non verrouillée est recalculée selon
la nouvelle recette ; un verrou de production est traduit en portions produites
et doit rester compatible avec la nouvelle grille. Chaque alternative chiffre le
panier complet, pas le coût de la recette seule.

Le meilleur objectif est présenté en premier ; les suivantes privilégient des
familles différentes quand elles sont renseignées. `objectiveRank` conserve le
rang économique/objectif avant cette diversification de présentation. Aucune
garantie de diversité nutritionnelle n'est déduite de ces familles.

`rejectedRecipeIds` appartient à la demande de remplacement, et ne modifie jamais
les exclusions alimentaires permanentes. Une recette rejetée n'est pas reproposée
dans cette demande. Une limite de recherche est signalée ; les alternatives ne
prétendent alors pas couvrir tout le catalogue.

## Optimisation et réoptimisation volontaires

`optimizeMenuJoint(context, {slots,baseMenu?,strategy?,maxEvaluations?,seedCount?,
maxNodes?,allowProductionAdjustments?,productionExtraSteps?,onProgress?})` :

- `slots` contient des repas avec ID, convives, conservation et verrous ; la recette
  peut être absente pour une création, ou renseignée pour une réoptimisation.
- `baseMenu` sert à libérer ses propres réservations et à respecter ses verrous.
  Par défaut, un menu vide `candidate` est utilisé.
- `strategy` vaut `exhaustive`, `local` ou `diverse` (défaut).
- `maxEvaluations` vaut 500 ; `seedCount` vaut 6 ; `maxNodes` vaut 1 000 fois la
  limite d'évaluations et protège l'énumération de branches sans menus complets.
- Les convives de chaque slot restent fixes. Sans autorisation d'ajustement, la
  production explicite d'une recette conservée reste préservée ; une nouvelle
  recette prend son minimum légal, sous réserve des verrous.
- `allowProductionAdjustments:true` autorise des productions facultatives dans
  la **proposition** globale, au plus `productionExtraSteps` pas supplémentaires
  (défaut 1, maximum 20). L'utilisateur devra accepter ce menu candidat.
- `onProgress` reçoit une copie de chaque amélioration trouvée : nombre
  d'évaluations, score, prix total et stratégie ayant produit l'amélioration. Le
  callback doit rester observateur, ne pas lever d’exception ni effectuer de mutation réseau.

Sortie : `{status,solution:{menu,evaluation}|null,search}`. `search` expose évaluations,
nœuds, limites, rejets, erreurs, améliorations et `quality` : `feasible`, `best_found`,
`proven_optimal` ou `no_solution`. Les statuts métier sont `feasible`, `needs_prices`,
`needs_data`, `infeasible`, `search_limit`. Une heuristique qui échoue à construire
un menu ne prétend pas démontrer une incompatibilité ; un slot sans choix admissible
est en revanche un blocage explicite. La preuve porte uniquement sur le modèle,
les choix de production autorisés et les nombres tarifaires fournis.

`proposeReoptimization(context, menu, options)` emploie ces mêmes options et
retourne le diagnostic de recherche, `proposal` et `applied:false`. Il n'enregistre
jamais son résultat. Il conserve les repas/paramètres verrouillés et tous les
convives, même lorsque le menu entier est réoptimisable.

## Restes cuisinés et journal

Le stock dispose facultativement de `prepared:{lotId:{recipeId,portions,
sourceEventId}}`, distinct de `physical`. Aucun reste cuisiné n'est créé pendant
la planification. La projection `prepared` apparaît lors de la première cuisson
confirmée conservant des portions.

`confirmMealCooking(context, menu, {mealId,eventId,actualNeeds})` exige les
ingrédients réellement consommés dans leurs unités/bases canoniques. Il retourne
menu avec repas marqué `cooked`, stock mis à jour et préparation. Les portions
produites/servies/conservées proviennent du mode de production confirmé. Une même
confirmation rejouée ne consomme ni ne crée de portions une seconde fois. Pour
une quantité ou un rendement réellement différent, corriger la préparation avant
la confirmation plutôt que déclarer un rendement fictif.

`applyEvent` accepte en plus des événements du lot 1 :

- `replan` : `{id,kind:"replan",expectedRevision,releaseIds,reservations,menuIntent?,
  proposalBasis?}`. Remplace plusieurs réservations atomiquement. Les API de menu
  construisent cet événement ; une application ne doit pas autoriser arbitrairement
  la libération des réservations d'un autre menu.
- `cook` peut porter `prepared:{id,recipeId,producedPortions,servedPortions,
  keptPortions,discardedPortions}`. Le total doit être exact ; seule la partie
  conservée devient un lot cuisiné. Le réducteur reste un réducteur d'événements
  déclaratifs ; la validation recette/menu se fait dans l'API de confirmation.
- `consume-prepared` : `{id,kind:"consume-prepared",lotId,portions}`. Déduit seulement
  les portions cuisinées, sans modifier les ingrédients. Annulation et rejeu suivent
  les règles d'idempotence existantes. Un lot épuisé disparaît de la projection.

Annuler une cuisson restaure les ingrédients et la réservation, et supprime son
lot cuisiné. Si ce lot a été consommé depuis, l'annulation est refusée tant que la
consommation dépendante n'est pas annulée. Les IDs ne sont jamais recyclés.
Pas de dates de péremption, congélation, nutrition ou garantie de conservation.

## Erreurs stables et validation future

Les fonctions lèvent `EngineError {code,message}` ; les recherches recueillent
les erreurs par candidat dans `rejected`/`failures` et retournent leurs statuts.

| Famille | Codes principaux |
|---|---|
| Production | `PRODUCTION_REVIEW_REQUIRED`, `INVALID_PRODUCTION`, `YIELD_MISMATCH`, `PRODUCTION_STEP_INVALID`, `PRODUCTION_LIMIT`, `INSUFFICIENT_PORTIONS`, `INDIVISIBLE_ROUNDING_REQUIRED` |
| Menu/choix | `INVALID_MENU`, `UNKNOWN_MEAL`, `INVALID_CHANGES`, `LOCKED_RECIPE`, `LOCKED_PRODUCTION`, `LOCKED_DINERS`, `LOCKED_LEFTOVERS`, `MEAL_ALREADY_COOKED`, `COOKING_CONFIRMATION_REQUIRED` |
| Contraintes | `DIET_EXCLUSION`, `ALLERGY_EXCLUSION`, `UNKNOWN_ALLERGENS`, `UNVERIFIED_DIET`, `REPEAT_CONSTRAINT`, `FAMILY_CONSTRAINT`, `VARIETY_CONSTRAINT` |
| Prix/achats | `NO_PRODUCT`, `UNVERIFIED_PRODUCT`, `STORE_MISMATCH`, `MISSING_CONVERSION`, `BUDGET_UNVERIFIABLE`, `BUDGET_EXCEEDED`, `UNSUPPORTED_FORMAT_MIX` |
| Acceptation/journal | `PROPOSAL_STALE`, `INVALID_PROPOSAL`, `EVENT_ID_CONFLICT`, `REVISION_CONFLICT`, `RESERVATION_STALE`, `RESERVATION_ID_REUSED`, `MENU_CANCELLATION_CONFLICT`, `CANCELLATION_CONFLICT`, `INSUFFICIENT_STOCK` |
| Restes/limites | `INVALID_PREPARED_YIELD`, `PREPARED_ID_REUSED`, `UNKNOWN_PREPARED_LOT`, `INSUFFICIENT_PREPARED_PORTIONS`, `RESOURCE_LIMIT`, `INVALID_QUANTITY` |

Les helpers exportés `validateContext`, `validateMenu`, `checkRecipeConstraints`
vérifient leurs objets et lèvent une erreur ; `projectedStock(context,menu)` retourne
une copie sans les réservations propres ; `assertLocks(before,after,recipes)`
vérifie les verrous. `mealForReplacement` construit le seul repas candidat.
`jointBasket(context,requirements,state?)` retourne le panier conjoint ;
`packageFrontier(need,validatedProducts,ingredientMap,options)` retourne
`{rows,complete}` ; `pareto(rows)` trie/prune un tableau de travail interne
`{cost,waste,...}` par dominance. Ces derniers helpers sont destinés au calcul,
pas à des actions directes de la future interface.

Pour la future PWA, conserver le modèle visuel demandé : liste de courses et
estimation globale, avec qualification d'incertitude. Les prix de ligne et calculs
techniques restent internes. L'intégration devra persister menu et stock ensemble,
générer l'ID avant le callback transactionnel, conserver le payload pour les retries,
et appliquer les règles d'autorisation côté serveur. Aucun adaptateur Firebase,
déploiement ou écran n'est développé dans ce lot.
