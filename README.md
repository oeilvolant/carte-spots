# Œil Volant — carte collaborative privée

Ce dossier est un **prototype prêt à configurer et publier**, pas un site déjà en ligne.
Les membres autorisés voient les **mêmes spots et parcours** avec synchronisation automatique.

## Fichiers

- `index.html` : carte interactive et création de spots/parcours
- `collab.js` : connexion Google et données communes dans Firebase
- `firebase-config.js` : paramètres publics du projet Firebase (à renseigner)
- `firestore.rules` : règles de sécurité à déployer **dans la console Firebase**
- `.nojekyll` : configuration GitHub Pages

## 1 — Activer Firebase (obligatoire pour le partage)

1. Va sur https://console.firebase.google.com/ et crée un projet, formule **Spark** gratuite.
2. Active **Authentication > Sign-in method > Google**.
3. Dans **Firestore Database**, crée une base Standard en **mode production** (règles sécurisées).
4. Dans **Paramètres du projet > Général**, ajoute une application Web et copie sa configuration : `apiKey`, `authDomain`, `projectId`, `appId`.
5. Colle ces paramètres dans le fichier `firebase-config.js`. Remplace `ownerEmail` par **ton adresse Google exacte**.
6. Ouvre `firestore.rules` et remplace `ton.adresse@gmail.com` par **la même adresse** que `ownerEmail` (respecte la casse).
7. Copie le contenu de `firestore.rules` dans **Firestore Database > Règles**, puis clique **Publier**.

**Important** : publier simplement le fichier `firestore.rules` sur GitHub n'active pas les règles Firebase. **Ne laisse jamais la base avec des règles publiques** du type `allow read, write: if true`.
La configuration Web Firebase n'est pas un mot de passe ; ne publie jamais de clés de compte de service ou de secrets privés.

## 2 — Publier le site sur GitHub Pages

1. Va sur https://github.com et crée un dépôt public `carte-spots`.
2. Ajoute à la **racine** `index.html`, `collab.js`, `firebase-config.js`, `.nojekyll`.
3. Dans **Settings > Pages**, choisis « Deploy from a branch », branche `main`, dossier `/(root)`.
4. Ton adresse sera du type `https://PSEUDO.github.io/carte-spots/` (l'adresse exacte sera affichée par GitHub).
5. Dans la console Firebase : **Authentication > Settings > Authorized domains**, ajoute `PSEUDO.github.io` (sans `https://` ni `/carte-spots/`).

La **page HTML** hébergée sur GitHub Pages reste publique ; les données (spots et routes) restent privées aux comptes autorisés grâce aux règles Firestore. Il faut une connexion Internet et l'adresse **HTTPS** : la connexion Google n'est pas fiable depuis `file://`.

## 3 — Donner l'accès à un ami ou collaborateur

1. Connecte-toi sur ton site avec le compte Google défini comme `ownerEmail`.
2. Ouvre **« Partager et gérer les accès »**.
3. Saisis l'adresse e-mail Google de la personne, puis choisis **Peut ajouter** ou **Lecture seule**.
4. Clique **Autoriser cette personne**, puis **Copier le lien de la carte**.
5. Envoie le lien. La personne l'ouvre et se connecte avec **exactement le compte Google invité**.

Les contributions de chacun s'affichent automatiquement sur les deux appareils. Le propriétaire gère tous les spots et invitations ; un collaborateur peut ajouter, modifier et supprimer **ses propres** spots/parcours uniquement ; un lecteur ne peut rien modifier. En cas de changement de droits, il peut être nécessaire de recharger la page. Un lien seul ne donne pas accès aux données.

## 4 — Importer la carte précédente

- Sur la V1/V2, clique **Sauvegarder** pour obtenir un fichier JSON.
- Sur le nouveau site, connecté en administrateur, clique **Importer**.
- Les spots et parcours de la sauvegarde seront **ajoutés** sans écraser ceux d'identifiant identique.
- Fais des exports JSON de sécurité régulièrement.

## Limites et sécurité aérienne

- Le calcul routier OSRM utilise un **serveur public de démonstration**, à remplacer avant une exploitation commerciale intensive.
- Les couches IGN/OACI/DGAC dépendent de flux externes pouvant nécessiter des autorisations, ou être indisponibles. Elles ne constituent **jamais une autorisation de vol drone**. Vérifier les sources officielles à jour et les NOTAM.
- L'affichage satellite est une photographie aérienne IGN, non une vue en direct.
- Les préférences de couches et les éléments masqués sont propres au navigateur (les spots et les parcours, eux, sont synchronisés).
- Ce prototype a subi des tests de syntaxe, **pas** de test de connexion sur ton projet Firebase ; les configurations, autorisations de domaine et règles sont à valider après mise en ligne.

Documentation : https://firebase.google.com/docs/auth/web/google-signin · https://firebase.google.com/docs/firestore/security/get-started · https://docs.github.com/en/pages
