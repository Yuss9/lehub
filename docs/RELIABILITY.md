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

## Résultats initiaux (PR #5)

- Lint, TypeScript et build de production : réussis.
- 52 tests locaux dans neuf fichiers : réussis, notamment reçus push après échec partiel/réactivation, suppression de session, export/restauration de la trace, OCR par lots, alertes et corruption de copie distante.
- Parcours Chromium sur le serveur standalone : réussi (24 s avec son lanceur). Les étapes comprennent deux onglets hors ligne, conflit par article, confirmation d’effacement, conservation de la file d’un autre foyer, révocation d’une session distante et retrait push après déconnexion/reconnexion. Contrôles de largeur à 390 px et captures dans `docs/screenshots/device-*.png`.
- PostgreSQL/Docker : commande du harnais tentée, bloquée car `docker` n’est pas disponible. Les exécutions natives restent en attente.
- WebKit : parcours tenté, bloqué car son navigateur n’est pas installé. Safari/iPhone réels restent en attente.
- Aucun fournisseur SMTP/push, stockage distant ou relais d’alerte réel n’a été contacté. Les essais extérieurs nécessitent la configuration de l’instance et un appareil volontaire.

## Validation complémentaire après fusion

Le parcours WebKit Linux a été exécuté sur le build standalone : **réussi en 24,5 secondes**, sans erreur JavaScript non traitée. Il couvre la persistance après rechargement, deux onglets, les conflits par article, la confirmation d’effacement par foyer, la conservation des autres files, les corrections et les sessions/appareils. La capture `screenshots/webkit-account-access.png` montre la fiche d’accès à 390 px.

L’émulation `setOffline(true)` de Playwright WebKit refuse certaines navigations pourtant servies par un service worker ([issue #42775](https://github.com/microsoft/playwright/issues/42775)). Le harnais ne saute pas ces étapes : pour les deux rechargements concernés, il coupe toutes les connexions au relais TCP local, réactive temporairement l’émulation réseau, puis exige une réponse provenant du service worker et retrouve les changements conservés. Il rétablit ensuite l’émulation hors ligne avant de réouvrir le relais. Le contrôle est lié à loopback, sur un port éphémère, avec un token généré pour le test ; tout est arrêté à la fin.

Les menus de navigation, les liens entre échéances et historique et le retour depuis l’écran hors ligne demandent les pages à l’ouverture. Le préchargement automatique provoquait des erreurs de requêtes RSC annulées sous WebKit ; il est désactivé sur ces liens et évite également des lectures de pages privées inutilisées. La navigation au clic et les protections d’origine restent actives.

La case de conservation attend maintenant la lecture initiale d’IndexedDB. Son activation compte comme une écriture en cours, reprend la file fusionnée retournée par le stockage et invalide les lectures précédentes. Une ancienne annonce ne peut plus remettre la case à zéro pendant l’activation. Le parcours retarde volontairement l’ouverture de la vraie base IndexedDB jusqu’au déblocage explicite, puis vérifie la restauration et la conservation des files des deux foyers.

Les 52 tests locaux, lint, TypeScript et le build de production ont été relancés avec succès. Aucune nouvelle migration ni variable de production n’est nécessaire pour cette validation complémentaire.

Le même parcours complet passe aussi sous Chromium Headless Shell (21,6 secondes). Les vérifications attendent le chargement effectif de la photo et la fin de la suppression synchronisée avant d’ouvrir son annulation ; elles ne confondent plus un élément visible avec un chargement terminé.

PostgreSQL/Docker et `pg_dump/pg_restore` restent **non validés** : Docker est absent et l’environnement ne permet pas de lancer PostgreSQL sous un utilisateur distinct (`runuser: cannot set groups: Operation not permitted`). Aucun service fournisseur réel n’a été sollicité. Il faut encore l’URL et l’accès à une instance de test configurée, un destinataire volontaire et les appareils réels pour SMTP, push VAPID et Safari/iPhone. Le test PDF automatisé contrôle l’accès et les en-têtes de téléchargement/aperçu ; il ne valide pas le lecteur PDF natif d’un iPhone.

## Installation, calendrier et authentification renforcée

La livraison suivante ajoute un [README self-hosting](../README.md), les variantes Compose Caddy et proxy externe, et un générateur `.env` qui refuse l’écrasement, crée cinq secrets distincts et une paire VAPID cohérente sans dépendance installée. Les services optionnels restent explicites : aucune CI/CD ou activation automatique d’un fournisseur extérieur.

Les paramètres sont répartis en Foyer, Compte et appareils, Notifications et Exploitation, avec URL partageable et requêtes limitées à la rubrique. Le calendrier ouvre toutes les tâches d’une journée ; le formulaire tactile et le glisser-déposer utilisent le même déplacement confirmé, limité au foyer et protégé par la révision. Le jour de référence est conservé ; les prévisions sont recalculées à partir du planning modifié. Le harnais PostgreSQL inclut désormais un **dixième** scénario : deux membres déplacent la même échéance depuis la même révision, un seul gagne.

La migration **0007_calm_jackal.sql** ajoute la table `two_factor` et `user.two_factor_enabled`. Arrêter app, worker, backup et monitor, sauvegarder, migrer puis reconstruire/redémarrer les services avec le nouveau code. La sauvegarde serveur contrôle désormais **26 tables**, dont les secrets 2FA chiffrés et les codes de secours. Garder `BETTER_AUTH_SECRET` stable et sauvegardé : le changer empêche de déchiffrer les données 2FA existantes. Les anciens comptes restent sans 2FA jusqu’à activation volontaire.

Le plugin Better Auth exige un code TOTP pour terminer l’enrôlement et un second facteur pour obtenir une session après le mot de passe. Les codes de secours sont chiffrés et consommables une fois. Le QR est généré localement ; aucun service extérieur ne reçoit la clé. Le parcours d’activation/désactivation déconnecte les autres sessions ; s’il échoue à cette étape, l’interface demande de vérifier la liste. Une récupération email change uniquement le mot de passe et révoque les sessions, sans retirer la 2FA. Le retrait d’urgence exige l’option explicite `--reset-two-factor` d’une commande locale ; elle n’est pas exposée en HTTP.

La [recette sur installation et appareils réels](ACCEPTANCE.md) précise les preuves à collecter et les limites : ne pas déduire un échec fournisseur push du simple mode avion. Docker/PostgreSQL natif, SMTP/push extérieurs, stockage distant, alertes extérieures et Safari/iPhone restent à exécuter sur une instance équipée ; aucune case du rapport n’est cochée par les tests locaux.

### Résultats du lot self-hosting

- 55 tests dans 11 fichiers réussis ; lint, TypeScript et build de production réussis. Les tests d’authentification exercent le vrai plugin Better Auth avec PGlite : enrôlement obligatoire, challenge TOTP, code de secours à usage unique, récupération email conservant le second facteur et retrait local d’urgence. Les deux fichiers touchés par la révocation des challenges ont ensuite été retestés (7 tests réussis).
- Audit des dépendances de production : aucune vulnérabilité signalée. Les quatre fichiers Compose sont syntaxiquement valides ; cela ne remplace pas leur exécution.
- Parcours Chromium complet réussi, avec quatre interventions dans une journée, report mobile, glisser-déposer confirmé, les quatre rubriques et connexion TOTP/code de secours. Captures `screenshots/self-hosting-*.png`.
- Le nouvel essai WebKit ne démarre pas : dépendance système `libGLESv2` indisponible dans l’environnement. La réussite WebKit du lot précédent ne constitue pas une validation de ces nouvelles interfaces.
- Harnais Docker tenté : `docker: command not found`. PostgreSQL natif, images, restauration `pg_dump/pg_restore`, services SMTP/push/distants, alertes extérieures et iPhone réel restent explicitement à valider dans [ACCEPTANCE.md](ACCEPTANCE.md).
