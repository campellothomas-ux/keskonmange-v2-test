# Intégration PWA / Firebase proposée, sans connexion réalisée

1. Conserver V2 intacte et ajouter un état V3 versionné séparé par foyer, par
   exemple `v3/households/{householdId}/engineState`. Migrer les données uniquement
   après validation des identités, unités, rendements, bases et références magasin.
   L'adaptateur actuel est un outil de revue, pas une migration automatique.
2. Exécuter le calcul dans la PWA, éventuellement dans un Web Worker si les vrais
   catalogues le nécessitent. `src/` ne dépend ni du DOM, ni de Node, ni de Firebase.
3. Préparer chaque intention une seule fois : ID d'opération, ID de réservation,
   contenu immuable, versions de recette/catalogue, quantités réellement achetées
   ou consommées. Générer l'ID **avant** `runTransaction`, puis conserver le même
   payload pour tous les retries et après interruption sur iPhone. Deux comptes
   du même foyer doivent partager le même état et le même espace d'IDs.
4. Dans `runTransaction`, décoder le dernier état reçu et appliquer
   `applyEvent(latest, event, immutableContext)` ; ne jamais calculer sur un ancien
   snapshot local. Sauvegarder projection physique, réservations, révision et
   journal ensemble. Un conflit invalide annule toute l'opération. Le journal
   contient le fingerprint JSON et les deltas nécessaires à l'inversion ; conserver
   aussi les versions immuables de catalogue/conversions pour un audit/rejeu.
5. Pour les achats, confirmer une sélection de références et quantités réelles,
   sans déduire les lignes cochées depuis l'état total du planning. Pour cuisiner,
   transmettre la consommation confirmée ; ne pas la remplacer implicitement par
   la prévision. Une annulation peut être refusée si une opération dépendante a
   consommé ou réservé ce stock ; traiter les dépendances dans l'ordre inverse.
6. Définir les règles Firebase côté serveur : membres du foyer autorisés, forme des
   écritures, immutabilité des IDs, versions de schéma. Le moteur client seul ne
   protège pas contre un client malveillant. Tester via émulateur transactions,
   coupure réseau, reconnexion et annulations depuis deux clients avant activation.
   Les tests actuels simulent les callbacks successifs sur le dernier snapshot,
   pas le transport ni les règles réelles de Firebase.
7. Prévoir la croissance du journal. Ne pas effacer ses IDs au risque de rejouer
   les achats anciens : définir checkpoint, rétention des clés d'idempotence,
   politique d'annulation et archivage avant toute compaction. Le journal du
   premier lot est intégral et non compacté.

L'état `v2/sharedState`, les fichiers de déploiement, l'authentification, les
écrans et le service worker existants ne sont pas touchés. Aucun SDK réseau n'est
importé par le module. Les résultats techniques détaillent les calculs pour les
tests ; l'intégration future pourra présenter seulement l'estimation globale du
panier, en conservant la qualification estimée/incomplète.
