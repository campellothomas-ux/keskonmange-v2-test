# LOT 5 — Application interactive et 50 recettes

Base : `KeskonMange-V3`, commit `895c3d07d968761feceb9c4f3f08fb59bbad6fd4`.
Modifications limitées à `v3/`. V1/V2, Firebase et les données utilisateur restent
hors du parcours. Aucun déploiement en production n’est effectué.

## Livré

Une application mobile-first autonome dans [KeskonMange-V3.html](dist/KeskonMange-V3.html) :
bibliothèque, recherche, filtres, fiches avec portions et étapes recalculées,
planning sans dates, courses regroupées et cochables, ajouts libres, idées sur
demande. Les portions sont modifiables de 1 à 12 personnes ; le planning peut
contenir jusqu’à 30 repas. Les erreurs et les états vides sont présentés en français.

La persistance locale reprend planning, portions, préférences et cases. Une ligne
cochée qui change reste protégée jusqu’à actualisation explicite. Les ajouts libres
survivent aux changements de repas. Un échec de sauvegarde est visible ; une page
devenue obsolète après un changement dans un autre onglet ne peut pas l’écraser.

L’interface appelle les fonctions de `v3/engine/` ; elle ne recalcule pas les portions.
Les extensions au moteur restent limitées aux fractions d’ingrédients partagés
dans les étapes (`share`, strictement positif et au plus égal à 1), aux huitièmes
usuels et à un pas d’affichage configurable. Les pincées sont présentées en
demi-pincées approximatives sans changer la référence, l’agrégation ou le besoin d’achat.
Les données de bibliothèque décrivent les fractions d’œufs battus explicitement ;
les œufs achetés restent arrondis après agrégation.

## Sélection et corrections

Les cinq pilotes du lot 4 sont présents. S’y ajoutent 26 P3 et 19 P2 choisies,
après lecture des ingrédients, rendements et étapes. Six P3 ont été écartées :
plat mêlant plusieurs protéines et burrata, trois tortillas pour deux convives,
salade cumulant thon et œufs, shawarma aux répartitions contradictoires, et deux
wraps avec une unité de salade ambiguë. Les autres exclusions privilégient les
recettes plus simples ou une diversité déjà couverte. Le layer cake est exclu.

[Inventaire des 50 recettes](../library/INVENTORY.md),
[sélection et 48 exclusions](../library/data/selection.json),
[données natives](../library/data/library-v3.json).

Les 50 originaux sont conservés, avec leur revue. Quinze ajustements sur quatorze
recettes sont utilisés comme **propositions de démonstration non validées** :
principalement les herbes de garniture excessives, et la proposition existante
de pâtes à 270 g au lieu des 350 g V1 pour trois portions de bolognaise. Les
quantités source, proposées, utilisées et leur justification sont consultables
dans les fiches ; la validation quantitative reste `null`. Les fichiers pilotes
du lot 4 ne sont pas modifiés.

Les variantes sont choisies explicitement : épinards frais, colin, persil, penne
et haricots verts frais. Les cuillères à café sont nommées d’après la convention
explicite des étapes V1 ; aucune équivalence en ml n’est créée. Les poids par pièce,
tête d’ail, densités et tailles de conditionnement ne sont pas inventés.

## Résultats des tests

| Ensemble | Résultat |
|---|---:|
| Moteur existant, lots 1 à 4 | 117 tests réussis |
| Bibliothèque et état local | 65 tests réussis, dont 50 tests individuels de fiches |
| Tailles vérifiées sur chacune des 50 fiches | 1, 2, 3, 4, 5, 7, 10 et 12 personnes, soit 400 cas |
| Parcours réels Chromium | 12 validations réussies |
| Erreurs JavaScript de l’application | 0 |
| Requêtes externes de l’application | 0 |

Les parcours navigateur couvrent la recherche et les filtres, le planning de dix
repas, la quiche pour cinq sélectionnée manuellement, le passage à trois burgers,
l’agrégation exacte et la protection des courses cochées, les ajouts et suppressions,
le texte libre échappé, les idées uniquement sur demande, la navigation sans
connexion après chargement, la fermeture complète/réouverture de Chromium,
les onglets concurrents et un échec simulé de stockage. Le mobile est vérifié
à 320, 375 et 390 px, la tablette à 768 px et l’ordinateur à 1440 px.

[Tests moteur](reports/engine-tests.tap) · [Tests bibliothèque/état](reports/unit-tests.tap) ·
[Rapport navigateur](reports/browser-tests.json) · [Audit des 50 fiches](../library/data/conversion-audit.json).

## Exemple quotidien

L’[exemple de dix repas](reports/lot5-scenario.json) contient une quiche pour quatre
et neuf repas pour deux, sans part cuisinée excédentaire. Les oignons communs
représentent 3,5 pièces nécessaires : quatre à prévoir après agrégation, pas un
arrondi séparé par recette. Les pâtes de bolognaise représentent 180 g pour deux
dans la variante de démo, avec les 350 g source pour trois conservés à part.

Dans le test de changement de portions, le besoin partagé en patates douces passe
de 750 à 975 g quand les burgers passent de deux à trois. La case cochée et les
750 g restent protégés jusqu’à actualisation explicite, puis la liste et les étapes
utilisent les nouvelles quantités. L’huile des trois burgers est bien de 1,5
cuillère à soupe. Le prix demeure **inconnu**, sans SKU ni paquet fictif.

## Limites restantes

- **Culinaire** : aucune recette n’est déclarée validée en conditions réelles.
  Les ajustements restent à essayer, les rendements et les durées à confirmer,
  notamment le gratin réduit et les recettes demandant un refroidissement préalable.
- **Poids et formats** : la source ne distingue pas toujours brut/net ; les besoins
  de conserves sont visés égouttés et cette interprétation reste à confirmer.
  Sans donnée vérifiée, on n’infère pas le poids brut d’un contenant, la masse d’une
  pièce, le volume d’une cuillère ou le contenu commercial réellement acheté.
- **Unités incompatibles** : grammes et tranches, ou cuillères à café et à soupe,
  peuvent apparaître sur des lignes séparées d’un même aliment. Une conversion
  nécessiterait une référence documentée ; aucun ingrédient n’est masqué.
- **Œufs fractionnés** : battre et prélever la fraction exacte est indiqué pour
  les panures, galettes et omelettes ; le reste cru n’est pas converti en portions
  cuisinées supplémentaires. Cette méthode pratique reste à tester avec les foyers.
- **Persistance** : stockage d’un seul navigateur/appareil, pas de synchronisation,
  migration, stock physique, confirmation d’achat ou de cuisson. Le mode privé,
  un stockage interdit ou un déplacement du fichier peuvent empêcher la reprise.
- **Ouverture locale** : le navigateur administré de validation refuse `file://`
  avec `ERR_BLOCKED_BY_ADMINISTRATOR`. Le même HTML a été testé en HTTP local ;
  aucune politique n’a été désactivée. L’ouverture par double-clic n’a donc pas
  été validée dans cet environnement précis.
- **Navigateurs** : tests automatisés dans Chromium ; tailles mobiles émulées,
  sans essai sur un iPhone physique ni validation Safari/Firefox.

## Fichiers et dépendances

- `v3/library/` : sélection, 50 sources conservées, conversion native, adaptations,
  convertisseur et inventaire/audit individuels.
- `v3/app/` : interface, persistance locale, fichier HTML autonome, scripts,
  tests et captures de validation.
- `v3/engine/src/cooking.mjs`, `v3/engine/src/culinary.mjs` : partage exact des
  ingrédients dans les étapes, note sur les fractions et huitièmes d’affichage.
- `v3/README.md` : ouverture sans installation et parcours utilisateur.

Seule dépendance ajoutée au dépôt : `esbuild`, outil de développement verrouillé,
pour produire l’HTML autonome. Aucun paquet d’exécution dans l’application.
Playwright/Chromium servent uniquement aux tests et étaient disponibles dans
l’environnement. Le cache npm a été placé dans le workspace après un échec de
permission sur le cache personnel ; aucune installation système n’a été nécessaire.
