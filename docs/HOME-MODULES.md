# Modules du foyer

Les cinq modules sont regroupés dans une PR à la demande du propriétaire. Les fondations existantes, la navigation sobre, le thème clair/sombre et les polices système sont conservés.

## Utilisation

- **Pièces** : créer, modifier, archiver/restaurer, définir l’ordre numérique d’affichage, consulter les appareils d’une pièce.
- **Équipements** : nom, pièce, marque, modèle, numéro de série, notes, achat et garantie. Recherche, filtre par pièce, archives, photos privées et documents associés.
- **Entretien** : date civile dans le fuseau du foyer, fréquence unique/hebdomadaire/mensuelle/annuelle et intervalle. Récurrence depuis la date prévue ou la réalisation. Vue par mois et regroupement des échéances par jour. Compte rendu et historique conservés.
- **Courses** : plusieurs listes partagées avec les membres, quantité libre, association aux appareils/entretiens, boutons tactiles pour cocher/décocher, renommage et suppression. Actualisation toutes les 10 secondes quand l’onglet est visible, sauf pendant la saisie.
- **Documents** : dépôt de PDF/JPEG/PNG/WebP, maximum 10 Mo par fichier, titre, catégorie, appareil associé, recherche, filtre et téléchargement privé. Les photos apparaissent sur la fiche de l’équipement.
- **Aperçu** : compteurs réels, prochaines tâches, retards, garanties expirant dans les 90 prochains jours, export JSON.
- **Recherche** : pièces, détails des appareils, entretiens, articles et documents. La recherche couvre les métadonnées, sans OCR ni recherche dans le contenu des fichiers.

Les animations d’entrée, de cartes et de formulaires restent légères et respectent `prefers-reduced-motion`.

## Migrations et configuration

Faire une sauvegarde cohérente de la base et du volume documents avant la mise à jour. Après fusion manuelle :

```bash
git switch main
git pull --ff-only
docker compose build
docker compose stop app
docker compose --profile tools run --rm migrate
docker compose up -d app
```

Les migrations `0001_productive_naoko.sql` et `0002_lovely_amphibian.sql` ajoutent sept tables et leurs index de foyer. Aucun effacement des données des fondations.

`DOCUMENTS_DIR` est déjà configuré par Compose (`/app/data/documents` avec volume persistant). En local, sa valeur par défaut est `./data/documents` ; le processus doit pouvoir écrire dans ce dossier. Aucun nouveau secret requis. Les Server Actions acceptent un corps de 11 Mo pour permettre un fichier de 10 Mo et ses métadonnées. Adapter aussi la limite du reverse proxy si nécessaire.

Option de connexion locale : `DATABASE_POOL_SIZE` (1 à 100, défaut 10). Le banc de test utilise 1 pour le transport PGlite ; Compose conserve le défaut.

## Comportements et limites

- Toutes les associations, lectures et mutations sont bornées au foyer choisi côté serveur. Les téléchargements et exports relisent la session et l’appartenance à chaque requête. Aucun chemin disque n’est accepté depuis le navigateur.
- Les originaux sont nommés par UUID sur disque, avec permissions restreintes. Le type est détecté par signature, jamais par le nom ou le MIME déclaré. Ce contrôle de format ne constitue pas un antivirus ou une validation exhaustive du contenu. Les PDF sont téléchargés en pièce jointe, les images seules peuvent être affichées inline ; `nosniff`, CSP sandbox et absence de cache partagé.
- La fin de mois conserve le jour d’ancrage : 31 janvier → 28/29 février → 31 mars. Les calculs portent sur des dates civiles et ne changent pas avec l’heure d’été.
- Une réalisation tardive avance une récurrence fixe jusqu’à la prochaine échéance future ; les dates sautées ne créent pas d’interventions fictives. La validation vérifie la date attendue sous verrou transactionnel pour empêcher un double enregistrement depuis un planning périmé.
- Les pièces, appareils et tâches sont archivés plutôt que supprimés pour conserver les références et l’historique. Les pièces archivées n’archivent pas leurs appareils.
- L’export JSON inclut les données structurées et les métadonnées/liens de téléchargement. Il n’inclut pas les originaux et ne remplace pas une sauvegarde base + volume. Pas d’import dans cette version.
- Pas de notifications automatiques, OCR, mode hors ligne, WebSocket ni sélection de plusieurs foyers. Le calendrier est une vue de planning par mois et par jour, sans glisser-déposer.
- La recherche et les pages chargent les données du foyer en mémoire : adapté à un foyer, pas à un catalogue de dizaines de milliers d’objets. Pas encore de pagination ni suppression/modification des documents déposés.

## Vérifications

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, puis `npm run test:e2e` (Chromium requis).

Tests PostgreSQL/PGlite : isolation des foyers, refus des associations étrangères, mutations, archivage/restauration, invalidité des dates, récurrences et fins de mois, historiques, planning périmé, listes et cascade, signatures/taille et chemins privés.

Parcours navigateur : fondations, pièce/appareil, dépôt et téléchargement, refus sans session, entretien récurrent et historique, courses entre deux membres, recherche, export, garanties, thèmes et largeur mobile, révocation immédiate de l’accès aux fichiers et à l’export.

Les captures de cette PR utilisent uniquement des données fictives dans une base et un dossier éphémères.
