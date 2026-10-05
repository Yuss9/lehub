# Appareils, changements locaux et surveillance

## Mise à jour

Arrêter app et worker, appliquer la migration **0006_burly_liz_osborn.sql** avec `npm run db:migrate`, puis redémarrer app, worker et, s’ils sont configurés, backup et monitor. Ne pas revenir à l’ancien code sur le nouveau schéma.

Les anciens abonnements push n’avaient pas de propriétaire de session fiable : la migration les retire et désactive leur préférence. **Réactiver les notifications sur chaque appareil et foyer** après la mise à jour. Les comptes, documents et changements de courses ne sont pas supprimés par cette migration.

## Courses hors ligne

La désactivation concerne uniquement le compte et foyer affichés. S’il reste des mutations, une confirmation affiche leur nombre. Annuler conserve la file ; confirmer retire ce foyer. Les autres foyers restent présents. La comparaison des identifiants et l’effacement partagent une transaction IndexedDB : une mutation ajoutée dans un autre onglet après l’ouverture de la confirmation exige une nouvelle confirmation.

Une marque de désactivation empêche un acquittement tardif de recréer la file effacée à partir d’un ancien état. Réactiver la conservation lève cette marque explicitement. Déconnexion, session invalidée et restauration métier continuent d’effacer tous les caches pour protéger un appareil partagé. Un effacement local ne retire pas une modification déjà acceptée par le serveur.

## Sessions et notifications

Paramètres affiche jusqu’à 100 sessions actives et 100 inscriptions push du compte connecté, sans exposer leurs tokens ni leurs clés. Une session distante peut être révoquée ; la session courante se termine par Déconnexion. Retirer un appareil de notification concerne tous les foyers de ce compte pour le même endpoint.

Chaque inscription push est rattachée à une session vivante. Supprimer ou révoquer cette session supprime ses inscriptions en cascade. La déconnexion tente aussi de désinscrire le navigateur ; l’effacement serveur reste effectif si cette tentative échoue. Les sessions expirées ne sont jamais destinataires et sont purgées par le worker. Réutiliser un endpoint sur un autre compte transfère sa propriété sous verrou PostgreSQL, sans conserver l’ancien compte comme destinataire.

Pour chaque rappel, une empreinte SHA-256 de l’endpoint identifie l’appareil sans exposer son URL dans les reçus. Une acceptation par le fournisseur est conservée ; une erreur temporaire garde le rappel en échec et relance seulement les appareils non servis. Désactiver puis réactiver le même endpoint ne répète pas un envoi accepté. Une réponse 404/410 retire l’inscription expirée. Les cinq tentatives et la relance manuelle du rappel restent disponibles ; les comptes par résultat apparaissent dans Paramètres.

Un reçu « envoyé » prouve l’acceptation par le fournisseur, pas l’affichage sur le téléphone. Un crash après acceptation et avant commit peut encore provoquer un doublon : le protocole n’offre pas d’envoi exactement une fois.

## Trace des corrections et OCR

Chaque correction d’intervention enregistre, dans la même transaction, l’auteur, son nom, la date et les valeurs avant/après. Un formulaire périmé ne modifie ni l’intervention ni sa trace. L’interface charge les corrections des interventions affichées en une requête du foyer, avec une limite de 1 000 corrections récentes par page. Les ZIP métier incluent ces traces ; les anciens ZIP v2 sans traces restent importables. Une restauration préserve les noms d’origine sans rattacher arbitrairement un ancien identifiant à un compte de destination.

`OCR_BATCH_SIZE=10` et `OCR_CONCURRENCY=2` sont les valeurs par défaut. Bornes : 1–100 documents par cycle et 1–4 extractions simultanées. Les extractions et les rappels avancent en parallèle. Une erreur sur un fichier n’arrête pas les autres ; les verrous `SKIP LOCKED` et les contrôles de révision/bail protègent plusieurs workers et les corrections humaines.

## Copie distante des sauvegardes

Le profil `backups` produit toujours une archive locale chiffrée et vérifie sa restauration dans une base jetable. Les nouvelles archives contrôlent les comptages des 25 tables, y compris sessions, préférences, reçus et traces ; les anciennes archives vérifient les tables déclarées dans leur manifeste. Si `BACKUP_REMOTE` est renseigné, il copie ensuite cette archive avec rclone, puis la relit entièrement et compare SHA-256. Le dernier succès `backup-offsite` est enregistré seulement après cette vérification. Un échec garde les archives locales et apparaît dans l’exploitation.

Exemple de configuration :

```dotenv
BACKUP_REMOTE=nas:lehub/backups
BACKUP_CONFIG_DIR=./backup-config
MONITOR_BACKUPS=true
```

Créer `backup-config/rclone.conf` avec un remote rclone (SFTP, S3, WebDAV, etc.). Le conteneur monte le dossier en lecture seule sous `/config`. Le fichier doit être lisible par l’UID/GID 1001 du service backup ; sur Linux, réserver le dossier à cet utilisateur/groupe et le fichier en mode 600. Le dossier est exclu de Git. La destination doit être réellement hors du serveur : rclone ne peut pas prouver qu’un remote pointe vers une autre machine.

L’image backup inclut rclone. Le fichier de configuration rclone entre dans l’archive chiffrée quand la copie distante est activée ; le restaurer aussi après extraction. La clé `BACKUP_ENCRYPTION_KEY` reste exclue et doit être conservée séparément. La rétention configurée concerne les archives locales ; régler la politique de rétention/versioning du stockage distant séparément. Aucune ancienne copie distante n’est supprimée automatiquement.

## Alertes et surveillance extérieure

Le moniteur est un processus distinct du worker. Il vérifie les signaux, le dernier cycle réussi et les erreurs. L’intervalle enregistré par le service backup remplace le seuil fixe de 48 heures : une sauvegarde hebdomadaire reste attendue pendant son intervalle, avec une marge de 30 minutes. Pour le worker, un signal âgé de plus de deux minutes ou un cycle réussi âgé de plus de 31 minutes est en retard.

```dotenv
OPERATIONS_ALERT_URL=https://ntfy.example.com/lehub-operations
OPERATIONS_ALERT_TOKEN=TOKEN_DU_RELAIS
MONITOR_BACKUPS=true
```

Le relais doit accepter un POST HTTPS de texte brut, comme ntfy. Le token optionnel est transmis en `Authorization: Bearer`. Aucun détail métier ou secret de configuration n’est envoyé. La première panne et le rétablissement sont signalés ; une panne persistante rappelle au maximum une fois par heure. Un envoi refusé est réessayé. La panne de base est signalée directement, sans dépendre d’une écriture dans la base.

```bash
docker compose --profile monitoring build monitor
docker compose --profile monitoring up -d monitor
```

Un moniteur sur la même machine ne peut pas annoncer la disparition de cette machine. Pour cela, configurer **Uptime Kuma ou un autre contrôleur sur une autre machine** avec :

- URL : `https://lehub.example.com/api/operations/health` ;
- en-tête `Authorization: Bearer TOKEN_INDEPENDANT` ;
- `OPERATIONS_HEALTH_TOKEN` côté app : au moins 32 caractères aléatoires ;
- succès HTTP 200 ; panne ou retard HTTP 503 ; mauvais token HTTP 401.

Cet endpoint ne renvoie que `ok` ou `unavailable`, sans exposer les diagnostics. Redémarrer app après modification des variables. `MONITOR_BACKUPS=true` doit être utilisé uniquement si le service backup est démarré. `BACKUP_REMOTE` active également la surveillance de la copie distante.

## Validation restante sur installation réelle

Le harnais Compose reste manuel, isolé et sans CI/CD :

```bash
docker compose -p lehub-validation -f compose.validation.yaml --profile build-only build validation application worker
docker compose -p lehub-validation -f compose.validation.yaml up --abort-on-container-exit --exit-code-from validation validation
docker compose -p lehub-validation -f compose.validation.yaml down
```

Il inclut désormais neuf scénarios de concurrence natifs : la trace d’une correction gagnante, le transfert concurrent d’un endpoint et la distribution par deux workers avec relance du seul appareil en échec. Les fournisseurs push de ce harnais sont simulés : aucun message extérieur n’est envoyé.

| Vérification | Couverture locale / prochaine action |
| --- | --- |
| Concurrence de stockage, suppression par foyer, appareils, reçus, corrections, OCR, alertes | Tests locaux avec PGlite et IndexedDB simulé, plus parcours Chromium réels. |
| SMTP | Socket local réel : réception, refus du plaintext imposé en production et STARTTLS avec certificat vérifié. Tester encore le fournisseur configuré depuis Paramètres, à l’adresse de l’administrateur volontaire. |
| Copie distante | CLI locale de test, lecture des octets et détection de corruption. Tester encore le vrai remote, puis restaurer une archive récupérée de ce remote. |
| PostgreSQL 17, images Docker, `pg_dump/pg_restore` | Exécuter le harnais ci-dessus sur une machine équipée ; pas validés par PGlite. |
| Push extérieur | Sur HTTPS, activer et tester sur un appareil volontaire avec des clés VAPID réelles ; vérifier aussi la déconnexion et la révocation. |
| Safari/iPhone | Installer sur l’écran d’accueil ; tester ajout/cochage hors ligne, retour réseau, changement de foyer, confirmation d’effacement, aperçu PDF, activation et retrait push, puis perte/rétablissement réseau. |

Le même parcours automatisé peut utiliser WebKit après installation de son navigateur et de ses dépendances : `LEHUB_BROWSER=webkit npm run test:e2e`. WebKit sous Linux ne remplace pas la vérification sur un iPhone réel, notamment pour les notifications et l’installation.

## Résultats de ce lot

- Lint, TypeScript et build de production : réussis.
- 52 tests locaux dans neuf fichiers : réussis, notamment reçus push après échec partiel/réactivation, suppression de session, export/restauration de la trace, OCR par lots, alertes et corruption de copie distante.
- Parcours Chromium sur le serveur standalone : réussi (24 s avec son lanceur). Les étapes comprennent deux onglets hors ligne, conflit par article, confirmation d’effacement, conservation de la file d’un autre foyer, révocation d’une session distante et retrait push après déconnexion/reconnexion. Contrôles de largeur à 390 px et captures dans `docs/screenshots/device-*.png`.
- PostgreSQL/Docker : commande du harnais tentée, bloquée car `docker` n’est pas disponible. Les exécutions natives restent en attente.
- WebKit : parcours tenté, bloqué car son navigateur n’est pas installé. Safari/iPhone réels restent en attente.
- Aucun fournisseur SMTP/push, stockage distant ou relais d’alerte réel n’a été contacté. Les essais extérieurs nécessitent la configuration de l’instance et un appareil volontaire.
