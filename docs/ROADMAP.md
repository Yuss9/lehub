# Lots de livraison

1. **Fondations** : comptes privés, foyer, invitations, paramètres, thèmes et Docker manuel.
2. **Modules du foyer** : pièces et équipements, entretiens, courses, documents, tableau de bord, garanties, recherche et export. Regroupement demandé explicitement par le propriétaire ; voir [HOME-MODULES.md](HOME-MODULES.md).

3. **Parcours complets** : protections de concurrence, gestion des fichiers, rappels, récupération d’accès, entretiens flexibles, courses hors ligne, fiches équipement, sauvegarde/restauration, calendrier, OCR, tags et pagination.

4. **Exploitation et collaboration** : stockage hors ligne transactionnel, conflits par article, suivi des workers et distributions, sauvegardes serveur chiffrées avec restauration de contrôle, aperçu PDF et correction OCR, dépenses et corrections d’historique, push, sélection de foyers et gestion des administrateurs. Voir [OPERATIONS.md](OPERATIONS.md) pour les limites et le harnais de validation native.

5. **Fiabilité des appareils et exploitation** : désactivation hors ligne par foyer avec confirmation atomique, abonnements push liés aux sessions, reçus par appareil, révocation d’accès, traces des corrections, lots OCR, copie distante vérifiée et surveillance indépendante. Voir [RELIABILITY.md](RELIABILITY.md).

Les modifications sont proposées dans une branche dédiée et une PR vers `main`. Le propriétaire révise et fusionne ; le workflow CI autorisé construit et publie les images GHCR après fusion sur main. Le déploiement NAS est une étape ultérieure.

6. **Installation et parcours quotidiens** : guide self-hosting complet, configurations Caddy/proxy, génération privée des secrets, recette réelle, rubriques de paramètres, journée complète du calendrier, déplacement protégé et double authentification TOTP avec codes de secours (migration 0007).

## Évolutions possibles

- Passkeys, intégrations domotiques et échanges de calendriers selon les usages.

L’interface utilise exclusivement les données réelles de PostgreSQL. Aucun jeu de démonstration dans une instance personnelle réelle. La démo NAS utilise une base et des volumes distincts ; voir [NAS-DEMO.md](NAS-DEMO.md). Les limites actuelles et instructions de migration sont décrites dans HOME-MODULES.md et README.md.

