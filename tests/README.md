# Test du raccourci photo

Depuis la racine, avec Node.js, Playwright et Chromium :

```sh
node tests/recipe-photo.test.cjs
```

Ces outils sont présents dans l’environnement cloud. Ailleurs, installer
Playwright hors du dépôt et préciser le chemin de Chromium si nécessaire :

```sh
npm install --prefix /tmp/km-photo-tests --no-package-lock playwright@1.62.1
NODE_PATH=/tmp/km-photo-tests/node_modules CHROMIUM_PATH=/usr/bin/chromium node tests/recipe-photo.test.cjs
```

Trois parcours sont exécutés : mobile tactile portrait (390 × 844), paysage
(844 × 390) et bureau (1280 × 900). Ils vérifient la cible de 44 px, l’absence
de chevauchement, le focus clavier, l’ouverture de l’éditeur existant,
l’enregistrement de la photo seule, les favoris, l’édition complète et les cas
sans photo ou avec image indisponible. L’annulation ne doit pas enregistrer.

Toutes les requêtes sont interceptées et le transport Firebase est simulé :
aucun compte réel ni aucune donnée distante ne sont utilisés. Une vérification
sur Safari d’un iPhone réel reste recommandée. Le code Firebase reste inchangé.

Pour enregistrer des captures, définir `PHOTO_SCREENSHOT_DIR` vers un dossier
existant hors du dépôt.
