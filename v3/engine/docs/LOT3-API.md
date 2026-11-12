# Lot 3 — orchestration libre et calculs partiels

Version 0.3.0, exports dans `src/index.mjs`. Les API des lots 1 et 2 restent strictes
et disponibles. La nouvelle couche conserve des choix non calculables sans les
transmettre artificiellement aux opérations de quantités, stocks ou prix.
Toutes les API métier retournent des copies ; aucune persistance ou connexion.

## Trois dimensions distinctes

Un choix peut être conservé même si sa quantité ou son prix ne peut pas être
calculé. Un calcul exact sur une partie du menu n'est pas une preuve de couverture
de l'ensemble. Une préférence d'optimisation n'est pas une règle interdisant une
sélection manuelle.

Le contexte conserve les champs des lots précédents : `recipes`, `ingredients`,
`products`, `session`, `state`, `policy`, `constraints`, `budget`. La nouvelle liste
de courses est un objet séparé, jamais une recette ni une quantité physique.
Les schémas partagés réellement incohérents (identités dupliquées, stock négatif,
réservations supérieures au physique, session invalide) restent des `EngineError`.
Leur réparation n'est pas simulée par cette couche.

## Menus mixtes et fiabilité des ingrédients

Les menus gardent le contrat du lot 2 : `{version:2,id,revision,meals,reservationIds}`.
Un repas peut porter `selection:"manual"` ou `selection:"user"`. Une recette peut
porter `manual:true`. Un ID de recette encore sans fiche peut rester dans le menu.
Les repas manuels et ceux qui ne sont pas calculables restent fixes dans les conseils.

Une quantité inconnue se représente par `quantity.amount:null` (ou une donnée
absente), pas par zéro. Pour exploiter un ingrédient dans une recette partielle,
il faut un mode/rendement exploitable et `quantityVerified:true` sur cet ingrédient.

```json
{
  "id":"partial-example",
  "yieldPortions":4,
  "production":{
    "version":1,"mode":"adjustable","unitLabel":"portion",
    "referenceUnits":"4","portionsPerUnit":"1","minUnits":"1","stepUnits":"1"
  },
  "ingredients":[
    {"ingredientId":"rice","quantity":{"amount":"400","unit":"g","basis":"net"},"quantityVerified":true},
    {"ingredientId":"chicken","quantity":{"amount":null,"unit":"g","basis":"net"},"quantityVerified":false}
  ]
}
```

Pour deux convives, les 200 g de riz sont calculables ; le poulet reste non chiffré.
Sans rendement justifié, même un nombre renseigné n'est pas arbitrairement remis
à l'échelle. Sans conversion valide, aucune soustraction de stock pour cette ligne.
Une quantité négative est `invalid`, jamais un besoin nul. Les autres ingrédients
indépendants et explicitement vérifiés peuvent continuer d'être calculés.

Les recettes complètement renseignées du contrat précédent gardent leur sémantique
de données fournies. Ce maintien de compatibilité ne transforme pas leurs données
de démonstration en recettes familiales réellement validées.

### Évaluation

`evaluateMixedMenu(context, menu, shopping?, {stockMenu=menu, acknowledgeChecked=false}?)`
retourne :

```text
{version:1,status,meals,requirements,basket,shopping,allocation,coverage,
 budget,risks,warnings,score,scoreScope,advice,metrics}
```

- Statut global : `complete`, `partial`, `needs_review` ou `invalid`. Ce statut
  décrit le calcul ; il n'efface aucun choix.
- Par repas : `status` peut aussi être `manual` ou `optimized` (quantités entièrement
  exploitables), et `calculationStatus` distingue `complete`, `partial`, `needs_review`,
  `invalid`. `optimizable` est faux pour une fiche opaque, manuelle ou présentant
  un risque alimentaire déclaré. `optimized` ne signifie pas qu'un menu a été remplacé.
- `requirements.needs` contient seulement les besoins justifiés, agrégés exactement.
  `knownNeeds` par repas, `individual` et `preparations` conservent la traçabilité.
- `coverage.unknownNeeds` explique les lignes non chiffrées avec `amount:null`.
  `purchaseIssues` identifie les ingrédients sans conditionnement exploitable.
  `catalogIssues` expose les références invalides isolées, jamais utilisées pour
  acheter. Un besoin exact sans format commercial a `toBuy` connu mais `bought:null`.
- Le stock libre est déduit une fois. `allocation` réserve uniquement les quantités
  fiables réellement présentes, par ordre du menu ; aucun stock futur n'est inventé.
- `coverage.quantitiesComplete` concerne les besoins et conditionnements du menu,
  pas une certification du contenu des produits libres. `coverage.complete` exclut
  aussi les conflits de coches. `basket.shopping.untracked` signale les articles
  libres dont le contenu physique n'est pas quantifié.
- `basket.amount` est le montant à utiliser pour le résumé global :
  `knownSubtotalCents`, `totalCents`, `listedItemsTotalCents`, `certainty`, `scope`.
  Si des besoins ou prix sont inconnus, `totalCents:null`, `certainty:"partial"` et
  `scope:"known_items_only"`. Le sous-total ne devient pas un total complet.
- Les anciennes structures `basket.menu`, `quantities` et sources tarifaires restent
  des diagnostics techniques. Une quantité n'est pas additionnée à une autre unité.
- `advice:{requested:false,applied:false}` : un recalcul n'appelle jamais les conseils.
  Le score sur un menu partiel porte sur les seuls composants connus, sans preuve
  d'optimalité ni comparaison monétaire certaine de la partie inconnue.

Les prix au poids gardent les incréments réels du lot 2. Si la frontière conjointe
d'achat dépasse une limite, les couvertures indépendantes exactes déjà obtenues
peuvent être conservées, avec `RESOURCE_LIMIT` et sans preuve conjointe.

### Budget et risques

Pour une action manuelle, même un contexte contenant `budget.strict:true` reste
non bloquant : ce booléen concerne la recherche automatique. Le diagnostic indique
`mode`, `targetCents`, `status`, `knownExcessCents`, `verified`, `blocking:false`.
Les statuts distinguent `within_estimate`, `over_target`, `partial_over_target` et
`unverifiable`. Un choix cher reste présent, sans annoncer le budget respecté.

Les risques connus (`ALLERGY_EXCLUSION`, `DIET_EXCLUSION`, `UNKNOWN_ALLERGENS`,
`UNVERIFIED_DIET`) restent visibles dans `risks`. Les nouvelles recommandations
ne peuvent pas introduire une recette incompatible. Un risque déjà choisi
manuellement n'est ni supprimé ni masqué par un conseil sur un autre repas.

## Liste de courses persistante

`createShopping(id)` crée `{version:1,id,revision,nextIntent,manual,calculated,
archived,receipts,cancellations}`. Les IDs d'intentions ne sont jamais recyclés.

Article libre :

```json
{
  "id":"manual-biscuits",
  "label":"Biscuits",
  "quantity":{"amount":"2","unit":"paquets libres"},
  "presentation":"présentation libre facultative",
  "estimate":{"kind":"estimated","currency":"EUR","totalCents":300},
  "checked":false
}
```

La quantité libre est un souhait affichable ; elle n'invente pas un contenu
canonique pour le stock. `estimate.totalCents` chiffre **la ligne entière**,
pas une unité implicite. L'estimation et la quantité sont facultatives.
Pour une référence commerciale connue, ajouter `productId` et `count` entier
(paquets ou incréments de vente au poids). La référence vérifiée permet alors
de calculer le contenu et le prix ; le libellé seul ne permet aucun rapprochement.

| API | Contrat |
|---|---|
| `addShoppingItem(shopping,item)` | Ajoute une intention manuelle non confirmée. Conserve toutes les autres lignes et coches. |
| `editShoppingItem(shopping,id,patch,{acknowledgeChecked?})` | Modifie une ligne manuelle non confirmée. Champs autorisés : label, quantité, présentation, référence/count, estimation. Une ligne cochée requiert l'acquittement explicite. |
| `removeShoppingItem(shopping,id,{acknowledgeChecked?})` | Archive la ligne manuelle ; une coche ou confirmation requiert acquittement. Ne retire pas physiquement un achat déjà effectué. |
| `checkShoppingItem(shopping,id,boolean)` | Change la sélection d'une intention non confirmée. Une confirmation ne se décoche pas sans annulation explicite. |
| `setShoppingPurchaseCount(shopping,id,count,{acknowledgeChecked?})` | Renseigne `checkoutCount`, quantité réellement achetée, distincte de la quantité souhaitée. Fonctionne aussi pour une ligne calculée ; après confirmation, elle est immuable. |
| `reconcileShopping(shopping,purchaseLines,{acknowledgeChecked?})` | Retourne `{shopping,conflicts,reconciliationRequired}`. Actualise les besoins calculés non protégés ; les manuels et les achats confirmés sont conservés. |
| `estimateShopping(context,shopping)` | Retourne lignes fusionnées d'affichage et montants `pending`, `confirmed`, `total`, avec sous-totaux et inconnues. |

Une ligne calculée cochée, mais non confirmée, reste intacte si un recalcul voudrait
changer son compte ou la supprimer. `CHECKED_LINE_CHANGED` rend le conflit visible,
et le montant global du menu reste partiel jusqu'à résolution. L'option explicite
`acknowledgeChecked:true` autorise la réconciliation ; elle n'est pas activée par
un simple ajout ou changement de convives.

Les articles d'une même **référence** sont regroupés en une ligne d'affichage avec
`origins`, comptes et états par intention. Les quantités souhaitées manuelle et
calculée sont additionnées, pas écrasées. Les achats confirmés utilisent leur compte
réel. `checkedState` vaut `unchecked`, `partial` ou `checked`. Deux noms proches,
ou deux lignes libres de même nom, restent séparés.

### Confirmation et annulation

`prepareShoppingConfirmation(context,shopping,{eventId,intentIds?})` fige un
commandement d'achat : lignes cochées non confirmées, comptes réels, prix qualifiés,
contenus commerciaux et snapshot des intentions. Par défaut, toute sélection
cochée non confirmée est incluse. Sans `checkoutCount`, cocher confirme le compte
affiché ; pour un achat partiel, renseigner le compte réellement acheté.

`confirmShopping(context,shopping,command)` retourne `{shopping,stock,replayed,
untracked}`. Stock et courses doivent être sauvegardés ensemble. Le moteur ajoute
seulement les contenus des références vérifiées réellement cochées. Un article
libre peut être confirmé dans la liste et le journal, mais reste `untracked` dans
le stock physique si son contenu est inconnu. Aucun paquet de biscuits ou produit
ménager n'est transformé arbitrairement en grammes d'un ingrédient.

Rejouer le même commandement ne réajoute rien, même si d'autres articles ont été
ajoutés depuis. Il faut un nouvel ID pour la sélection suivante. Modifier un
commandement ou son catalogue avant la première confirmation produit un conflit.
Les prix capturés restent qualifiés et ne sont pas réécrits par un futur tarif.

Acheter un seul paquet alors que deux sont nécessaires ajoute exactement un
paquet au physique. Le recalcul peut créer une **nouvelle** intention pour le
paquet restant ; l'ancienne confirmation reste cochée et identifiée. Un prix libre
annoncé pour une autre quantité n'est pas proratisé sans justification.

`cancelShoppingConfirmation(context,shopping,{eventId,targetId})` inverse le stock
et les marqueurs de confirmation ensemble. La réception annulée reste archivée
pour l'audit, mais ne contribue plus au montant des achats confirmés. Les besoins
encore demandés peuvent redevenir en attente. Si ce stock a depuis été réservé
ou consommé, le journal refuse l'inversion jusqu'au traitement des dépendances.
Rejouer l'annulation est neutre ; rejouer ensuite l'ancienne confirmation ne la
réactive pas. Une nouvelle intention nécessite un nouvel ID d'opération.

Une réception confirmée ne s'édite pas silencieusement : pour corriger une erreur,
annuler explicitement ; pour de nouveaux achats, créer une nouvelle intention.
Archiver une ligne ne rembourse pas un achat et ne réécrit pas le physique.

## Changements explicites et conseils séparés

`changeMixedMenu(context,menu,shopping,commands)` accepte les commandes :

```text
{type:"updateMeal",mealId,patch:{diners?,productionUnits?,leftovers?}}
{type:"addMeal",meal:{...}}
{type:"replaceMeal",mealId,recipeId,selection?}
{type:"removeMeal",mealId}
```

Il conserve les autres repas. Un lot entier s'ajuste au minimum nécessaire selon
son modèle vérifié ; aucune portion facultative ni recette différente n'est ajoutée.
Si une production reste inconnue, le nombre de convives peut être conservé sans
inventer le facteur. Une grille invalide reste invalide, sans ingrédients calculés
pour cette préparation. Les repas cuisinés et paramètres verrouillés restent protégés.

`proposeMixedMenu(context,menu,shopping,meals,{purpose="manual",reason?,
acknowledgeChecked=false})` expose le même mécanisme pour une liste candidate.
Il retourne une `mixed-menu-proposal` en attente, avec menu/courses candidats,
évaluation, différences, changements exacts et bases de snapshot. Aucun conseil
n'est recherché par ces commandes. Une intention manuelle explicite n'est pas
refusée pour son seul budget, ses répétitions ou un calcul incomplet.

`acceptMixedProposal(context,menu,shopping,proposal,{eventId})` retourne les trois
états `{menu,shopping,stock,evaluation,replayed}` à sauvegarder atomiquement. Le
journal existant remplace seulement les réservations du menu par celles des besoins
connus. Menu, courses, contexte et stock obsolètes sont refusés. Le rejeu identique
ne ramène pas le planning à une ancienne version.

`cancelMixedChange(context,menu,shopping,{eventId,targetId})` restaure menu,
réservations et courses, sous réserve d'absence de dépendances. Il ne peut pas
écraser des coches/achats survenus après la proposition. Employer cette API pour
les transitions mixtes ; le `cancelMenuChange` historique ne connaît pas les courses.

### Action métier « Suggestions »

`createAdviceSession(id)` crée une session de demandes/refus.

`requestSuggestions(context,menu,shopping,{session?,limit=3,maxEvaluations=60,
maxExtraCostCents=0,minSavingCents=1,minIngredientGain={},kinds?})` retourne
`{status:"suggestions",requested:true,applied:false,suggestions,search,failures}`.

Les types recherchés sont `portions` et `replacement`. Un conseil porte sur un
seul changement explicite et évalue le menu entier connu, avec les contributions
fiables des repas partiels. Les repas manuels, incomplets, cuisinés ou incompatibles
restent fixes. Un remplacement candidat doit être entièrement exploitable et
respecter allergies/exclusions, verrous et limites de répétition/famille applicables.
Le moteur n'aggrave pas les inconnues de quantité/prix pour fabriquer une économie.

Chaque proposition contient `adviceKind`, `reason`, `changes`, `comparison`,
`benefits`, `limits`, `signature` et `requiresAcceptance:true`. Les différences
de surplus/stock sont ventilées par ingrédient ; les paquets excluent les simples
incréments de pesée. Un coût inconnu ne devient pas nul.

`knownSubtotalDeltaCents` peut montrer un gain sur les seuls éléments chiffrés ;
`costDeltaCents` reste `null` si le total complet est inconnu. Le libellé distingue
baisse de coût estimé, baisse de sous-total connu et meilleure utilisation des
achats. Une portion supplémentaire à coût inchangé n'est pas annoncée comme une
économie monétaire. Un gain doit améliorer le score configuré et dépasser les
seuils explicites ; aucun conseil utile => liste vide.

Les risques des choix manuels conservés et les inconnues sont inclus dans `limits`.
Un budget strict de recherche exige la couverture et les observations suffisantes
sur tout le panier ; une proposition automatique ne prétend pas le respecter si
ce n'est pas vérifiable. Les mêmes choix restent possibles comme actions manuelles.

`declineSuggestion(session,proposal)` retourne seulement une nouvelle session avec
la signature rejetée. Menu, courses et stock restent intacts. La signature ne sera
pas immédiatement reproposée dans cette session. Ignorer une proposition ne fait rien.

`acceptSuggestion(context,menu,shopping,session,proposal,{eventId})` vérifie le refus,
la signature et les snapshots puis applique uniquement les changements acceptés ;
il retourne aussi `adviceSession`. Une acceptation répétée ne double rien.

`requestMixedReoptimization(context,menu,shopping,options)` est un raccourci pour
la meilleure amélioration locale proposée. Sa portée est volontairement limitée
à un changement à la fois ; il ne prétend pas résoudre globalement un menu opaque.
Les produits manuels restent présents. Pour une recherche générale complètement
quantifiée, les API strictes des lots précédents et la combinaison ci-dessous
restent disponibles ; elles n'acceptent pas des lignes libres comme de faux SKU.

## Recherche combinée facultative

`optimizeMenuCombined(context, {slots,baseMenu?,maxEvaluations=500,maxNodes=500000,
...optionsDuLot2})` exécute `local`, puis `diverse`, sur le même contexte strict
et avec le même objectif. Les budgets sont partagés, moitié arrondie supérieure
pour local, moitié inférieure pour diverse. Un budget de 1 ne lance qu'une phase.
Les allocations et consommations réelles sont retournées dans `search.phases`.

Le résultat est le meilleur **des phases effectivement évaluées**. Il n'est pas
garanti meilleur qu'une stratégie seule disposant de tout le budget. Exécuter les
deux phases avec le budget complet de chacune nécessite de doubler explicitement
le budget global. La preuve globale reste fausse. Cette stratégie demeure une
option expérimentale, pas un nouveau défaut : les mesures ne démontrent pas un
avantage systématique. Les appels de progression sont qualifiés par phase.

## Revue terrain et contrats de validation

`validateFieldPacket(packet)` vérifie le format versionné du
[modèle de revue](../fixtures/household-review.template.json). Il demande cinq
revues de recettes familiales, preuves examinées, production/quantités revues,
identités/unités explicites et références commerciales quantifiées. Un prix
historique/observé demande une référence de ticket, pas seulement une étiquette.
Les prix estimés ou inconnus gardent leur qualification.

Retour : `needs_review`, `invalid` ou `technically_ready`, compteurs, modes,
types de prix et diagnostics. **`fieldValidated:false` reste systématique** : ce
contrôle hors ligne ne vérifie ni l'authenticité des sources ni un usage réel du
foyer. Une attestation technique ne constitue pas une validation terrain.

## Erreurs et intégration future

En plus des codes précédents : `QUANTITY_REQUIRED`, `QUANTITY_REVIEW_REQUIRED`,
`RECIPE_DATA_REQUIRED`, `INGREDIENT_DATA_REQUIRED`, `CHECKED_LINE_CHANGED`,
`CHECKED_CHANGE_REQUIRES_ACK`, `PURCHASED_ITEM_IMMUTABLE`, `PURCHASE_INTENT_STALE`,
`INVALID_PURCHASE_COMMAND`, `PURCHASE_RECEIPT_MISSING`, `SHOPPING_CANCELLATION_CONFLICT`,
`SUGGESTION_REJECTED`, `INVALID_SUGGESTION`, `MANUAL_MEAL_FIXED`,
`INCOMPLETE_AUTOMATIC_CHOICE`, `HOUSEHOLD_REVIEW_REQUIRED`, `EVIDENCE_REVIEW_REQUIRED`.
Les problèmes par ligne restent des diagnostics isolés ; les opérations réellement
incohérentes ou sur snapshot obsolète lèvent un `EngineError` sans écriture.

Helpers techniques : `safeMixedContext` est interne à son module et
isole les références invalides ; `analyzeMixedMeal` produit le diagnostic par repas ;
`validateShopping` vérifie l'état, `sumAmounts` agrège uniquement des centimes
explicites, `mixedBasis` crée les snapshots, `compareMixedEvaluations` compare deux
évaluations. Aucun helper n'effectue une recommandation ou une écriture réseau.

La future interface n'a besoin que d'une liste simple et de `basket.amount` en
haut. Les détails tarifaires et les calculs restent techniques. Elle devra
sauvegarder les états retournés ensemble et conserver le commandement de confirmation
pour les retries. Les règles serveur, la synchronisation, le bouton graphique,
les écrans et le déploiement restent hors périmètre.
