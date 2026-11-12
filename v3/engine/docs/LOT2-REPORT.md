# Bilan critique du lot 2 — 12 novembre 2026

Base : commit `f488bc8`, branche `KeskonMange-V3`, module `v3/engine/`.
Environnement : Linux x64, Node.js v24.22.1. Aucune dépendance installée.
Les tests et benchmarks ci-dessous ont été réellement exécutés. Les fichiers
applicatifs V2, la branche main et Firebase n'ont pas été modifiés ni utilisés.
Aucun déploiement, interface ou composant d'IA générative.

## Améliorations livrées

- Le choix des conditionnements est désormais conjoint avec les surplus et le
  budget pour chaque menu. Une couverture légèrement plus chère peut devenir
  préférable. Les choix sont confrontés à des oracles indépendants.
- Contrat versionné pour portions ajustables, lots entiers et unités individuelles.
  Les convives, production, conservation et abandon sont distincts. Le bouton de
  production suit une grille légale et ne diminue jamais les convives.
- Recalcul partiel du menu entier, suggestions mesurées, remplacement individuel
  diversifié et réoptimisation globale avec verrous. Toutes les propositions
  restent en attente d'acceptation et protègent leurs snapshots.
- Acceptation atomique de nouvelles réservations, conservation des réservations
  étrangères, révisions, rejouement idempotent et annulation des transitions.
- Projection distincte des portions cuisinées, créée uniquement à la confirmation
  de cuisson. La consommation d'une portion cuisinée ne recrée pas d'ingrédients.
- Construction initiale et amélioration locale simple/diversifiée, avec compteurs,
  progression et limites explicites. L'exhaustif garde une preuve sur petits jeux.

Les API historiques et leur comportement à deux étapes restent disponibles pour
la compatibilité. Les nouvelles API et leurs limites sont décrites dans
[LOT2-API.md](LOT2-API.md) et [LOT2-OPTIMIZATION.md](LOT2-OPTIMIZATION.md).

## Tests réellement exécutés

```sh
npm test
node --test --experimental-test-coverage --test-reporter=tap test/*.test.mjs
npm run --silent scenario:lot2
npm run --silent benchmark:lot2
```

**66 tests réussis, 0 échec, 0 ignoré**, dont les **35 tests précédents inchangés**.
Passage avec couverture : environ 1,96 s. Couverture mesurée : 100 % des lignes,
90,71 % des branches, 94,53 % des fonctions de `src/`. Ces chiffres ne constituent
pas une certification de fiabilité alimentaire ou d'exactitude des données.
Le [journal TAP](../reports/lot2-tests.tap) conserve les résultats complets ; seuls
les espaces de fin de ligne de sa table de couverture sont retirés pour Git.

| Tests du lot 2 | Vérifications constatées |
|---|---|
| A — Quiche | 2/4/5/8/9 convives → 1/1/2/2/3 quiches, soit 4/4/8/8/12 portions. Quantités ×1/×2/×3 ; restes 2/0/3/0/3. `+` passe de 4 à 8 ; 1,25 quiche refusée. |
| B — Ajustable | 2/3/6 portions depuis 4 : facteurs 1/2, 3/4, 3/2. Œufs arrondis seulement avec politique explicite, panier commercial entier. Unités individuelles et plafonds également testés. |
| C — Menu partiel | 5 repas conservés ; convives 2/3/2/4/3. Besoins individuels 200/300/200/400/300 g, total 1 400 g. Stock libre 150 g, achats 1 600 g, surplus 350 g sur le jeu synthétique. |
| D — Suggestions | Une portion de plus sans achat supplémentaire, comparaison exacte, aucun changement avant acceptation. Nouveau paquet non présenté comme économie ; seuils de pertinence, stock périssable et destination des restes testés. |
| E — Remplacement | Plusieurs alternatives évaluées sur le menu entier, 4 autres repas inchangés, convives conservés, rejet temporaire respecté. Verrou de production conservé entre modes ou incompatibilité signalée. |
| F — Réoptimisation | Menu partiellement verrouillé, entièrement verrouillé et modifiable. Proposition distincte de l'acceptation ; convives conservés et input inchangé. |
| G — Stock partagé | Modifications, remplacement, annulations inverses ; physique intact, réservations étrangères préservées et pas de double allocation. Stale/rejeu/conflit et évaluation altérée testés. |
| H — Restes cuisinés | 2 quiches pour 5 : consommation de 800 g et 6 œufs de test, 8 portions préparées, 3 conservées. Rejeu neutre, consommation cuisinée indépendante, annulations et dépendances protégées. |
| I — Achats conjoints | Format de 650 g/130 c préféré à 800 g/100 c sous pénalité 1 c/g. Sous budget strict 120 c : retour au format 800 g. Budget global couplant deux frontières d'ingrédients testé. |
| J — Recherche | Petits menus confrontés à un oracle ; limites d'évaluations/nœuds et amélioration progressive ; recherche interrompue jamais optimale. |
| K — Données incorrectes | Mode/rendement inconnu, grille incohérente, conversion/conditionnement manquant, prix inconnu, allergène non revu, budget impossible, quantité commerciale nulle, stock insuffisant et verrous incompatibles. |

Les tests générés reproductibles comprennent les campagnes du lot 1 (250
conditionnements, 150 historiques de stock, 60 menus) et celles du lot 2 :

- **120** problèmes d'achats coût + gaspillage, comparés à toutes les combinaisons
  entières des deux formats dans un oracle indépendant.
- **45** problèmes conjoints de menus et conditionnements, avec portions propres
  à chaque slot, stock, prix, surplus et répétitions variés, comparés à l'énumération
  indépendante de toutes les recettes et nombres de paquets. Même score minimal.

Les prix/produits/recettes du nouveau jeu sont **entièrement synthétiques**, ainsi
que les coefficients de score. Ils ne constituent ni un catalogue E.Leclerc/Lidl,
ni une revue des vraies recettes du foyer. Aucun poids ou rendement alimentaire
manquant n'a été comblé pour faire réussir ces scénarios.

## Parcours JSON demandé

[Entrée reproductible](../fixtures/lot2.json) et [sortie enregistrée](../reports/lot2-scenario.json).
Le script crée 5 repas, modifie trois convives, obtient une suggestion, montre un
refus sans effet, l'accepte explicitement, demande un remplacement, rejette une
première alternative puis accepte un autre choix. Il recalcule et vérifie le stock.

Ses huit contrôles passent : cinq repas, convives 2/3/2/4/3 conservés, seul le
repas ciblé remplacé, rejet temporaire respecté, aucun ingrédient physiquement
consommé par la planification, réservation extérieure conservée, aucune quantité
doublement réservée, aucun plat cuisiné créé avant cuisson. Les comparaisons
quantitatives et tarifaires sont conservées dans le JSON.

## Benchmarks et qualité des solutions

[Résultats détaillés](../reports/lot2-benchmark.json). Chaque recherche est exécutée
deux fois pour vérifier la stabilité exacte du résultat ; les temps restent des
mesures distinctes et naturellement variables. Tous les résultats sont stables,
et leurs couvertures de besoins et utilisations de stock passent les invariants.
Plusieurs formats par ingrédient, stocks et préférences/historique sont inclus.

| Catalogue / repas | Recherche | Évaluations | Temps observé | Panier synthétique | Score | Preuve |
|---|---|---:|---:|---:|---:|---|
| 4 / 2 | Exhaustive | 12 | 12,99 ms | 1,00 € | 144 | Oui, modèle et prix fournis |
| 4 / 2 | Locale | 8 | 4,57 ms | 1,00 € | 144,5 | Non |
| 4 / 2 | Diversifiée | 7 | 2,28 ms | 1,00 € | 144,5 | Non |
| 30 / 5 | Exhaustive limitée | 250 | 77,58 ms | 2,70 € | 326 | Non |
| 30 / 5 | Locale | 250 | 58,59 ms | 2,70 € | 282,5 | Non |
| 30 / 5 | Diversifiée | 250 | 58,62 ms | 2,70 € | 266,5 | Non |
| 60 / 10 | Exhaustive limitée | 400 | 137,38 ms | 6,10 € | 763 | Non |
| 60 / 10 | Locale | 400 | 125,62 ms | 6,10 € | 743 | Non |
| 60 / 10 | Diversifiée | 400 | 111,55 ms | 6,80 € | 773 | Non |

Le score est en équivalents centimes selon les coefficients synthétiques, pas un
montant à afficher à la place du panier. Sur le petit jeu, les deux heuristiques
manquent l'optimum de 0,5 point. Sur 30/5, la diversité améliore le score de 16
points face à la recherche locale et de 59,5 face à l'exhaustif tronqué. Sur 60/10,
elle est au contraire moins bonne de 30 points et coûte 0,70 € de plus que la
recherche locale. Ces écarts sont mesurés ; les grands optima restent inconnus.

La mémoire est enregistrée via RSS avant/après, RSS échantillonnée lors des
améliorations et heap utilisé. La RSS du **processus entier** observée au cours de
la campagne va approximativement de 30 à 75 Mio ; elle inclut Node et les essais
précédents. Les deltas de heap par recherche peuvent être négatifs à cause du GC.
Ces observations ne sont pas des pics d'allocation propres au solveur ni des
mesures Safari/iPhone. Aucun temps de réponse mobile n'est garanti.

## Limites et décision d'architecture

- Les modes et rendements des vraies recettes V2 doivent être revus. Le nouvel
  adaptateur retourne un statut de validation requise ; les titres ne donnent pas
  le mode. Les trois recettes annotées du lot 1 ne sont pas automatiquement
  certifiées pour le contrat de production du lot 2.
- Les prix et conditionnements réels du magasin restent à fournir. Les bornes de
  prix sont conservées quand elles existent, jamais inventées. Le budget strict
  n'est vérifiable que dans le modèle avec observations de session suffisantes.
- La dominance des achats est exacte sous des coûts et taux non négatifs, contenus
  fixes indépendants, sans promotions, substitution ou disponibilités limitées.
  Un seul format au poids reste autorisé par ingrédient, sans mélange fixe/poids.
- Les preuves globales portent sur les choix de production explicitement proposés
  au solveur. Elles ne couvrent pas une quantité facultative non autorisée dans
  l'espace de recherche. Une recherche locale est un meilleur trouvé, pas une preuve.
- Les limites de réseau rationnel et de frontières d'achat peuvent provoquer
  `RESOURCE_LIMIT`. Pas de passage silencieux à des quantités approchées.
- Les propositions contiennent des signatures JSON exactes du contexte ; leur
  taille augmente avec le catalogue. Le journal conserve ses transitions et IDs
  sans compaction. Les benchmarks de recherche ne mesurent pas une longue histoire
  de journal ou la mémoire de centaines de propositions conservées par une interface.
- Les nouvelles réservations n'anticipent pas le physique des courses futures.
  Elles sont allouées dans l'ordre du menu. Menu et stock doivent être persistés
  atomiquement par le futur adaptateur transactionnel.
- Les portions cuisinées sont un modèle minimal. Elles ne sont pas automatiquement
  affectées à d'autres repas et ne possèdent ni date de consommation garantie,
  péremption, congélation ou information nutritionnelle.
- Aucun test de transport/règles Firebase, ni campagne réelle à deux iPhone, ni
  test Safari n'a été réalisé. Ce lot ne crée aucune connexion Firebase.
- OR-Tools/CP-SAT reste une option évaluée architecturalement, sans installation
  ni benchmark inventé. Son intégration n'est pas justifiée par ces seules données.
  Un vrai branch-and-bound nécessiterait une borne admissible du score complet ;
  le coût d'ingrédients seul ne suffit pas en présence de bonus de stock.

La suite utile consiste à valider recettes et références d'un seul magasin,
mesurer la recherche dans un Worker sur iPhone, puis tester l'enregistrement
atomique des transitions dans un émulateur Firebase. Les écrans et le déploiement
restent hors périmètre.
