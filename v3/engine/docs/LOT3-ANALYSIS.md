# Analyse préalable du lot 3

Base vérifiée : `ebbb9c9`, branche `KeskonMange-V3`. Aucun AGENTS.md trouvé.
Le moteur strict reste la référence ; ses 66 tests sont conservés.

Changements minimaux :

1. Ajouter une évaluation de menu mixte, ligne par ligne, qui ne transmet aux
   calculs exacts que les données justifiées. Une donnée inconnue n'est jamais 0.
2. Ajouter un état de courses avec identités d'intentions, origines, coches et
   confirmations conservées ; les articles libres ne deviennent pas du stock
   quantifié sans référence et contenu vérifiés.
3. Séparer les commandes manuelles, le diagnostic de budget et les recommandations
   demandées explicitement. Les premières conservent les choix même non optimaux.
4. Envelopper les deux recherches existantes avec un budget global partagé, sans
   modifier le solveur ni le journal physique.
5. Auditer les sources accessibles pour préparer une revue terrain. Les fixtures
   existantes et les recettes de démonstration ne sont pas des données familiales
   réelles validées. Aucun accès Firebase ou catalogue externe n'est requis.

Les réservations porteront exclusivement sur les besoins connus. Les propositions
resteront explicites, protégées contre les snapshots obsolètes. Les lignes cochées
non confirmées ne seront pas réorganisées silencieusement ; les confirmations
seront des intentions immuables réutilisant le journal idempotent existant.
