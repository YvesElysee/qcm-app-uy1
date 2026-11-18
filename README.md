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
- **Inscription complète** : Nom complet ou pseudo, adresse email, mot de passe, **faculté**, **filière du catalogue**, niveau, année académique et date de naissance (optionnelle).
- **Catalogue facultés / filières** : le formulaire charge `GET /api/catalog` (facultés, filières et niveaux). La liste des filières se met à jour selon la faculté choisie.
- **Filière absente du catalogue** : l'étudiant peut choisir « Autre filière (demande) » et saisir son intitulé. Son compte est créé normalement et une **demande** est enregistrée pour l'administration. Dès que l'admin ajoute la filière, l'étudiant reçoit une **notification dans l'application** et un **email**.
- **Mot de passe affiché / masqué** : les champs de connexion, d'inscription et de réinitialisation disposent d'un bouton œil pour vérifier la saisie.
- **Authentification par jeton serveur** : les mots de passe sont hachés côté serveur (scrypt + sel aléatoire) et le backend délivre un jeton de session. Le navigateur ne manipule plus aucun hash.
- **Récupération de mot de passe par Email via Google SMTP** :
  - Génération d'un code de vérification à 6 chiffres valable 15 minutes.
  - Expédition par email via le service SMTP officiel de Google (Gmail).
  - Utilise l'adresse Gmail et le **code à 16 caractères** (Mot de passe d'application Google gratuit).
  - Réinitialisation et mise à jour du mot de passe en 3 étapes sécurisées.

### 2. Espace Étudiant & Gestion des QCM Passés / Manqués
- **Historique personnel exclusif** : L'espace d'un étudiant n'affiche **strictement que les QCM qu'il a lui-même passés**, avec sa note (/20), son score et un accès à la correction détaillée ("Relire ma copie").
- **Espace verrouillé sur le parcours inscrit** : l'étudiant ne voit que les épreuves, résultats, classements et ressources de **sa faculté, sa filière et son niveau d'inscription**. Aucun sélecteur de niveau ne permet de sortir de sa promotion.
- **Rattrapage des évaluations manquées** :
  - Si un étudiant a manqué une épreuve programmée, celle-ci apparaît dans une section dédiée : *Évaluations Manquées · Rattrapage Disponible*.
  - L'étudiant peut rattraper l'évaluation à son rythme, mais avec **exactement le même temps par question, la même durée totale et les mêmes questions/configurations** que la session officielle.
  - Le résultat est enregistré avec la mention *Rattrapage*.

### 3. Multi-faculté, filières & niveaux
- **Deux facultés seedées** : `FACSCIENCES` (Faculté des Sciences) et `FALSH` (Faculté des Lettres et Sciences Humaines), avec leurs filières par défaut. L'administration peut en ajouter ou en supprimer.
- **Une seule filière par étudiant**, choisie à l'inscription et **cadenassée** sur son tableau de bord.
- **Niveau verrouillé** : le niveau d'inscription (L1, L2, L3, M1, M2) est conservé sur le compte et verrouille l'espace personnel. Un étudiant de L1 ne peut ni consulter, ni télécharger, ni déposer une copie pour une épreuve de L3.
- **Catalogue des UE par faculté, filière et niveau** : l'administration crée les UE dans une portée précise ; les épreuves héritent de cette portée.
- **Notifications automatiques** : une cloche dans la navbar affiche le nombre de notifications non lues (rafraîchissement toutes les 60 s) et liste :
  - les nouvelles épreuves disponibles pour la salle de l'étudiant (filière + niveau) ;
  - la validation de sa demande de filière ;
  - le rejet motivé d'une demande de filière.

### 4. Alertes & Emploi du Temps
- **Avertissements proactifs** : Bannière d'alerte et compte à rebours dynamique pour les QCM prévus aujourd'hui ou dans les prochaines 24h/48h.
- **Notifications navigateur** : Possibilité d'activer les rappels Web Notifications.
- **Emploi du temps synchronisé** : Consultation du calendrier des épreuves avec statuts clairs (À venir, En cours, Rattrapage possible, Terminé). Pour un étudiant connecté, l'emploi du temps est automatiquement limité à sa faculté, sa filière et son niveau.

### 5. Espace de Contact & Suggestions pour l'Admin
- Formulaire dédié accessible en un clic depuis l'espace étudiant :
  - Catégorie : *Suggestion d'amélioration*, *Signalement d'erreur dans un QCM*, *Demande de rattrapage*, *Problème technique*, *Autre demande*.
  - Sélection de l'UE concernée, sujet et message.
  - Suivi des messages envoyés par l'étudiant avec leur statut (*En attente*, *En cours*, *Traité*) et la **réponse de l'administration** affichée sous chaque message.
  - La notification « Réponse de l'administration » ouvre directement l'historique des messages (`/contact?tab=history`).
- Côté Administrateur : section *Messages* permettant de filtrer par catégorie/filière/statut, **répondre depuis l'application** (la réponse est enregistrée, notifiée à l'étudiant et envoyée par email si SMTP est configuré), modifier une réponse, mettre à jour le statut, répondre par email externe (`mailto:`) ou supprimer.

### 6. Panneau Administrateur Réorganisé & Complet
- **Interface repensée** : barre latérale sur desktop et onglets défilants sur mobile, **seize sections** claires · *Vue d'ensemble, Évaluations, Analytique, Tuteur IA, Génération QCM IA, Unités d'enseignement, Facultés & filières, Demandes de filière, Demandes de QCM, Étudiants, Résultats, Classements, Ressources, Messages, Sauvegardes, Paramètres SMTP*.
- **Portée faculté / filière / niveau** : chaque écran de données (étudiants, résultats, analytique, classements, ressources, évaluations) peut être filtré par faculté, filière et niveau. Les listes de filières sont toujours dérivées de la faculté sélectionnée.
- **Vue d'ensemble** : statistiques clés (évaluations, à venir, étudiants inscrits, messages en attente) et listes des prochaines et dernières évaluations.
- **Évaluations** :
  - Programmation (faculté héritée de l'UE, filière, niveau, semestre, minuterie, **nombre de questions tirées par étudiant**, ouverture/clôture) et import CSV regroupés côte à côte.
  - Liste complète avec actions : inspecter les questions, consulter les résultats, exporter CSV / procès-verbal PDF, supprimer l'évaluation (**les résultats déjà enregistrés sont conservés**).
- **Analytique** : tableau de bord pédagogique avec les questions les plus ratées, la réussite moyenne par UE, l'évolution des notes dans le temps et les taux d'erreur globaux, filtrable par parcours.
- **Résultats** : consultation des notes par évaluation (participants, moyenne, meilleure note) avec exports CSV / PDF, plus un **export complet** de toutes les copies avec le détail de chaque réponse.
- **Sauvegardes** : création, téléchargement et suppression des copies de sécurité SQLite (sauvegarde automatique planifiée côté serveur).
- **Étudiants** : recherche, filtres faculté / filière / niveau, suppression et **export CSV** de la liste.
- **Facultés & filières** : création et suppression sécurisée (refus si des étudiants ou UE y sont encore rattachés), compteurs d'étudiants et de filières.
- **Demandes de filière** : file d'attente *en attente / validées / rejetées*. Valider une demande ajoute la filière au catalogue, aligne les comptes concernés et envoie notification + email aux étudiants.
- **Ressources** : publication de documents officiels par faculté/filière/niveau, modération des dépôts étudiants, téléchargement et suppression.
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
- **Disponible partout dans l'espace étudiant** : bouton flottant sur desktop, entrée dédiée dans la barre de navigation mobile et rappel de découverte lors de la première visite.
- Après une épreuve, la **correction** propose un **Tuteur IA** intégré pour comprendre les mauvaises réponses :
  - Bouton global *Aide IA pour réviser* et bandeau récapitulatif du nombre d'erreurs.
  - Bouton *Comprendre cette erreur avec l'IA* sur chaque question ratée (la question, les options, la réponse choisie et la bonne réponse alimentent le contexte).
  - Conversations guidées : le tuteur explique **pourquoi** la réponse est incorrecte au lieu de donner la lettre de la solution.
- **Historique persistant** : la conversation est conservée dans le navigateur par étudiant et par contexte (question ou QCM). Un rafraîchissement du site ne la fait plus disparaître.
- **Aucune clé côté navigateur** : les appels passent par le proxy serveur `/api/ai/tutor`. Les clés `GROQ_API_KEYS` / `GEMINI_API_KEYS` restent dans le `.env` du serveur, avec **rotation automatique** et **repli d'un fournisseur à l'autre** en cas d'erreur ou de quota atteint.
- L'assistant s'identifie uniquement comme **QCM App** : il ne révèle jamais le fournisseur, le modèle ou la technologie sous-jacente.
- **Réponse lisible** : le tuteur rend le Markdown (gras, listes, tableaux) et les formules mathématiques LaTeX (`\(...\)`, `\[...\]`) avec **KaTeX**. L'étudiant ne voit jamais les astérisques ni les délimiteurs bruts.
- **Réponse réellement cochée** : le contexte transmis contient le **texte exact de la case cochée** par l'étudiant (y compris pour les anciennes copies qui ne stockaient que la lettre A/B/C/D). Le tuteur ne prétend plus qu'aucune réponse n'a été donnée. Un message explicite « aucune case cochée » s'affiche uniquement lorsque c'est vrai.
- **Quota anti-épuisement des tokens** : `2` questions maximum par erreur et par étudiant sur une **fenêtre glissante de 24 h** (persisté dans la table `ai_usage`), plus un plafond quotidien (`30` par défaut). Quitter puis revenir avant l'échéance ne réinitialise pas le compteur. Les boutons IA restent masqués tant que les clés ne sont pas configurées (`GET /api/ai/status`).
- **Tableau de bord admin « Tuteur IA »** : nombre de requêtes (aujourd'hui, semaine, mois), requêtes réussies / en erreur / refusées par quota, **tokens consommés** (annoncés par les fournisseurs), **budget mensuel restant** (`AI_TOKEN_BUDGET` − consommation du mois), graphique des 30 derniers jours, étudiants les plus consommateurs et questions les plus travaillées.

### 8. Génération de QCM par IA (administration)
- **Tous les formats de documents** : PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, OpenDocument (ODT/ODS/ODP), RTF, HTML, EPUB, TXT, MD, CSV, JSON, XML et ZIP (25 Mo max). L'extracteur universel `server/textExtract.js` prend en charge les fichiers Office, OpenDocument et les archives, avec repli sur `pdftotext` / LibreOffice lorsqu'ils sont installés.
- **Extraction robuste** : les PDF scannés ou les images sans texte renvoient un message explicite en français ; les documents structurés (DOCX, PPTX, XLSX, ODT, EPUB) sont lus directement sans dépendance npm supplémentaire.
- **Génération guidée et par lots** : prompt libre, nombre de questions (1 à 40), difficulté, faculté, filière, niveau et UE. Les 3 documents les plus récents sont utilisés par défaut, ou une sélection explicite. La génération procède par lots de 10 avec déduplication et nouvelle tentative pour garantir la cohérence.
- **Questions contrôlées** : chaque proposition contient 4 options, une seule bonne réponse, des tags, un niveau de difficulté et une **explication obligatoire**. Un aperçu complet (dont l'explication) est affiché avant utilisation.
- **Enregistrement direct optionnel** : les questions peuvent être enregistrées dans une épreuve existante (code de l'épreuve, temps par question, semestre). Les anciennes questions de cette épreuve sont alors remplacées.
- **Sécurité & budget** : accès strictement administrateur, documents stockés hors du dossier public, consommation décomptée du **budget mensuel de tokens IA**. Sans clé configurée, l'API répond `503` avec un message explicite.

### 9. Ressources de cours partagées
- **Espace étudiant `/resources`** : chaque étudiant voit et télécharge les documents de **sa faculté, sa filière et son niveau** uniquement. Il peut déposer un fichier (25 Mo max) et supprimer **uniquement ses propres dépôts**.
- **Classement par type** : chaque document est étiqueté **Cours, TD, TP, Examen, Corrigé, Fiche de révision ou Autre**. Les documents sont regroupés par type dans l'espace étudiant, avec des filtres et des compteurs ; l'administration choisit le type à la publication et peut filtrer sa liste.
- **Formats acceptés** : PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, TXT, MD, CSV, JSON, images (PNG, JPG, JPEG, WEBP) et ZIP.
- **Téléchargement contrôlé** : les fichiers sont stockés hors du dossier public et servis par `GET /api/resources/:id/download`, qui vérifie la portée avant d'envoyer le fichier.
- **Modération admin** : publication de ressources officielles pour n'importe quel parcours, filtrage par faculté / filière / niveau / type, téléchargement et suppression.

### 9 bis. Générateur d'exercices de Mathématiques (L1 → M1)
- **Accès ciblé** : fonctionnalité réservée aux étudiants de la filière **Mathématiques**, niveaux **L1, L2, L3 et M1**. Le contrôle est appliqué côté serveur (`/api/exercises/*`) et l'interface affiche un message explicite aux autres parcours.
- **Documents personnels** : l'étudiant dépose ses propres cours, TD ou annales (PDF, Word, PowerPoint, Excel, OpenDocument, texte, archive… 25 Mo max). Chaque document est rattaché à son compte et invisible des autres étudiants.
- **Formats d'exercices variés** : QCM à 4 options, QRO (question à réponse ouverte), exercice de calcul avec étapes, vrai/faux justifié, série mixte ou exercice libre (démonstration, modélisation).
- **Correction pédagogique** : chaque exercice généré comporte une réponse ou un corrigé modèle, les étapes clés et une explication. L'étudiant peut masquer ou afficher la correction.
- **Historique personnel** : les générations récentes sont conservées et peuvent être rouvertes ou supprimées. Le budget mensuel de tokens IA est partagé avec le générateur de QCM de l'administration.

### 10. Évaluations sécurisées & apprentissage adaptatif
- **Correction 100 % côté serveur** : l'API publique ne renvoie jamais `ReponseCorrecte`. L'étudiant n'envoie que ses choix ; le serveur calcule le score, la note et la correction détaillée, puis les restitue après soumission. L'inspecteur admin conserve l'accès complet via son jeton.
- **Contrôle d'accès centralisé** : `server/access.js` vérifie la **faculté + filière + niveau** pour consulter une épreuve, charger ses questions, déposer une copie, télécharger une ressource ou consulter un classement. L'administration dispose d'un bypass explicite.
- **Anti-triche pendant l'épreuve** : détection des changements d'onglet, blocage du copier/coller et du menu contextuel, avertissement visuel, plein écran proposé et **soumission automatique au 3ᵉ incident**.
- **Banque de questions enrichie** : tags libres, niveau de difficulté (`facile`, `moyenne`, `difficile`), **explication pédagogique** et nombre de questions tirées par étudiant. Le tirage est **déterministe par étudiant** (même tirage en cas de reprise, ordre différent d'un étudiant à l'autre).
- **Explication à la correction** : à la fin du QCM et dans « Relire ma copie », chaque question affiche la bonne réponse et son **explication**. L'explication est stockée côté serveur et n'est révélée qu'après soumission (jamais pendant l'épreuve).
- **Correction visible après l'épreuve** : à la fin du QCM, l'étudiant voit immédiatement les cases qu'il a cochées et la bonne réponse pour chaque question. La correction reste **inaccessible pendant l'épreuve** ; elle est également disponible dans « Relire ma copie » (y compris pour les anciennes copies).
- **Classements par salle** : une salle correspond à la classe de l'étudiant (**faculté + filière + niveau**). L'administration dispose d'un onglet *Classements* filtrable par UE, faculté, filière et niveau, avec **export CSV et PDF**. Chaque étudiant peut afficher le classement de sa propre salle depuis son espace ; le serveur ignore tout niveau demandé et utilise **son niveau d'inscription**.
- **Sauvegarde automatique SQLite** : copies cohérentes via `db.backup()`, rotation configurable, téléchargement et suppression depuis l'administration, et **export complet** des résultats (une ligne par réponse) au format CSV.

### 11. Demandes de QCM & parrainage
- **Demande d'épreuve** : depuis son tableau de bord, un étudiant peut demander un QCM absent pour **sa faculté, sa filière, son niveau et une UE**. Le serveur impose la portée du jeton : impossible de demander une épreuve pour un autre parcours.
- **Pétition à seuil** : les demandes du même groupe (faculté + filière + niveau + UE) sont comptées. En dessous de `QUIZ_REQUEST_THRESHOLD` (10 par défaut), le demandeur voit sa progression et est invité à partager son **lien de parrainage**. Au seuil atteint, toutes les demandes passent en *validée* et une notification est envoyée aux demandeurs.
- **Traitement administrateur** : la section *Demandes de QCM* regroupe les pétitions, affiche la progression, permet de programmer directement l'épreuve, d'accepter ou de rejeter avec un motif. Dès qu'une épreuve dotée de questions et d'une date d'ouverture est programmée (manuellement, par import CSV ou par l'IA), les demandes du groupe passent automatiquement en *acceptée*.
- **Parrainage** : chaque étudiant possède un code unique et un lien `/register?ref=CODE`. Un filleul est rattaché automatiquement à l'inscription. **1 filleul = badge Ambassadeur**, **3 filleuls = priorité** sur la plateforme. Le parrain reçoit une notification à chaque inscription parrainée.
- **Statuts** : `pending` (sous le seuil), `validated` (seuil atteint), `approved` (épreuve créée ou acceptée par l'admin), `rejected` (motif affiché à l'étudiant).
- **Configuration** :
  ```env
  # Nombre de demandes identiques nécessaires pour valider une épreuve
  QUIZ_REQUEST_THRESHOLD=10
  ```

### 12. Design Professionnel Unifié
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
| `POST /api/auth/register` | public | Inscription étudiant (faculté + filière + niveau, demande de filière si absente, `referredBy` optionnel) |
| `POST /api/auth/login` | public | Connexion étudiant → jeton |
| `GET /api/auth/filiere-request` | étudiant | Suivi de la demande de filière |
| `GET /api/auth/referral` | étudiant | Code, lien de parrainage, filleuls et privilèges |
| `POST /api/auth/forgot-password` | public | Étape 1 : code 6 chiffres par email |
| `POST /api/auth/verify-reset-code` | public | Étape 2 : vérification du code |
| `POST /api/auth/reset-password` | public | Étape 3 : nouveau mot de passe |
| `PUT /api/auth/profile` | étudiant | Mise à jour du profil |
| `POST /api/auth/change-password` | étudiant | Changement de mot de passe |
| `GET /api/catalog` | public | Catalogue facultés, filières et niveaux |
| `GET /api/quizzes` | public / étudiant | Liste des QCM (filtres faculté/filière/niveau, tri) ; portée verrouillée avec un jeton étudiant |
| `GET /api/quizzes/:id` | public / étudiant | Métadonnées d'un QCM (contrôle d'accès si jeton étudiant) |
| `GET /api/quizzes/:id/questions` | admin / étudiant autorisé | Questions (sans correction pour les étudiants, tirage par étudiant ; correction complète avec jeton admin) |
| `POST /api/quizzes/:id` | admin | Programmer / fusionner un QCM (faculté, filière, niveau) |
| `POST /api/quizzes/:id/questions` | admin | Importer (remplacer) les questions |
| `DELETE /api/quizzes/:id/questions/:qid` | admin | Supprimer une question |
| `DELETE /api/quizzes/:id` | admin | Supprimer un QCM (questions + sessions ; **résultats conservés**) |
| `POST /api/quizzes/:id/sessions` | étudiant autorisé | Heartbeat présence participants |
| `GET /api/quizzes/:id/sessions` | étudiant autorisé | Compteur de participants |
| `POST /api/results` | étudiant | Enregistrer une copie (score et correction calculés serveur, portée vérifiée) |
| `GET /api/results?ue=&sessionTimestamp=` | étudiant | Classement d'une session limité à sa salle |
| `GET /api/results/ranking?ue=&sessionTimestamp=` | étudiant | Classement de sa salle (faculté + filière + niveau d'inscription forcés côté serveur) |
| `GET /api/results/mine` | étudiant | Historique personnel (avec correction) |
| `GET /api/notifications` | étudiant | Notifications personnelles + compteur de non-lues |
| `POST /api/notifications/:id/read` · `read-all` · `DELETE /:id` | étudiant | Marquer comme lue / tout lire / supprimer |
| `GET /api/quiz-requests/mine` | étudiant | Mes demandes de QCM, progression et lien de parrainage |
| `GET /api/quiz-requests/progress?ue=` | étudiant | Progression d'une pétition pour son parcours |
| `POST /api/quiz-requests` | étudiant | Demander un QCM (portée imposée par le jeton) |
| `GET /api/resources?type=cours` | étudiant / admin | Ressources du parcours (étudiant) ou toutes les ressources filtrables (admin) ; filtre optionnel par type |
| `POST /api/resources` | étudiant / admin | Déposer une ressource (multipart avec `type`, portée imposée pour l'étudiant) |
| `GET /api/resources/:id/download` | étudiant autorisé / admin | Téléchargement contrôlé hors dossier public |
| `DELETE /api/resources/:id` | auteur / admin | Supprimer une ressource |
| `GET /api/exercises/access` | étudiant | Vérifier l'éligibilité (Mathématiques L1 → M1) et lister les types d'exercices |
| `GET /api/exercises/documents` | étudiant éligible | Mes documents personnels |
| `POST /api/exercises/documents` | étudiant éligible | Déposer un document (multipart, extraction universelle) |
| `DELETE /api/exercises/documents/:id` | propriétaire | Supprimer un document personnel |
| `POST /api/exercises/generate` | étudiant éligible | Générer des exercices corrigés à partir de ses documents |
| `GET /api/exercises/history` · `DELETE /:id` | étudiant éligible | Consulter / supprimer ses générations récentes |
| `POST /api/feedback` | étudiant | Envoyer un message/suggestion |
| `GET /api/feedback/mine` | étudiant | Suivi de mes messages |
| `GET /api/feedback` · `PATCH` · `DELETE` | admin | Gestion des messages ; `PATCH { reply, status }` enregistre la réponse, notifie l'étudiant et envoie un email si SMTP est configuré |
| `GET /api/ues?faculte=&filiere=&niveau=` | public | Liste des UEs |
| `POST /api/ues` · `DELETE /api/ues/:id` | admin | Gestion des UEs (faculté, filière, niveau) |
| `GET /api/ai/status` | étudiant | Disponibilité de l'assistant + quotas restants (dont fenêtre 24 h par question) |
| `POST /api/ai/tutor` | étudiant | Question au tuteur (rotation de clés, quota 2/erreur sur 24 h) |
| `GET /api/ai-generation/documents` | admin | Documents de référence déposés |
| `POST /api/ai-generation/documents` | admin | Déposer un document (tous formats Office/OpenDocument/PDF/texte, 25 Mo max) |
| `DELETE /api/ai-generation/documents/:id` | admin | Supprimer un document de référence |
| `POST /api/ai-generation/generate` | admin | Générer des questions (prompt + documents, enregistrement direct optionnel) |
| `GET /api/admin/ai-usage` | admin | Requêtes, tokens consommés et budget mensuel restant |
| `POST /api/admin/login` | public | Connexion admin → jeton |
| `POST /api/admin/logout` | admin | Révoquer le jeton admin côté serveur |
| `GET /api/admin/students` · `DELETE` | admin | Gestion des étudiants (filtres faculté/filière/niveau) |
| `GET /api/admin/results?ue=&faculte=&filiere=&niveau=` | admin | Résultats (sans `ue` : export complet) |
| `GET /api/admin/analytics?faculte=&filiere=&niveau=` | admin | Agrégats : questions ratées, réussite par UE, évolution |
| `GET /api/admin/rankings?ue=&faculte=&filiere=&niveau=` | admin | Classements par salle (faculté + filière + niveau), par épreuve et session |
| `GET/POST /api/admin/facultes` · `DELETE /:id` | admin | Catalogue des facultés |
| `GET/POST /api/admin/filieres` · `DELETE /:id` | admin | Catalogue des filières (notification + email des demandeurs à l'ajout) |
| `GET /api/admin/filiere-requests?status=` | admin | Demandes de filière (en attente / validées / rejetées) |
| `POST /api/admin/filiere-requests/:id/approve` · `reject` | admin | Traiter une demande (notification + email) |
| `GET /api/admin/quiz-requests?faculte=&filiere=&niveau=&status=` | admin | Demandes de QCM individuelles + groupes/pétitions |
| `POST /api/admin/quiz-requests/:id/approve` · `reject` | admin | Accepter / rejeter un groupe de demandes (notification aux demandeurs) |
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
│   ├── access.js               # Règles faculté + filière + niveau (accès épreuves, ressources, salles)
│   ├── notifications.js        # Notifications internes (quiz disponible, filière validée/rejetée, demandes)
│   ├── referrals.js            # Codes de parrainage, rattachement des filleuls et privilèges
│   ├── smtp.js                 # Envoi SMTP Google (Nodemailer)
│   ├── backup.js               # Sauvegardes SQLite planifiées (db.backup + rotation)
│   ├── questionDraw.js         # Tirage déterministe des questions par étudiant
│   ├── ranking.js              # Classements par salle (faculté + filière + niveau), meilleure tentative
│   ├── textExtract.js          # Extracteur universel (PDF, Office, ODF, EPUB, RTF, HTML, ZIP…)
│   └── routes/
│       ├── auth.js             # Inscription, connexion, MDP oublié (3 étapes), profil, demande de filière
│       ├── catalog.js          # Catalogue public facultés / filières / niveaux
│       ├── quizzes.js          # QCM, questions (sans correction publique), tirage, présence, notifications
│       ├── results.js          # Copies corrigées serveur, classement, historique personnel
│       ├── notifications.js    # Liste, lecture et suppression des notifications étudiantes
│       ├── quizRequests.js     # Demandes de QCM (pétitions, seuil, modération admin, auto-approbation)
│       ├── resources.js        # Ressources de cours (dépôt, téléchargement contrôlé, modération)
│       ├── exercises.js        # Générateur d'exercices Mathématiques (documents personnels, QCM/QRO/calcul)
│       ├── feedback.js         # Messages & suggestions étudiants
│       ├── ues.js              # Unités d'enseignement (faculté, filière, niveau)
│       ├── admin.js            # Login admin, catalogue, demandes, étudiants, résultats, analytique, classements
│       ├── ai.js               # Tuteur IA : proxy Groq/Gemini, quotas 24 h, tokens, identité QCM App
│       ├── aiGeneration.js     # Génération de QCM : documents de référence, extraction universelle, prompt, explications
│       └── settings.js         # Configuration & test SMTP
├── src/                        # Frontend React 19
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.jsx      # Barre de navigation partagée (responsive, notifications, menu utilisateur)
│   │   │   └── Footer.jsx     # Pied de page partagé (navigation, infos institution)
│   │   ├── pages/
│   │   │   ├── Home.jsx       # Accueil public : présentation et stats en direct
│   │   │   ├── ContactPage.jsx # Page « Contacter l'administration » (espace étudiant)
│   │   │   └── NotFound.jsx    # Page 404
│   │   ├── ai/
│   │   │   ├── AiTutor.jsx     # Drawer « Tuteur IA » (proxy serveur, quotas 24 h, historique)
│   │   │   ├── AiLauncher.jsx  # Bouton flottant + découverte du tuteur IA
│   │   │   └── AiMarkdown.jsx  # Rendu Markdown + formules LaTeX (KaTeX)
│   │   ├── ui/
│   │   │   └── icons.jsx       # Bibliothèque d'icônes SVG au trait (aucun emoji)
│   │   ├── ContactAdmin.jsx    # Formulaire de suggestions & signalements étudiants
│   │   ├── Login.jsx           # Accès sécurisé Administrateur
│   │   ├── NotificationBell.jsx # Cloche de notifications (compteur non-lues, liste, lecture)
│   │   ├── ReviewSession.jsx   # Relecture détaillée d'une copie d'examen (+ Tuteur IA)
│   │   ├── ExerciseGenerator.jsx # Générateur d'exercices Mathématiques (L1 → M1)
│   │   ├── Schedule.jsx        # Emploi du temps public & étudiant (portée verrouillée si connecté)
│   │   ├── StudentAuth.jsx     # Connexion, Inscription catalogue & Récupération MDP
│   │   ├── StudentDashboard.jsx # Tableau de bord étudiant (parcours verrouillé, alertes, rattrapages)
│   │   ├── StudentProfile.jsx  # Profil personnel & changement de mot de passe
│   │   └── StudentResources.jsx # Espace de partage de ressources du parcours
│   ├── hooks/
│   │   └── usePageTitle.js     # Titre d'onglet par page
│   ├── services/
│   │   ├── api.js              # Couche d'accès à l'API REST (jetons Bearer)
│   │   ├── aiService.js         # Pont vers le proxy serveur /api/ai (aucune clé exposée)
│   │   ├── authService.js      # Authentification étudiant (délégue au serveur)
│   │   └── emailService.js      # Configuration SMTP & test (admin)
│   ├── utils/
│   │   └── csvParser.js        # Parser CSV universel tolérant tous formats & délimiteurs
│   ├── AdminPanel.jsx          # Panneau d'administration complet (16 sections)
│   ├── App.jsx                 # Routage protégé + layout (navbar/footer) de l'application
│   ├── config.js               # URL discrète du portail administrateur
│   ├── QuizSession.jsx         # Moteur de passage de QCM (Live & Rattrapage, correction à la fin)
│   └── main.jsx
├── data/                       # Base SQLite + ressources + documents IA/personnels + sauvegardes (gitignoré)
└── .env                        # ADMIN_PASSWORD, SMTP, IA, PORT (voir .env.example)
```

Les fichiers déposés (ressources de cours et documents de référence IA) sont stockés
hors du dossier public, sous `DATA_DIR` :
`resources/`, `ai-documents/`, `student-documents/` et `backups/`. Seules les
routes authentifiées et autorisées permettent de les télécharger.

### Navigation (routes)

| Route | Accès | Description |
| --- | --- | --- |
| `/` | Public | Accueil : présentation et statistiques en direct |
| `/login`, `/register`, `/forgot-password` | Public (redirige vers `/dashboard` si connecté) | Authentification étudiant |
| `/dashboard` | Étudiant connecté | Espace personnel verrouillé sur faculté + filière + niveau : UE, évaluations, rattrapages, résultats |
| `/resources` | Étudiant connecté | Ressources de cours du parcours : téléchargement et dépôt |
| `/exercises` | Étudiant Mathématiques L1 → M1 | Générateur d'exercices corrigés à partir de documents personnels |
| `/schedule` | Public / étudiant | Emploi du temps des évaluations (limité au parcours si connecté) |
| `/contact` | Étudiant connecté | Suggestions / contact administration |
| `/quiz/:quizId` | Étudiant connecté | Session d'évaluation (immersif, sans navbar) |
| `/review/:quizId` | Étudiant connecté | Relecture de copie |
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
- **Cloisonnement faculté / filière / niveau** : `server/access.js` vérifie la portée exacte pour les métadonnées d'épreuve, les questions, la soumission d'une copie, les classements et les ressources. Un étudiant ne peut jamais lire ni modifier les données d'un autre parcours ; seul un jeton admin valide bypasse ces règles.
- **Ressources et documents IA hors dossier public** : les fichiers sont stockés sous `DATA_DIR` et servis uniquement par des routes contrôlées. Les documents de référence IA sont réservés à l'administration.
- **Uploads limités** : 25 Mo pour les ressources de cours, les documents IA et les documents personnels du générateur d'exercices ; extraction universelle et noms de fichiers normalisés côté serveur.
- **Notifications personnelles** : chaque étudiant ne lit que ses propres notifications (`userId` issu du jeton), avec déduplication par événement.
- **Demandes et parrainage** : la portée d'une demande de QCM est toujours déduite du jeton (jamais du corps de la requête). Les codes de parrainage sont uniques et un compte ne peut être rattaché qu'à un seul parrain.
- Toutes les **écritures** (QCM, questions, UEs, messages, résultats, étudiants, catalogue, demandes de filière, ressources, SMTP) exigent un **jeton administrateur**.
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
