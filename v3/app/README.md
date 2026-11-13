# Application locale V3 — Lot 5

Le livrable utilisateur est [dist/KeskonMange-V3.html](dist/KeskonMange-V3.html),
un fichier autonome déjà construit. Il ne dépend pas du serveur V2.
Voir le [guide d’ouverture](../README.md).

## Développement et serveur local

Node.js 22+ ; aucune dépendance d’exécution dans le navigateur.

```sh
cd v3/app
npm ci
npm run build
npm start
```

Ouvrir `http://127.0.0.1:4173`. `PORT` permet de choisir un autre port ; le serveur
reste lié à la boucle locale. Il ne sert que la démo et ne peut pas exposer les
fichiers V2 ou leur configuration. Aucun déploiement n’est nécessaire.

**Dépendance de construction justifiée** : `esbuild` 0.25.12, verrouillé dans
`package-lock.json`, regroupe les modules ES existants, les données et le CSS dans
le fichier autonome. Cela permet une ouverture sans serveur et sans installation
pour l’utilisateur. Aucun framework, SDK Firebase ou outil de calcul n’est ajouté.

## Tests reproductibles

```sh
cd v3/engine
node --test --test-reporter=tap test/*.test.mjs > ../app/reports/engine-tests.tap
cd ../app
node --test --test-reporter=tap test/*.test.mjs > reports/unit-tests.tap
npm run build
# Dans un autre terminal : npm start
npm run test:browser
node scripts/report.mjs
```

Le test navigateur utilise Python 3, Playwright et Chromium (`/usr/bin/chromium`
par défaut), déjà disponibles dans l’environnement de validation. Ce sont des
outils de test, pas des dépendances de l’application. `CHROMIUM_PATH` et
`KM_TEST_URL` permettent de viser un autre Chromium ou un serveur local déjà lancé.
Sur une autre machine, installer ces outils de test avant d’exécuter ce seul test.

## Architecture

- `src/app.mjs` : affichage, contrôles, navigation, boîte de recette et messages.
  Les textes de données et saisies sont échappés avant affichage.
- `src/state.mjs` : état local versionné ; appels à `changeMixedMenu`,
  `evaluateMixedMenu`, `renderCooking`, `suggestRecipes` et aux fonctions de courses
  de `v3/engine/`. Aucune règle de quantité ou de rendement n’est réécrite en UI.
- `../library/` : 50 sources sélectionnées, conversion native, décisions éditoriales,
  propositions et preuves de conversion. Les cinq pilotes LOT 4 restent dans le moteur.
- `scripts/build.mjs` : construction autonome ; `scripts/serve.mjs` : serveur local.
- `test/` et `reports/` : validation du modèle, de la persistance et du navigateur.

La clé locale est `keskonmange:v3:lot5` ; aucune clé V2 n’est lue ou migrée. Seuls
le planning, les préférences de personnes et les lignes de courses sont persistés.
Les propositions et l’historique de contexte du moteur ne remplissent pas le
stockage local. La démo ne confirme ni achats ni cuisson et ne crée aucun stock.
Un branchement futur du journal physique requerra les transactions d’acceptation
du moteur ; il ne fait pas partie de ce lot.

## Reproduire la conversion

```sh
node v3/library/scripts/convert.mjs /chemin/KeskonMange_V3_REVISE_98_DOSSIER.zip
```

Le script vérifie l’empreinte de l’archive, extrait uniquement les 50 identifiants
sélectionnés et refuse une source originale modifiée. Python 3 standard suffit
pour lire le ZIP. Sans argument, il reconstruit depuis les 50 sources déjà conservées.
Après conversion, relancer les tests et `npm run build` pour actualiser la démo.

La politique CSP de l’HTML interdit les connexions réseau et les contenus externes.
Les seuls visuels sont des pictogrammes et formes décoratives, aucune photographie
de recette inventée. Les captures des tests sont conservées dans `reports/`.
