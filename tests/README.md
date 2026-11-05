# Vérifications V0.8.1

Depuis la racine du dépôt, avec Node.js 24 :

```sh
node tests/courses.test.mjs
```

Les cinq tests couvrent le moteur exporté **et sa copie intégrée à l’interface**,
l’effacement complet, la conservation des données et la régénération du planning.
Le test de transaction vérifie le format partagé et la conservation des ajouts
présents dans le dernier état reçu.

Le test navigateur nécessite Playwright et Chromium. Dans l’environnement cloud
préparé, ils sont déjà disponibles :

```sh
node tests/browser.test.cjs
```

Sur une autre machine, installer Playwright hors du dépôt puis utiliser Chromium
installé localement (adapter `CHROMIUM_PATH`) :

```sh
npm install --prefix /tmp/km-browser-tests --no-package-lock playwright@1.62.1
NODE_PATH=/tmp/km-browser-tests/node_modules CHROMIUM_PATH=/usr/bin/chromium node tests/browser.test.cjs
```

Le navigateur teste la confirmation et son annulation, l’attente du succès
serveur, le refus d’écriture, le mode hors connexion, l’effacement et Actualiser.
Il vérifie aussi les tailles calculées des champs en portrait/paysage et la
politique de zoom. Toutes les requêtes sont interceptées : le transport Firebase
est simulé, sans authentification ni lecture/écriture distante.

Avant fusion, vérifier sur Safari d’un iPhone réel le focus, le défilement,
l’absence de zoom au double toucher et le zoom volontaire au pincement. Chromium
mobile ne reproduit pas le zoom automatique propre à Safari. La synchronisation
réelle des deux comptes doit également être vérifiée avec leurs propriétaires,
dans le projet Firebase de test uniquement. Aucun réglage Auth ni règle Firebase
n’est modifié par ce correctif.
