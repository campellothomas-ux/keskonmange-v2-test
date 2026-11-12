# Audit avant implémentation — 12 novembre 2026

Source de travail : dépôt GitHub `campellothomas-ux/keskonmange-v2-test`, branche
`KeskonMange-V3`, commit `0d9efe9abdd19f44c7ed25a0617932ffcc1e2a25`.
Aucun fichier AGENTS.md trouvé. Aucun appel à Firebase effectué.

## Existant

- `core.mjs:calculateNeeds` applique systématiquement portions demandées / portions
  de recette ; convives, rendement produit et conservation des restes sont confondus.
- `qtyKey` normalise quelques unités mais conserve les unités inconnues. Les sommes
  utilisent Number et un arrondi cumulatif à trois décimales ; aucun poids égoutté.
- Les identifiants peuvent provenir d'un nom normalisé. Les alias du catalogue
  (par exemple emmental/gruyère) ne suffisent pas à prouver une substitution.
- `shopping.purchased` est un état de liste, pas un journal de stock physique.
  Ni réservations, ni conditionnements commerciaux, ni prix dans ce modèle.
- Les recettes de démonstration sont dans `index.html:DEMO_IMPORT`, avec des
  cuillères, pièces et gousses. Les recettes privées du foyer ne sont pas dans Git.
- `firebase-sync.mjs:transactionTransform` recalcule bien sur l'état courant.
  L'état V2 est une chaîne JSON atomique ; il ne contient pas de journal V3.
- Le métier est également dupliqué dans index.html : ne pas refondre ce point
  pendant cette mission, et ne pas importer le nouveau moteur dans V2.

## Archive fournie : référence expérimentale uniquement

La demande annonce le prototype indisponible : aucun prototype distant n'est
recherché et l'implémentation part du dépôt. L'archive jointe reste lisible pour
un audit statique ; son code et ses jeux tarifaires ne sont pas repris.
`engine.js` effectue un arrondi à deux décimales, ajuste automatiquement les
convives, limite les formats à deux et l'énumération à 160 sans preuve de couverture.
Il mélange les origines commerciales dans une session, ajoute des marges de prix
arbitraires (8/18/30 %), utilise des pénalités de variété et saison imposées et
peut retourner un menu au-dessus du budget. Le moteur n'expose pas de journal
idempotent ni de réservations. Ces résultats ne prouvent pas la fiabilité V3.

## Décision de premier lot

Module ES indépendant, JavaScript standard sans dépendance ni réseau. Couches :
arithmétique rationnelle BigInt ; validation et conversions documentées ; rendement
explicite ; agrégation ; combinaison exacte de conditionnements par programmation
dynamique bornée ; panier ; réducteur pur d'événements ; recherche déterministe de
menus avec compteur de candidats et statut de preuve. JSON aux frontières.

Les données ambiguës bloquent le calcul concerné. Les prix synthétiques servent
uniquement aux tests et restent marqués estimés. Aucun prix commercial vérifié
ni rendement brut/net/égoutté n'est disponible dans le dépôt. Les conversions de
cuillères et les unités par pièce ne seront pas inventées pour rendre les recettes
artificiellement exploitables.
