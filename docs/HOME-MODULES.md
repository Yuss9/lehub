# Modules du foyer

## Utilisation

- **Pièces et équipements** : formulaires avec contrôle de version, archivage, filtres et pagination. Chaque équipement possède une fiche réunissant ses photos, documents, entretiens et interventions. Le prix d’achat est conservé en centimes ; vendeur et tags sont recherchables.
- **Entretien** : récurrences fixes ou depuis réalisation, calendrier mensuel avec dates prévisionnelles, report d’une échéance, occurrence ignorée, réalisation datée et coût. Ajouter une intervention passée conserve le planning courant. L’historique montre l’auteur, le titre au moment de l’intervention et le coût.
- **Courses** : plusieurs listes partagées, état coché explicite, modification du nom/quantité/catégorie, regroupement, associations aux équipements/entretiens, retrait des achats et restauration des suppressions. Les listes peuvent être renommées ou rétablies depuis le panneau de gestion.
- **Documents** : PDF/JPEG/PNG/WebP privés, 10 Mo maximum par fichier ; modification du titre, des tags, de la catégorie et de l’association, remplacement de l’original, suppression et restauration. La corbeille interdit immédiatement le téléchargement. Le worker supprime définitivement les documents après 30 jours.
- **Recherche et aperçu** : requêtes SQL limitées aux modules utiles, compteurs réels, garanties, pagination de 20 résultats et recherche dans les tags et le texte extrait des documents. Le calendrier projette les récurrences ; les dates futures restent indicatives.
- **Mobile** : navigation inférieure avec menu « Plus », installation sur l’écran d’accueil et courses hors ligne après activation volontaire sur l’appareil. Les animations respectent la préférence de réduction des mouvements.

## Concurrence et mode hors ligne

Les modifications des pièces, équipements, documents, listes, articles et entretiens comparent la révision du formulaire à celle de la base. Un ancien formulaire reçoit un message demandant d’actualiser, sans écraser la nouvelle version. La réalisation d’un entretien verrouille la tâche et compare aussi l’échéance attendue. Modifier les consignes d’un entretien arrivé au 28 février conserve son ancrage au 31 si la date n’a pas été changée.

Cocher un achat enregistre `checked=true` ; deux membres cochant une ancienne vue ne décochent donc plus l’article. Une action volontaire contraire reste autorisée : le dernier état demandé prévaut. Les identifiants de mutation rendent les reprises de synchronisation idempotentes.

La conservation hors ligne est désactivée par défaut. Elle stocke uniquement les listes, articles, associations et changements en attente du compte actif dans la mémoire locale du navigateur. Au retour de la connexion, le serveur relit la session, le foyer et les associations avant chaque écriture. Les conflits de modification demandent d’annuler les changements en attente et de reprendre la saisie depuis la version du serveur. La déconnexion ou une réponse d’accès refusé efface le cache. Un changement de compte ne rejoue jamais l’ancienne file.

Le service worker ne conserve ni pages privées, ni API, ni documents. Il met en cache uniquement la page publique `/offline`, son code et les ressources publiques. Une navigation sans réseau ouvre cette page. Les données volontairement conservées restent lisibles sur l’appareil hors ligne : désactiver la conservation sur un appareil partagé. Les droits révoqués sont détectés au prochain contact avec le serveur. La création et la gestion des listes demandent une connexion ; les articles fonctionnent hors ligne.

## Rappels, OCR et récupération d’accès

Configurer `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` et, si nécessaire, `SMTP_USER`/`SMTP_PASSWORD`. Le port 465 utilise TLS direct ; les autres ports exigent STARTTLS, sauf `SMTP_ALLOW_PLAINTEXT=true` pour un relais local explicitement choisi. Les secrets restent dans `.env`.

Chaque membre choisit ses rappels dans Paramètres : activation volontaire et délai de 0 à 90 jours. Le worker vérifie les échéances toutes les minutes, déduplique par destinataire/objet/date et effectue jusqu’à cinq tentatives SMTP. Les accès retirés, les rappels désactivés et les anciennes échéances sont contrôlés avant envoi. Comme tout envoi SMTP, un crash après acceptation de l’email et avant validation en base peut produire un doublon. Ce lot fournit les rappels par email ; aucune permission de notification push n’est demandée.

Le lien « Mot de passe oublié » donne toujours une réponse générique. Les demandes sont limitées par IP et email. Seule l’empreinte du jeton aléatoire est stockée, avec une expiration de 30 minutes. La réinitialisation est à usage unique et révoque les sessions. Sans SMTP, un opérateur possédant l’accès au serveur peut créer un lien avec :

```bash
docker compose run --rm --no-deps worker npm run account:recover -- administrateur@example.com
# Ou en local, avec DATABASE_URL et BETTER_AUTH_URL configurés :
npm run account:recover -- administrateur@example.com
```

Ne pas communiquer ce lien dans des journaux publics. La clé de configuration initiale ne sert pas de clé de récupération.

Le worker extrait les PDF textuels via Poppler et reconnaît les images/scans avec Tesseract français/anglais. Maximum dix pages PDF, 30 secondes par commande et 200 000 caractères. Les résultats dépendent de la qualité des scans. Une erreur est visible sur le document et peut être relancée. `OCR_ENABLED=false` désactive cette extraction. Le conteneur worker embarque Poppler et Tesseract ; en local, installer ces programmes et leurs langues.

```bash
npm run worker
npm run worker -- --once
```

## Sauvegarde et restauration

Paramètres et l’aperçu proposent une archive ZIP version 2 : données structurées et tous les originaux, y compris la corbeille. `/api/export` est désormais un alias de `/api/backup` et renvoie du ZIP. Aucun chemin disque, mot de passe, jeton, session ou invitation n’est exporté.

La restauration est réservée aux administrateurs. Une première étape vérifie le manifeste, les identifiants, les associations, les tailles et les empreintes SHA-256. Après aperçu, il faut écrire `RESTAURER` pour remplacer les données du foyer. Les comptes, accès et préférences personnelles de rappel sont conservés ; les auteurs antérieurs restent mentionnés dans les comptes rendus. Les identifiants métiers et clés de stockage sont régénérés pour empêcher les collisions. Les nouveaux fichiers sont préparés avant la transaction ; les anciens sont retirés après validation. Les données d’un autre foyer ne sont jamais remplacées.

Limites explicites : archive compressée 100 Mo, contenu décompressé 250 Mo, 2 000 entrées, manifeste 10 Mo, 10 Mo par original et 50 000 lignes par catégorie. Pour une installation plus grande ou une restauration intégrale des comptes, conserver la méthode `pg_dump` + volume décrite dans README. Une sauvegarde volumineuse est refusée, jamais tronquée. Un échec de nettoyage disque après validation peut laisser un fichier orphelin ; une sauvegarde serveur reste nécessaire.

## Mise à jour manuelle

Après fusion par le propriétaire, sauvegarder ensemble la base et les fichiers, puis :

```bash
git switch main
git pull --ff-only
docker compose build
docker compose stop app worker
docker compose --profile tools run --rm migrate
docker compose up -d app worker
```

Les migrations `0003_overconfident_human_torch.sql` et `0004_numerous_nightcrawler.sql` ajoutent les révisions, corbeilles, détails d’achat/intervention, OCR et tables de récupération/rappels/reprise hors ligne. Elles initialisent les révisions à zéro et remplissent les titres des anciens comptes rendus, sans supprimer les données.

Les fichiers restent dans `DOCUMENTS_DIR`, partagé entre app et worker avec le même utilisateur Docker. Les formulaires de dépôt utilisent la limite Next de 11 Mo. La route de restauration limite son propre flux à 101 Mo avec l’enveloppe multipart ; adapter aussi la limite et le délai du reverse proxy. Les archives sont traitées en mémoire : prévoir de la mémoire disponible et éviter les restaurations simultanées. Ne pas rétrograder le code sans restaurer un ensemble base/fichiers cohérent.

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
TEST_POSTGRES_URL=postgresql://… npm run test:postgres
```

Les tests en mémoire utilisent PGlite uniquement dans les tests. La suite PostgreSQL natif ouvre deux connexions et deux comptes, crée une base jetable `lehub_concurrency_<uuid>`, applique les migrations et vérifie les modifications/validations concurrentes, les achats explicites, les reprises idempotentes et le conflit suppression/modification. L’URL doit viser un serveur de test avec le droit CREATE DATABASE ; sa base existante n’est jamais migrée ni effacée. La base créée est supprimée à la fin. Aucun pipeline CI ou déploiement automatique.

Les captures utilisent exclusivement des données fictives dans une base et un dossier temporaires. Le modèle conserve la sélection déterministe d’un seul foyer ; le sélecteur de foyer et le glisser-déposer dans le calendrier restent des évolutions distinctes.
