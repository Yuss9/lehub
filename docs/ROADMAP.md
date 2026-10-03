# Lots de livraison

1. **Fondations** : Next.js, PostgreSQL/Drizzle, Better Auth, création du foyer, invitations, membres, paramètres, thèmes et Docker manuel.
2. **Pièces et équipements** : CRUD, archivage, réorganisation, photos privées, recherche, filtres et détails.
3. **Entretien** : tâches, occurrences et historique, calendrier, récurrence fixe ou depuis réalisation, fuseaux et fins de mois testés.
4. **Courses** : plusieurs listes, liens aux équipements/entretiens, actions rapides mobiles.
5. **Documents** : originaux privés, validation des signatures/taille, métadonnées, associations, téléchargement autorisé.
6. **Finitions** : aperçu métier, garanties, recherche globale, export utilisateur et accessibilité.

Chaque lot donne lieu à une PR vers main. Aucun lot dépendant ne démarre avant le retour du propriétaire.

## Limites du premier lot

L’aperçu affiche les informations réelles du foyer. Les modules métier à venir sont des mentions de feuille de route, sans boutons factices. Le volume documents est provisionné ; aucun upload n’est encore disponible. Pas de seed requis.

Le modèle supporte plusieurs foyers, mais l’interface sélectionne le premier foyer rejoint. Le sélecteur de foyer viendra ultérieurement. Les invitations créent des membres ; l’interface ne promeut pas encore un membre administrateur et ne supprime pas les administrateurs. Une invitation peut rejoindre un compte existant après connexion.

Pas d’email transactionnel ni de récupération de mot de passe oubliée dans ce lot. La modification du mot de passe nécessite le mot de passe actuel. Ne pas confondre ce premier lot avec une version fonctionnellement complète de l’application.
