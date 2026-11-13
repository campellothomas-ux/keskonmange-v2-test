# Bilan LOT 0 — 13 novembre 2026

## Résultat et périmètre

La V2 de la branche `KeskonMange-V3` est exécutable localement avec un jeu de test
indépendant. Son HTML racine sert de source : CSS, composants, navigation,
fiches, événements et calculs V2 sont conservés. Les adaptations portent sur
le démarrage, les libellés d’enregistrement, un bandeau d’identification du test
et une réinitialisation locale confirmée. Le bouton de compte est désactivé.

Les dix fichiers V2 de référence sont inchangés, vérifiés par SHA-256 :
`index.html`, `core.mjs`, `firebase-runtime.mjs`, `firebase-sync.mjs`,
`firebase-config.js`, `service-worker.js`, `manifest.webmanifest`,
`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.
Leurs empreintes sont dans `source-lock.json`, référence `e4fbb2e`.

Aucun accès Firebase, migration, déploiement, moteur économique, nouvel onglet
ou import des 98 recettes. Les fichiers du prototype `v3/app/`, du moteur et
de la bibliothèque V3 restent inchangés. `v3/README.md` pointe désormais vers
ce laboratoire comme point d’entrée de développement.

## Vérifications

| Domaine | Résultat |
| --- | --- |
| Source V2 | CSS, cœur métier, navigation, fiches, planning et gestionnaires d’événements comparés au source original ; empreintes identiques |
| Données | Onze exemples V2, quantités et étapes conservées ; fixture reproductible, jamais issue de Firebase |
| Recettes | Recherche par nom/ingrédient, filtres, hors saison, favoris et état sans résultat |
| Fiches | Portions modifiables, ingrédients et références quantitatives des étapes recalculés, mode cuisine |
| Planning | Ajout, retrait, ouverture de fiche, portions, mode cuisine lié au repas |
| Courses | Actualisation explicite V2, regroupement des ingrédients communs, rayons dans leur ordre V2, achats conservés |
| Personnalisations | Quantités, unités, rayons, cases cochées, favoris et édition locale conservés au rechargement et après fermeture complète |
| Actions sensibles | Vider demande confirmation, conserve recettes/planning/favoris ; réinitialiser ne touche qu’au jeu de test |
| Isolation du stockage | Sentinelles représentant d’autres sauvegardes et cache indépendant conservés, aucun `clear()` ni suppression globale |
| Erreurs | Quota/échec d’écriture sans faux succès, sauvegarde illisible conservée et récupération explicite |
| Concurrence | Deux clients sous verrou et deux onglets réels, sans perte des ajouts testés |
| Réseau | Zéro requête externe observée ; configuration/runtime Firebase et worker non servis ; CSP bloque fetch, WebSocket, beacon et worker |
| Mobile | Parcours tactiles 320 et 390 px, aucun débordement horizontal ; ordinateur 1440 px |
| Hors ligne | Modifications possibles dans un onglet déjà chargé |

**17 tests Node et 14 scénarios navigateur réussis.**
Les traces brutes sont dans [unit-tests.tap](reports/unit-tests.tap) et
[browser-tests.json](reports/browser-tests.json). Le navigateur de test est
Chromium sous Linux ; le profil est temporaire, les requêtes externes disposent
d’un second blocage dans le banc d’essai. Aucune sonde ne cible Firebase.

Captures de la véritable interface V2 :
[ordinateur — recettes](reports/desktop-recettes.png),
[ordinateur — courses](reports/desktop-courses.png),
[mobile — recettes](reports/mobile-390-recettes.png),
[mobile — courses](reports/mobile-390-courses.png).

## Limites et points à conserver pour les lots suivants

- Les trois onglets et leur ordre V2 restent **Recettes, Planning, Courses**.
  Le passage aux quatre onglets demandés appartient aux lots suivants.
- Les courses suivent le fonctionnement V2 : actualisation explicite après
  modification du planning. Aucun recalcul économique ou nouveau budget.
- Les calculs restent ceux de la V2, y compris leurs arrondis et limites de
  rendement. Ces tests établissent une référence de non-régression, pas une
  validation culinaire ni une validation économique.
- Les photos distantes utilisent le repli graphique V2. L’édition de leur URL
  est testée, sans autoriser leur téléchargement.
- La persistance est celle du navigateur, sans sauvegarde distante ni migration.
  Une suppression des données du laboratoire par le navigateur efface ce test.
- Safari/iPhone physique et installation PWA ne sont pas validés. La connexion
  et la synchronisation Firebase ne sont pas testées ni initialisées. Un test
  iPhone physique nécessitera un accès HTTPS isolé, à prévoir séparément.
- Le rechargement hors ligne n’est pas disponible : aucun worker ni cache
  applicatif dans ce laboratoire. Les onglets chargés continuent à fonctionner.
- Si le source V2 évolue, examiner les changements puis actualiser explicitement
  le verrou de référence et les tests ; aucun contournement automatique.

Le lot 0 s’arrête ici. Les lots suivants attendent une validation explicite.
