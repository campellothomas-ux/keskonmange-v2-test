# LOT 0 — La V2 dans un laboratoire local

**Pour essayer sans installation ni commande :**
[fichier HTML autonome](dist/KeskonMange-Demo-V2.html).
Il utilise les mêmes exemples et les mêmes écrans V2. La sauvegarde fonctionne
selon les autorisations du navigateur, avec un repli temporaire explicite.
[Bilan de cette version et limite du test sur Mac](STANDALONE-REPORT.md).

Les instructions ci-dessous concernent uniquement l’environnement de développement.

Depuis la racine du dépôt, branche `KeskonMange-V3`, avec Node.js 20 ou plus récent :

```sh
node v3/v2-lab/serve.mjs
```

Ouvrir **http://127.0.0.1:43820** dans le navigateur du même ordinateur.
Laisser le terminal ouvert ; `Ctrl+C` arrête le serveur. Aucun `npm install`,
compte, configuration Firebase ou compilation n’est nécessaire.

L’application affiche la véritable interface de `index.html` à la racine :
Recettes, Planning, Courses. Le serveur adapte son démarrage en mémoire ; il ne
génère et ne modifie aucun fichier V2. Le moteur économique et les nouveaux
onglets n’appartiennent pas à ce lot.

## Essai rapide

1. Retrouver la bibliothèque V2 et ouvrir une fiche. Modifier les personnes,
   puis consulter les ingrédients et le mode cuisine.
2. Ajouter un plat au planning, modifier ses portions, retirer un repas.
3. Choisir **Mettre à jour les courses**, conformément au fonctionnement V2.
4. Consulter les rayons, cocher un article, modifier sa quantité ou son rayon.
   Ajouter par exemple `2 pièces Citrons`.
5. Fermer puis rouvrir le navigateur à la même adresse : les modifications de
   test sont conservées. Le bouton **Réinitialiser le test** demande confirmation.

Les onze recettes sont les exemples `DEMO_IMPORT` déjà présents dans la V2,
associés à son catalogue d’ingrédients. Le planning initial contient trois repas,
deux favoris, une quantité personnalisée, un article coché et du savon de test.
Ce jeu indépendant n’est pas le contenu du compte utilisateur. Ni les 98 fiches
de l’archive ni les 50 conversions V3 ne sont importées dans ce lot.

Les photos externes sont bloquées ; le remplacement visuel existant de la V2
est utilisé. Les quantités et limites de calcul restent celles de la V2.

## Isolation

- Serveur lié uniquement à `127.0.0.1`, sur un port dédié, avec contrôle de
  l’en-tête Host et de l’origine. Aucune API d’écriture, aucun proxy, aucune
  exposition générale du dépôt.
- Aucune configuration, aucun runtime Firebase, aucun SDK Google n’est servi.
  `firebase-sync.mjs`, servi localement, est seulement le validateur JSON pur
  existant ; il n’importe que `core.mjs` et n’initialise aucun service.
- La politique CSP du serveur interdit toutes les connexions de données,
  images externes, formulaires réseau, frames et workers. Le script inline V2
  est autorisé par son empreinte, sans `unsafe-eval` ni scripts inline libres.
- Aucun manifeste PWA, aucun enregistrement de service worker et aucun accès
  applicatif à CacheStorage. Toutes les réponses portent `Cache-Control: no-store`.
- Si un service worker préexiste sur cette adresse, le démarrage est refusé.
  Aucun worker ou cache existant n’est supprimé.
- Seule la clé `keskonmange:v3:lot0:v2-exemples-lot0-1:state` est utilisée dans
  le stockage local. Aucun inventaire, import ou effacement des autres clés.
  Les écritures sont sérialisées entre onglets avec Web Locks ; une erreur de
  stockage est affichée et ne produit pas de faux succès.
- Une sauvegarde illisible reste intacte jusqu’à la réinitialisation explicite
  de ce jeu de test. Une empreinte des dix fichiers V2 de référence bloque le
  démarrage si le socle change sans revue des adaptations.

Utiliser cette commande dédiée, **pas un serveur statique à la racine du dépôt**
qui exposerait le HTML Firebase original. Ne pas réutiliser le port d’une autre
application. Si nécessaire :

```sh
node v3/v2-lab/serve.mjs 43822
```

Ouvrir alors l’adresse affichée. Chaque port possède sa sauvegarde indépendante.
Ne pas effacer les caches ou les données d’une autre application pour démarrer
le laboratoire. Après une modification du code du laboratoire, redémarrer le
serveur et recharger la page.

## Vérifications reproductibles

```sh
node --test v3/v2-lab/test/lot0.test.mjs
```

Parcours navigateur, après démarrage du serveur, avec Playwright Python et
Chromium déjà disponibles dans l’environnement de développement :

```sh
python v3/v2-lab/test/browser.py
```

Ce script utilise un profil temporaire indépendant et bloque aussi toute sortie
réseau externe dans le banc de test. Les sondes CSP visent `example.invalid`,
jamais une véritable base Firebase. Les résultats et captures sont dans
[`reports/`](reports/). Aucune dépendance n’est ajoutée à l’application.

## Limites de ce lot

Le serveur est accessible uniquement sur l’ordinateur qui l’exécute. Les formats
mobiles tactiles sont testés sous Chromium ; **Safari sur iPhone physique reste
à valider**, dans un environnement de test HTTPS distinct autorisé ultérieurement.
Le serveur refuse intentionnellement les accès LAN et les aperçus distants.

Un onglet déjà chargé reste utilisable sans réseau. Le rechargement complet hors
ligne et l’installation PWA sont désactivés dans ce laboratoire sans cache ni
service worker. Authentification, partage Firebase et synchronisation distante
ne sont pas exercés. Leurs fichiers d’origine restent inchangés.

[Bilan du lot 0](REPORT.md)
