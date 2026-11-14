# QCM App · Plateforme d'évaluation 2026

Application web d'évaluations et QCM pour **QCM App**.
Conçue avec **React 19 + Vite 8 + Tailwind CSS** et un **backend Node.js / Express + SQLite** (plus aucune dépendance à Firebase).

---

## Architecture

```text
┌────────────────────────────┐        /api/* (JSON + jetons Bearer)
│  Frontend React (SPA)      │  ◄──────────────────────────────►  Backend Express
│  Vite + Tailwind 4         │                                      │
└────────────────────────────┘                              ┌────────┴────────┐
                                                            │  SQLite local   │
                                                            │  data/qcm.db    │
                                                            └─────────────────┘
```

- **Développement** : `npm run dev` démarre l'API Express (`:3001`) et Vite (`:5173`) ensemble ; le proxy Vite transmet `/api` au backend.
- **Production** : `npm run build` puis `npm start` · le serveur Express sert le frontend compilé (`dist/`) **et** l'API sur un seul port.
- **Base de données** : SQLite via `better-sqlite3` (fichier unique `data/qcm.db`, sauvegardes faciles, aucun service externe).

---

## Nouvelles Fonctionnalités & Mises à Jour

### 1. Inscription & Authentification Étudiant (API sécurisée)
- **Inscription complète** : Nom complet ou pseudo, adresse email, mot de passe, filière, niveau, année académique et date de naissance (optionnelle).
- **Authentification par jeton serveur** : les mots de passe sont hachés côté serveur (scrypt + sel aléatoire) et le backend délivre un jeton de session. Le navigateur ne manipule plus aucun hash.
- **Récupération de mot de passe par Email via Google SMTP** :
  - Génération d'un code de vérification à 6 chiffres valable 15 minutes.
  - Expédition par email via le service SMTP officiel de Google (Gmail).
  - Utilise l'adresse Gmail et le **code à 16 caractères** (Mot de passe d'application Google gratuit).
  - Réinitialisation et mise à jour du mot de passe en 3 étapes sécurisées.

### 2. Espace Étudiant & Gestion des QCM Passés / Manqués
- **Historique personnel exclusif** : L'espace d'un étudiant n'affiche **strictement que les QCM qu'il a lui-même passés**, avec sa note (/20), son score et un accès à la correction détaillée ("Relire ma copie").
- **Rattrapage des évaluations manquées** :
  - Si un étudiant a manqué une épreuve programmée, celle-ci apparaît dans une section dédiée : *Évaluations Manquées · Rattrapage Disponible*.
  - L'étudiant peut rattraper l'évaluation à son rythme, mais avec **exactement le même temps par question, la même durée totale et les mêmes questions/configurations** que la session officielle.
  - Le résultat est enregistré avec la mention *Rattrapage*.

### 3. Gestion de la Filière & Niveaux d'Étude
- Un étudiant est lié à **une seule filière** choisie à l'inscription (cadenassée sur son tableau de bord).
- Il peut naviguer entre tous les niveaux de sa filière (L1, L2, L3, M1, M2), avec son **niveau d'inscription sélectionné et mis en avant par défaut**.

### 4. Alertes & Emploi du Temps
- **Avertissements proactifs** : Bannière d'alerte et compte à rebours dynamique pour les QCM prévus aujourd'hui ou dans les prochaines 24h/48h.
- **Notifications navigateur** : Possibilité d'activer les rappels Web Notifications.
- **Emploi du temps synchronisé** : Consultation du calendrier des épreuves avec statuts clairs (À venir, En cours, Rattrapage possible, Terminé).

### 5. Espace de Contact & Suggestions pour l'Admin
- Formulaire dédié accessible en un clic depuis l'espace étudiant :
  - Catégorie : *Suggestion d'amélioration*, *Signalement d'erreur dans un QCM*, *Demande de rattrapage*, *Problème technique*, *Autre demande*.
  - Sélection de l'UE concernée, sujet et message.
  - Suivi des messages envoyés par l'étudiant avec leur statut (*En attente*, *En cours*, *Traité*).
- Côté Administrateur : section *Messages* permettant de filtrer par catégorie/filière, mettre à jour le statut, répondre directement par email (`mailto:`) ou supprimer.

### 6. Panneau Administrateur Réorganisé & Complet
- **Interface repensée** : barre latérale sur desktop et onglets défilants sur mobile, neuf sections claires · *Vue d'ensemble, Évaluations, Analytique, Unités d'enseignement, Étudiants, Résultats, Messages, Sauvegardes, Paramètres SMTP* · dans le même thème sombre que l'espace étudiant.
- **Vue d'ensemble** : statistiques clés (évaluations, à venir, étudiants inscrits, messages en attente) et listes des prochaines et dernières évaluations.
- **Évaluations** :
  - Programmation (filière, niveau, semestre, minuterie, **nombre de questions tirées par étudiant**, ouverture/clôture) et import CSV regroupés côte à côte.
  - Liste complète avec actions : inspecter les questions, consulter les résultats, exporter CSV / procès-verbal PDF, supprimer l'évaluation (**les résultats déjà enregistrés sont conservés**).
- **Analytique** : tableau de bord pédagogique avec les questions les plus ratées, la réussite moyenne par UE, l'évolution des notes dans le temps et les taux d'erreur globaux.
- **Résultats** : consultation des notes par évaluation (participants, moyenne, meilleure note) avec exports CSV / PDF, plus un **export complet** de toutes les copies avec le détail de chaque réponse.
- **Sauvegardes** : création, téléchargement et suppression des copies de sécurité SQLite (sauvegarde automatique planifiée côté serveur).
- **Étudiants** : recherche, filtres, suppression et **export CSV** de la liste complète.
- **Parser CSV Ultra-Flexible** :
  - Accepte tous les délimiteurs : point-virgule (`;` standard Excel français), virgule (`,`), tabulation (`\t`), pipe (`|`).
  - Suppression automatique du BOM UTF-8 (`\ufeff`) qui corrompt souvent la première colonne dans Excel.
  - Détection tolérante des colonnes (Question/Énoncé, OptA-D / Option A-D / Choix 1-4, ReponseCorrecte / Bonne Réponse).
  - Support des réponses sous forme de lettre (`A`, `B`, `C`, `D`), de chiffre (`1`, `2`, `3`, `4`) ou du texte complet de l'option.
  - **Modal de prévisualisation avant importation** : affiche le nombre de questions détectées, les colonnes reconnues, un aperçu des cartes de questions et alertes d'erreurs éventuelles.
  - **Téléchargement de modèles CSV** : Modèle Excel (`;`) et Modèle Standard (`,`) téléchargeables en 1 clic.
- **Inspecteur de questions** : Consultation et suppression individuelle des questions chargées dans une UE.
- **Configuration SMTP Google en direct** : saisie de l'adresse Gmail et du mot de passe d'application à 16 caractères, avec outil de test d'envoi d'email en temps réel.

### 7. Tuteur IA (proxy serveur sécurisé)
- Après une épreuve, la **correction** propose un **Tuteur IA** intégré pour comprendre les mauvaises réponses :
  - Bouton global *Aide IA pour réviser* et bandeau récapitulatif du nombre d'erreurs.
  - Bouton *Comprendre cette erreur avec l'IA* sur chaque question ratée (la question, les options, la réponse choisie et la bonne réponse alimentent le contexte).
  - Conversations guidées : le tuteur explique **pourquoi** la réponse est incorrecte au lieu de donner la lettre de la solution.
- **Aucune clé côté navigateur** : les appels passent par le proxy serveur `/api/ai/tutor`. Les clés `GROQ_API_KEYS` / `GEMINI_API_KEYS` restent dans le `.env` du serveur, avec **rotation automatique** et **repli d'un fournisseur à l'autre** en cas d'erreur ou de quota atteint.
- L'assistant s'identifie uniquement comme **QCM App** : il ne révèle jamais le fournisseur, le modèle ou la technologie sous-jacente.
- **Réponse lisible** : le tuteur rend le Markdown (gras, listes, tableaux) et les formules mathématiques LaTeX (`\(...\)`, `\[...\]`) avec **KaTeX**. L'étudiant ne voit jamais les astérisques ni les délimiteurs bruts.
- **Réponse réellement cochée** : le contexte transmis contient le **texte exact de la case cochée** par l'étudiant (y compris pour les anciennes copies qui ne stockaient que la lettre A/B/C/D). Le tuteur ne prétend plus qu'aucune réponse n'a été donnée. Un message explicite « aucune case cochée » s'affiche uniquement lorsque c'est vrai.
- **Quota anti-épuisement des tokens** : `2` questions maximum par erreur et par étudiant sur une **fenêtre glissante de 24 h** (persisté dans la table `ai_usage`), plus un plafond quotidien (`30` par défaut). Quitter puis revenir avant l'échéance ne réinitialise pas le compteur. Les boutons IA restent masqués tant que les clés ne sont pas configurées (`GET /api/ai/status`).
- **Tableau de bord admin « Tuteur IA »** : nombre de requêtes (aujourd'hui, semaine, mois), requêtes réussies / en erreur / refusées par quota, **tokens consommés** (annoncés par les fournisseurs), **budget mensuel restant** (`AI_TOKEN_BUDGET` − consommation du mois), graphique des 30 derniers jours, étudiants les plus consommateurs et questions les plus travaillées.

### 8. Évaluations sécurisées & apprentissage adaptatif
- **Correction 100 % côté serveur** : l'API publique ne renvoie jamais `ReponseCorrecte`. L'étudiant n'envoie que ses choix ; le serveur calcule le score, la note et la correction détaillée, puis les restitue après soumission. L'inspecteur admin conserve l'accès complet via son jeton.
- **Anti-triche pendant l'épreuve** : détection des changements d'onglet, blocage du copier/coller et du menu contextuel, avertissement visuel, plein écran proposé et **soumission automatique au 3ᵉ incident**.
- **Banque de questions enrichie** : tags libres, niveau de difficulté (`facile`, `moyenne`, `difficile`) et nombre de questions tirées par étudiant. Le tirage est **déterministe par étudiant** (même tirage en cas de reprise, ordre différent d'un étudiant à l'autre).
- **Révisions intelligentes** : chaque erreur crée une carte de révision planifiée par **répétition espacée** (algorithme SM-2 simplifié). L'espace `/revision` permet de réviser les cartes dues, de consulter toutes ses cartes et de suivre ses échéances par UE.
- **Correction visible après l'épreuve** : à la fin du QCM, l'étudiant voit immédiatement les cases qu'il a cochées et la bonne réponse pour chaque question. La correction reste **inaccessible pendant l'épreuve** ; elle est également disponible dans « Relire ma copie » (y compris pour les anciennes copies).
- **Classements par salle** : une salle correspond à la classe de l'étudiant (**filière + niveau**). L'administration dispose d'un onglet *Classements* filtrable par UE, filière et niveau, avec **export CSV et PDF**. Chaque étudiant peut afficher le classement de sa propre salle depuis son espace, **uniquement après avoir cliqué sur « Classement »** : chaque personne est classée sur sa meilleure tentative, par épreuve et par session.
- **Sauvegarde automatique SQLite** : copies cohérentes via `db.backup()`, rotation configurable, téléchargement et suppression depuis l'administration, et **export complet** des résultats (une ligne par réponse) au format CSV.

### 9. Design Professionnel Unifié
- **Thème sombre** cohérent sur tout le site (étudiant et administration) : fonds `slate-950/900`, bordures `slate-800`, couleur primaire `blue-600`, accents émeraude / rouge / indigo.
- **Aucun emoji** : l'interface utilise exclusivement des icônes SVG au trait fin (`src/components/ui/icons.jsx`), alignées et lisibles à toutes les tailles.
- Identité resserrée sur le nom **QCM App** partout (titre, emails, pied de page, procès-verbaux PDF).

---

## Configuration du Service SMTP Google (16 Caractères)

Pour activer l'envoi réel des emails de récupération de mot de passe :
1. Connectez-vous à votre compte Google et activez la **Validation en deux étapes (2FA)** dans vos paramètres de sécurité.
2. Rendez-vous sur : [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Créez un mot de passe d'application (nommez-le par exemple *"QCM App"*).
4. Google vous fournit un code à **16 caractères** (ex: `abcd efgh ijkl mnop`).
5. Rendez-vous dans le panneau d'administration (section *Paramètres SMTP*) ou ajoutez-le dans votre fichier `.env` :
   ```env
   SMTP_EMAIL=votre-adresse@gmail.com
   SMTP_APP_PASSWORD=abcd efgh ijkl mnop
   ```

> Si aucun SMTP n'est configuré, le code de récupération est tout de même généré et renvoyé à l'écran (mode simulation) afin de pouvoir tester le flux complet en local.

---

## Configuration du Tuteur IA (Groq + Gemini)

Ajoutez vos clés dans le `.env` du serveur (jamais dans le frontend) :

```env
# 1 à 6 clés par fournisseur, séparées par des virgules
GROQ_API_KEYS=cle_groq_1,cle_groq_2,cle_groq_3
GEMINI_API_KEYS=cle_gemini_1,cle_gemini_2,cle_gemini_3

# Facultatif : modèles et quotas
# GROQ_MODEL=llama-3.3-70b-versatile
# GEMINI_MODEL=gemini-2.0-flash
# AI_MAX_QUESTIONS_PER_ERROR=2
# AI_DAILY_LIMIT=30

# Budget mensuel de tokens (tableau de bord admin) · 0 = illimité
# AI_TOKEN_BUDGET=1000000
```

Le serveur alterne les clés à chaque requête et bascule automatiquement vers une autre clé ou l'autre fournisseur en cas d'échec. Sans aucune clé, `GET /api/ai/status` renvoie `available: false` et les boutons IA sont masqués dans l'interface.

Le budget `AI_TOKEN_BUDGET` est comparé aux tokens réellement annoncés par les fournisseurs (`usage` / `usageMetadata`). Le tableau de bord **Administration → Tuteur IA** affiche le restant du mois, la consommation quotidienne, les refus de quota et les étudiants les plus consommateurs. Les requêtes sont journalisées dans la table `ai_requests` (statut, fournisseur, modèle, tokens).

---

## Démarrage Rapide

```bash
# 1. Installation des dépendances
npm install

# 2. Configuration (mot de passe admin, SMTP optionnel)
cp .env.example .env
#   → éditez ADMIN_PASSWORD (obligatoire pour l'espace admin)

# 3. Lancement en développement (API :3001 + Vite :5173 avec proxy)
npm run dev

# 4. Build de production + démarrage (un seul serveur)
npm run build
npm start
```

- **Développement** : ouvrez [http://localhost:5173](http://localhost:5173) (les appels `/api` sont automatiquement proxyfiés vers l'API Express).
- **Production** : ouvrez [http://localhost:3001](http://localhost:3001) (modifiable via `PORT` dans `.env`).

---

## API REST (résumé)

| Méthode & route | Accès | Description |
|---|---|---|
| `POST /api/auth/register` | public | Inscription étudiant |
| `POST /api/auth/login` | public | Connexion étudiant → jeton |
| `POST /api/auth/forgot-password` | public | Étape 1 : code 6 chiffres par email |
| `POST /api/auth/verify-reset-code` | public | Étape 2 : vérification du code |
| `POST /api/auth/reset-password` | public | Étape 3 : nouveau mot de passe |
| `PUT /api/auth/profile` | étudiant | Mise à jour du profil |
| `POST /api/auth/change-password` | étudiant | Changement de mot de passe |
| `GET /api/quizzes` | public | Liste des QCM (filtres filière/niveau, tri) |
| `GET /api/quizzes/:id` | public | Métadonnées d'un QCM |
| `GET /api/quizzes/:id/questions` | public / admin | Questions (sans correction pour les étudiants, tirage par étudiant ; correction complète avec jeton admin) |
| `POST /api/quizzes/:id` | admin | Programmer / fusionner un QCM |
| `POST /api/quizzes/:id/questions` | admin | Importer (remplacer) les questions |
| `DELETE /api/quizzes/:id/questions/:qid` | admin | Supprimer une question |
| `DELETE /api/quizzes/:id` | admin | Supprimer un QCM (questions + sessions ; **résultats conservés**) |
| `POST /api/quizzes/:id/sessions` | public | Heartbeat présence participants |
| `GET /api/quizzes/:id/sessions` | public | Compteur de participants |
| `POST /api/results` | étudiant | Enregistrer une copie (score et correction calculés serveur) |
| `GET /api/results?ue=&sessionTimestamp=` | public | Classement d'une session |
| `GET /api/results/ranking?niveau=&ue=&sessionTimestamp=` | étudiant | Classement de sa salle (filière forcée côté serveur) |
| `GET /api/results/mine` | étudiant | Historique personnel (avec correction) |
| `GET /api/review/stats` | étudiant | Statistiques de révision espacée par UE |
| `GET /api/review` | étudiant | Cartes dues (`?all=1` pour toutes, `?ue=` pour filtrer) |
| `POST /api/review/:id/answer` | étudiant | Réévaluer une carte (`remembered`) |
| `DELETE /api/review/:id` | étudiant | Supprimer une carte de révision |
| `POST /api/feedback` | étudiant | Envoyer un message/suggestion |
| `GET /api/feedback/mine` | étudiant | Suivi de mes messages |
| `GET /api/feedback` · `PATCH` · `DELETE` | admin | Gestion des messages |
| `GET /api/ues` | public | Liste des UEs |
| `POST /api/ues` · `DELETE /api/ues/:id` | admin | Gestion des UEs |
| `GET /api/ai/status` | étudiant | Disponibilité de l'assistant + quotas restants (dont fenêtre 24 h par question) |
| `POST /api/ai/tutor` | étudiant | Question au tuteur (rotation de clés, quota 2/erreur sur 24 h) |
| `GET /api/admin/ai-usage` | admin | Requêtes, tokens consommés et budget mensuel restant |
| `POST /api/admin/login` | public | Connexion admin → jeton |
| `POST /api/admin/logout` | admin | Révoquer le jeton admin côté serveur |
| `GET /api/admin/students` · `DELETE` | admin | Gestion des étudiants |
| `GET /api/admin/results?ue=` | admin | Résultats (sans `ue` : export complet) |
| `GET /api/admin/analytics` | admin | Agrégats : questions ratées, réussite par UE, évolution |
| `GET /api/admin/rankings?ue=&filiere=&niveau=` | admin | Classements par salle (filière + niveau), par épreuve et session |
| `GET/POST /api/admin/backups` | admin | Lister / créer une sauvegarde SQLite |
| `GET/DELETE /api/admin/backups/:name` | admin | Télécharger / supprimer une sauvegarde |
| `GET/PUT /api/settings/smtp` · `POST /api/settings/test-smtp` | admin | Configuration & test SMTP |

---

## Structure du Projet

```text
├── server/                     # Backend Node.js / Express (remplace Firebase)
│   ├── index.js                # Point d'entrée : API + frontend statique en prod
│   ├── db.js                   # SQLite (better-sqlite3) & schéma
│   ├── auth.js                 # scrypt, jetons, middlewares requireStudent/requireAdmin
│   ├── smtp.js                 # Envoi SMTP Google (Nodemailer)
│   ├── backup.js               # Sauvegardes SQLite planifiées (db.backup + rotation)
│   ├── questionDraw.js         # Tirage déterministe des questions par étudiant
│   ├── ranking.js              # Classements par salle (filière + niveau), meilleure tentative
│   ├── spacedRepetition.js     # Algorithme de répétition espacée (cartes d'erreurs)
│   └── routes/
│       ├── auth.js             # Inscription, connexion, MDP oublié (3 étapes), profil
│       ├── quizzes.js          # QCM, questions (sans correction publique), tirage, présence
│       ├── results.js          # Copies corrigées serveur, classement, historique personnel
│       ├── review.js           # Révisions intelligentes : cartes dues, réponses, stats
│       ├── feedback.js         # Messages & suggestions étudiants
│       ├── ues.js              # Unités d'enseignement
│       ├── admin.js            # Login admin, étudiants, résultats, analytique, IA, classements
│       ├── ai.js               # Tuteur IA : proxy Groq/Gemini, quotas 24 h, tokens, identité QCM App
│       └── settings.js         # Configuration & test SMTP
├── src/                        # Frontend React 19
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.jsx      # Barre de navigation partagée (responsive, menu utilisateur)
│   │   │   └── Footer.jsx     # Pied de page partagé (navigation, infos institution)
│   │   ├── pages/
│   │   │   ├── Home.jsx       # Accueil public : présentation, stats en direct, prochaines évaluations
│   │   │   ├── ContactPage.jsx # Page « Contacter l'administration » (espace étudiant)
│   │   │   └── NotFound.jsx    # Page 404
│   │   ├── ai/
│   │   │   ├── AiTutor.jsx     # Drawer « Tuteur IA » (proxy serveur, quotas 24 h)
│   │   │   └── AiMarkdown.jsx  # Rendu Markdown + formules LaTeX (KaTeX)
│   │   ├── ui/
│   │   │   └── icons.jsx       # Bibliothèque d'icônes SVG au trait (aucun emoji)
│   │   ├── ContactAdmin.jsx    # Formulaire de suggestions & signalements étudiants
│   │   ├── Login.jsx           # Accès sécurisé Administrateur
│   │   ├── ReviewSession.jsx   # Relecture détaillée d'une copie d'examen (+ Tuteur IA)
│   │   ├── RevisionSession.jsx # Révisions espacées des erreurs (cartes dues / toutes)
│   │   ├── Schedule.jsx        # Emploi du temps public & étudiant
│   │   ├── StudentAuth.jsx     # Connexion, Inscription complète & Récupération MDP
│   │   ├── StudentDashboard.jsx # Tableau de bord étudiant (Alertes, Rattrapages, QCM)
│   │   └── StudentProfile.jsx  # Profil personnel & changement de mot de passe
│   ├── hooks/
│   │   └── usePageTitle.js     # Titre d'onglet par page
│   ├── services/
│   │   ├── api.js              # Couche d'accès à l'API REST (jetons Bearer)
│   │   ├── aiService.js         # Pont vers le proxy serveur /api/ai (aucune clé exposée)
│   │   ├── authService.js      # Authentification étudiant (délégue au serveur)
│   │   └── emailService.js      # Configuration SMTP & test (admin)
│   ├── utils/
│   │   └── csvParser.js        # Parser CSV universel tolérant tous formats & délimiteurs
│   ├── AdminPanel.jsx          # Panneau d'administration complet
│   ├── App.jsx                 # Routage protégé + layout (navbar/footer) de l'application
│   ├── config.js               # URL discrète du portail administrateur
│   ├── QuizSession.jsx         # Moteur de passage de QCM (Live & Rattrapage, correction à la fin)
│   └── main.jsx
├── data/                       # Base SQLite (créée automatiquement, gitignorée)
└── .env                        # ADMIN_PASSWORD, SMTP, PORT (voir .env.example)
```

### Navigation (routes)

| Route | Accès | Description |
| --- | --- | --- |
| `/` | Public | Accueil : présentation, statistiques en direct, prochaines évaluations |
| `/login`, `/register`, `/forgot-password` | Public (redirige vers `/dashboard` si connecté) | Authentification étudiant |
| `/dashboard` | Étudiant connecté | Espace personnel : UE, évaluations, rattrapages, résultats |
| `/schedule` | Public | Emploi du temps des évaluations (filtrable) |
| `/contact` | Étudiant connecté | Suggestions / contact administration |
| `/quiz/:quizId` | Étudiant connecté | Session d'évaluation (immersif, sans navbar) |
| `/review/:quizId` | Étudiant connecté | Relecture de copie |
| `/revision` | Étudiant connecté | Révisions intelligentes (répétition espacée) |
| Portail admin (URL discrète, voir `src/config.js`) | Admin | Connexion + panneau d'administration (aucun lien public) |
| `*` | · | Page 404 |

La **navbar** et le **footer** sont partagés sur toutes les pages standard ; les sessions d'évaluation (`/quiz/...`) restent immersives pour la concentration. Le titre de l'onglet suit la page (`usePageTitle`).

> **Accès administrateur discret** : le portail n'apparaît plus dans aucun menu. Il est accessible via l'URL définie dans `src/config.js` (`/qa-admin-7f3c` par défaut) ou le raccourci **Ctrl + Shift + Alt + A**. Cette discrétion ne remplace pas la sécurité : le mot de passe et le jeton restent vérifiés côté serveur.

---

## Sécurité (améliorations par rapport à la version Firestore)

- Les **mots de passe** sont hachés côté **serveur** (scrypt + sel aléatoire par utilisateur) · plus aucun hash dans le navigateur.
- Le **mot de passe administrateur** (`ADMIN_PASSWORD`) est vérifié côté serveur avec comparaison temps constant · l'ancien `VITE_ADMIN_PASSWORD` était exposé dans le bundle JS.
- **Connexion admin protégée contre le force brute** : 5 tentatives maximum par fenêtre glissante de 10 minutes et par IP ; au-delà, le serveur répond `429` avec le délai restant et le compteur est remis à zéro après une connexion réussie.
- **Jetons admin à durée de vie limitée** : 8 heures ; la **déconnexion révoque le jeton côté serveur** (`POST /api/admin/logout`), impossible de le réutiliser ensuite.
- **Expiration gérée côté client** : à la première réponse `401`, la session admin locale est effacée et l'utilisateur est redirigé vers le portail discret (`src/config.js`) avec un message explicite.
- **Portail administrateur non exposé** : aucun lien visible dans la navbar, le footer ou les pages d'authentification. L'URL secrète et le raccourci clavier ne remplacent pas l'authentification serveur.
- **Tuteur IA sans clé exposée** : les appels passent par `/api/ai/*`, avec rotation de clés, repli automatique et quotas persistés en base.
- Toutes les **écritures** (QCM, questions, UEs, messages, résultats, étudiants, SMTP) exigent un **jeton administrateur**.
- L'**historique personnel** (`/api/results/mine`) et le **suivi des messages** sont filtrés par le serveur selon l'identité du jeton · plus de lecture globale des résultats côté client.
- Les réinitialisations de mot de passe et les présences obsolètes sont **nettoyées automatiquement** côté serveur.

## Sauvegarde de la base

Les sauvegardes sont **automatiques** : le serveur crée une copie cohérente de la base au démarrage (après 30 secondes) puis toutes les `BACKUP_INTERVAL_HOURS` heures (6 par défaut). Les fichiers sont stockés dans `data/backups` (ou `BACKUP_DIR`) et les plus anciens sont supprimés au-delà de `BACKUP_MAX` copies (10 par défaut).

```env
BACKUP_ENABLED=true          # false pour désactiver
BACKUP_INTERVAL_HOURS=6      # fréquence des sauvegardes automatiques
BACKUP_MAX=10                # nombre de copies conservées
# BACKUP_DIR=./data/backups  # dossier de destination
```

Depuis l'administration, section **Sauvegardes**, vous pouvez créer une copie immédiate, la télécharger ou la supprimer. Pour restaurer une sauvegarde : arrêtez le serveur, remplacez `data/qcm.db` par le fichier choisi, puis redémarrez.

Sauvegarde manuelle de secours :
```bash
cp data/qcm.db sauvegardes/qcm-$(date +%F).db
```
