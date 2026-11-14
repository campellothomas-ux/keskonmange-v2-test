# KeskonMange V3 — interface V2 et panier global

[Fichier autonome à télécharger](dist/KeskonMange-V3.html) · [Bilan des vérifications](REPORT.md)

Cette intégration reprend le véritable HTML V2, ses styles, cartes, fiches,
recherche, filtres, favoris, édition, import et modales. Elle ajoute les parcours
V3 dans quatre onglets : **Planning | Courses | Recettes | Profil**.
Le prototype graphique `v3/app/` n’est pas utilisé.

Le fichier embarque le code, les 98 recettes originales, les 50 conversions V3,
les moteurs PDF et OCR français. Aucune installation n’est demandée à
l’utilisateur. Aucun tarif synthétique n’est chargé par défaut.

**État de livraison : intégration locale testée, validation des prix ouverts
bloquée par le proxy, prévisualisation HTTPS non publiée.** Le navigateur géré
interdit ici `file://` ; le double-clic sur Mac/Safari n’est donc pas validé.
Le même fichier a été exercé sous Chromium via un serveur HTTP local isolé.
Une prévisualisation HTTPS sur une nouvelle origine serait le moyen de tester
sans commande sur Mac et iPhone ; elle nécessite l’accord explicite demandé
par l’utilisateur avant tout déploiement externe.

## Essayer les fonctions

1. Dans **Recettes**, consulter une fiche, adapter les portions et l’ajouter
   au planning. Les 48 originaux non qualifiés restent consultables ; seuls les
   50 formats V3 intacts participent à la génération automatique.
2. Dans **Profil**, définir le budget, les préférences et le magasin. Les
   recherches publiques nécessitent une activation explicite. On peut aussi
   déclarer un conditionnement et un prix personnel, ou importer un ticket.
3. Demander un menu dans **Recettes**. Le moteur compare jusqu’à 180 paniers
   complets ; le menu n’est appliqué qu’après **Accepter ce menu**. Le bouton
   **Remplacer** conserve les autres repas proposés.
4. Dans **Courses**, ajouter un achat manuel, cocher des articles, corriger un
   nom, une quantité, un produit ou un rayon. Les achats supplémentaires
   participent immédiatement au budget. Une correspondance confirmée peut
   couvrir un besoin du planning au lieu de s’y ajouter.
5. Importer une photo JPEG/PNG ou un PDF dans **Profil** ou **Courses**, revoir
   les lignes, affecter les remises, confirmer les conditionnements et le
   total. Aucun ticket ni prix extrait n’est enregistré avant confirmation.
   L’historique permet ensuite la correction et la suppression.

Une ligne sans prix reste visible. Un montant partiel n’est jamais déclaré
comme un panier complet sous budget. Les conditionnements proviennent
exclusivement de données consultées ou confirmées par le foyer.

## Architecture et isolation

- `src/catalog.mjs` adapte les 98 fiches à la V2, réutilise les 50 conversions
  existantes et conserve les originaux et la traçabilité. Une recette modifiée
  ou importée perd sa qualification automatique tant qu’elle n’est pas revue.
- `src/economy.mjs` appelle `v3/engine/` pour les rendements, besoins exacts,
  conditionnements et la recherche globale. Le seul ajout au moteur est un
  évaluateur optionnel du panier complet dans `joint-optimizer.mjs` ; son
  comportement par défaut conserve ses 117 tests. Aucun algorithme de portions
  ou de choix de conditionnements n’est dupliqué dans les composants UI.
- `src/prices.mjs` distingue produits, formats, observations, provenance,
  ancienneté, magasin et promotions. Les calculs restent exacts ; les arrondis
  d’affichage ne réécrivent pas les quantités culinaires.
- `src/sources.mjs` ne réalise que des GET HTTPS vers les deux services ouverts.
  Cache de session, espacement des appels, délais limites, erreurs et cache
  périmé explicites. Les observations importées restent enregistrées localement.
- `src/recognition.mjs` extrait le texte PDF avec PDF.js et exécute Tesseract.js
  localement pour les images et PDF scannés. Workers, WebAssembly et modèle
  français sont embarqués. Aucun service payant ou secret dans le navigateur.
- `src/receipts.mjs` conserve les brouillons jusqu’à confirmation, exige une
  affectation explicite des remises avant d’en faire des prix nets, puis
  conserve les observations historiques. Les alias sont confirmés par le foyer.
- `src/state.mjs` limite le stockage à
  `keskonmange:v3:integrated:1`. Aucun import des clés V1/V2 ni synchronisation
  distante. Les images et PDF ne sont pas conservés. Le texte brut ne l’est pas
  par défaut. Si le navigateur refuse la sauvegarde, une session temporaire
  est annoncée clairement.
- `scripts/build.mjs` vérifie les empreintes des dix fichiers V2 de référence,
  transforme leur copie en mémoire et génère le fichier autonome. Les fichiers
  de production restent inchangés. Aucune configuration ou amorce Firebase,
  aucun manifeste ou service worker n’est embarqué. La CSP ne permet que les
  deux services ouverts pour les connexions, sans code distant.

Le serveur de développement est lié à une origine dédiée, `127.0.0.1:43830`.
Il sert uniquement le fichier généré, sans exposer la racine du dépôt. La
prévisualisation éventuelle devra aussi utiliser une nouvelle origine.

## Sources et limites tarifaires

Open Food Facts identifie les produits et leurs contenus ; il ne fournit pas
à lui seul les prix. Open Prices fournit des observations datées. L’API a été
préparée d’après le code et la documentation amont :

- [OFF API v2](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Open Prices API](https://prices.openfoodfacts.org/api/docs)
- [Source Open Prices auditée, commit 4d413b9](https://github.com/openfoodfacts/open-prices/tree/4d413b90b2b1e2528549407aee8b9b3e600360b0)

Les appels réels effectués le 14 novembre 2026 sont refusés par le proxy de
cette instance : `curl (56) CONNECT tunnel failed, response 403`, HTTP distant
`000`, sur les trois domaines. Les connecteurs ne sont **pas validés en réel**.
Le référentiel public livré reste vide. La couverture du marché, la fraîcheur
des observations et leur correspondance au magasin sont **non mesurables**
avant une consultation réussie. Les réponses simulées des tests sont distinctes.

Un prix comporte une date, une source, un produit ou une unité de catégorie,
et un magasin si connu. Les prix du foyer issus de tickets récents du magasin
choisi sont prioritaires sur ses estimations manuelles comparables. Une
médiane de cinq observations compatibles au maximum limite le poids d’une
valeur isolée. Les observations de plus de 730 jours sont exclues ; au-delà de
180 jours, leur confiance est faible. Les promotions et avantages fidélité
sont exclus par défaut et configurables séparément. Un prix public ne devient
« magasin choisi » que si son identifiant de lieu exact a été sélectionné.
Les observations de catégorie restent indicatives.

L’intégration E.Leclerc proposée a été examinée via son README. Elle repose sur
une session de navigateur authentifiée et sur le franchissement de protections
DataDome ; elle n’est pas exécutée ni utilisée. Aucune API officielle exploitable
Lidl n’est confirmée dans cette livraison. Le produit n’en dépend pas.

## Confidentialité et licences

Les données ouvertes OFF/Open Prices et l’historique privé sont deux collections
séparées. Aucun ticket personnel n’est publié sur Open Prices. Seuls les mots
ou codes saisis explicitement pour une recherche sont transmis aux services,
qui peuvent journaliser requêtes et adresse IP. Aucune clé Firebase n’est livrée.

Les bases ouvertes relèvent d’ODbL : attribution et provenance sont conservées.
Une future redistribution de leur base dérivée devra respecter ses obligations
de partage à l’identique ; cette livraison ne publie aucune base combinant les
observations privées du foyer. Aucune photographie OFF n’est téléchargée.

PDF.js 5.6.205, Tesseract.js/Core 7.0.0 et le modèle français tessdata_fast
sont utilisés sous Apache-2.0, sans facturation à l’usage. Les notices des
composants embarqués sont dans [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt)
et dans **Profil → Confidentialité et sources**. Le modèle est épinglé au
commit `87416418657359cb625c412a48b6e1d6d41c29bd` avec contrôle SHA-256.
`esbuild` 0.27.0 est une dépendance de compilation uniquement. Aucune dépendance
OCR/PDF n’est ajoutée à la V2 de production.

## Reproduction pour le développement

Ces commandes concernent les développeurs, pas l’ouverture par l’utilisateur :

```sh
cd v3/integration
npm ci
npm run build
node scripts/serve.mjs
```

Vérifications disponibles :

```sh
node --test --test-reporter=tap test/*.test.mjs
python test/browser.py
python test/fresh-state-browser.py
node scripts/scenarios.mjs
node scripts/probe-live.mjs
```

Le parcours navigateur exige Playwright Python et Chromium dans le banc de test.
Il utilise un profil temporaire, des prix **synthétiques exclusivement de test**
et des réponses API simulées explicitement repérées. Il lit réellement les PDF
et les images. `probe-live.mjs` réalise séparément les appels réseau réels,
sans modifier le référentiel ni masquer un échec par une réponse de test.

Les limites restantes et les résultats détaillés figurent dans [REPORT.md](REPORT.md).
