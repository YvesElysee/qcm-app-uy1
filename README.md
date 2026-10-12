# QCM App UY1 — Plateforme Téléévaluation 2026

Application web d'évaluations et QCM pour l'Université de Yaoundé 1 (UY1). Conçue avec React 19 + Vite 8 + Tailwind CSS + Firebase Firestore.

---

## Nouvelles Fonctionnalités & Mises à Jour

### 1. Inscription & Authentification Étudiant (Sans Firebase Auth)
- **Inscription complète** : Nom complet ou pseudo, adresse email, mot de passe chiffré (SHA-256 avec sel), filière, niveau, année académique et date de naissance (optionnelle).
- **Authentification personnalisée** : Gestion directe via la collection Firestore `users` sans dépendre de Firebase Auth.
- **Récupération de mot de passe par Email via Google SMTP** :
  - Génération d'un code de vérification à 6 chiffres valable 15 minutes.
  - Expédition par email via le service SMTP officiel de Google (Gmail).
  - Utilise l'adresse Gmail et le **code à 16 caractères** (Mot de passe d'application Google gratuit).
  - Réinitialisation et mise à jour du mot de passe en 3 étapes sécurisées.

### 2. Espace Étudiant & Gestion des QCM Passés / Manqués
- **Historique personnel exclusif** : L'espace d'un étudiant n'affiche **strictement que les QCM qu'il a lui-même passés**, avec sa note (/20), son score et un accès à la correction détaillée ("Relire ma copie").
- **Rattrapage des évaluations manquées** :
  - Si un étudiant a manqué une épreuve programmée, celle-ci apparaît dans une section dédiée : *⚠️ Évaluations Manquées — Rattrapage Disponible*.
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
- Côté Administrateur : Onglet *Messages & Suggestions* permettant de filtrer par catégorie/filière, mettre à jour le statut, répondre directement par email (`mailto:`) ou supprimer.

### 6. Panneau Administrateur Enrichi & Import CSV Universel
- **Parser CSV Ultra-Flexible** :
  - Accepte tous les délimiteurs : point-virgule (`;` standard Excel français), virgule (`,`), tabulation (`\t`), pipe (`|`).
  - Suppression automatique du BOM UTF-8 (`\ufeff`) qui corrompt souvent la première colonne dans Excel.
  - Détection tolérante des colonnes (Question/Énoncé, OptA-D / Option A-D / Choix 1-4, ReponseCorrecte / Bonne Réponse).
  - Support des réponses sous forme de lettre (`A`, `B`, `C`, `D`), de chiffre (`1`, `2`, `3`, `4`) ou du texte complet de l'option.
  - **Modal de prévisualisation avant importation** : affiche le nombre de questions détectées, les colonnes reconnues, un aperçu des cartes de questions et alertes d'erreurs éventuelles.
  - **Téléchargement de modèles CSV** : Modèle Excel (`;`) et Modèle Standard (`,`) téléchargeables en 1 clic.
- **Gestion des Étudiants Inscrits** : Nouvel onglet listant tous les comptes étudiants inscrits dans Firestore avec recherche par nom/email, filtres par filière/niveau, et suppression.
- **Configuration SMTP Google en direct** : Nouvel onglet permettant de saisir l'adresse Gmail et le mot de passe d'application à 16 caractères, avec outil de test d'envoi d'email en temps réel.
- **Inspecteur de questions** : Consultation et suppression individuelle des questions chargées dans une UE.

---

## Configuration du Service SMTP Google (16 Caractères)

Pour activer l'envoi réel des emails de récupération de mot de passe :
1. Connectez-vous à votre compte Google et activez la **Validation en deux étapes (2FA)** dans vos paramètres de sécurité.
2. Rendez-vous sur : [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Créez un mot de passe d'application (nommez-le par exemple *"QCM App UY1"*).
4. Google vous fournit un code à **16 caractères** (ex: `abcd efgh ijkl mnop`).
5. Rendez-vous dans le panneau d'administration (onglet *Configuration SMTP*) ou ajoutez-le dans votre fichier `.env.local` :
   ```env
   VITE_SMTP_EMAIL=votre-adresse@gmail.com
   VITE_SMTP_APP_PASSWORD=abcd efgh ijkl mnop
   ```

---

## Démarrage Rapide

```bash
# 1. Installation des dépendances
npm install

# 2. Lancement du serveur de développement (gère aussi l'API SMTP via Vite)
npm run dev

# 3. Build de production
npm run build
```

---

## Structure du Projet

```text
src/
├── components/
│   ├── ContactAdmin.jsx      # Formulaire de suggestions & signalements étudiants
│   ├── Login.jsx             # Accès sécurisé Enseignant / Administrateur
│   ├── ReviewSession.jsx     # Relecture détaillée d'une copie d'examen
│   ├── Schedule.jsx          # Emploi du temps public & étudiant
│   ├── StudentAuth.jsx       # Connexion, Inscription complète & Récupération MDP
│   ├── StudentDashboard.jsx  # Tableau de bord étudiant central (Alertes, Rattrapages, QCM)
│   └── StudentProfile.jsx    # Profil personnel & changement de mot de passe
├── services/
│   ├── authService.js        # Authentification Firestore (sans Firebase Auth)
│   └── emailService.js       # Service d'envoi SMTP Google & test
├── utils/
│   └── csvParser.js          # Parser CSV universel tolérant tous formats & délimiteurs
├── AdminPanel.jsx            # Panneau d'administration complet
├── App.jsx                   # Routage protégé de l'application
├── firebase.js               # Initialisation Firestore
├── QuizSession.jsx           # Moteur de passage de QCM (Live & Rattrapage)
└── server.js                 # API Node.js / Nodemailer pour le service SMTP Google
```