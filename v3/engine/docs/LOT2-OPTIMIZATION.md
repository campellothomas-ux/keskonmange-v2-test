# Résolution conjointe et stratégie locale

## Pourquoi le lot 1 ne suffisait pas

Besoin de test : 650 g. Offre A : 800 g pour 100 centimes ; offre B : 650 g pour
130 centimes. Avec une pénalité explicite de 1 centime/g de surplus, A vaut 250
et B vaut 130. Le lot 1 choisit d'abord A par coût. Le lot 2 conserve les deux
compromis coût/surplus et choisit B. Sous budget strict de 120 centimes, il revient
à A, car le budget est impératif. Ce sont des données synthétiques, pas des prix
commerciaux. Les deux décisions sont testées.

## Couverture commerciale et preuve locale

Pour chaque ingrédient, normaliser les contenus vérifiés sur le réseau rationnel
commun. Une programmation dynamique calcule le coût minimal pour chaque quantité
achetée exacte. Examiner les quantités de N à N+C−1 pas du réseau, où N est le
besoin arrondi au pas de couverture et C le plus grand format. Au-delà, retirer un
paquet préserve la couverture et ne peut augmenter ni coût non négatif ni surplus
pondéré non négatif. Cette borne ne coupe donc pas une solution préférable.

À quantité identique, un plan plus cher est dominé. Conserver ensuite uniquement
les plans non dominés selon `(coût, surplus pondéré)`. La pondération est propre
à l'ingrédient et à son unité canonique ; elle n'est pas déduite du prix au kilo.
Les prix nuls sont autorisés ; les taux négatifs sont refusés.

Combiner ces frontières entre ingrédients, en conservant à nouveau les plans
non dominés coût/surplus. Cela permet un budget strict sur le panier total ou une
pénalité de dépassement souple, sans choisir séparément une solution trop chère
pour chaque ingrédient. Un cas à deux ingrédients vérifie que le budget force un
compromis global différent des deux choix individuels.

Le coût des ajouts manuels est inclus. Pour une offre au poids seule, le marginal
est calculé après regroupement de la ligne manuelle et des incréments nécessaires,
afin de respecter l'arrondi au centime de la ligne totale. Les mélanges fixe/poids
et plusieurs offres au poids restent explicitement non pris en charge. Les
promotions et disponibilités en quantités limitées ne sont pas modélisées.

Quand un prix est inconnu, les références chiffrables peuvent fournir un panier
réalisable, mais la preuve est désactivée si une alternative sans prix pourrait
changer l'optimum. Si aucun format n'a de prix, une couverture quantitative exacte
provisoire reste possible ; le prix total vaut `null` et le score contient seulement
le sous-total connu et les composantes quantifiées. Un score provisoire n'est pas
une estimation certaine du coût total. Pour un budget strict, les achats doivent
être certifiables par des prix observés de session ; les offres non vérifiables
ne sont pas des alternatives satisfaisant cette contrainte.

## Choix des menus et de la production

Chaque slot possède ses convives, sa conservation, ses contraintes et ses verrous.
Les recettes sont validées individuellement pour ce slot : production minimale
légale, production explicite à conserver ou verrou à traduire dans la nouvelle
recette. Les augmentations facultatives sont limitées à un ensemble explicitement
autorisé par l'appelant, et demeurent des propositions à accepter.

Pour chaque menu candidat, agréger tous les besoins, libérer virtuellement ses
propres réservations, employer le stock libre une seule fois et résoudre le
panier conjoint. Le score ajoute les politiques de variété/préférences/historique
et de stock. Aucun coût de calcul ne remplace une quantité physique.

Une énumération exhaustive des choix de recette/production, associée aux frontières
exactes d'achat, peut ainsi prouver l'optimum **conjoint de ce modèle fini**. Les
contraintes validées, les limites et l'incertitude des données restent visibles.
La preuve ne concerne ni les vrais prix inconnus ni des productions supplémentaires
non autorisées dans l'espace de recherche.

## Trois stratégies comparées

1. `exhaustive` : énumération des affectations légales par slot, rejet précoce des
   répétitions/familles incompatibles. Budgets séparés d'évaluations complètes et
   de nœuds. Une recherche limitée n'annonce jamais d'optimalité.
2. `local` : construction déterministe d'un premier menu, puis changements d'une
   recette à la fois, chaque changement étant évalué dans le menu complet.
3. `diverse` : plusieurs constructions déterministes décalées, puis amélioration
   locale du meilleur candidat trouvé. Ce n'est pas un algorithme aléatoire.

Les choix initiaux sont ordonnés par une relaxation du coût des ingrédients aux
prix de référence disponibles, sans contraintes de paquets et avec le stock
considéré individuellement. Cette valeur sert **uniquement à ordonner la recherche**.
Elle n'est ni une liste d'achats, ni une quantité inventée, ni une borne prouvée
du score global incluant les bonus de stock. Les repas verrouillés sont placés
avant les autres dans les constructions pour protéger leurs choix.

Les compteurs, rejets, erreurs, limites et améliorations successives sont retournés.
`onProgress` permet de présenter une première proposition réalisable puis de
l'améliorer dans un Worker, sans enregistrer le planning. Le calcul n'utilise ni
horloge ni hasard : même entrée et mêmes limites => même résultat. Le callback
est synchrone ; l'application devra employer un Worker pour une interaction sans
blocage de son thread principal. Aucun adaptateur Worker d'interface n'est ajouté.

La diversification ne domine pas toujours la recherche locale simple. Les mesures
du lot montrent précisément un avantage sur 30 recettes/5 repas et un désavantage
sur 60 recettes/10 repas. Une recherche locale peut aussi manquer l'optimum sur
4 recettes/2 repas. Le rapport expose ces contre-exemples plutôt que d'annoncer
un gain garanti. Les écarts des grandes instances se calculent par rapport à la
meilleure solution mesurée, sans les présenter comme un écart à l'optimum inconnu.

## OR-Tools / CP-SAT et alternative avec bornes

Une formulation sous contraintes peut choisir une variable booléenne par
`(slot, recette, production autorisée)`, des entiers de conditionnements, le stock
utilisé et les surplus. Contraintes : un choix par slot, production suffisante,
compatibilité alimentaire, verrous, répétitions/familles, équilibres par ingrédient,
paquets entiers, stock libre et budget certifiable. Objectif : coût + surplus
pondéré + politiques du foyer. Les rationnels doivent être convertis exactement
sur des échelles entières compatibles avec int64, sans arrondi alimentaire.

CP-SAT fournirait une borne et des statuts de preuve pour des instances plus
grandes. Son coût d'intégration reste celui décrit au lot 1 : pas de runtime
officiel équivalent directement prêt pour la PWA, besoin d'un portage WASM à
auditer ou d'un service supplémentaire, cycle de sérialisation, packaging et tests.
Il n'a pas été installé ni benchmarké ; aucune comparaison de vitesse inventée.
Les performances serveur mesurées du moteur JS et les catalogues réels encore à
valider ne démontrent pas la nécessité d'un backend Python ou d'un service payant.

Un branch-and-bound avec une borne admissible du **score complet**, prenant en
compte les bonus négatifs de stock, est une piste. Une borne naïve du prix seul
ne permettrait pas de couper correctement ce score. Ce lot utilise la dominance
exacte des achats, l'énumération, la construction et l'amélioration locale ; il
ne prétend pas avoir implémenté une borne globale ou CP-SAT.
