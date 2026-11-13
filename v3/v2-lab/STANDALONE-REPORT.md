# Démonstration sans installation — 14 novembre 2026

Le fichier `dist/KeskonMange-Demo-V2.html` contient la véritable interface V2,
ses calculs et les onze recettes d’exemple indépendantes du lot 0. Aucun fichier
annexe n’est nécessaire. Ni les originaux V2 ni les données du foyer ne sont modifiés.

## Protection et sauvegarde

- Aucun import de module, SDK Firebase, fichier de configuration Firebase,
  service worker, manifeste PWA ou script externe.
- La CSP est incluse dans le fichier : connexions, workers, formulaires réseau
  et frames interdits ; images uniquement embarquées ; script autorisé par son
  empreinte exacte. Les photos distantes utilisent le repli graphique V2.
- Les validations et le client local du lot 0 sont réutilisés. Les quantités,
  instructions et écrans V2 ne sont pas réimplémentés.
- Sauvegarde dans une clé propre à la démonstration autonome et au chemin du
  fichier, distincte des sauvegardes du laboratoire et de V1/V2. Garder le même
  fichier et le même navigateur. Une seule fenêtre d’essai à la fois.
- Si le stockage est refusé ou saturé, les interactions restent possibles en
  mémoire. Le bandeau et le statut indiquent alors que les essais disparaîtront
  à la fermeture ; aucun faux succès de sauvegarde persistante.
- Réinitialisation explicitement confirmée, limitée à ce jeu de test.

## Vérifications réellement réalisées

**21 tests Node réussis** : les 17 tests du laboratoire et quatre tests
supplémentaires du document autonome. CSS et principaux écrans comparés au
source V2 ; JavaScript classique analysé ; absence de modules externes et
empreinte CSP vérifiées. Les dix fichiers V2 de référence conservent leurs SHA-256.

**Six scénarios Chromium réussis** : ouverture du document autonome via HTTP
local dans le banc de test ; recherche, favoris, fiches, portions, planning,
courses par rayons et ajouts manuels cochés ; sauvegarde après fermeture complète
du navigateur ; réinitialisation ; refus du stockage ; blocage réseau par la
CSP embarquée ; aperçu dans le sandbox de conversation sur ordinateur et mobile.
Les polices, tailles, couleurs et espacements de sept éléments représentatifs
de l’aperçu sont comparés au document autonome.

L’aperçu conserve les véritables composants et calculs. Son adaptateur déclenche
les gestionnaires locaux V2 pour les boutons de formulaire, car le sandbox
interdit les soumissions HTML natives. Aucune permission réseau supplémentaire.
Ses styles V2 sont isolés de ceux de l’hôte. Le stockage est indisponible dans
ce sandbox : les essais y restent temporaires, avec une indication visible.

**Limite précise :** l’ouverture directe du fichier livré a été tentée et le
navigateur administré a répondu `net::ERR_BLOCKED_BY_ADMINISTRATOR` pour `file://`.
Cette politique n’a pas été contournée. Aucun Mac/Safari physique n’est disponible.
Les essais HTTP et du sandbox ne sont pas présentés comme une validation du
double-clic sur Mac. L’aperçu interactif constitue l’alternative testée, sans
installation ni déploiement.

Résultats : [tests Node](reports/standalone/unit-tests.tap),
[scénarios navigateur et refus file://](reports/standalone/browser-tests.json).
Aucune requête externe de l’application ni erreur JavaScript non traitée observée.
Les trois ressources de présentation de l’hôte sont bloquées dans le banc de
test ; elles ne font pas partie du HTML autonome.

## Maintenance

La préparation du fichier est réservée au développement :
`node v3/v2-lab/build-standalone.mjs`. La personne qui reçoit le HTML n’exécute
aucune commande. Le script vérifie le verrou des sources V2 avant génération.

Tests : `node --test v3/v2-lab/test/*.test.mjs`, puis
`python v3/v2-lab/test/standalone-browser.py` pour le document autonome.
L’enveloppe du sandbox peut être fournie au banc de test avec `KM_DEMO_PREVIEW` ;
elle est explicitement marquée non exécutée si absente. Les tests utilisent un
profil temporaire, distinct de toute sauvegarde réelle.
