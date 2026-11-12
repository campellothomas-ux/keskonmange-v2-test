# Rapport d'exécution — 12 novembre 2026

Environnement : Linux x64, Node.js v24.22.1, aucune dépendance installée.
Source V2 : `0d9efe9abdd19f44c7ed25a0617932ffcc1e2a25`.
Les sorties ci-dessous ont réellement été produites par les commandes du module.

## Tests automatisés

Commande principale : `npm test`. Capture détaillée avec couverture :

```sh
node --test --experimental-test-coverage --test-reporter=tap test/*.test.mjs > reports/tests.tap
```

Résultat enregistré : **35 tests, 35 réussis, 0 échec, 0 ignoré**, environ 1,13 s
pour le passage avec couverture. [Journal TAP complet](../reports/tests.tap).
Couverture mesurée sur `src/` : 100 % des lignes, 92,21 % des branches,
97,53 % des fonctions. Ces chiffres ne prouvent pas la vérité des données ni
l'absence de toutes les erreurs ; les oracles et invariants ci-dessous donnent
une validation plus substantielle du périmètre.

| Exigence | Contrôle effectué | Résultat |
|---|---|---|
| A | 650 g, boîtes de 400 g | 2 boîtes, 800 g achetés, surplus 150 g |
| B | 650 g avec 250 g en stock | 1 boîte de 400 g |
| C | Formats 500 g/1 kg à 160/290 centimes | 400 g : 1 petit ; 650 g : 1 grand ; 1 400 g : 1 grand + 1 petit |
| D | Rendement 4, convives 2, adaptation explicite, conservation/abandon | Rendement préservé par défaut ; division par 2 uniquement autorisée explicitement |
| E | Deux besoins de 325 g, stock commun 250 g | Besoin global 650 g, stock utilisé une fois |
| F | Cinq références, deux cochées ; aucune cochée | Seules deux entrées physiques ; zéro entrée si aucune sélection |
| G | Répétition du même achat et réutilisation conflictuelle d'ID | Idempotence ; conflit si contenu différent |
| H | Réserver, cuisiner réellement 280 g, rejouer, annuler | Consommation une fois, stock/réservation restaurés à l'annulation |
| I | Pièce/masse, tête/gousse, densité et poids égoutté sans preuve | Erreurs `MISSING_CONVERSION` |
| J | Budget strict insuffisant, exclusion/allergie, prix estimé | Incompatibilité explicite ou données insuffisantes ; aucun faux menu valide |
| K | Préférence pour stock périssable configurée | Politique capable de faire changer le choix ; 100 unités utilisées sur 1 000, pas de consommation forcée du tout |
| L | Répétition bon marché vs diversité légèrement plus chère | Diversité choisie avec pénalité explicite ; priorité au budget strict |
| M | Référence d'autre magasin et prix observé ailleurs | Référence étrangère refusée ; provenance tarifaire conservée et incertaine |
| N | Petits volumes, tiers, ingrédients indivisibles, vente au poids, unités incompatibles | Calculs rationnels exacts et conventions d'arrondi testées |

Cas supplémentaires : annulation avec dépendances, concurrence de deux intentions
sur le dernier état, conflit de révision, protection des réservations d'autrui,
ID de réservation jamais recyclé, références indisponibles/périmées, prix négatif,
contenu non vérifié, limite de calcul, tags V2 non certifiés, adaptation en lecture
seule et traçabilité du jeu V2.

Trois campagnes déterministes supplémentaires sont incluses dans ces tests :

- **250** problèmes de conditionnements à trois formats (y compris prix nuls),
  comparés à un oracle indépendant énumérant tous les nombres de paquets.
  Même coût minimal et même quantité achetée au départage.
- **150** historiques générés achat/consommation/annulations, avec conservation
  du stock exact et rejouement idempotent.
- **60** petits problèmes de menus, comparés à l'énumération indépendante des
  triples ordonnés et des quantités de paquets. Même score minimal et résultat
  strictement reproductible.

## Scénario V2 et banc d'évaluation

```sh
npm run --silent scenario
npm run --silent evaluate
npm run --silent audit:v2
```

Sorties archivées : [scénario complet](../reports/scenario.json),
[évaluation](../reports/evaluation.json), [audit V2](../reports/v2-audit.json).
11 recettes sources, 3 annotées pour les essais, 8 bloquées en attente de revue.
Les contenus commerciaux, prix, coefficients de score, base nette et sémantique
du rendement du scénario sont des **hypothèses de test déclarées**. Aucun de ces
montants ne vaut un prix E.Leclerc/Lidl vérifié. Pas de conversion pièce/masse
ou cuillère/volume ajoutée pour faire fonctionner les recettes.

Pour les trois recettes utilisables, tous les couples distincts sont comparés :

| Menu | Panier estimé du jeu d'essai | Score exact |
|---|---:|---:|
| Poulet/poireaux + ratatouille | 12,30 € | 1222,9 |
| Poulet/poireaux + gratin | 12,40 € | 1231,7 |
| Ratatouille + gratin | **10,40 €** | **1031** |

L'oracle indépendant retrouve le même résultat. Le choix naïf des deux premières
recettes coûte 1,90 € de plus sur ces prix synthétiques. Le scénario confirme
aussi achats partiels, double validation neutre, réservations des deux repas,
cuisson puis restauration par annulation.

| Instance mesurée | Candidats | Temps observé | Panier estimé | Optimalité |
|---|---:|---:|---:|---|
| 3 recettes V2, 2 repas | 3 | 5,96 ms | 10,40 € | Démontrée dans le modèle à deux étapes et sur les prix fournis |
| 18 copies synthétiques, 6 repas, limite 500 | 500 | 108,89 ms | 28,90 € | Non démontrée, recherche tronquée |
| Même problème avec parcours inversé | 500 | 88,97 ms | 27,00 € | Non démontrée, recherche tronquée |

Les contrôles automatiques de couverture des besoins, équilibre des surplus,
stock non réutilisé, nombre de repas, variété, familles, paquets entiers, magasin
unique et budget déclaré passent pour ces trois sorties. Les quantités utilisées
et surplus restent ventilés par ingrédient et unité dans le JSON.
Les temps proviennent d'un passage serveur, pas d'une garantie de performance sur
iPhone. Les copies synthétiques n'ajoutent pas de vraie diversité culinaire.
La différence de 1,90 € entre parcours tronqués illustre la limite de recherche ;
il ne s'agit pas d'une preuve sur le meilleur menu de la grande instance.

## Limites et blocages restant avant intégration

- Pas de catalogue commercial magasin ni de relevé de prix vérifié dans le dépôt.
- Revue nécessaire des identités, bases de poids, rendements, possibilités de
  redimensionnement et allergènes des vraies recettes du foyer.
- Pas de garantie de péremption sans dates de repas et lots de stock.
- Un seul format au poids par ingrédient, pas de mélange poids/paquet ; pas de
  promotions, limitations commerciales ou substitutions automatiques.
- Optimalité à deux étapes seulement ; pas d'optimisation conjointe de tous les
  conditionnements avec les coefficients de gaspillage/préférences.
- Journal intégral en mémoire ; archivage/checkpoints à définir avant usage long.
- Firebase, règles serveur, deux iPhone et fonctionnement hors ligne réel non
  testés : aucun accès réseau Firebase n'a été effectué. Les tests de concurrence
  vérifient le réducteur sur le dernier snapshot, pas l'infrastructure.
- Compatibilité navigateur fondée sur ES standard/BigInt/structuredClone ; aucune
  campagne Safari/iPhone menée pour ce module sans interface.
- OR-Tools évalué architecturalement, non installé, non benchmarké. Aucun backend
  Python, service payant ou composant IA ajouté.

La prochaine étape utile consiste à valider les données nécessaires avec le
foyer et les références d'un seul magasin, puis à tester l'adaptateur transactionnel
dans un émulateur Firebase. Les fonctionnalités d'interface sont hors de ce lot.
