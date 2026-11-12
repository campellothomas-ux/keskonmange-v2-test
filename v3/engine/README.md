# KeskonMange V3 — moteur indépendant, lots 1 et 2

Module ES sans dépendance, sans interface ni accès réseau. Les fichiers V2, leur
configuration et leur synchronisation Firebase ne sont pas modifiés.
Node.js 22+ pour les commandes ; `src/` utilise uniquement les API JavaScript
standards. Aucune installation npm nécessaire.

**Lot 2 — version 0.2.0** : production ajustable, par préparation entière ou par
unité ; optimisation conjointe des menus et conditionnements ; modifications,
suggestions et remplacements à accepter explicitement ; réservations atomiques
et stock séparé de portions cuisinées. Le lot 1 et ses 35 tests restent conservés.

```sh
cd v3/engine
npm test
npm run --silent scenario:lot2
npm run --silent benchmark:lot2
```

Voir [les contrats et le parcours de la future interface](docs/LOT2-API.md),
[la méthode de résolution](docs/LOT2-OPTIMIZATION.md),
[le rapport critique du lot 2](docs/LOT2-REPORT.md) et
[le scénario JSON enregistré](reports/lot2-scenario.json).
Les propositions ne modifient pas les choix acceptés ; l'appel d'acceptation est
une action métier distincte. Aucun écran, déploiement ni accès Firebase ajouté.

## Commandes et référence du lot 1

```sh
cd v3/engine
npm test
npm run --silent scenario
npm run --silent evaluate
npm run --silent audit:v2
```

`scenario` écrit un JSON comprenant optimisation, achats partiels, réservation,
consommation, rejouement et annulation. Un autre scénario peut être fourni :
`npm run --silent scenario -- /chemin/scenario.json`.

## Périmètre livré

- Quantités rationnelles exactes ; unités g/ml/unit ; bases brut/net/égoutté/
  comestible ; conversions uniquement explicites et documentées.
- Rendement et convives distincts, conservation des portions restantes et arrondi
  des ingrédients indivisibles sur décision explicite.
- Besoins agrégés avant déduction du stock libre ; conditionnements entiers,
  plusieurs formats, vente au poids avec incrément explicite.
- Prix sourcés, prix inconnus et incertitudes conservés ; panier incluant les ajouts
  manuels. Budget strict accepté uniquement avec prix observés le jour de session.
- Journal pur idempotent : achats réellement cochés, réservations, consommation
  réelle fournie par l'appelant, annulation et détection de conflits.
- Menus déterministes, contraintes alimentaires et variété configurables,
  préférences/historique et politique explicite pour stock périssable/surplus.
  La recherche expose ses limites et la portée exacte de sa preuve.

## Données et limites à connaître

Les 11 recettes de démonstration sont extraites du dépôt. Trois sont utilisables
avec des annotations de test explicites ; huit attendent une revue. Il ne s'agit
pas d'une validation du catalogue privé du foyer. Les unités de cuillère, gousse,
feuille ou cube ne sont jamais converties par défaut.

**Tous les produits et prix des scénarios sont synthétiques.** Ils ne constituent
pas un relevé E.Leclerc ou Lidl. Le magasin `fixture-store` évite cette confusion.
Les prix observés dans les tests sont des valeurs de test, pas des observations
commerciales. Les hypothèses de base nette et de rendement sont aussi identifiées.

Ce lot ne gère pas les lots de stock/datations de péremption, les promotions,
substitutions, stocks de magasin limités, contraintes nutritionnelles, ni la
planification chronologique. Un seul format de vente au poids est admis par
ingrédient, sans mélange fixe/poids. Une combinaison non prise en charge produit
une erreur, pas un résultat approché silencieux.

L'API historique `optimizeMenus` du lot 1 procède en deux étapes : conditionnement de coût minimal pour
chaque menu, puis classement des menus avec les politiques explicites. La preuve
ne concerne pas un objectif pondéré conjoint sur tous les menus et conditionnements.
Une recherche bornée n'annonce pas d'optimalité globale.
L'API du lot 2 `optimizeMenuJoint` utilise des frontières de Pareto de coût/surplus
pour résoudre ce problème conjoint ; employer cette nouvelle API pour les nouveaux
menus. Les limites de preuve, de ressources et de données restent explicites.

## Points d'entrée

```js
import {
  calculateRequirements, calculateBasket, optimizeMenus,
  emptyStock, applyEvent, adaptV2Recipes
} from './src/index.mjs';
```

Voir [le modèle](docs/MODEL.md) et [le scénario d'entrée](fixtures/scenario.json).
Les erreurs de données sont des `EngineError` avec un `code` stable et un message
de contexte. `optimizeMenus` distingue `feasible`, `needs_data`, `needs_prices`,
`infeasible` et `search_limit`. Une solution possible avec des prix incomplets est
provisoire ; son coût total vaut `null`.

Documentation : [audit](docs/AUDIT.md), [résolution](docs/OPTIMIZATION.md),
[intégration future](docs/INTEGRATION.md), [résultats réels](docs/TEST-REPORT.md).
Les sorties enregistrées sont dans [reports/](reports/).
