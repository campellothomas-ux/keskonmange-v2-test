# Bilan d’intégration — 14 novembre 2026

**La mission n’est pas déclarée terminée.** La chaîne locale est implémentée et
testée, mais l’acceptation avec prix ouverts réels et l’accès utilisateur sans
commande restent à valider. Aucun déploiement externe, aucune connexion
Firebase et aucune migration n’ont été effectués.

[Fichier autonome préparé](dist/KeskonMange-V3.html) — environ 5 Mo, sans prix
fictifs embarqués. Le double-clic Mac n’est pas validé dans cet environnement,
dont Chromium interdit les URL `file://`. Le fichier identique servi sur une
origine HTTP locale isolée passe les parcours ci-dessous. Une prévisualisation
HTTPS séparée est prête à être envisagée après accord explicite.

## Résultats confirmés

- **18 tests d’intégration**, **117 tests existants du moteur** et **21 tests
  d’isolation V2** réussis ; rapports TAP dans `reports/`.
- **10 groupes de parcours navigateur réussis**, avec vrais rendus, clics,
  lecture de fichiers, OCR et fermeture/réouverture du navigateur. Les tests
  tarifaires et les réponses API de cette suite sont synthétiques.
- Un parcours supplémentaire sur profil vierge, **sans aucun prix injecté**,
  confirme le catalogue initial, l’ajout d’une quiche, la présence des prix
  inconnus et l’édition d’une quantité d’achat sans catalogue.
- Les dix fichiers V2/PWA de référence restent identiques. L’archive originale
  des 98 fiches est conservée, empreinte du JSON
  `606b728465394408ed1f1ce88d1f23529066e28a393fadf54959693fa5948940`.
- Les 50 conversions existantes restent qualifiées **techniquement**. Leurs
  réserves et corrections sont conservées. Aucune validation culinaire réelle
  n’est affirmée. Les 48 autres recettes restent consultables et sélectionnables
  manuellement avec un avertissement sur leurs calculs provisoires.
- Les fichiers de sortie ne contiennent ni configuration Firebase, ni SDK, ni
  amorce de synchronisation distante, ni enregistrement de service worker.
  Le banc navigateur n’a relevé aucune requête extérieure inattendue ni erreur
  JavaScript non traitée. Les prix simulés sont injectés uniquement dans son
  profil temporaire, avec un bandeau visible de données synthétiques.

## Tests d’acceptation A à I

| Test | Résultat observé | Limite |
| --- | --- | --- |
| A — Sources ouvertes | Trois véritables appels tentés ; refus du proxy sur OFF, Open Prices et la documentation OFF | **Bloqué** : aucun produit ni prix réel reçu, couverture non mesurable |
| B — 100 €, 7 repas | Recherche globale du moteur, 180 paniers comparés, achats manuels inclus ; scénario complet et confirmation distincte | Validation économique **synthétique** ; 10 repas également testés |
| C — Achats supplémentaires | Bananes, fromage blanc et biscuits ajoutés via l’UI ; maintien des prix inconnus, saisie d’un prix manuel et recalcul immédiat | Aucun tarif générique arbitraire ; recherche réelle de comparables bloquée |
| D — Ticket | PDF textuel, PNG avec OCR réel et PDF scanné avec OCR réel atteignent la vérification ; remise affectée, corrections et confirmation | Tickets synthétiques lisibles ; variantes d’enseignes non qualifiées en conditions réelles |
| E — Historique | Trois références changent après confirmation ; prix récents du foyer préférés, promotions exceptionnelles, fidélité et prix trop anciens testés | Prix d’essai, aucun prix personnel réel fourni |
| F — Conditionnements | Agrégation exacte avant achat ; trois demi-oignons donnent 1,5 unité nécessaire et 2 unités achetées ; 333 g de yaourt, stock, formats, surplus, vente au poids | Formats de test ou confirmés manuellement ; catalogue ouvert non validé |
| G — Réoptimisation | Dépassement, recherche sur le panier global et confirmation avant toute modification ; remplacement ciblé d’un repas testé | Recherche bornée ; une réduction n’est pas toujours trouvée et aucun optimum global n’est garanti |
| H — Reprise | Budget, planning, articles, cases, références, historique et préférences conservés après fermeture complète et réouverture | Même origine/profil navigateur, stockage autorisé ; pas de synchronisation entre appareils |
| I — Interface | Véritables composants V2, quatre onglets dans l’ordre, 98 fiches, parcours à 1 440 px et 390 px sans débordement horizontal | Chromium ; Safari/iPhone physique et double-clic Mac non testés |

Rapports : [intégration](reports/unit-tests.tap), [moteur](reports/engine-tests.tap),
[isolation V2](reports/v2-isolation-tests.tap), [navigateur](reports/browser-tests.json),
[appels réels](reports/live-sources.json), [scénarios chiffrés de test](reports/synthetic-scenarios.json).

## Exemple économique — données synthétiques uniquement

Le scénario reproductible demande sept repas pour deux convives. Il retient :
papillote de cabillaud aux légumes d’été ; omelette courgettes-feta-menthe ;
omelette jambon-fromage ; saumon aux courgettes ; omelette poivrons-feta ;
linguine crevettes-courgettes-ail-citron ; bowl quinoa-crevettes-mangue.

Les formats et tarifs de ce scénario sont volontairement fictifs et réservés
aux tests : panier total **58,08 €**, dont **20 €** d’achat manuel, 31 lignes
chiffrées sur 31. Un ajout de **46,92 €** fait passer le panier à **105 €** et
le reste à **−5 €**. La recherche suivante ne trouve pas de réduction sur ce
jeu de données ; le planning reste inchangé. Ce résultat n’est pas présenté
comme un respect du budget ou une économie obtenue.

La liste détaillée du scénario conserve séparément besoin, format, quantité
achetée et coût dans `reports/synthetic-scenarios.json`. Ce n’est pas un
catalogue commercial livré à l’utilisateur.

Exemple d’historique issu du ticket synthétique confirmé :

| Référence de test | Estimation initiale | Prix issu du ticket | Motif de sélection |
| --- | ---: | ---: | --- |
| Riz basmati, format de test | 1,22 € | 1,80 € | Observation personnelle récente du magasin choisi |
| Lait, format de test | 1,16 € | 1,20 € | Même règle, conditionnement identique |
| Yaourt grec, format de test | 1,06 € | 2,50 € | Même règle, sans écraser les observations antérieures |

L’amélioration porte sur la provenance des estimations, pas sur une baisse
garantie des prix. Les articles ignorés et les remises non affectées ne
deviennent pas des références fiables par défaut. Le ticket peut être corrigé
sans dupliquer ses observations puis supprimé avec celles-ci.

## Blocage réseau exact

Les trois domaines renvoient depuis le proxy :

```text
curl: (56) CONNECT tunnel failed, response 403
HTTP distant : 000
```

Domaines : `world.openfoodfacts.org`, `prices.openfoodfacts.org`,
`openfoodfacts.github.io`. Ce 403 vient du tunnel du proxy ; ce n’est pas une
réponse fonctionnelle des API. L’état de l’instance active signale encore la
révision réseau 1, appliquée, dont les domaines autorisés n’incluent pas ces
trois hôtes, malgré la modification des réglages signalée par l’utilisateur.
Les tentatives et leur horodatage sont conservés dans `live-sources.json`.

Produits reçus : **0**. Observations de prix reçues : **0**. Formats publics
vérifiés : **0**. Fraîcheur, correspondance au magasin et taux de couverture
d’un menu avec ces données : **non mesurables**. Aucun refus n’a été remplacé
par des prix synthétiques dans l’application. La suite de contrat simulée
ne constitue pas une vérification d’Open Prices en service.

## Limites restantes

1. **Prix réels et accès sans commande** : appliquer la politique réseau à
   l’instance réellement utilisée, puis mesurer un sous-ensemble pilote. Une
   origine HTTPS isolée doit être autorisée avant publication, puis testée
   avec les vrais services et avec Safari/iPhone. Aucun site V2 existant ne
   doit être remplacé et aucune intégration Firebase ne doit être activée.
2. **Recettes** : les validations culinaires restent en attente. Les originaux
   non qualifiés ont un calcul proportionnel provisoire et des instructions
   chiffrées à vérifier. Une édition les retire du générateur automatique.
   Le filtrage d’équipement s’appuie sur les mentions explicites des étapes,
   sans prétendre comprendre toutes les variantes de cuisson.
3. **Optimisation** : maximum 180 évaluations pour 1 à 10 repas ; comparaison
   du coût global estimé, variété et préférences simples. Pas de garantie
   d’optimalité. Pour un ingrédient avec vente au poids, les alternatives
   fixes et au poids sont comparées séparément ; une combinaison mixte de
   ces modes n’est pas prouvée optimale. Sans incrément de vente documenté,
   le poids prévu est à peser en magasin, sans prétendre connaître un pas
   de vente réel. Pas d’intégration Leclerc/Lidl opérationnelle.
4. **Préférences et allergènes** : exclusions et régime végétarien simples.
   Une allergie active ferme l’accès automatique aux compositions non revues
   par le foyer. Les variantes commerciales ne sont jamais fusionnées sans
   confirmation. L’examen des étiquettes reste nécessaire.
5. **Tickets** : l’OCR n’est pas une certitude. Formats de tickets sur plusieurs
   lignes, lots complexes ou remises générales nécessitent des corrections.
   Limites : 18 Mo, 6 pages PDF, 12 millions de pixels par page PDF rendue.
   La création de prix à partir d’une remise globale non affectée est refusée,
   sauf choix explicite d’enregistrer seulement le ticket sans observations.
   JSON attend `lines` ; CSV simple `nom;quantité;prix`, pas un import universel.
6. **Stockage et hors ligne** : local uniquement, usage recommandé dans une
   fenêtre ; pas de résolution de conflits entre plusieurs onglets. Aucun
   service worker ni installation PWA dans cet espace isolé. Le fichier
   embarque les ressources nécessaires à l’OCR/PDF, mais son exécution
   `file://` dépend du navigateur et reste à vérifier. En cas de refus de
   stockage, le bandeau annonce clairement une session temporaire.
7. **Vie privée et licences** : les tickets restent sur l’appareil, sans
   téléversement automatique. Les requêtes publiques révèlent au service le
   terme ou code recherché et l’IP ; elles nécessitent l’activation dans
   Profil. Attribution ODbL et séparation public/privé documentées dans le
   README ; les notices Apache et autres composants sont embarquées.

## Périmètre des fichiers

Tous les ajouts sont dans `v3/integration/` : adaptateur V2, gestion du panier,
prix, connecteurs, tickets, stockage, construction autonome, données originales,
tests et rapports. Le seul fichier existant modifié est
`v3/engine/src/joint-optimizer.mjs`, pour l’évaluateur optionnel d’un panier
global ; les garanties d’optimalité ne sont pas réutilisées abusivement avec
cet évaluateur. Aucun fichier V1/V2 ou de configuration Firebase n’est modifié.
Travail exclusivement sur `KeskonMange-V3`, à partir de `5561118`.
