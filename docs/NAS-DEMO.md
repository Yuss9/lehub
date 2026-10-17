# CI/CD LeHub dans le projet Synology public-sites

Cette configuration remplace la proposition de stack autonome : **tous les services LeHub sont dans `/volume1/docker/web/docker-compose.yml`, projet `public-sites`**. Le runner GitHub reste dans `/volume1/docker/github-runner-lehub`, comme celui de OneTask.

## Comportement

- Push/merge sur `main` ou lancement manuel sur main : runner NAS `jarvis-lehub`, label `lehub-web`.
- Sur le NAS : lint, TypeScript, tests unitaires, build Next.js dans Docker, puis construction des cibles `runner`, `worker`, `migrate`.
- Publication GHCR : `ghcr.io/yuss9/lehub`, `lehub-worker`, `lehub-migrate`, tags `sha-<commit complet>` puis `latest` après un déploiement sain.
- Déploiement uniquement des services LeHub dans le Compose partagé ; aucune commande globale `up`, `down` ou prune.
- Base vierge au premier démarrage, migrations techniques uniquement. **Aucun seed, aucun compte précréé, aucune fake data.** Initialisation par le parcours `/setup` normal.
- Les merges suivants mettent à jour le code et le schéma ; ils ne réinitialisent pas les comptes ni les données.

## Fichiers

| Fichier du dépôt | Destination / usage |
|---|---|
| `deploy/synology/docker-compose.yml` | Modèle complet pour `/volume1/docker/web/docker-compose.yml` |
| `deploy/synology/Caddyfile` | Modèle complet pour `/volume1/docker/web/Caddyfile` |
| `deploy/compose.runner-synology.yaml` | `/volume1/docker/github-runner-lehub/compose.yaml` |
| `scripts/init-demo-env.sh` | Exécuter une fois sur le NAS ; génère la configuration sous `/volume1/docker/web/lehub/` |
| `scripts/deploy-demo.sh` | Exécuté automatiquement par le workflow depuis le checkout GitHub |

Les modèles conservent les services Sarah, Theo, OneTask et Caddy fournis par le propriétaire. Comparer avec les fichiers actuellement présents avant remplacement ; conserver toute modification locale ultérieure. Le Caddyfile corrige aussi l'accolade fermante isolée présente à la fin du texte collé : elle ne doit pas figurer dans le fichier réel.

## Services ajoutés au Compose public-sites

| Service | Fonction |
|---|---|
| `lehub-postgres` | PostgreSQL dédié, base `lehub_demo` |
| `lehub-migrate` | Migration ponctuelle, profil `lehub-tools` |
| `lehub` | Next.js, destination Caddy `lehub:3000` |
| `lehub-worker` | OCR et traitements de fond |

Volumes persistants : `lehub-postgres-data` et `lehub-documents`. Base et worker sont sur `lehub-network`; l'application rejoint aussi `public-sites-network`. Aucun nouveau port hôte et aucun deuxième Caddy. Ne pas ajouter LeHub aux dépendances de Caddy : les sites existants doivent rester indépendants de son démarrage.

## Préparation — avancer dans cet ordre, avant fusion

### 1. Vérifier le runner existant

Le modèle réutilise le contexte de build `/volume1/docker/github-runner-onetask-web` et les variables REPO_URL, RUNNER_NAME, RUNNER_LABELS, RUNNER_TOKEN montrées dans la configuration existante. Il ne copie pas son dossier `runner` ni son enregistrement GitHub.

Le Dockerfile/entrypoint OneTask n'a pas été fourni. Vérifier qu'il sait initialiser un `/runner` neuf avec ces variables avant de lancer le runner LeHub. Le conteneur doit disposer de Bash, Git et du client Docker/Compose, et être autorisé à utiliser le socket du NAS.

### 2. Récupérer la branche sur l'ordinateur

Depuis un checkout propre :

```bash
git fetch origin
git switch --track origin/feat/nas-demo-cicd
```

Si la branche existe déjà, utiliser `git switch feat/nas-demo-cicd` puis `git pull --ff-only`.

### 3. Générer les secrets LeHub dans web

Sur le NAS, créer uniquement le nouveau sous-dossier :

```bash
mkdir -p /volume1/docker/web/lehub
```

Copier le script depuis l'ordinateur (SCP classique si le sous-système SFTP du NAS n'est pas actif) :

```bash
scp -O scripts/init-demo-env.sh yuss@192.168.1.95:/volume1/docker/web/lehub/init-env.sh
```

Puis sur le NAS :

```bash
bash /volume1/docker/web/lehub/init-env.sh
```

Le script crée `lehub/postgres.env` et `lehub/app.env`, mode 600, avec secrets indépendants. Il refuse d'écraser une configuration existante et ne modifie pas le `.env` partagé de OneTask.

L'URL par défaut est `https://lehub-demo.yuss.dev`. Pour la changer, modifier BETTER_AUTH_URL dans `lehub/app.env` et le domaine Caddy/DNS. Ne pas changer le secret PostgreSQL après initialisation du volume sans changement SQL coordonné.

### 4. Préserver le fonctionnement du runner OneTask

**À faire avant d'installer le nouveau Compose partagé.** `docker compose config --quiet` charge aussi les `env_file` des autres services. Le runner OneTask ne monte actuellement que docker-compose.yml : il doit donc également voir les nouveaux fichiers LeHub.

Ajouter cette ligne à ses volumes, sans modifier son enregistrement :

```yaml
- /volume1/docker/web/lehub:/volume1/docker/web/lehub:ro
```

Quand son runner est Idle et qu'aucun workflow n'est en cours, recréer uniquement son service depuis son dossier avec sa procédure habituelle. Vérifier les permissions de lecture des fichiers 600 pour l'utilisateur du runner (ne pas les rendre publics). Cette étape ne concerne pas les conteneurs OneTask applicatifs.

Le nouveau runner LeHub monte le même sous-dossier en écriture pour les dumps et le marqueur de version. Le socket Docker confère déjà des privilèges administratifs sur les conteneurs du NAS ; n'exécuter que du code de confiance sur ces runners.

### 5. Installer les modèles dans web

Sauvegarder les fichiers actuels sur le NAS :

```bash
cd /volume1/docker/web
cp docker-compose.yml "docker-compose.yml.backup-$(date +%Y%m%d-%H%M%S)"
cp Caddyfile "Caddyfile.backup-$(date +%Y%m%d-%H%M%S)"
```

Après comparaison, copier depuis l'ordinateur :

```bash
scp -O deploy/synology/docker-compose.yml yuss@192.168.1.95:/volume1/docker/web/docker-compose.yml
```

Sur le NAS :

```bash
cd /volume1/docker/web
docker compose config --quiet
```

Ne pas lancer un `docker compose up -d` global et ne pas charger la route LeHub dans Caddy avant que son application tourne. Le fichier .env existant continue à fournir ONETASK_POSTGRES_PASSWORD aux commandes manuelles.

### 6. Installer et enregistrer le runner LeHub

Créer `/volume1/docker/github-runner-lehub` sur le NAS, puis copier depuis l'ordinateur :

```bash
scp -O deploy/compose.runner-synology.yaml yuss@192.168.1.95:/volume1/docker/github-runner-lehub/compose.yaml
```

Dans GitHub : Settings → Actions → Runners → New self-hosted runner, Linux et architecture du NAS (`uname -m`). Récupérer le token après `--token`.

Dans Bash sur le NAS :

```bash
cd /volume1/docker/github-runner-lehub
read -r -s -p 'Token runner LeHub : ' RUNNER_TOKEN
printf '\n'
export RUNNER_TOKEN
docker compose up -d --build
unset RUNNER_TOKEN
docker compose logs --tail=100
```

Vérifier `jarvis-lehub`, statut Idle, labels `self-hosted`, `Linux`, `lehub-web`. Le workflow utilise le GITHUB_TOKEN avec packages:write pour GHCR ; aucun PAT à créer. Si les packages existent déjà, vérifier leur accès Actions pour le dépôt LeHub.

### 7. Fusionner et attendre le premier déploiement

La fusion vers main déclenche la pipeline. Le runner monte le Compose partagé et le dossier lehub. Il récupère le mot de passe OneTask depuis son conteneur PostgreSQL existant, comme le workflow OneTask fourni, uniquement pour résoudre la configuration complète. Il ne le journalise pas et ne recrée aucun service OneTask.

Le déploiement : pull des trois images au SHA ; démarrage de lehub-postgres ; arrêt de lehub/lehub-worker ; dump ; migrations ; démarrage de lehub/lehub-worker ; healthcheck app et cycle worker sans erreur. Le SHA est noté dans `lehub/deployed-image.txt`. Les tags latest sont publiés après cette validation.

### 8. Activer Caddy et initialiser l'instance vierge

Faire pointer le DNS `lehub-demo.yuss.dev` vers la même destination publique que les sites existants. Aucun nouveau port à ouvrir si leur HTTPS fonctionne déjà.

Après le premier déploiement sain, ajouter au Caddyfile existant :

```caddyfile
lehub-demo.yuss.dev {
    encode zstd gzip
    header X-Robots-Tag "noindex, nofollow"
    reverse_proxy lehub:3000
}
```

Le modèle complet du dépôt contient cette route avec les trois autres sites. Valider et recharger :

```bash
docker exec public-sites-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec public-sites-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Ouvrir `https://lehub-demo.yuss.dev/setup` : choisir le foyer, l'email et le mot de passe, puis fournir la SETUP_KEY de `lehub/app.env`. Aucun identifiant démo prédéfini. La clé de setup reste privée ; les inscriptions publiques demeurent désactivées après ce premier compte.

## Mises à jour et limites

- Chaque merge sur main met à jour LeHub, sans effacer les données et sans redémarrer les autres sites.
- Les changements futurs du Compose/Caddyfile doivent être reportés manuellement sur le NAS ; la pipeline ne les écrase pas.
- Les commandes manuelles utilisent latest par défaut. Le workflow emploie LEHUB_IMAGE_TAG=sha-... pour déployer le commit exact. Un échec de publication latest après un déploiement sain laisse un job rouge : vérifier l'étape en erreur avant toute intervention.
- Dumps dans `/volume1/docker/web/lehub/backups`, sans rotation automatique ni documents. Ne pas les confondre avec une sauvegarde complète ; garder l'accès privé et surveiller l'espace disque.
- Échec après arrêt/migration : seuls lehub/lehub-worker sont arrêtés. Pas de rollback automatique sur un schéma potentiellement incompatible. Corriger puis relancer ; ne pas supprimer les volumes.
- Pas de SMTP ni de clés VAPID dans cette configuration basique. OCR actif. Pas de faux comptes ni de protection produit spécifique aux comptes démo.
- Images construites pour l'architecture du NAS, pas de manifeste multiarchitecture.

Contrôles ciblés :

```bash
cd /volume1/docker/web
docker compose ps lehub lehub-worker lehub-postgres
docker compose logs --tail=100 lehub lehub-worker
```

## Validation de la PR

Syntaxe Bash et YAML vérifiée. Génération/refus d'écrasement des secrets testés dans un dossier temporaire. Déploiement simulé avec un client Docker factice : réussite et échec de migration, commandes limitées aux services LeHub. Aucun Docker Engine disponible dans l'environnement de préparation : builds, tests npm, migrations réelles, démarrage et connexion restent à vérifier sur le NAS. Le workflow exécute lint/typecheck/tests/build ; tests navigateur et harnais Docker natif non inclus. Aucun changement UI.
