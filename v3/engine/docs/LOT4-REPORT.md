# LOT 4 — Bilan et corrections livrées

Base : branche `KeskonMange-V3`, commit `f8f3262b34487cbb446e61372dfa83b884961be4`.
Travail limité à `v3/engine/`. Aucune modification de V1/V2, aucun accès Firebase,
aucun déploiement, aucune importation des 98 recettes, aucune dépendance ajoutée.

## Sources et traçabilité

Archive fournie : `KeskonMange_V3_REVISE_98_DOSSIER.zip`, SHA-256
`3dda40f91991647262dd4e75f0ad5b96547ac6fe96a49a63867e1d0ebdfa8dca`.
Le fichier V1 des 98 recettes y porte l'empreinte
`606b728465394408ed1f1ce88d1f23529066e28a393fadf54959693fa5948940`.
L'analyse précédente avait contrôlé les copies originales des 98 recettes, les
1 151 lignes d'ingrédients et la cohérence du tableur ; elle n'avait validé aucune
correction culinaire. Ce lot conserve seulement l'extrait de revue des cinq
pilotes dans [pilot-source-review.json](../fixtures/pilot-source-review.json).

Le fichier natif [pilot-v3.json](../fixtures/pilot-v3.json) contient les cinq
recettes, 60 lignes d'ingrédients source, 42 identités d'ingrédients et l'eau de
cuisson auxiliaire. Les originaux et propositions de revue sont intacts.
Chaque ligne distingue `trace.original`, `trace.proposed`, `trace.validated`
et `trace.effective`. `validated` reste `null` pour les quantités : une valeur V1
calculable n'est pas présentée comme une quantité validée en cuisine.

La seule proposition quantitative sur ces cinq recettes concerne les pâtes de
la bolognaise : **350 g V1, 270 g proposés, aucune correction validée, 350 g
effectivement utilisés pour trois portions**. Le rendement de quatre parts par
quiche, lui, est validé par la demande du lot 4 et tracé dans `productionTrace`.

Les variantes orthographiques de « bœuf haché 5 % » et « concentré de tomate(s) »
partagent un identifiant documenté. Les noms V1 restent traçables. Les steaks
achetés en pièces restent distincts du bœuf haché vendu au poids.

## Résultat des cinq conversions

| Recette | Production | Contrôle concret |
|---|---|---|
| Quiche jambon-fromage | Lot entier, 4 parts par quiche | 2/4/5/8/9 convives → 4/4/8/8/12 parts ; jamais une demi-pâte |
| Chili con carne | Ajustable, référence 3 portions | Riz indépendant, légumes en pièces/gousses, conserves en masse égouttée |
| Bolognaise économique | Ajustable, référence 3 portions | 350 g de pâtes préservés ; 700/3 g pour deux, référence exacte inchangée |
| Cheeseburgers | Une unité par burger, référence 4 | Pains/steaks/cheddar entiers ; 2 burgers → 450 g de frites et 1 c. à soupe d'huile |
| Gratin de gnocchis | Ajustable, référence 4 portions | Pour deux : 375 g gnocchis, 300 g potimarron, 75 g mozzarella ; plat adapté à essayer |

Le mode « lot entier » du gratin était un candidat de revue, pas une validation.
Le redimensionnement livré est arithmétique et explicite ; l'architecture n'impose
pas un mode de production à partir du seul mot « gratin ». Les durées sont les
repères V1, avec vérification de cuisson dans le plat choisi.

## Corrections des problèmes du rapport précédent

- Les accompagnements peuvent suivre les convives plutôt que les lots : la
  salade ne double plus simplement parce qu'une deuxième quiche est préparée.
- Les ingrédients sans SKU restent présents dans la liste calculée, avec nom et
  quantité ; le prix total est inconnu et les conditionnements ne sont pas inventés.
- Les achats en pièces sont arrondis **après** regroupement et déduction du stock :
  trois demi-oignons donnent 1,5 consommé et 2 à prévoir, ou 1 à prévoir s'il reste
  un demi-oignon. Le surplus d'achat reste séparé des ingrédients consommés.
- Les unités naturelles V1 restent des pièces et gousses. Les grammes et millilitres
  sont conservés pour les autres ingrédients, sauf configuration documentée.
- Les étapes utilisent des liaisons explicites aux ingrédients recalculés ; l'huile
  des deux burgers passe bien à une cuillère, sans modifier « 210 °C » ou les durées.
- Les suggestions excluent les surplus cuisinés des pilotes ; aucun supplément
  de production n'est exploré automatiquement. Le choix manuel reste calculable.
- Une étape non synchronisable est signalée au lieu de fournir une quantité fausse.
- La réconciliation protège les lignes cochées et conserve les ajouts manuels.

## Tests exécutés

**117 tests réussis, 0 échec : 95 tests existants et 22 nouveaux tests LOT 4.**
Résultats détaillés : [lot4-tests.tap](../reports/lot4-tests.tap).

```sh
cd v3/engine
npm run convert:pilots
npm run scenario:lot4
node --test --test-reporter=tap test/*.test.mjs > reports/lot4-tests.tap
```

Les nouveaux tests couvrent les cinq conversions et les propositions non validées,
les rendements, les accompagnements, les unités entières, toutes les étapes de
cuisine, les erreurs de liaison, les conversions configurées et refusées,
l'agrégation kg/g et pièce/g explicitement justifiée, le stock réservé par un autre
planning, l'absence de catalogue, les ajouts manuels et la protection des cases
cochées. Ils vérifient les suggestions directes, les remplacements, les propositions
automatiques et la recherche conjointe pour empêcher un contournement des rendements.

Le test de non-régression d'arrondi affiche chaque besoin avec quatre précisions,
répète les opérations vingt fois et vérifie que les quantités exactes et les données
source restent identiques. Un autre test contrôle le partage de configuration
culinaire entre les étapes et la liste sans modifier la référence commerciale.

Le scénario utilise les cinq recettes, produit 4/3/3/2/2 parts, 42 besoins regroupés
et un ajout manuel coché. Aucun reste cuisiné, étapes entièrement synchronisées,
prix inconnu. [Planning et liste complète](LOT4-EXAMPLE.md),
[résultat JSON reproductible](../reports/lot4-scenario.json).

## Problèmes encore ouverts

1. **Essais culinaires** : quantités V1, garniture de quiche et gratin réduit n'ont
   pas été testés physiquement. Le calcul peut être validé techniquement sans
   promouvoir les corrections proposées en validation métier.
2. **Bases de poids** : sauf mention explicite « égoutté », la V1 n'indique pas la
   base brute/nette. Le calcul conserve la quantité recette sous une base `net`
   explicitement interprétée « telle qu'écrite », sans coefficient de perte. Vérifier
   notamment potimarron, mozzarella et épinards avant un achat commercial exact.
3. **Épinards frais/surgelés** : les deux procédures sont conservées. Le dossier
   ne justifie aucun rendement de conversion ni poids après égouttage ; la variante
   doit être choisie. Les 200 g source ne certifient pas une équivalence culinaire.
4. **Mesures** : `cas` est affiché en cuillères à soupe (explicite dans les étapes
   des burgers). `cc` et les pincées restent les mesures de la source ; clarifier
   leur convention et documenter volumes/densités avant conversion en ml/g.
5. **Grammes/pièces** : aucun poids fiable par calibre n'est fourni. Le mécanisme
   est configurable et testé avec des données artificielles, mais aucune de ces
   valeurs de test n'est activée sur les recettes réelles.
6. **Achats réels** : formats, poids bruts des conserves, têtes d'ail, prix et
   contenu acheté restent inconnus. Les besoins sont exploitables sans ces données,
   mais leur confirmation ne peut créer du stock physique sans contenu vérifié.
7. **Salade de quiche** : référence de 100 g pour 2,5 convives V1 conservée, soit
   160 g pour quatre ; confirmer cette quantité lors de l'essai, sans la remplacer
   automatiquement par la quantité d'une quiche entière.

Aucun de ces points n'a déclenché une refonte ou une correction quantitative cachée.

## Fichiers modifiés

- `fixtures/pilot-source-review.json`, `fixtures/pilot-v3.json` : cinq sources et conversion native traçable.
- `src/culinary.mjs`, `src/cooking.mjs` : affichage, achat minimal et étapes synchronisées.
- `src/production.mjs`, `src/mixed-core.mjs`, `src/mixed-menu.mjs` : accompagnements, admissibilité et besoins sans SKU.
- `src/advice.mjs`, `src/joint-optimizer.mjs`, `src/menu-interactions.mjs` : suggestions et recherche respectant les rendements.
- `src/shopping.mjs`, `src/index.mjs` : réconciliation sans catalogue et exports publics.
- `scripts/convert-pilots.mjs`, `scripts/scenario-lot4.mjs` : conversion limitée et démonstration reproductible.
- `test/pilots.test.mjs`, `test/culinary.test.mjs`, `test/lot4-shopping.test.mjs`, `test/lot4-helpers.mjs` : tests et données de test partagées.
- `docs/LOT4-REPORT.md`, `docs/LOT4-API.md`, `docs/LOT4-EXAMPLE.md`, `reports/lot4-scenario.json`, `reports/lot4-tests.tap` : bilan et preuves.
- `package.json`, `README.md` : commandes et documentation du lot.
