# Courses fiables et exploitation de l’installation

## Courses hors ligne

Le stockage opt-in utilise IndexedDB. Chaque ajout, acquittement ou résolution lit puis écrit dans **une transaction unique**, sérialisée entre onglets. BroadcastChannel actualise les autres pages ; Web Locks coordonne la synchronisation lorsque disponible. Les identifiants de replay côté PostgreSQL restent idempotents même sans Web Locks. Les files sont séparées par compte et foyer. Déconnexion, session invalidée et restauration métier effacent les caches.

Un conflit bloque seulement les opérations du même article. Les autres articles continuent de se synchroniser. La carte de conflit montre la version serveur ; on peut abandonner les changements de cet article, ou appliquer explicitement une modification à la version actuelle. Ses opérations dépendantes sont conservées jusqu’à ce choix. Il n’y a plus de bouton qui efface toute la file pour résoudre un seul conflit.

L’ancien stockage `lehub-shopping-v1` est migré à la première ouverture. Les données restent privées sur l’appareil : désactiver la conservation sur un appareil partagé. Changer de foyer ne supprime pas les changements d’un autre foyer ; revenir au foyer concerné pour les synchroniser. Les formulaires ouverts avant un changement de foyer sont refusés côté serveur.

## Worker, SMTP et push

Appliquer `0005_legal_slyde.sql` via `npm run db:migrate` avant de redémarrer **app et worker**. Paramètres affiche le dernier signal, le dernier cycle réussi, les échecs et les 30 derniers rappels du foyer pour ses administrateurs. Un rappel en échec, y compris après cinq tentatives, peut être relancé individuellement. L’envoi et la nouvelle tentative revalident toujours le membre, ses préférences et l’échéance. Le test SMTP envoie uniquement à l’adresse du compte administrateur connecté, avec un délai minimum d’une minute entre les tests. Les erreurs affichées ne contiennent ni secrets SMTP ni adresses de destinataires.

Le worker tourne chaque minute. Le signal de vie est renouvelé toutes les 20 secondes, y compris pendant un traitement ; il faut aussi examiner le dernier cycle réussi pour détecter un traitement bloqué. Les envois sont au moins une fois : un crash après acceptation SMTP mais avant commit peut produire un doublon. Plusieurs workers peuvent partager la file grâce à `FOR UPDATE SKIP LOCKED`.

Pour les notifications navigateur :

```bash
npm run push:keys
```

Copier les clés dans `.env` et renseigner `VAPID_SUBJECT=mailto:adresse-administrateur`. Conserver la clé privée hors de Git. Redémarrer app/worker, puis activer les notifications depuis Paramètres sur chaque appareil et pour chaque foyer. HTTPS est requis hors localhost. Sur iOS, utiliser l’installation sur l’écran d’accueil si le navigateur ne propose pas PushManager. La permission est demandée uniquement après le clic de l’utilisateur. Google FCM, Firefox Mozilla et Apple sont les services acceptés ; les URL arbitraires sont refusées pour empêcher les requêtes serveur vers un réseau privé. Les notifications masquent les détails de l’entretien sur l’écran verrouillé. Les abonnements expirés sont retirés, et désactiver le dernier appareil coupe les rappels push du foyer pour ce membre.

La clé VAPID publique peut être exposée au navigateur, jamais la privée. Le test Push utilise la même limitation d’une minute que SMTP. Les envois à des fournisseurs externes réels ne font pas partie des tests locaux.

## Sauvegardes serveur régulières

Les ZIP métier restent disponibles dans Paramètres. La sauvegarde serveur inclut **tous les foyers, comptes, mots de passe hachés, sessions, invitations, préférences, configuration effective et originaux**. Elle contient donc des données privées et des secrets de configuration.

Générer une clé indépendante avec `openssl rand -hex 32`, renseigner `BACKUP_ENCRYPTION_KEY`, puis conserver cette clé dans un emplacement sûr **hors du serveur et hors des archives**. Sans cette clé, une archive n’est pas récupérable.

```bash
docker compose --profile backups build backup
docker compose --profile backups up -d backup
```

Le premier cycle démarre immédiatement. Par défaut, un cycle toutes les 24 heures et sept archives validées conservées (`BACKUP_INTERVAL_HOURS`, `BACKUP_RETENTION`). Aucun workflow CI/CD et aucun déploiement automatique. Le volume `server_backups` doit être copié régulièrement hors de la machine : le disque du serveur n’est pas une protection contre la perte du serveur.

Le processus utilise un snapshot PostgreSQL exporté, `pg_dump -Fc --snapshot`, et des verrous sur les lignes document pour empêcher leur remplacement ou purge pendant la copie des originaux. Les mutations de documents peuvent attendre pendant cette phase. Les fichiers sont hachés SHA-256 ; l’archive est chiffrée AES-256-GCM. Avant publication et rotation, le fichier chiffré final est déchiffré et restauré dans une **base jetable** ; les comptages et références aux originaux sont vérifiés. Une archive non validée ne remplace jamais les sauvegardes précédentes.

Le compte de restauration doit avoir CREATE DATABASE et pouvoir supprimer ses bases de contrôle. Par défaut, le même serveur est utilisé ; `BACKUP_TEST_POSTGRES_URL` permet de choisir un serveur de test distinct. Le client `pg_dump` Docker est PostgreSQL 17 : adapter l’image si la version majeure du serveur est supérieure. Prévoir l’espace pour la copie temporaire, le dump, l’archive et une base restaurée. L’essai n’envoie pas d’emails, ne démarre pas d’application et supprime uniquement la base aléatoire `lehub_backup_verify_*` qu’il vient de créer.

Test manuel d’une archive :

```bash
docker compose --profile backups run --rm backup node --import tsx scripts/server-backup.ts --verify /app/data/backups/NOM.enc
```

Extraction pour une restauration réelle, dans un **nouveau dossier local** avec clients PostgreSQL/Node installés et clé d’archive dans l’environnement :

```bash
npm run backup:server -- --unpack /chemin/NOM.enc --output /chemin/recuperation-neuve
```

Le dossier contient `database.dump`, `documents/`, `manifest.json` et `configuration.json`. Reconstituer `.env` à partir de cette configuration effective, puis suivre la restauration du README dans un **projet Compose distinct et des volumes neufs**. Le dump inclut toutes les tables ; ne pas lancer de worker avant d’avoir vérifié la configuration SMTP/push et choisi l’instance qui doit reprendre les rappels. Les sessions restaurées peuvent être révoquées si nécessaire. Ne pas écraser les volumes de l’instance existante. L’extraction ne restaure pas automatiquement une base de production.

## Documents, dépenses et foyers

Un PDF peut être ouvert dans la carte du document, avec téléchargement si le navigateur ne fournit pas de lecteur. La même autorisation serveur et les en-têtes privés s’appliquent à l’aperçu. L’état OCR distingue attente, traitement, succès, correction manuelle et échec, avec dates et relance. Une correction manuelle ou un remplacement invalide le résultat d’un ancien traitement ; aucun OCR en retard ne peut écraser ce texte.

Dans Entretien → Tout l’historique, filtrer par année, équipement, résultat ou texte. Les dépenses sont agrégées par équipement et année sur **tout l’historique correspondant**, indépendamment de la pagination. Les interventions ignorées et annulées n’entrent pas dans les totaux. Une correction change date, coût, notes ou résultat, conserve l’auteur et ne décale pas le planning ; les saisies annulées restent consultables. Deux corrections simultanées ne peuvent pas s’écraser.

Paramètres permet de créer/sélectionner plusieurs foyers (maximum 20 par compte), rejoindre via les invitations existantes, nommer ou rétrograder les administrateurs et retirer un autre membre. Un verrou sur le foyer sérialise les changements de rôles et garantit au moins un administrateur. L’appartenance est vérifiée à chaque requête, indépendamment du cookie de sélection. Les fichiers, recherches, exports et mutations restent limités au foyer actif.

## Validation manuelle sur une instance dédiée

Ce projet Compose a son propre PostgreSQL éphémère, un relais SMTP qui **ne transmet aucun email**, l’image de production et un validateur. Il n’utilise aucun volume ni secret de production et n’expose aucun port hôte.

```bash
docker compose -p lehub-validation -f compose.validation.yaml --profile build-only build validation application worker
docker compose -p lehub-validation -f compose.validation.yaml up --abort-on-container-exit --exit-code-from validation validation
docker compose -p lehub-validation -f compose.validation.yaml down
```

Le validateur vérifie le démarrage de l’image production, sept courses de concurrence PostgreSQL avec deux connexions, les migrations, un bootstrap, la restauration ZIP avec original, un rappel distribué via SMTP, un cycle worker, la sauvegarde serveur chiffrée et sa restauration de contrôle. Toutes les bases utilisées sont aléatoires et supprimées ; PostgreSQL de validation utilise un tmpfs. Si une étape échoue, conserver les logs avant `down`. Cette commande est manuelle et ne constitue pas une CI.

### Résultats de ce lot

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` et parcours Chromium : résultats consignés dans la PR.
- SMTP local réel : transport Nodemailer sur un socket TCP, email reçu, puis refus du même relais lorsque TLS est imposé.
- PostgreSQL natif et Docker : **non exécutés dans l’environnement de développement de cette PR**, car les exécutables ne sont pas disponibles. Le harnais fourni doit encore être lancé sur une machine de test équipée. Les tests PGlite ne remplacent pas cette validation.
- Restauration ZIP métier : testée localement ; restauration complète `pg_dump/pg_restore` et images Docker : en attente du harnais natif.
- Push : validations, autorisations et persistance testées localement ; distribution externe réelle à vérifier avec des clés VAPID et un appareil volontaire.
