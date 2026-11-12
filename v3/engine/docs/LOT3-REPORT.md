# Lot 3 — bilan factuel et limites

Date : 12 novembre 2026. Base : `ebbb9c9`, branche `KeskonMange-V3`.
Module : `v3/engine/`, version 0.3.0. Exécution Linux x64, Node.js v24.22.1.
Aucune dépendance installée. Aucun fichier applicatif V2 modifié, aucun accès
Firebase, aucune interface, IA, OCR ou mise en ligne.

## Ce qui est validé dans le périmètre technique

- Les recettes complètes, partielles et manuelles cohabitent. Les calculs fiables
  continuent ; les quantités inconnues ne sont jamais ramenées à zéro.
- Les besoins fiables d'une recette partielle nécessitent une revue explicite
  et un facteur de production justifié. Un ingrédient sans conversion ne réserve
  aucun stock. Les données réellement invalides restent signalées comme telles.
- Un choix cher reste conservé avec un diagnostic de dépassement, même si le
  contexte possède un budget strict réservé à la recherche automatique. Les
  risques alimentaires connus des sélections manuelles restent visibles.
- Les articles libres persistent, avec souhaits, estimations facultatives et
  coches. Les lignes de même SKU regroupent leurs origines sans effacer de besoin ;
  les libellés similaires seuls ne fusionnent jamais.
- Une réorganisation de ligne calculée cochée est explicite. Les achats confirmés
  conservent leur identité, leurs comptes réels et leur trace ; le stock n'est
  jamais ajouté deux fois. Les contenus libres non vérifiés ne deviennent pas
  artificiellement du stock canonique.
- Les conseils sont demandés séparément. Ils restent des propositions ; refus,
  ignorance et maintien d'un menu moins économique sont sans effet bloquant.
- Les changements de planning et confirmations de courses sont réversibles via
  le journal existant, avec protection des dépendances et des snapshots.
- La recherche combinée sélectionne le meilleur des deux budgets réellement
  évalués et respecte son budget global. Elle ne prétend pas prouver l'optimum.

Les changements sont une couche d'orchestration : aucun changement du solveur,
de l'arithmétique, du réducteur de stock ou des modes de production des lots 1/2.
Le seul ajustement du benchmark précédent extrait son constructeur de cas dans
un fichier commun, pour comparer exactement les mêmes données avant/après.

Contrats complets : [LOT3-API.md](LOT3-API.md).

## Tests réellement exécutés

```sh
cd v3/engine
npm test
npm run --silent scenario:lot3
npm run --silent benchmark:lot3
npm run --silent audit:field
```

**95 tests réussis, 0 échec, 0 ignoré**, dont les **66 tests précédents inchangés**.
Le passage avec couverture a duré environ 2,72 s : 98,47 % des lignes, 87,71 % des
branches et 93,33 % des fonctions de `src/`. Les pourcentages ne constituent pas
une preuve de vérité des données ni d'exhaustivité de tous les comportements.
[Journal complet](../reports/lot3-tests.tap).

| Exigence | Résultat constaté |
|---|---|
| A — Recette non optimisable | Recette conservée ; riz fiable calculé, poulet inconnu non chiffré. Les autres repas restent exploitables. Donnée non revue ou conversion manquante jamais utilisée au stock. |
| B — Recette coûteuse | Choix maintenu, dépassement signalé, aucun remplacement ni conseil déclenché par la modification seule. |
| C — Produits manuels | Trois produits gardent quantités/présentations et coches après modification et proposition de réoptimisation partielle. |
| D — Conseils à la demande | Plusieurs propositions pertinentes sur demande seulement ; aucun changement sans acceptation. Sans gain utile, la liste reste vide. |
| E — Refus/acceptation | Refus sans modification du menu/courses/stock ; signature rejetée non reproposée immédiatement ; autre choix accepté isolément. |
| F — Courses en cours | Coches conservées à l'ajout ; changements protégés ; SKU fusionnés avec origines ; confirmations idempotentes ; achats partiels réels et nouveaux besoins séparés ; annulation cohérente et dépendances protégées. |
| G — Menu mixte | Trois recettes complètes, une partielle et une manuelle calculées sur leur périmètre, sans perte des articles libres ou des choix. |
| H — Recherche combinée | Même contexte et objectif, consommations sous le plafond partagé, résultat jamais moins bon que les deux phases réellement exécutées ; aucune prétention d'optimalité globale. |
| I — Non-régression | 66 tests conservés, dont lots entiers, portions individuelles, conversions exactes, réservations, annulations, restes cuisinés et oracles générés des lots 1/2. |

Les sorties JSON des scénarios des lots 1 et 2 restent **identiques octet par
octet**. Les erreurs/conditions nouvelles sont également testées : prix inconnus,
conditionnement absent, risque allergène manuel explicite, refus de recommandation
incompatible, budget automatique non vérifiable, commande d'achat altérée,
contexte/catalogue obsolète, réception incomplète et validation technique de revue.

## Scénario reproductible du lot 3

[Entrée](../fixtures/lot3.json), [sortie complète](../reports/lot3-scenario.json).
Le jeu est **synthétique**, y compris les recettes et le produit volontairement
coûteux. Il n'est pas une validation familiale ou commerciale réelle.

Le scénario crée cinq repas mixtes, modifie les convives de trois repas, ajoute
un sixième repas choisi librement hors budget, ajoute trois articles libres,
recalcule, demande des conseils, en refuse un, en accepte un autre puis confirme
une sélection d'achats et la rejoue.

Ses **14 contrôles passent**, notamment : maintien des six choix, repas partiel
et manuel conservés, choix cher maintenu et dépassement signalé, poulet jamais
inventé, total complet restant `null`, trois lignes manuelles et leurs coches
préservées, refus non reproposé, seul changement accepté appliqué, double validation
neutre et réservation extérieure protégée.

Le sous-total des éléments chiffrés passe de 2,20 € à 3,20 € après changements de
convives, puis à 25,20 € avec le choix cher, et 29,20 € avec les lignes libres dont
le prix est renseigné. Ce sont **des montants synthétiques partiels** ; ni le
poulet ni le soda non tarifé ne sont implicitement gratuits. La portion proposée
utilise mieux les achats à coût inchangé ; elle n'est pas annoncée comme économie
monétaire. La sélection d'achats ne crée du stock physique que pour les contenus
commerciaux vérifiés dans ce jeu de test.

## Benchmarks avant/après et décision

[Résultats complets](../reports/lot3-benchmark.json). Les cas du lot 2 sont partagés
sans changement de données, et les scores/prix de `local` et `diverse` à même budget
sont vérifiés identiques au rapport précédent. Chaque nouvelle recherche est
rejouée pour contrôler sa stabilité ; tous les résultats sont stables.

| Recettes / repas | Stratégie | Budget global d'évaluations | Évaluations réelles | Score | Panier synthétique | Temps observé |
|---|---|---:|---:|---:|---:|---:|
| 4 / 2 | Locale | 100 | 8 | 144,5 | 1,00 € | 20,41 ms |
| 4 / 2 | Diversifiée | 100 | 7 | 144,5 | 1,00 € | 34,67 ms |
| 4 / 2 | Combinée | 100 | 15 | 144,5 | 1,00 € | 7,23 ms |
| 4 / 2 | Combinée | 200 | 15 | 144,5 | 1,00 € | 4,23 ms |
| 30 / 5 | Locale | 250 | 250 | 282,5 | 2,70 € | 92,77 ms |
| 30 / 5 | Diversifiée | 250 | 250 | 266,5 | 2,70 € | 50,86 ms |
| 30 / 5 | Combinée | 250 | 250 | 286,5 | 2,70 € | 46,09 ms |
| 30 / 5 | Combinée | 500 | 500 | 266,5 | 2,70 € | 102,81 ms |
| 60 / 10 | Locale | 400 | 400 | 743 | 6,10 € | 114,80 ms |
| 60 / 10 | Diversifiée | 400 | 400 | 773 | 6,80 € | 111,06 ms |
| 60 / 10 | Combinée | 400 | 400 | 743 | 6,10 € | 106,27 ms |
| 60 / 10 | Combinée | 800 | 800 | 743 | 6,10 € | 195,99 ms |

Sur 30/5, diviser un plafond global de 250 en 125+125 donne 286,5 : c'est moins
bon que la stratégie diversifiée seule avec 250 (266,5). La combinaison retient
bien le meilleur de ses phases réelles (304,5 et 286,5) ; elle ne bénéficie pas de
deux budgets complets cachés. Avec 500 explicitement autorisés, elle retrouve le
meilleur des deux budgets de 250, sans nouvelle amélioration propre au solveur.

Sur 60/10, la combinaison de deux budgets de 200 trouve 743, identique à la
locale seule avec 400 et meilleur que la diversifiée avec 400. Doubler à 800
n'améliore pas ce résultat. Sur 4/2, les heuristiques gardent leur écart de 0,5
face à la référence exhaustive 144 du lot 2.

**Décision : conserver ce wrapper en option, sans en faire le défaut.** Aucun
gain systématique à budget égal n'est démontré. Pas de nouveau solveur, tuning
coûteux ou infrastructure supplémentaire pour masquer ce constat.

Les temps sont ceux d'un passage serveur, avec compilation/cache/charge variables ;
ils ne démontrent pas une accélération fiable ni une performance iPhone. Les
relevés RSS/heap du processus sont dans le JSON ; les deltas peuvent être négatifs
à cause du GC et ne sont pas des pics propres à l'algorithme. Aucun optimum global
n'est revendiqué pour les recherches combinées ou les menus partiels.

## Audit des données réelles : bloqué, pas inventé

[Audit enregistré](../reports/lot3-field-audit.json), sur l'arbre Git de `ebbb9c9`.
Les sources suivies du dépôt ont été examinées, dont `index.html:DEMO_IMPORT`, les
extractions V2 et les jeux de tests. Résultat :

- 11 recettes de démonstration identifiées, **0 recette familiale attestée**.
- **0 référence commerciale vérifiée** par une preuve accessible.
- **0 prix magasin vérifié**, aucun ticket/catalogue commercial accessible identifié.
- Les fixtures précédentes restent des démonstrations/annotations et produits
  synthétiques, sans changement de qualification.

Il est donc impossible de revendiquer la validation terrain demandée sur cinq
recettes et E.Leclerc Saint-Orens. Aucune Firebase privée ou source extérieure
n'a été consultée pour combler ce manque.

Un [format de revue vide](../fixtures/household-review.template.json) prévoit cinq
recettes à renseigner, preuves examinées, quantités/rendements/modes validés et
références commerciales documentées. `validateFieldPacket` contrôle sa cohérence
technique et garde toujours `fieldValidated:false` : il ne peut pas authentifier
un ticket ou confirmer l'usage réel d'un foyer à partir de simples déclarations.
Ses tests utilisent des attestations factices, explicitement distinctes de données terrain.

## Limites restantes

- Les inconnues ne sont pas optimisées comme des besoins nuls. Les conseils sur un
  menu partiel portent sur les éléments chiffrables et exposent leurs limites ;
  ils ne garantissent ni couverture ni économie du panier réel complet.
- La réoptimisation mixte est locale, à un changement proposé à la fois. Les API
  globales strictes restent réservées à un contexte entièrement quantifié.
- Les articles libres sans contenu vérifié restent hors du stock canonique.
  Une réception passée n'est pas automatiquement repricée ; une correction
  nécessite un traitement explicite, pas un remplacement silencieux de l'historique.
- Les propositions et le journal conservent des snapshots détaillés ; leur
  archivage/compaction reste à définir avant un usage long. L'audit des preuves
  réelles et la migration du foyer ne sont pas implémentés comme un import automatique.
- Les capacités commerciales restent celles des lots 1/2 : un seul magasin,
  contenu vérifié, pas de promotions, substitution ou mélange fixe/poids non pris
  en charge. Un dépassement de ressources est signalé, jamais remplacé par une
  approximation de quantité.
- Une corruption de l'état partagé de stock ou d'identités communes reste une
  erreur stricte. Cette couche n'en fabrique pas une réparation silencieuse.
- Aucun test réel sur iPhone, transport/règles Firebase ou synchronisation entre
  comptes. Aucun suivi nutritionnel, date de conservation ou congélation ajouté.

La prochaine validation utile nécessite les cinq revues familiales et des preuves
de contenus commerciaux réels. Les comportements techniques sont testés ; la
validation terrain demeure explicitement en attente de ces données.
