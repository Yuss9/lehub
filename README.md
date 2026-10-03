# lehub

Le foyer, simplement. Application gratuite à héberger chez soi, en français, avec une interface sobre et responsive.

**Premier lot : fondations.** Comptes privés, configuration initiale, foyer, invitations, membres, paramètres, thèmes. Les pièces, équipements, entretiens, courses et documents seront livrés dans des PR distinctes : voir [la feuille de route](docs/ROADMAP.md).

## Stack

Node.js 24 LTS dans Docker, Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4, composants shadcn/ui personnalisés (Radix/CVA), Better Auth, Drizzle et PostgreSQL 17. Versions exactes dans `package.json` et `package-lock.json`. Le support de Next 16 et Drizzle 0.45 a été vérifié dans les peer dependencies de Better Auth.

Aucun service cloud, envoi d’email, abonnement, pipeline CI/CD ou déploiement automatique.

## Installation manuelle avec Docker Compose

Prérequis : Git, Docker avec Compose v2, un reverse proxy HTTPS pour l’accès distant.

```bash
git clone https://github.com/Yuss9/lehub.git
cd lehub
cp .env.example .env
chmod 600 .env
```

Générer trois valeurs **différentes** avec `openssl rand -hex 32`, puis renseigner :

| Variable | Utilisation |
| --- | --- |
| `POSTGRES_PASSWORD` | Mot de passe de la base ; utiliser la valeur hexadécimale générée pour éviter les caractères réservés d’une URL. |
| `BETTER_AUTH_SECRET` | Secret aléatoire de signature des sessions, minimum 32 caractères. |
| `SETUP_KEY` | Clé aléatoire demandée pour créer le premier administrateur. |
| `BETTER_AUTH_URL` | URL publique exacte, sans chemin : `https://lehub.example.com`, ou `http://localhost:3000` pour usage local. |
| `DATABASE_URL` | Pour les commandes locales uniquement. Compose la construit avec les variables PostgreSQL. |
| `POSTGRES_USER`, `POSTGRES_DB` | `lehub` par défaut. |
| `DOCUMENTS_DIR` | Emplacement réservé aux futurs fichiers, `/app/data/documents` dans Docker. |

Ne pas ajouter le fichier `.env` au dépôt.

```bash
docker compose build
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose up -d app
docker compose ps
```

Les migrations sont **explicites** : les appliquer avant de démarrer l’application. Aucun schéma n’est créé automatiquement par le démarrage de l’app.

Ouvrir l’URL configurée. Au premier lancement, `/setup` demande le nom du foyer, le premier compte et la clé `SETUP_KEY`. Un verrou transactionnel et un enregistrement singleton empêchent la création de plusieurs installations. Après configuration, cette page redirige vers la connexion et l’inscription publique reste désactivée. Conserver la clé hors ligne ; elle ne permet pas de refaire la configuration ni de réinitialiser un compte.

### Reverse proxy Caddy sur le même hôte

```caddyfile
lehub.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Le port de l’app est lié uniquement à `127.0.0.1` ; PostgreSQL n’est pas exposé. Si Caddy est dans un autre conteneur, joindre Caddy et `app` à un réseau Docker partagé et utiliser `reverse_proxy app:3000` ; `127.0.0.1` dans un conteneur désigne ce conteneur lui-même. Configurer `BETTER_AUTH_URL` avec l’URL HTTPS réelle, conserver le `Host` public et ne pas exposer directement l’app derrière un proxy qui accepte des en-têtes de transfert arbitraires. Les protections d’origine/CSRF restent actives.

`GET /api/health` renvoie uniquement `{"status":"ok"}` ou `{"status":"unavailable"}` (503), selon la disponibilité de la base. Il ne révèle aucune information de connexion et ne remplace pas les migrations.

### Mise à jour

Après validation et fusion manuelle de la PR :

1. Faire une sauvegarde cohérente (voir ci-dessous).
2. `git switch main` puis `git pull --ff-only`.
3. `docker compose build`.
4. `docker compose stop app`.
5. `docker compose --profile tools run --rm migrate`.
6. `docker compose up -d app`, puis vérifier `/api/health` et se connecter.

En cas d’échec de migration, laisser l’app arrêtée et examiner l’erreur. Ne pas rétrograder le code sur un schéma incompatible ; restaurer ensemble la base et les fichiers si nécessaire.

## Utilisation du premier lot

- L’administrateur personnalise le nom du foyer, la devise et le fuseau dans **Paramètres**.
- Il crée un lien d’invitation associé à un email, valable 48 heures et utilisable une seule fois. Le lien n’est montré qu’à sa création ; seule son empreinte SHA-256 est conservée. Le transmettre par le canal de son choix.
- Le destinataire crée son compte depuis le lien. S’il a déjà un compte, il se connecte puis rouvre le lien. Le rôle accordé est `member`.
- L’administrateur peut révoquer les invitations et retirer un membre. Les droits du foyer sont relus à chaque requête : retirer un membre coupe son accès au foyer sans supprimer son compte.
- Chacun peut changer son mot de passe (12 à 128 caractères) et déconnecter ses autres sessions. Il n’y a pas de récupération par email dans ce lot.
- L’apparence claire/sombre/système est conservée sur l’appareil.

Les formulaires utilisent les Server Actions de Next.js (contrôle d’origine intégré). Les routes Better Auth appliquent les protections CSRF, l’authentification et une limitation de débit stockée en base. Toutes les mutations de foyer vérifient l’appartenance et le rôle côté serveur. Les mots de passe sont hachés par Better Auth/scrypt. Les comptes provisionnés ont `emailVerified=false` : recevoir un lien partagé n’est pas une preuve de propriété de la boîte email.

## Développement local

Node.js 22 minimum, recommandé 24, npm, PostgreSQL 17. Exposer une base **de développement** sur `localhost:5432`, puis adapter `DATABASE_URL` dans `.env`.

```bash
npm ci
npm run db:migrate
npm run dev
```

Next.js lit `.env`. Le script de migration lit également `.env` si présent ; les variables déjà définies dans le processus restent prioritaires. Les données de l’application viennent toujours de PostgreSQL. Pas de seed de démonstration dans ce lot.

Après modification du schéma : `npm run db:generate`, inspecter et versionner `drizzle/`, puis `npm run db:migrate`. Ne pas remplacer les migrations par `drizzle-kit push` en production.

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Les tests d’intégration exécutent la migration et les opérations réelles via le moteur PostgreSQL de PGlite en mémoire : bootstrap unique, autorisations, isolation entre foyers, invitations expirées/révoquées/utilisées, comptes existants, inscription publique interdite, connexion, CSRF, mot de passe et déconnexion. PGlite n’est pas utilisé par l’application en production. Il ne remplace pas un test de concurrence multiconnexion sur PostgreSQL natif.

L’override ciblé `@esbuild-kit/core-utils > esbuild` corrige l’ancienne dépendance transitive de Drizzle Kit. La génération des migrations est vérifiée avec cet override ; ne pas appliquer aveuglément `npm audit fix --force`, qui propose une rétrogradation incompatible de Drizzle Kit.

## Sauvegarde et restauration

La base et le volume documents forment un ensemble. Le volume est déjà prévu, même si l’upload n’arrive qu’au lot Documents. Conserver également `.env` (secrets inclus) de façon chiffrée hors du serveur. Les sauvegardes contiennent des données privées.

### Sauvegarde cohérente

Exécuter depuis le dépôt, en réservant une fenêtre de maintenance :

```bash
mkdir -p backups
chmod 700 backups
docker compose stop app
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/database.dump
docker compose run --rm --no-deps -T --entrypoint tar app -C /app/data/documents -czf - . > backups/documents.tar.gz
cp .env backups/environment.env
chmod 600 backups/*
docker compose start app
```

Vérifier le succès de **chaque commande** avant de poursuivre, archiver le dossier sous un nom horodaté et le copier dans un emplacement sûr. Ne pas écraser la seule sauvegarde existante. `backups/` est exclu de Git.

### Restauration dans des volumes neufs

Utiliser un dossier de checkout séparé avec le même code, un fichier `.env` restauré et un nom de projet Compose distinct (`lehub-restore`). Arrêter l’ancienne app pour libérer le port 3000. Ne pas utiliser `down -v` sur le projet existant.

```bash
docker compose -p lehub-restore up -d db
docker compose -p lehub-restore exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --single-transaction' < backups/database.dump
docker compose -p lehub-restore run --rm --no-deps -T --entrypoint tar app -C /app/data/documents -xzf - < backups/documents.tar.gz
docker compose -p lehub-restore --profile tools run --rm migrate
docker compose -p lehub-restore up -d app
```

Construire les images dans ce checkout si nécessaire avant la restauration. Vérifier la connexion, les membres et les paramètres avant de considérer la restauration terminée. Garder les anciens volumes jusqu’à validation. La configuration du reverse proxy doit pointer vers cette instance. L’export utilisateur des données structurées est prévu au lot 6 ; `pg_dump` fournit dès maintenant la sauvegarde complète administrateur.

## Contributions

Lire [AGENTS.md](AGENTS.md). Une branche dédiée et une PR vers `main` par lot, avec objectif, changements, vérifications, migrations, variables et limites. Le propriétaire valide et fusionne lui-même. Aucun workflow GitHub Actions.

### Parcours navigateur et captures

Après `npm run build`, installer Chromium avec `npx playwright install chromium`, puis lancer `npm run test:e2e`. Les ports locaux 3000 et 54329 doivent être libres. Le script démarre le serveur **standalone de production** et une base PGlite éphémère dédiée, applique les migrations, teste les parcours et arrête les processus. Il ne réutilise pas la base de `.env`. Les identifiants `example.test` présents dans les tests sont fictifs et n’existent jamais dans l’installation normale.

Pour utiliser un navigateur déjà installé : `CHROMIUM_EXECUTABLE_PATH=/chemin/vers/chromium npm run test:e2e`. Les captures sont enregistrées dans `docs/screenshots/` avec les animations suspendues.
