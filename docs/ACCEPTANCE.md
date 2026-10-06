# Recette d’une installation réelle

Utiliser une instance HTTPS de test, des comptes/documents jetables et des destinataires/appareils volontaires. Ne pas copier les secrets dans ce rapport. Compléter les cases **après observation** ; aucun test local ne les valide automatiquement.

| Information | À renseigner sans secret |
| --- | --- |
| Date / opérateur | |
| Commit testé | |
| URL de test | |
| Docker / Compose / PostgreSQL | |
| Navigateur / OS / modèle de téléphone | |
| SMTP, stockage distant et relais d’alertes utilisés | Noms seulement, aucun identifiant ni token |

## 1. PostgreSQL natif et images Docker

Lancer les commandes du [README](../README.md#valider-une-installation-réelle) avec `-p lehub-validation -f compose.validation.yaml`. Elles isolent les services et données. Conserver le code de sortie du validateur et ses logs avant `down`.

- [ ] Images validation, application et worker construites.
- [ ] Migrations, dont 0007, exécutées sans erreur.
- [ ] Validation terminée avec code de sortie 0.
- [ ] Scénarios concurrents : formulaire périmé, réalisation unique, cases explicites, rejouabilité hors ligne, rôles, correction, endpoint push, deux workers et déplacement concurrent.
- [ ] Original du ZIP restauré et accès privé vérifié.
- [ ] Archive chiffrée restaurée par les vrais clients `pg_dump`/`pg_restore` ; données 2FA incluses dans le contrôle des tables.
- [ ] Démarrage de la production, cycle worker et SMTP **local du harnais** réussis.

Le harnais ne valide ni un fournisseur SMTP extérieur ni une livraison push à un téléphone. En cas d’échec, conserver les logs et ne pas cocher la ligne correspondante.

## 2. SMTP TLS réel

- [ ] Configurer le vrai fournisseur dans `.env`, port 587 STARTTLS ou 465 TLS direct ; garder `SMTP_ALLOW_PLAINTEXT=false`.
- [ ] Recréer app/worker, puis demander le test depuis Paramètres → Exploitation avec un administrateur volontaire.
- [ ] Observer l’email dans sa boîte et vérifier TLS dans les logs du fournisseur ; noter date et délai, sans publier son adresse.
- [ ] Sur un relais de test maîtrisé, provoquer une erreur temporaire, observer le rappel en échec, rétablir le relais et relancer seulement ce rappel.
- [ ] Recevoir un lien « mot de passe oublié », le consommer une seule fois et vérifier qu’un deuxième usage échoue.
- [ ] Avec 2FA activée, vérifier qu’un nouveau mot de passe exige toujours un second facteur.

Résultat observé / éventuel échec :

## 3. Push réel sur deux appareils

- [ ] Générer/conserver des clés VAPID réelles ; tester sur HTTPS avec permissions acceptées.
- [ ] Sur chaque appareil volontaire, activer et recevoir le test du foyer.
- [ ] Recevoir un vrai rappel sur les deux appareils ; constater les reçus par appareil dans Exploitation.
- [ ] Tester une erreur fournisseur temporaire pour un seul endpoint **si le fournisseur ou un relais de test maîtrisé permet cette injection** : vérifier que l’autre reçu reste envoyé et que seule la livraison échouée est relancée. Couper simplement le réseau du téléphone ne prouve pas un échec fournisseur.
- [ ] Si cette injection n’est pas disponible, marquer ce scénario externe « non vérifié » ; le scénario de concurrence/fournisseur simulé du harnais reste une couverture distincte.
- [ ] Se déconnecter sur l’appareil A, puis provoquer un autre rappel depuis B : l’ancienne inscription de A a disparu côté serveur.
- [ ] Révoquer la session de B depuis un autre appareil : accès serveur coupé et inscription retirée.
- [ ] Réactiver explicitement après reconnexion et vérifier le foyer ciblé.

Un push accepté peut être affiché plus tard ; la révocation ne retire pas une notification déjà livrée ou déjà acceptée par le fournisseur. Résultat / délais / appareils :

## 4. Sauvegarde distante et reprise

- [ ] Activer backups avec une clé indépendante, destination sur une autre machine et configuration rclone privée.
- [ ] Observer un cycle local validé puis un succès distant après relecture SHA-256.
- [ ] Récupérer **la copie distante**, et non le fichier local d’origine.
- [ ] Exécuter `--verify` sur cette copie avec des clients PostgreSQL natifs.
- [ ] Dans un nouveau projet Compose avec volumes neufs, restaurer base, originaux et configuration depuis cette copie ; ne pas démarrer le worker avant contrôle.
- [ ] Se connecter, vérifier 2FA, foyers, documents, historique et courses ; ne pas consigner secrets ni codes.
- [ ] Vérifier que la clé d’archive et le secret Better Auth sont récupérables hors serveur.
- [ ] Configurer rétention/versioning distant et connaître le délai de reprise observé.

Archive testée / SHA-256 / résultat / durée :

## 5. Alertes et machine indisponible

- [ ] Faire tourner monitor, vérifier la réception ntfy/relais.
- [ ] Sur l’instance de test, arrêter worker, attendre le seuil annoncé, observer une alerte ; redémarrer et observer le rétablissement.
- [ ] Tester un backup en échec sur cette instance, puis une reprise.
- [ ] Configurer Uptime Kuma sur une **autre machine**, endpoint protégé et token privé.
- [ ] Couper l’app de test, vérifier l’alerte extérieure et son rétablissement.
- [ ] Tester un intervalle de sauvegarde supérieur à 48 heures sans faux signal prématuré.

Résultats / délai d’alerte :

## 6. Safari et iPhone réels

- [ ] Safari : connexion, invitation, paramètres par rubrique et 2FA avec TOTP/code de secours.
- [ ] Installer depuis Safari sur l’écran d’accueil, lancer en mode app.
- [ ] Activer courses hors ligne, couper Wi-Fi/données, ajouter/cocher et fermer/rouvrir l’app ; retrouver la file.
- [ ] Rétablir le réseau et vérifier chaque changement depuis un second compte.
- [ ] Provoquer un conflit d’article, résoudre cet article et conserver les autres changements.
- [ ] Vérifier changement de foyer et confirmation d’effacement limitée au foyer ; annuler conserve la file.
- [ ] Ouvrir un vrai PDF dans l’app et le télécharger ; vérifier le lecteur natif, pas seulement les en-têtes HTTP.
- [ ] Activer/recevoir un push dans l’app installée, puis vérifier déconnexion et révocation côté serveur.
- [ ] Calendrier : ouvrir une journée avec plus de trois événements, reporter avec le formulaire tactile et vérifier les récurrences.
- [ ] Compte/appareils, Notifications et Exploitation : vérifier largeur à 390 px, clavier et défilement.

WebKit Linux est une couverture automatisée complémentaire ; ce n’est pas un iPhone et il ne valide pas son installation, lecteur PDF ou réception push. Résultats / versions / limites :

## Statut avant livraison

- [ ] Tous les scénarios applicables ont un résultat et une preuve sans secret.
- [ ] Les scénarios impossibles ou non exécutés sont explicitement notés.
- [ ] La restauration a été réellement essayée, pas seulement la création d’archive.
- [ ] Aucun compte, appareil ou service de production n’a subi l’injection de panne.
