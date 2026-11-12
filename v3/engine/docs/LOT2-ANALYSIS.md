# Analyse du lot 1 avant extension — lot 2

Base GitHub vérifiée : `f488bc8`, branche `KeskonMange-V3`. Aucun AGENTS.md trouvé.
Les fonctions exactes, validations commerciales et 35 tests existants sont conservés.

Modifications nécessaires :

1. Ajouter un contrat de production versionné. Le booléen `scalable` ne distingue
   pas portions ajustables, lots entiers et unités individuelles. Aucune déduction
   du mode depuis les titres V2 ; les données non revues restent bloquées.
2. Remplacer la stratégie de coût minimal des emballages pour les nouvelles API
   par des frontières de Pareto coût/surplus pondéré. Combiner les frontières sous
   budget, puis comparer les menus : l'objectif devient conjoint dans ce modèle.
3. Fournir des propositions immuables portant sur un menu et un snapshot de stock.
   Recalcul, suggestions, remplacement et réoptimisation ne valent pas acceptation.
4. Remplacer atomiquement les seules réservations du menu, avec contrôle de révision,
   idempotence et annulation. Les réservations d'autres menus restent protégées.
5. Étendre le journal avec une projection séparée de portions cuisinées, créée
   seulement à la confirmation de cuisson et réversible sans fabriquer d'ingrédients.
6. Comparer recherche exhaustive, construction déterministe et amélioration locale
   diversifiée. Les limites s'expriment en évaluations, sans horloge ni hasard.

Les API du lot 1 gardent leur contrat et leur preuve à deux étapes ; les nouvelles
API annoncent une portée de preuve différente. Pas de refonte de V2, de connexion
Firebase, de déploiement, de suivi des dates ou d'infrastructure Python. Les jeux
de produits/prix restent synthétiques et étiquetés. OR-Tools sera comparé sur le
coût architectural et les capacités ; aucune performance non mesurée ne sera affirmée.
