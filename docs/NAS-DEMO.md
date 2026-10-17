# CI/CD de la démo LeHub sur Synology

Démo séparée de l’installation personnelle : PostgreSQL `lehub_demo`, projet Compose `lehub-demo`, volumes propres, alias Caddy `lehub-demo-app`. Les images GHCR `lehub`, `lehub-worker` et `lehub-migrate` utilisent les cibles explicites du Dockerfile existant. Le déploiement référence le SHA complet ; le tag `demo` identifie le dernier déploiement réussi.

## 1. Récupérer les fichiers avant fusion

Depuis un checkout propre sur ton ordinateur :

```bash
git fetch origin
git switch --track origin/feat/nas-demo-cicd
```

Si la branche existe déjà localement, utiliser `git switch feat/nas-demo-cicd` puis `git pull --ff-only`.
Préparer le NAS avec les étapes suivantes AVANT de fusionner. Aucun fichier .env ne doit être committé.

## 2. Préparer le répertoire de la démo sur le NAS

Depuis ton ordinateur :

```bash
ssh yuss@192.168.1.95
bash
mkdir -p /volume1/docker/lehub-demo
mkdir -p /volume1/docker/github-runner-lehub
docker compose version
docker network inspect public-sites-network
```

Utiliser ton accès Docker habituel ; préfixer les commandes Docker par `sudo` seulement si ton compte en a besoin. Ne pas rendre le socket Docker accessible à tous avec chmod 666.

Copier via File Station ou SCP :

| Fichier du dépôt | Destination NAS |
|---|---|
| deploy/compose.demo.yaml | /volume1/docker/lehub-demo/compose.yaml |
| scripts/init-demo-env.sh | /volume1/docker/lehub-demo/init-env.sh |
| deploy/compose.runner-synology.yaml | /volume1/docker/github-runner-lehub/compose.yaml |

Exemple SCP depuis le checkout du dépôt sur ton ordinateur :

```bash
scp deploy/compose.demo.yaml yuss@192.168.1.95:/volume1/docker/lehub-demo/compose.yaml
scp scripts/init-demo-env.sh yuss@192.168.1.95:/volume1/docker/lehub-demo/init-env.sh
scp deploy/compose.runner-synology.yaml yuss@192.168.1.95:/volume1/docker/github-runner-lehub/compose.yaml
```

Si SCP/SFTP n'est pas activé, utiliser File Station.

## 3. Générer les secrets de la démo

Sur le NAS :

```bash
bash /volume1/docker/lehub-demo/init-env.sh
cd /volume1/docker/lehub-demo
docker compose config --quiet
```

Le script génère quatre secrets indépendants : PostgreSQL, Better Auth, clé setup et mot de passe administrateur. Le mot de passe PostgreSQL est hexadécimal pour pouvoir être utilisé directement dans DATABASE_URL.

L'URL choisie est `https://lehub-demo.yuss.dev`. Si tu veux `https://lehub.yuss.dev`, modifier `BETTER_AUTH_URL` dans `.env` et utiliser exactement ce domaine pour le DNS et Caddy.

`IMAGE_TAG=bootstrap` est volontaire : aucune image n'existe encore. Ne pas lancer `docker compose up` maintenant. Le premier workflow remplacera cette valeur après réussite.

Garder `.env` privé ; ne pas le committer. Il est monté dans le runner via le dossier de déploiement pour permettre Compose et l'enregistrement du tag déployé. Le runner ayant le socket Docker, il possède déjà des privilèges très élevés sur le NAS.

## 4. Créer un runner propre pour LeHub

Ton runner OneTask est enregistré pour `Yuss9/onetask`. LeHub doit avoir son propre enregistrement et son propre répertoire de données.

Le modèle de runner fourni réutilise le Dockerfile et l'entrypoint de `/volume1/docker/github-runner-onetask-web` comme contexte de build. Il utilise les variables visibles dans ta capture : REPO_URL, RUNNER_NAME, RUNNER_LABELS et RUNNER_TOKEN. Il ne copie pas le dossier `runner` de OneTask.

Cette étape suppose que ton entrypoint existant utilise bien ces variables et initialise un dossier `/runner` vide. Ses sources n'étaient pas dans les pièces jointes : en cas d'erreur d'enregistrement, contrôler ce fichier avant de changer l'installation OneTask.

Ouvrir : https://github.com/Yuss9/lehub/settings/actions/runners

Cliquer **New self-hosted runner**, sélectionner Linux et l'architecture correspondant au NAS (`uname -m`). Récupérer le token d'enregistrement indiqué après `--token`. Ce n'est pas un PAT.

Sur le NAS, dans Bash :

```bash
cd /volume1/docker/github-runner-lehub
read -r -s -p 'Token runner LeHub : ' RUNNER_TOKEN
printf '\n'
export RUNNER_TOKEN
docker compose up -d --build
unset RUNNER_TOKEN
docker compose logs --tail=100
```

Dans GitHub, vérifier que `jarvis-lehub` apparaît **Idle**, avec le label `lehub-web`. Il doit aussi avoir les labels automatiques `self-hosted` et `Linux`.

Le workflow utilise Docker pour Node, npm et les tests : pas besoin d'installer Node sur DSM. Il faut néanmoins un runner GitHub récent, Git, Bash et le client Docker/Compose, comme pour OneTask.

## 5. Configurer GitHub Actions et GHCR

Dans **Settings → Actions → General**, autoriser les actions nécessaires, dont `actions/checkout@v6` (la même version que ton exemple OneTask). Le YAML demande explicitement `contents: read` et `packages: write`.

Aucun secret PAT n'est nécessaire pour le workflow : GitHub fournit automatiquement `secrets.GITHUB_TOKEN`. Le login GHCR est isolé dans un répertoire temporaire puis supprimé à la fin du job. Les secrets de l'application restent dans le `.env` du NAS.

Les packages sont liés à `Yuss9/lehub` grâce au token du workflow et au label OCI `org.opencontainers.image.source`. Si un package du même nom existe déjà et refuse le push/pull, ouvrir ses **Package settings → Manage Actions access** et donner au dépôt LeHub l'accès requis. Ne pas rendre le package public pour contourner une permission.

Le dépôt est actuellement privé. Le workflow proposé ne se déclenche PAS sur les PR : seuls les push sur main et les lancements manuels sur main utilisent ce runner. Avec un socket Docker et les fichiers du NAS, n'exécuter que du code de confiance sur ce runner. Pour de futures vérifications de PR externes, employer un runner GitHub hébergé distinct.

## 6. Préparer le DNS

Faire pointer `lehub-demo.yuss.dev` vers la même entrée publique que tes sites existants : CNAME vers ton nom DDNS existant, ou enregistrement A vers ton IPv4 publique. Ne pas utiliser `192.168.1.95` comme adresse publique du DNS.

La redirection existante doit amener le trafic public TCP 80 vers `192.168.1.95:8088` et TCP 443 vers `192.168.1.95:8443`, si c'est bien le chemin utilisé par tes sites. UDP 443 vers 8443 est facultatif pour HTTP/3. Aucun nouveau port n'est requis.

Attendre le premier déploiement avant d'activer la route Caddy afin d'éviter un 502 pendant l'initialisation.

## 7. Fusionner la PR et lancer le premier déploiement

Une fois les fichiers NAS et le runner prêts, relire puis fusionner la PR vers main.
Le workflow **LeHub - CI, GHCR and NAS demo** démarre sur le push main.
Un lancement manuel depuis Actions doit également sélectionner main.

Ordre exécuté :

1. Vérifier Docker, Compose, le réseau et les fichiers de déploiement.
2. Construire l'image CI : npm ci, lint, typecheck, tests unitaires, build Next.js.
3. Construire explicitement les images app/worker/migrations.
4. Publier les trois images `sha-<commit>` dans GHCR.
5. Tirer les images et démarrer PostgreSQL si nécessaire.
6. Arrêter app/worker, sauvegarder PostgreSQL avant migration.
7. Exécuter les migrations versionnées.
8. Initialiser le foyer démo seulement si la base est vide.
9. Démarrer app et worker ; attendre le healthcheck HTTP et un cycle worker terminé sans erreur.
10. Enregistrer le SHA dans `.env`, puis publier les tags `demo`.

Le build et le déploiement tournent sur le NAS. Les trois images sont stockées dans GHCR, visibles dans GitHub Packages, pas committées comme fichiers binaires du dépôt. Elles ciblent l'architecture du NAS qui les construit ; le pack ne produit pas de manifeste multiarchitecture.

Les tests navigateur et le harnais natif `compose.validation.yaml` du projet ne sont pas inclus dans cette première pipeline. Le healthcheck /api/health confirme l'accès à la base, pas l'intégralité des fonctionnalités. Faire les vérifications manuelles de l'étape 9.

## 8. Ajouter LeHub au Caddy existant

Sur le NAS :

```bash
cd /volume1/docker/web
cp Caddyfile "Caddyfile.backup-$(date +%Y%m%d-%H%M%S)"
```

Éditer ce Caddyfile en conservant toutes ses routes actuelles. Ajouter :

```caddyfile
lehub-demo.yuss.dev {
    header X-Robots-Tag "noindex, nofollow"
    reverse_proxy lehub-demo-app:3000
}
```

Puis :

```bash
docker exec public-sites-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec public-sites-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Il n'y a aucune modification à faire dans `/volume1/docker/web/docker-compose.yml`. Le Caddy existant est déjà connecté à `public-sites-network`. Ne pas ajouter un `depends_on` vers un service appartenant à un autre projet Compose.

Si ton éditeur remplace le fichier monté par un nouvel inode et que Caddy voit encore l'ancienne version, recréer uniquement Caddy depuis son projet : `docker compose up -d --no-deps --force-recreate caddy`, puis valider les sites. Cela interrompt brièvement le proxy, donc commencer par le reload normal.

## 9. Se connecter et vérifier

Ouvrir https://lehub-demo.yuss.dev

| Usage | Email | Mot de passe |
|---|---|---|
| Visiteur (rôle member) | demo@example.test | LeHub-Demo-2026! |
| Administration privée | admin@example.test | Valeur DEMO_ADMIN_PASSWORD dans le .env du NAS |

Le script utilise le hachage Better Auth, crée un compte credential, un foyer, ses memberships et l'installation initiale. Pas besoin de passer par `/setup` ni d'activer l'inscription publique.

Jeu fictif initial : salon, cuisine, buanderie, téléviseur, machine à café, lave-linge, garanties/prix d'exemple, entretien à J+7 et liste de courses. Aucun document personnel et aucun email réel. SMTP et VAPID ne sont pas configurés ; OCR reste actif pour les fichiers éventuellement ajoutés.

Contrôles sur le NAS :

```bash
cd /volume1/docker/lehub-demo
docker compose ps
docker compose logs --tail=100 app worker
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{console.log(r.status);process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
```

Puis vérifier dans le navigateur : HTTPS, connexion visiteur, affichage des pièces/équipements, ajout d'un article de courses, déconnexion et reconnexion. Vérifier aussi l'accès au compte administrateur privé.

Cette version est une **instance de démonstration partagée et modifiable**. Ce n'est pas encore un mode démo durci intégré au produit : le compte membre peut notamment utiliser les fonctionnalités que LeHub autorise actuellement aux membres, modifier ses préférences ou son mot de passe. Les changements sont visibles par les autres visiteurs. Ne pas présenter le compte comme une sandbox personnelle ou en lecture seule.

Avant une large diffusion publique, prévoir dans l'application des restrictions serveur pour les comptes démo (changement du mot de passe/2FA, invitations et opérations sensibles selon les routes réellement autorisées), des quotas d'upload et une réinitialisation contrôlée. Cette configuration initialise un jeu de données ; il ne prétend pas ajouter ces protections au code existant. Ne jamais mettre de données personnelles sur cette instance.

## 10. Déploiements suivants et récupération

Chaque push fusionné sur main reconstruit, teste, publie et déploie. Le seed reconnaît le foyer démo et préserve les données existantes : il ne remet pas à zéro les modifications des visiteurs. Changer DEMO_PASSWORD dans `.env` après initialisation ne change pas le hash du compte ; utiliser la récupération de compte existante si nécessaire.

Chaque déploiement sauvegarde la base dans `/volume1/docker/lehub-demo/backups`. Ce dump contient les comptes et les données de cette démo ; conserver le dossier privé. Il ne contient PAS les fichiers du volume documents : ce n'est pas une sauvegarde complète de fichiers utilisateurs. Les dumps n'ont pas de rotation automatique dans cette configuration ; supprimer périodiquement les plus anciens après avoir conservé ceux nécessaires.

Si une migration ou un contrôle de démarrage échoue, le job échoue et arrête app/worker. Il ne remet pas aveuglément une ancienne image sur une base potentiellement modifiée. Corriger le problème puis relancer le workflow main. Pour un vrai retour arrière après migration, restaurer une base distincte depuis le dump et utiliser les images SHA correspondantes après vérification de compatibilité. Ne pas lancer `down -v` ni une restauration destructive comme réflexe de dépannage.

Un échec avant l'étape déploiement laisse la version actuelle en place. Un échec de publication du tag `demo` après le déploiement peut laisser un job rouge alors que l'app SHA est déjà saine : vérifier les étapes du job.

Si le Compose du dépôt change, recopier explicitement `deploy/compose.demo.yaml` vers `/volume1/docker/lehub-demo/compose.yaml` avant de déployer un code qui dépend de ce changement. Le workflow ne remplace pas automatiquement ta configuration NAS.

Les tags SHA/images et le cache de build s'accumulent. Inspecter périodiquement `docker system df` et supprimer seulement les anciennes images LeHub inutilisées en conservant des versions de secours. Ne pas lancer de prune global de volumes sur le NAS partagé.

## 11. Dépannage rapide

| Symptôme | Cause probable / contrôle |
|---|---|
| Job en attente de runner | jarvis-lehub offline, label lehub-web manquant, runner enregistré sur le mauvais dépôt |
| Fichier NAS introuvable dans le job | montage du dossier /volume1/docker/lehub-demo absent ou droits insuffisants |
| permission denied Docker | accès du runner au socket Docker à aligner sur OneTask ; pas de chmod 666 |
| denied GHCR | packages:write, package préexistant non lié au dépôt, règle d'organisation restrictive |
| manifest unknown bootstrap | premier workflow pas encore réussi ; ne pas démarrer app manuellement avant publication |
| erreur PostgreSQL après modification du secret | le mot de passe d'un volume initialisé ne change pas en modifiant .env |
| 502 Caddy | app non healthy, alias lehub-demo-app absent, réseau partagé absent, migration en échec |
| erreur d'origine à la connexion | BETTER_AUTH_URL ne correspond pas exactement à l'URL HTTPS utilisée |
| seed refuse l'instance | mauvaise base ou base déjà initialisée autrement ; ne pas supprimer le garde-fou |
| documents non accessibles | vérifier volume partagé app/worker et UID/GID 1001, jamais chmod 777 |

## Vérifications effectuées et limites

Fichiers YAML analysés, scripts Bash validés avec `bash -n`, module seed validé avec `node --check`. Le schéma de seed a été établi depuis `src/db/schema.ts` actuel. Aucune image n'a été construite ici, aucun test npm/connexion Better Auth/migration n'a été exécuté dans cet environnement, et aucun accès au NAS n'a été réalisé. Le premier workflow constitue la vérification d'exécution ; les contrôles navigateur ci-dessus restent nécessaires.

Références :
- https://github.com/Yuss9/lehub/blob/main/Dockerfile
- https://github.com/Yuss9/lehub/blob/main/compose.yaml
- https://github.com/Yuss9/lehub/blob/main/src/db/schema.ts
- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- https://docs.github.com/en/actions/reference/security/secure-use
