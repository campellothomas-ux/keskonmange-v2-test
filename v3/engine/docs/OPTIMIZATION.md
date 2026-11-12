# Choix de résolution et portée des preuves

## Approche retenue : calcul déterministe dans le navigateur

Pour chaque menu, agréger les besoins, soustraire le stock libre une fois par
ingrédient, puis résoudre une couverture entière par ingrédient. Les formats
fixes utilisent une programmation dynamique sur le réseau rationnel commun des
contenus (PPCM des dénominateurs puis PGCD des contenances). Toutes les quantités
restent exactes ; les états sont des indices entiers bornés.

Pour un besoin N et un plus grand format C, il suffit d'examiner les quantités
achetées de N à N+C−1 pas du réseau. Au-delà, on peut retirer au moins un paquet
sans perdre la couverture ; son prix étant positif ou nul, le coût n'augmente
pas. À coût égal, préférer le plus petit surplus, puis le moins de paquets et
l'ordre stable des références. La programmation dynamique minimise le coût exact
en centimes à chaque quantité. Le nombre de formats n'est pas limité à deux.

Limite par défaut : 100 000 états et au plus 5 millions de transitions. Dépassement
=> `RESOURCE_LIMIT`. Il n'y a aucune coupure numérique du nombre de paquets qui
prétendrait ensuite démontrer une optimalité. Une référence au poids seule est
résolue directement par plafond exact besoin/incrément ; la ligne totale est
chiffrée selon le taux. Les mélanges fixe/poids ou plusieurs offres au poids sont
refusés dans ce lot, car les arrondis tarifaires par ligne empêchent d'utiliser
naïvement la même récurrence additive.

Si un prix manque, le panier reste calculable en quantités : préférence provisoire
au plus petit volume couvrant le besoin, puis coût connu et nombre de paquets.
Le coût complet reste inconnu et `packageOptimal:false`. Ce choix n'est jamais
présenté comme le minimum monétaire.

Les menus sont énumérés sans ordre, avec répétitions limitées, exclusions,
allergies, tags alimentaires revus, nombre minimal de recettes distinctes et
maximum par famille facultatifs. Un défaut d'information allergène ne vaut pas
absence d'allergène. La garantie porte sur la liste d'ingrédients déclarée ; la
vérification des étiquettes et contaminations croisées reste une donnée à préparer.
Les tags V2 ne deviennent pas des certifications V3.

Pour chaque menu dont les achats de coût minimal sont fixés, le score exact est :
coût panier + répétitions + familles répétées + préférences non satisfaites +
historique + dépassement budgétaire souple + surplus pondérés − utilisation du
stock périssable pondérée. **Tous les coefficients sont fournis explicitement** ;
hors coût, ils valent zéro par défaut. Les taux de surplus et de stock portent
sur l'unité canonique de chaque ingrédient (centimes/g, ml ou unité). On n'additionne
jamais directement des grammes, millilitres et pièces pour mesurer le gaspillage.
Le coefficient des pâtes/riz/épices peut rester nul ou faible. Le bonus périssable
ne consomme jamais plus que le besoin et le stock libre. Aucune promesse de
consommation avant péremption : le planning n'est pas daté et le stock n'a pas de lots.

Le moteur explore au plus `maxCandidates` menus complets (2 000 par défaut,
`mealCount` limité à 30). Il expose candidats visités, faisables, erreurs et
troncature. `optimal:true` nécessite une exploration complète, aucune alternative
calculable omise pour manque de données/ressources, des prix numériques complets
et la couverture de conditionnements démontrée. Les estimations permettent une
preuve **sur ces nombres estimés**, jamais sur les vrais tarifs commerciaux.
Les menus incomplets en prix passent après les menus complètement chiffrés.

Cette preuve concerne précisément la stratégie **deux étapes** : plus bas coût
des conditionnements de chaque menu, puis score des menus. Un conditionnement
plus cher mais plus économe en surplus ne sera pas choisi pour améliorer un score
pondéré conjoint. Ce problème global est une extension distincte ; il n'est pas
prétendu résolu. Les mesures sur gros jeux montrent aussi la sensibilité d'une
recherche tronquée à l'ordre stable des IDs.

## Alternative : programmation sous contraintes / CP-SAT

Variables possibles : nombre entier x[r] de préparations, nombre entier y[p] de
paquets, utilisation s[i] du stock libre, surplus w[i]. Après mise à l'échelle
entière **exacte**, imposer : nombre de repas, bornes de répétition, exclusions,
allergies validées, diversité, `s[i] <= stockLibre[i]` et
`Σ contenu[p] y[p] + s[i] >= Σ besoin[i,r] x[r]`.
Le budget porte sur `Σ prix[p] y[p] + ajoutsManuels`, et les surplus sont liés aux
équilibres. Des variables booléennes identifient les recettes/familles utilisées.
Pour des recettes aux portions variables, fixer d'abord un ensemble de tailles
de préparations validées ; ne pas linéariser approximativement une conversion.
CP-SAT peut ainsi traiter un objectif conjoint ou des priorités lexicographiques,
et fournir borne, écart et statut de preuve sous limite de calcul.

| Critère | JavaScript retenu | OR-Tools / CP-SAT |
|---|---|---|
| Architecture | ES natif, hors ligne, sans dépendance | Pas de distribution JS navigateur officielle équivalente aux API Python/C++/Java/.NET ; WASM tiers à auditer ou service à héberger |
| Calcul | Couverture exacte puis énumération bornée | Contraintes entières, recherche sophistiquée et bornes |
| Preuve | Complète sur petits jeux dans le modèle à deux étapes | Statuts optimal/feasible/infeasible + borne si résolution complète ou partielle |
| Taille | Coût combinatoire visible, explicité | Potentiellement meilleur sur grandes instances, à mesurer avec les vrais catalogues |
| Intégration | Aucun backend, PWA existante compatible | Distribution/runtime, sérialisation, mise à l'échelle int64, tests croisés, éventuelle infrastructure supplémentaire |
| Données manquantes | Blocages explicites | Ne fournit pas non plus les prix, rendements ou conversions manquants |

CP-SAT n'a pas été installé ni chronométré pendant cette mission ; aucune mesure
de vitesse ou de taille de bundle n'est inventée. Les limites réelles seront
mesurées avant une décision d'intégration. Les instances V2 exploitables ne
justifient actuellement ni backend Python ni service payant. Les tests avec
référence exhaustive et les JSON d'évaluation pourront servir de contrat de
comparaison à un futur solveur. Aucune IA générative n'intervient dans les calculs.
