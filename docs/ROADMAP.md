# Lots de livraison

1. **Fondations** : comptes privés, foyer, invitations, paramètres, thèmes et Docker manuel.
2. **Modules du foyer** : pièces et équipements, entretiens, courses, documents, tableau de bord, garanties, recherche et export. Regroupement demandé explicitement par le propriétaire ; voir [HOME-MODULES.md](HOME-MODULES.md).

Les modifications sont proposées dans une branche dédiée et une PR vers `main`. Le propriétaire révise et fusionne ; aucun pipeline ou déploiement automatique.

## Évolutions possibles

- Sélecteur de foyer, pagination et recherche SQL.
- Modification/suppression des documents et aperçu PDF.
- Notifications des échéances et garanties.
- Calendrier graphique, import d’export et courses hors ligne.

L’interface utilise exclusivement les données réelles de PostgreSQL. Aucun jeu de démonstration en production. Les limites actuelles et instructions de migration sont décrites dans HOME-MODULES.md et README.md.
