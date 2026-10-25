# CI LeHub sur Synology et publication GHCR

## Périmètre actuel

La CI vérifie le code, construit les images et les publie dans GitHub Container Registry.
**Aucun déploiement, migration ou redémarrage applicatif n'est exécuté.**
Les scripts et modèles de déploiement restent disponibles pour une étape ultérieure.
Ne pas exécuter scripts/deploy-demo.sh pour valider cette CI.

- Pull request vers main : validation sur ubuntu-latest, jamais sur le NAS, aucune publication.
- Push sur main ou lancement manuel sur main : runner self-hosted Linux portant le label lehub-web.
- Dockerfile.ci exécute npm ci, lint, typecheck, tests unitaires et build Next.js.
- Construction explicite des cibles runner, worker et migrate. Le Dockerfile finit par validation : un docker build sans --target ne produit donc pas l'application web.
- Toutes les images sont construites avant toute publication.
- Publication des trois tags sha-<commit complet>, puis latest après publication des trois SHA.
- latest signifie « CI réussie », pas « déployé ». Les mises à jour des trois tags ne sont pas atomiques ; utiliser les SHA pour le futur déploiement.
- Images natives de l'architecture du moteur Docker du NAS, sans multiarchitecture.
- Authentification GHCR par GITHUB_TOKEN avec packages:write ; aucun PAT de publication nécessaire.
- Si un package existe déjà, lui accorder l'accès Actions du dépôt Yuss9/lehub.

| Cible | Image |
| --- | --- |
| runner | ghcr.io/yuss9/lehub |
| worker | ghcr.io/yuss9/lehub-worker |
| migrate | ghcr.io/yuss9/lehub-migrate |

## Audit du runner

Le Compose du dépôt cible le bon dépôt, un nom distinct jarvis-lehub, le label lehub-web, un dossier /runner persistant et le socket Docker du NAS.
Il réutilise cependant le build local ../github-runner-onetask-web : son Dockerfile et son entrypoint ne sont pas présents dans ce dépôt.
On ne peut donc pas confirmer depuis ces fichiers la version du runner, son utilisateur, ses permissions socket, son initialisation ou son redémarrage sans token.

Les exécutions visibles au 25 octobre 2026 ont échoué ; la dernière (39026120361) ne contient aucun job.
L'ancien workflow référençait runner.temp dans jobs.<job>.env, où le contexte runner est interdit.
La nouvelle version prépare DOCKER_CONFIG dans une étape via RUNNER_TEMP et GITHUB_ENV.

Le modèle CI retire les montages du Compose de production et du dossier contenant les secrets LeHub.
Cela n'isole pas le NAS du runner : le socket Docker donne toujours le contrôle du moteur hôte.
Ne jamais exécuter du code de PR sur ce runner. Le workflow NAS accepte seulement main.

## Vérifier sur le NAS

Dans GitHub : Settings → Actions → Runners, vérifier jarvis-lehub, Idle et les labels self-hosted, Linux, lehub-web.
L'API de listing des runners n'est pas accessible avec le connecteur utilisé pour cet audit.

Commandes sans affichage des variables ou tokens :

```bash
cd /volume1/docker/github-runner-lehub
docker compose ps
docker exec github-runner-lehub bash -lc 'id; git --version; docker version; docker info --format "{{.OSType}}/{{.Architecture}}"'
docker exec github-runner-lehub bash -lc 'cd /runner && ./bin/Runner.Listener --version'
```

Si Runner.Listener est ailleurs, retrouver son chemin dans le Dockerfile/entrypoint local.
actions/checkout@v6 exige un runner compatible ; maintenir le runner GitHub à jour.
Le conteneur doit disposer de Bash, Git, certificats TLS, client Docker avec support de build et droits sur /var/run/docker.sock.
Node et npm sont utilisés dans node:24-bookworm-slim, pas directement dans DSM.
L'accès sortant à GitHub, GHCR, Docker Hub, npm et aux dépôts Debian est nécessaire.
Surveiller RAM et stockage Docker ; pas de prune global automatique sur un NAS partagé.

Le token d'enregistrement est temporaire. L'entrypoint doit réutiliser l'enregistrement persistant après redémarrage.
Ne pas partager le token, les fichiers .credentials ou la sortie brute de docker inspect.

Le fichier deploy/compose.runner-synology.yaml est un modèle : sa modification dans GitHub ne change pas le conteneur installé.
Avant de l'appliquer, inspecter le build OneTask et comparer la configuration réelle. Ne pas écraser un fichier NAS à l'aveugle.

## Activer et valider

1. Le propriétaire révise puis fusionne la PR vers main.
2. Dans Actions → LeHub - CI and GHCR, suivre le job build-publish.
3. Le précontrôle doit confirmer le runner, l'architecture et l'accès au moteur Docker.
4. Les étapes lint/typecheck/tests/build et les trois constructions doivent réussir.
5. Vérifier les trois packages GHCR et leurs tags SHA/latest ; les références sont dans le résumé du job.

Un job en attente suggère un runner hors ligne ou des labels incompatibles.
Une erreur avant checkout peut venir de Bash/Git/Docker ou des permissions socket.
Un échec checkout peut venir d'un runner obsolète.
Une erreur 403 à la publication peut venir des permissions du package.
Un build réussi ne valide pas les migrations, l'OCR en fonctionnement, les tests navigateur ou la santé de l'application déployée.

## Déploiement ultérieur

Les modèles deploy/synology/ et scripts/init-demo-env.sh / scripts/deploy-demo.sh sont conservés, mais ne sont plus appelés par la CI.
La préparation du Compose public-sites, des secrets, de Caddy et des sauvegardes sera revue séparément.
Aucun changement de schéma, de variable applicative ni d'interface dans ce lot.
