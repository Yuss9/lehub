# lehub

**Le foyer, simplement.** Application gratuite et privée à héberger chez soi : pièces, équipements, garanties, entretiens récurrents, courses partagées hors ligne et documents avec OCR. Interface française, thèmes clair/sombre et installation sur téléphone.

Next.js 16 · React 19 · Better Auth · Drizzle · PostgreSQL 17 · Docker Compose. Les versions exactes sont verrouillées dans `package-lock.json`. Aucun service cloud métier obligatoire, aucune inscription publique. L'installation personnelle reste manuelle ; une [démo NAS avec CI/CD et GHCR](docs/NAS-DEMO.md) est disponible séparément.

## Sommaire

- [Démarrer en 10 minutes](#démarrer-en-10-minutes)
- [Choisir son reverse proxy](#choisir-son-reverse-proxy)
- [Fichiers Compose et services](#fichiers-compose-et-services)
- [Configurer le fichier .env](#configurer-le-fichier-env)
- [Emails, notifications et téléphone](#emails-notifications-et-téléphone)
- [Sauvegardes locales et hors serveur](#sauvegardes-locales-et-hors-serveur)
- [Surveillance et alertes](#surveillance-et-alertes)
- [Valider une installation réelle](#valider-une-installation-réelle)
- [Mettre à jour](#mettre-à-jour)
- [Restaurer ou récupérer un compte](#restaurer-ou-récupérer-un-compte)
- [Dépannage](#dépannage)
- [Développement](#développement)

## Démarrer en 10 minutes

Prévoir une machine Linux ou un NAS avec Git, **Docker Engine et Compose v2**, de l’espace pour les documents et les sauvegardes. Un domaine et HTTPS sont nécessaires pour l’accès distant et les notifications push. Les ports 80/443 doivent être libres si tu choisis le Caddy fourni. Le PostgreSQL inclus reste privé : ne pas publier son port.

```bash
git clone https://github.com/Yuss9/lehub.git
cd lehub
```

Générer `.env` avec des secrets indépendants et une paire de clés VAPID. Cette commande ne nécessite pas Node installé sur l’hôte, ne montre aucun secret et **refuse d’écraser un fichier existant** :

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work node:24-bookworm-slim \
  node scripts/configure-env.mjs \
  --url https://lehub.example.com --email toi@example.com
```

Avec Node 22 minimum (24 recommandé), utiliser plutôt :

```bash
node scripts/configure-env.mjs --url https://lehub.example.com --email toi@example.com
```

Pour un essai limité à la machine locale : `--url http://localhost:3000`. Remplacer les domaines et adresses d’exemple par les tiens. La génération fonctionne sans `npm install`. Sinon, copier `.env.example` dans `.env`, puis générer **séparément** `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `SETUP_KEY`, `BACKUP_ENCRYPTION_KEY` et `OPERATIONS_HEALTH_TOKEN` avec `openssl rand -hex 32` ; ne pas réutiliser une valeur. Conserver `.env` en mode 600 et ne jamais le committer.

Vérifier la configuration sans imprimer les secrets, construire les images, migrer puis démarrer :

```bash
docker compose config --quiet
docker compose build app worker migrate
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose up -d app worker
docker compose ps
```

Les migrations sont explicites. **Ne pas démarrer l’app sur une base non migrée.** Ouvrir `http://localhost:3000` pour un essai local, ou configurer le proxy ci-dessous pour un domaine HTTPS. `/setup` demande le nom du foyer, ton email, ton mot de passe et la valeur `SETUP_KEY` du fichier privé `.env`. La clé ne permet que la création du premier administrateur ; après cette étape, l’inscription publique reste désactivée.

Sur un serveur distant, `localhost` désigne le serveur. Pour un essai sans domaine, utiliser un tunnel `ssh -L 3000:127.0.0.1:3000 utilisateur@serveur`, puis ouvrir `http://localhost:3000` sur ton ordinateur. Ne pas rendre le port 3000 public pour contourner le proxy.

## Choisir son reverse proxy

### A. Caddy fourni : HTTPS automatique

Faire pointer le DNS du domaine vers la machine, autoriser 80/443 et définir dans `.env` :

```dotenv
BETTER_AUTH_URL=https://lehub.example.com
LEHUB_DOMAIN=lehub.example.com
```

```bash
docker compose -f compose.yaml -f compose.caddy.yaml config --quiet
docker compose -f compose.yaml -f compose.caddy.yaml up -d app worker caddy
docker compose -f compose.yaml -f compose.caddy.yaml logs --tail=100 caddy
```

`deploy/Caddyfile` transmet les requêtes à `app:3000`. Les certificats sont conservés dans `caddy_data` ; ne pas supprimer ce volume lors des mises à jour. Ne pas activer ce Caddy si un autre service occupe déjà 80/443.

### B. Caddy, Nginx ou proxy Synology sur l’hôte

L’app écoute sur `127.0.0.1:3000`. Configurer un site HTTPS dont la destination est `http://127.0.0.1:3000` et conserver le nom d’hôte public. Exemple Caddy :

```caddyfile
lehub.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Sur Synology, utiliser Container Manager avec les fichiers du projet, puis le reverse proxy du NAS avec HTTPS en entrée et `127.0.0.1:3000` en sortie. `BETTER_AUTH_URL` doit correspondre à l’URL réellement ouverte dans le navigateur. Ne pas exposer PostgreSQL, et ne pas désactiver les contrôles d’origine pour corriger une mauvaise URL.

### C. Proxy dans un autre projet Docker

Définir `PROXY_NETWORK=web` dans `.env`. Si ce réseau n’existe pas encore :

```bash
docker network create web
docker compose -f compose.yaml -f compose.proxy.yaml config --quiet
docker compose -f compose.yaml -f compose.proxy.yaml up -d app worker
```

Joindre également le conteneur du proxy à `web`. Sa destination est **`lehub-app:3000`**, par exemple `reverse_proxy lehub-app:3000` dans Caddy. Dans un conteneur, `127.0.0.1` désigne ce conteneur, pas l’hôte. Seule l’app rejoint le réseau externe ; base et worker restent sur le réseau interne du projet. Utiliser un alias distinct si plusieurs instances lehub partagent le même réseau.

Conserver le même nom de projet Compose, les mêmes fichiers `-f` et le même répertoire pour les commandes suivantes. Ajouter les profils `backups`/`monitoring` aux commandes utilisant ton proxy si tu actives ces services. Les options A et C sont des alternatives.

## Fichiers Compose et services

| Fichier | Usage |
| --- | --- |
| `compose.yaml` | Installation complète : PostgreSQL, app, worker et services optionnels. |
| `compose.caddy.yaml` | À combiner avec le précédent pour fournir HTTPS. |
| `compose.proxy.yaml` | À combiner avec le précédent pour rejoindre un proxy Docker existant. |
| `compose.validation.yaml` | **Projet de test distinct**, base jetable, SMTP local et validateur. Aucun volume de production. |

| Service | Démarrage | Rôle / données persistantes |
| --- | --- | --- |
| `db` | Normal | PostgreSQL 17 ; volume `postgres_data`. |
| `app` | Normal | UI et fichiers privés ; volume `documents`, UID/GID 1001. |
| `worker` | Normal | OCR, rappels et purge ; même volume `documents`, UID/GID 1001. |
| `migrate` | Profil `tools`, commande ponctuelle | Migrations versionnées. |
| `backup` | Profil `backups` | Archives chiffrées, restauration de contrôle, copie distante ; `server_backups`. |
| `monitor` | Profil `monitoring` | Alertes de panne/rétablissement du worker et des sauvegardes. |
| `caddy` | Fichier Caddy | Certificats `caddy_data`, configuration `caddy_config`. |

Les volumes nommés sont préfixés par le projet Compose. Conserver leur nom en déplaçant le checkout. Ne pas utiliser `docker compose down -v` pour une mise à jour.

## Configurer le fichier .env

`.env.example` est la référence exhaustive. `.env` est lu par Compose ; `DATABASE_URL` y concerne uniquement les commandes locales. Compose construit lui-même la connexion des conteneurs à `db`. Les valeurs SMTP contenant `$`, `#` ou espaces doivent être entourées de **guillemets simples** dans `.env`, par exemple `SMTP_PASSWORD='valeur$privée'`.

| Variables | Valeur / rôle |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_DB` | `lehub` par défaut. |
| `POSTGRES_PASSWORD` | Secret hexadécimal généré ; ne pas changer seul après création du volume PostgreSQL. |
| `BETTER_AUTH_URL` | Origine exacte, sans chemin : `https://lehub.example.com`. HTTP seulement pour localhost. |
| `BETTER_AUTH_SECRET` | Secret stable de 32 caractères minimum. Signe les sessions et chiffre les données 2FA ; le sauvegarder. |
| `SETUP_KEY` | Secret indépendant pour le premier compte. |
| `LEHUB_DOMAIN`, `PROXY_NETWORK` | Nom du site Caddy, ou réseau du proxy existant (`web`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | Serveur, port 587 STARTTLS ou 465 TLS direct, expéditeur autorisé. |
| `SMTP_USER`, `SMTP_PASSWORD` | Identifiants du fournisseur ; vides seulement pour un relais autorisé sans authentification. |
| `SMTP_ALLOW_PLAINTEXT` | `false` en exploitation. `true` uniquement pour un relais local de test isolé. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Paire stable et contact `mailto:toi@example.com` ou URL HTTPS. Générées par `setup:env`, ou `npm run push:keys` après `npm ci`. |
| `OCR_ENABLED` | `true`. L’image worker inclut Poppler et Tesseract français/anglais. |
| `OCR_BATCH_SIZE`, `OCR_CONCURRENCY` | 10 documents/cycle et 2 traitements ; bornes 1–100 et 1–4. |
| `BACKUP_ENCRYPTION_KEY` | Clé indépendante de 64 caractères hexadécimaux, indispensable au profil backups. La conserver aussi hors serveur. |
| `BACKUP_INTERVAL_HOURS`, `BACKUP_RETENTION` | 24 heures et 7 archives locales validées par défaut. |
| `BACKUP_REMOTE`, `BACKUP_CONFIG_DIR` | Destination rclone facultative, dossier `./backup-config` avec configuration privée. |
| `BACKUP_TEST_POSTGRES_URL` | Facultatif : serveur distinct pour les restaurations de contrôle, droit CREATE DATABASE requis. |
| `MONITOR_BACKUPS` | `true` uniquement si backup tourne réellement. |
| `OPERATIONS_ALERT_URL`, `OPERATIONS_ALERT_TOKEN` | Relais HTTPS compatible ntfy ; token envoyé en Bearer. |
| `OPERATIONS_HEALTH_TOKEN` | Secret indépendant de 32 caractères minimum pour la surveillance extérieure. |
| `DATABASE_URL`, `DOCUMENTS_DIR`, `SERVER_BACKUPS_DIR` | Chemins/connexion des commandes locales. Les chemins Docker sont fixés par Compose. |
| `TEST_POSTGRES_URL` | Serveur dédié aux tests de concurrence, jamais la base de production. |

Après modification des variables, recréer les services concernés avec `docker compose up -d app worker` et, s’ils sont activés, backup/monitor. Un simple `restart` ne recharge pas l’environnement Compose.

## Emails, notifications et téléphone

### SMTP réel

```dotenv
SMTP_HOST=smtp.ton-fournisseur.example
SMTP_PORT=587
SMTP_FROM='lehub <notifications@ton-domaine.example>'
SMTP_USER=notifications@ton-domaine.example
SMTP_PASSWORD='REMPLACER_PAR_LE_SECRET_DU_FOURNISSEUR'
SMTP_ALLOW_PLAINTEXT=false
```

Recréer app/worker, puis ouvrir **Paramètres → Exploitation → Envoyer un email de test à mon adresse**. Seul l’administrateur connecté peut demander ce test, à sa propre adresse. Vérifier réellement sa réception, les indésirables et les journaux SMTP. « Envoyé » signifie accepté par le serveur SMTP, pas lu ni forcément déposé dans la boîte. Activer les rappels et choisir le délai dans **Notifications**. Sans SMTP, les rappels email et la récupération par email ne sont pas distribués ; la récupération locale reste disponible.

### Push et iPhone

Sur HTTPS, ouvrir **Paramètres → Notifications** : installer lehub sur l’écran d’accueil, activer les notifications, puis toucher **Tester**. Sur iPhone, effectuer cette activation depuis l’app installée. Une autorisation refusée doit être corrigée dans les réglages du navigateur/appareil. Ne pas remplacer les clés VAPID lors de chaque redémarrage.

Un abonnement appartient à une session et un foyer. Déconnexion/révocation coupe les inscriptions de cette session. Les rappels gardent un reçu par appareil : une erreur temporaire sur un second appareil reste à relancer, même si le premier a été servi. Un crash après acceptation par le fournisseur peut toutefois produire un doublon ; une acceptation fournisseur ne prouve pas l’affichage sur l’écran.

Pour les courses hors ligne, activer la conservation dans Courses, puis vérifier les ajouts/cochages sans réseau et leur synchronisation au retour. Les caches sont privés par compte/foyer. La déconnexion les efface : synchroniser les changements en attente avant de quitter le compte. La désactivation avec changements en attente demande confirmation pour le foyer concerné.

### Double authentification

Dans **Paramètres → Compte et appareils**, configurer la 2FA, scanner le QR code généré localement, conserver les codes de secours puis confirmer un code temporaire. L’activation n’est effective qu’après cette confirmation. Les autres sessions sont révoquées par le parcours ; vérifier la liste si une erreur réseau interrompt cette étape. Aucun service QR externe ne reçoit la clé.

La connexion exige ensuite mot de passe + TOTP, ou un code de secours à usage unique. La récupération du mot de passe par email **ne désactive pas la 2FA**. Sauvegarder les codes et `BETTER_AUTH_SECRET`, nécessaire au déchiffrement des données 2FA. Cette version fournit TOTP, pas les passkeys.

## Sauvegardes locales et hors serveur

L’export ZIP depuis le dashboard ou Exploitation comprend données métier et originaux. Il ne remplace pas une sauvegarde serveur : comptes, sessions, configuration et données 2FA font partie de la sauvegarde intégrale PostgreSQL.

```dotenv
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION=7
MONITOR_BACKUPS=true
```

```bash
mkdir -p backup-config
docker compose --profile backups build backup
docker compose --profile backups up -d backup app
docker compose --profile backups logs --tail=100 backup
```

Chaque archive inclut un snapshot PostgreSQL cohérent, les originaux et la configuration effective ; elle est chiffrée AES-256-GCM. **Avant rotation**, le service déchiffre l’archive finale et restaure dans une base jetable pour contrôler tables et fichiers. Le compte doit pouvoir créer/supprimer ces bases de contrôle ; le PostgreSQL inclus le permet. Prévoir l’espace pour l’archive, la copie temporaire et une base restaurée.

### Copier vers une autre machine

Créer `backup-config/rclone.conf`, par exemple avec [le modèle SFTP](deploy/rclone.sftp.conf.example), et `known_hosts` avec la clé du serveur vérifiée auprès de son administrateur. Configurer :

```dotenv
BACKUP_REMOTE=offsite:/chemin/absolu/lehub
BACKUP_CONFIG_DIR=./backup-config
```

Le service tourne avec UID/GID 1001. Sur Linux, réserver le dossier/fichier à cet utilisateur :

```bash
sudo chown -R 1001:1001 backup-config
sudo chmod 700 backup-config
sudo chmod 600 backup-config/rclone.conf backup-config/known_hosts
docker compose --profile backups up -d backup app
```

Ne pas écrire les identifiants dans Git. Le fichier rclone fait partie de l’archive chiffrée lorsqu’il est utilisé. `rclone obscure` est réversible : ce n’est pas un chiffrement protecteur du fichier de configuration.

Le service relit entièrement la copie distante et compare SHA-256 avant de déclarer un succès. La destination doit se trouver sur **une autre machine** ; une copie sur le même disque ne protège pas contre la perte du serveur. La rétention automatique ne concerne que les archives locales : régler séparément rétention/versioning du stockage distant.

Récupérer périodiquement une vraie copie distante dans le volume de contrôle, puis vérifier sa restauration :

```bash
docker compose --profile backups run --rm --entrypoint rclone backup \
  copyto offsite:/chemin/absolu/lehub/NOM.enc /app/data/backups/recuperee.enc
docker compose --profile backups run --rm backup \
  node --import tsx scripts/server-backup.ts --verify /app/data/backups/recuperee.enc
```

Remplacer `NOM.enc` par une archive existante. Cette vérification crée une base temporaire et n’écrase pas la base active. Conserver la clé d’archive **séparément**, sinon une sauvegarde peut devenir irrécupérable.

## Surveillance et alertes

```dotenv
OPERATIONS_ALERT_URL=https://ntfy.ton-domaine.example/lehub-operations
OPERATIONS_ALERT_TOKEN='SECRET_DU_RELAIS'
MONITOR_BACKUPS=true
```

```bash
docker compose --profile monitoring build monitor
docker compose --profile monitoring up -d monitor app
docker compose --profile monitoring logs --tail=100 monitor
```

Le moniteur signale panne et rétablissement, avec rappel horaire au maximum. Le délai attendu des sauvegardes suit leur intervalle configuré. Activer `MONITOR_BACKUPS` seulement si backup fonctionne.

Pour détecter la disparition de la machine elle-même, utiliser **Uptime Kuma sur une autre machine** :

- URL `https://lehub.example.com/api/operations/health` ;
- en-tête `Authorization: Bearer VALEUR_OPERATIONS_HEALTH_TOKEN` ;
- réponse attendue 200 ; 503 indique panne/retard, 401 indique un mauvais token ;
- protéger le token dans la configuration privée de Kuma.

Le endpoint ne révèle que `ok`/`unavailable`. `/api/health` vérifie uniquement la base ; il ne remplace pas le suivi worker/backups. Sur une instance **de test**, arrêter le worker pour vérifier l’alerte, puis le redémarrer pour vérifier le rétablissement. Ne pas provoquer une panne sur la production pour une recette.

## Valider une installation réelle

Le harnais Docker utilise ses propres services jetables, sans ports hôtes ni volumes de production :

```bash
docker compose -p lehub-validation -f compose.validation.yaml \
  --profile build-only build validation application worker
docker compose -p lehub-validation -f compose.validation.yaml \
  up --abort-on-container-exit --exit-code-from validation validation
docker compose -p lehub-validation -f compose.validation.yaml logs --no-color
docker compose -p lehub-validation -f compose.validation.yaml down
```

Conserver les journaux avant `down`. Le validateur contrôle migrations, démarrage de l’image, concurrence avec connexions PostgreSQL distinctes, export/restauration ZIP, SMTP local, worker et sauvegarde chiffrée avec `pg_dump/pg_restore`. Le relais SMTP de ce harnais **ne distribue pas d’emails à l’extérieur** et les fournisseurs push sont simulés.

Compléter avec [la recette réelle](docs/ACCEPTANCE.md) pour SMTP TLS, push VAPID sur appareils volontaires, stockage distant et Safari/iPhone. **Un test local ou WebKit Linux ne prouve pas une réception sur téléphone.** Les résultats et limites de la validation locale sont consignés dans la PR et [RELIABILITY.md](docs/RELIABILITY.md).

## Mettre à jour

Faire une sauvegarde vérifiée et conserver ses secrets. Ne pas régénérer `.env`.

```bash
git switch main
git pull --ff-only
docker compose build app worker migrate
docker compose stop app worker
docker compose --profile tools run --rm migrate
docker compose up -d app worker
docker compose ps
```

Adapter ces commandes avec les mêmes fichiers `-f` et profils que l’installation. **Arrêter/reconstruire aussi backup et monitor s’ils tournent** : ils partagent le schéma et du code. Lire les instructions du lot avant migration ; ne pas redémarrer si elle échoue et ne pas rétrograder le code sur un schéma incompatible.

Cette livraison ajoute **0007_calm_jackal.sql**, la table 2FA et le flag compte. Les comptes existants gardent la 2FA désactivée jusqu’à leur activation volontaire. Si tu viens d’une version antérieure à 0006, cette migration retire les anciens abonnements push : les réactiver sur chaque foyer/appareil. Voir [RELIABILITY.md](docs/RELIABILITY.md).

## Restaurer ou récupérer un compte

### Restauration intégrale

Extraire une archive chiffrée avec Node/clients PostgreSQL sur une machine dédiée, dans un **nouveau dossier**, avec la clé d’archive dans l’environnement :

```bash
npm ci
npm run backup:server -- --unpack /chemin/NOM.enc --output /chemin/recuperation-neuve
```

La configuration privée extraite permet de reconstituer `.env`. Restaurer ensemble `database.dump`, `documents/`, configuration et éventuel `rclone.conf`. Utiliser le code correspondant à l’archive, **un projet Compose distinct et des volumes neufs** ; arrêter l’ancienne app pour libérer le port :

```bash
docker compose -p lehub-restore build app worker migrate
docker compose -p lehub-restore up -d db
docker compose -p lehub-restore exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --single-transaction' \
  < /chemin/recuperation-neuve/database.dump
```

Créer une archive des originaux puis la charger dans le volume neuf :

```bash
tar -C /chemin/recuperation-neuve/documents -czf /chemin/documents-restauration.tar.gz .
docker compose -p lehub-restore run --rm --no-deps -T --entrypoint tar app \
  -C /app/data/documents -xzf - < /chemin/documents-restauration.tar.gz
docker compose -p lehub-restore --profile tools run --rm migrate
docker compose -p lehub-restore up -d app
```

Vérifier comptes, 2FA, membres, documents et paramètres avant de démarrer le worker et de basculer le proxy. Choisir quelle instance reprendra les rappels pour éviter deux distributions. Garder les anciens volumes jusqu’à validation et révoquer les sessions restaurées si nécessaire. L’extraction seule ne restaure pas une production. Voir aussi [OPERATIONS.md](docs/OPERATIONS.md).

### Mot de passe ou téléphone perdu

Le lien email est personnel et valable 30 minutes. Sans SMTP, un opérateur disposant de l’accès au serveur peut générer un lien privé :

```bash
docker compose exec worker npm run account:recover -- toi@example.com
```

Ne pas partager les journaux contenant ce lien. Si le téléphone **et tous les codes de secours** sont perdus, la réinitialisation email conserve la 2FA. L’opérateur peut explicitement la retirer et révoquer les sessions avant récupération :

```bash
docker compose exec worker npm run account:recover -- toi@example.com --reset-two-factor
```

Cette option n’existe pas dans une route publique. Réactiver la 2FA après récupération. L’accès au serveur reste donc un accès administratif sensible.

## Dépannage

| Symptôme | Vérification |
| --- | --- |
| Erreur Compose « Set … » | `.env` au bon endroit et secrets obligatoires remplis ; `config --quiet`. |
| 502 / app inaccessible | `docker compose ps`, logs app/db, migrations réussies, bonne destination du proxy. |
| Connexion refusée / erreur d’origine | URL publique exacte dans `BETTER_AUTH_URL`, HTTPS et Host conservés. Ne pas désactiver CSRF. |
| Mot de passe DB changé dans `.env` | PostgreSQL n’applique pas un nouveau mot de passe à un volume déjà initialisé ; restaurer la bonne configuration ou procéder à un changement SQL explicite. |
| OCR immobile | Worker actif, volume documents partagé, `OCR_ENABLED=true`, état du document et logs worker. |
| Email absent | SMTP TLS, expéditeur autorisé, identifiants, indésirables ; test dans Exploitation. |
| Push iPhone absent | HTTPS, app installée, permission accordée, clés stables et abonnement actif de cette session/foyer. |
| Backup en échec | Clé indépendante, espace disque, droits CREATE DATABASE, droits UID 1001 et rclone ; voir Exploitation. |
| Alerte backups injustifiée | N’activer `MONITOR_BACKUPS` que lorsque backup est démarré ; contrôler intervalle et dernier cycle. |
| Code TOTP refusé | Horloge du serveur et du téléphone synchronisées, bon compte dans l’application ; essayer un code de secours. |

```bash
docker compose logs --tail=100 app worker db
docker compose --profile backups logs --tail=100 backup
docker compose --profile monitoring logs --tail=100 monitor
```

Ne pas publier `.env`, URI TOTP, codes de secours, dumps, fichiers privés ou liens de récupération dans un ticket.

## Développement

Node 22 minimum, 24 recommandé, PostgreSQL 17 de développement. `DATABASE_URL` pointe vers cette base ; adapter `DOCUMENTS_DIR` à un dossier local writable.

```bash
npm ci
npm run db:migrate
npm run dev
# Autre terminal :
npm run worker
```

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npx playwright install chromium
npm run test:e2e
```

Les tests navigateur démarrent le serveur standalone et une base PGlite **jetable**, jamais la base de `.env`. Ports locaux 3000, 3001 et 54329 libres. Chromium existant : `CHROMIUM_EXECUTABLE_PATH=/chemin/chromium npm run test:e2e`. WebKit : `npx playwright install --with-deps webkit`, puis `LEHUB_BROWSER=webkit npm run test:e2e`. Les captures et comptes fictifs de tests ne sont jamais ajoutés à la production.

PGlite n’est pas une validation native : `TEST_POSTGRES_URL=postgresql://… npm run test:postgres` crée/supprime sa propre base de test, avec deux connexions concurrentes. Ne pas lui fournir la production. Les mises à jour de schéma passent par `npm run db:generate`, inspection/versionnement de `drizzle/`, puis migrations explicites. Ne pas utiliser `drizzle-kit push` en production ni appliquer aveuglément `npm audit fix --force`.

Contributions : lire [AGENTS.md](AGENTS.md), branche dédiée, PR vers main, tests, captures et instructions de migration. Le propriétaire valide et fusionne ; le workflow NAS déploie uniquement la démo dans public-sites après fusion sur main. Voir [ROADMAP.md](docs/ROADMAP.md) et [HOME-MODULES.md](docs/HOME-MODULES.md).

Références officielles : [variables Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/), [HTTPS avec Caddy](https://caddyserver.com/docs/quick-starts/https), [2FA Better Auth](https://better-auth.com/docs/plugins/2fa).

