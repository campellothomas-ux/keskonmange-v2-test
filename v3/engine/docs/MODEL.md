# Contrat de données du premier lot

## Quantités et identité

`ingredient` possède `id`, `unit` (`g`, `ml`, `unit`), `basis` (`gross`, `net`,
`drained`, `edible`). Pour `unit`, `countKind` distingue par exemple œuf, gousse
et tête. `indivisible:true` interdit les fractions de stock et nécessite une
politique d'arrondi à la préparation. Aucun rapprochement par nom ou alias.

Une quantité d'entrée : `{amount:"1/3", unit:"kg", basis:"net"}`. `amount`
accepte les entiers sûrs JSON et les chaînes décimales/rationnelles. Les nombres
flottants non entiers, notations exponentielles, NaN, valeurs négatives et
dénominateurs nuls sont refusés. Les sorties quantitatives sont des chaînes
réduites (`"1000/3"`). Les quantités culinaires ne sont jamais arrondies par
addition ; `BigInt` reste interne et n'apparaît pas dans le JSON.

kg/g, l/cl/ml et pièce/unit sont normalisés dans une même dimension et une même
base. Chaque autre conversion doit figurer sur **cet ingrédient**, avec unité,
base et nature comptable source, facteur rationnel et `evidence`. Exemple fictif :

```json
{
  "id":"beans", "unit":"g", "basis":"drained",
  "conversions":[{
    "fromUnit":"g", "fromBasis":"net", "factor":"3/5",
    "evidence":"Rendement du produit de test explicitement mesuré"
  }]
}
```

Ce facteur n'est jamais généralisé aux autres produits. Si deux références ont des
rendements différents, fournir directement leur contenu égoutté mesuré, ou créer
des identités distinctes ; ne pas déclarer une conversion globale mensongère.
Les chemins de conversion multiples/chaînés ne sont pas inférés. La traçabilité
de l'evidence repose sur les données fournies ; le moteur ne certifie pas leur
vérité physique. Le modèle conserve la quantité originale du conditionnement.
Le stock courant est projeté dans la base canonique choisie ; il ne suit pas
séparément les emballages, eaux de conserve ou pertes d'épluchage.

## Recettes et préparations

Une recette : `{id, yieldPortions, scalable, family?, ingredients:[{ingredientId,
quantity}], verifiedDietTags?}`. Un repas : `{id, recipeId, diners, producePortions?,
leftovers:"keep"|"discard", indivisiblePolicy?:"ceil"}`.

Sans `producePortions`, le rendement de la recette reste entier, indépendamment
du nombre de convives. Modifier le rendement nécessite `scalable:true`.
Produire moins que les portions nécessaires est refusé. `leftovers` indique la
destination du surplus de portions ; les deux choix consomment les ingrédients
de toute la préparation. Les portions conservées ne sont pas automatiquement
replanifiées dans un autre repas dans ce lot.

Pour un ingrédient indivisible, une fraction déclenche une erreur sauf si `ceil`
est explicitement demandé. L'écart exact/préparé est alors exposé. Cette politique
ne garantit pas les propriétés culinaires d'une recette redimensionnée.

## Commerce, prix et panier

Référence fixe : `{id, ingredientId, storeId, saleUnit, mode:"fixed", content,
contentVerified:true, contentEvidence, price, available?, validFrom?, validUntil?}`.
Un lot de six a comme contenu le total vérifié du lot vendu. L'achat est un
nombre entier de références. Une boîte dont seul le poids net est connu ne peut
pas satisfaire un besoin égoutté sans conversion documentée.

Référence au poids : `mode:"weight"`, `increment` quantifié, `priceQuantity`
quantifiée (ex. 1 kg). Le prix correspond à `priceQuantity` ; le nombre acheté est
un entier d'incréments. C'est un modèle distinct, pas un paquet arbitraire de 1 kg.
Un seul choix au poids par ingrédient dans ce premier lot. Les limites de stock
commercial ne sont pas modélisées : `available` est uniquement un booléen.

`session` contient un seul `storeId` et une date ISO `asOf` fournie par l'appelant.
Aucun accès implicite à l'horloge. Un catalogue d'un autre magasin provoque une
erreur ; il doit être filtré explicitement avant l'appel.

`price` : `{kind, cents, currency:"EUR", storeId, observedOn?, rangeCents?}`.
`kind` vaut `observed`, `historical`, `elsewhere`, `estimated`, `unknown`.
Un prix inconnu utilise `cents:null`. Une observation doit être datée et porter
sur le magasin de session. Un prix observé ailleurs garde son magasin source,
mais la référence achetée appartient toujours au magasin de session. La date
d'observation ne peut pas être postérieure à la session.

Les centimes sont des entiers. Les lignes au poids sont arrondies au centime
supérieur **après regroupement par référence**, y compris les ajouts manuels.
C'est une convention de chiffrage conservatrice explicite ; le ticket réel reste
la référence lors de l'achat. Les quantités physiques ne sont pas arrondies.

`menu` chiffre les seuls achats nécessaires. `cart` ajoute `manual:[{productId,
count}]`. Les sorties donnent `knownSubtotalCents`, `totalCents`, `rangeCents`
et `certainty`. Sans prix complet, total `null`. Sans borne fournie pour un prix
incertain, borne supérieure `null` et contribution minimale 0 : aucune marge
arbitraire de 8/18/30 %. Une contrainte budgétaire stricte exige des observations
du jour de session sans plage d'incertitude ; cette garantie ne porte que sur le
modèle et les données de cette session, pas sur un futur passage en caisse.

## Stock et opérations

État : `{revision, physical:{ingredientId:amount}, reservations:{reservationId:
{ingredientId:amount}}, operations:{eventId:record}}`. Utiliser `emptyStock()`.
Les quantités de stock sont déjà dans l'unité/base canonique ; elles ne sont pas
des paquets ou des quantités affichées dans une liste de courses.

- `reserve` : `{id,kind:"reserve",reservationId,needs}`. Ne touche pas au physique.
  Ne peut réserver que ce qui est libre. Les manquants futurs restent des achats
  prévus ; ils ne sont pas transformés en stock disponible. Fractionner les
  réservations réelles par repas pour pouvoir libérer chaque préparation.
- `release` : `{id,kind:"release",reservationId}` libère une réservation.
- `purchase` : `{id,kind:"purchase",lines:[{productId,count,checked}]}`. Le compte
  entier indique la quantité **réellement achetée** en paquets ou incréments pesés.
  Seules les lignes `checked:true` sont ajoutées. Un zéro est un achat nul.
- `cook` : `{id,kind:"cook",reservationId?,needs}` déduit la consommation réelle
  fournie explicitement. Avec réservation, la libère et protège les autres menus.
- `cancel` : `{id,kind:"cancel",targetId}` applique le delta inverse et restaure
  l'ancienne réservation si elle n'a pas changé. Les dépendances incompatibles
  doivent être annulées d'abord. Une annulation ne peut pas être elle-même annulée
  dans ce lot ; une nouvelle intention nécessite un nouvel ID.

Un même ID et un même payload JSON sont idempotents ; même ID/autre payload est
un conflit. Une réservation supprimée ne réutilise jamais son ID pour une nouvelle
intention, afin d'empêcher une ancienne annulation de supprimer une nouvelle
réservation identique. `expectedRevision?` peut imposer un contrôle optimiste ;
le rejeu identique est reconnu même après changement de révision.

`calculateBasket` lit le stock libre sans le modifier. Pour recalculer un menu
déjà réservé, utiliser une projection qui libère **ses propres** réservations,
dans une future transaction ; ne pas compter deux fois les réservations du menu
comme du stock libre. La révision, les opérations et les quantités physiques
doivent être sauvegardées atomiquement.
