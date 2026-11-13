# KeskonMange V3 — Développement sur le socle V2

Le point d’entrée actuel est le **[laboratoire V2 isolé — LOT 0](v2-lab/README.md)**.
Il réutilise directement l’interface de la V2, avec des exemples indépendants,
un stockage local séparé et aucun démarrage Firebase.

Depuis la racine du dépôt, avec Node.js 20 ou plus récent :

```sh
node v3/v2-lab/serve.mjs
```

Ouvrir **http://127.0.0.1:43820** sur le même ordinateur.

[Bilan et limites du lot 0](v2-lab/REPORT.md) ·
[Tests navigateur](v2-lab/reports/browser-tests.json)

Les développements antérieurs restent conservés dans `engine/`, `library/` et
`app/`. **L’interface autonome du lot 5 est abandonnée comme direction UX** ;
[sa documentation historique](app/README.md) reste disponible. Le moteur et les
conversions ne sont pas raccordés au laboratoire dans le lot 0.

Aucun fichier V2 à la racine n’est modifié. Aucun déploiement, migration ou accès
Firebase n’est effectué par ce laboratoire. Les lots suivants nécessitent une
validation explicite.
