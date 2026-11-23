# Configuration Firebase — notifications push QCM App

Le code Firebase est déjà intégré. Il reste seulement à fournir **deux éléments** :

| Élément | Où le mettre | À quoi il sert |
| --- | --- | --- |
| `google-services.json` | `android/app/google-services.json` | Permet à l’APK de s’enregistrer auprès de Firebase Cloud Messaging (FCM) et de recevoir les notifications. |
| Compte de service JSON | variable d’environnement `FIREBASE_SERVICE_ACCOUNT_JSON` ou `GOOGLE_APPLICATION_CREDENTIALS` | Permet au serveur Node.js d’**envoyer** les notifications via `firebase-admin`. |

Sans ces deux éléments, le portail fonctionne normalement : notifications internes et e-mails SMTP restent actifs, seuls les push et les rappels programmés sont désactivés.

---

## 1. Créer le projet Firebase

1. Allez sur <https://console.firebase.google.com/>.
2. Cliquez sur **Ajouter un projet**.
3. Nom du projet : `QCM App` (ou un nom de votre choix).
4. Activez Google Analytics si vous le souhaitez (facultatif).
5. Créez le projet.

---

## 2. Ajouter l’application Android

1. Dans la page d’accueil du projet, cliquez sur **Ajouter une application → Android**.
2. Nom du package Android : **exactement**

   ```text
   org.qcmapp.app
   ```

3. Surnom : `QCM App`.
4. La empreinte SHA-1 est facultative pour FCM. Si le formulaire la demande, vous pouvez la récupérer avec la clé release locale :

   ```bash
   keytool -list -v \
     -keystore android/app/qcm-app-release.jks \
     -alias qcm-app
   ```

5. Téléchargez `google-services.json`.
6. Copiez-le ici :

   ```bash
   cp /chemin/du/telechargement/google-services.json android/app/google-services.json
   ```

Le fichier est ignoré par Git (voir `android/.gitignore`) : il restera sur la machine qui compile l’APK.

---

## 3. Activer Cloud Messaging

1. Dans la console Firebase, ouvrez **Build → Cloud Messaging**.
2. Vérifiez que l’API est activée (elle l’est normalement par défaut).
3. Aucune clé de serveur n’est à copier depuis cet onglet : nous utilisons un compte de service.

---

## 4. Créer le compte de service du serveur

1. Firebase Console → **Paramètres du projet** (icône engrenage).
2. Onglet **Comptes de service**.
3. Cliquez sur **Générer une nouvelle clé privée** → **JSON**.
4. Enregistrez le fichier, par exemple `/etc/qcm/firebase-service-account.json` sur le VPS.

⚠️ Ce fichier contient une clé privée : ne le commitez jamais, ne le collez jamais dans un message ou un ticket public.

---

## 5. Déclarer les identifiants au serveur

Deux méthodes au choix.

### Méthode A — chemin vers le fichier (recommandée sur VPS)

Dans le `.env` du serveur :

```env
GOOGLE_APPLICATION_CREDENTIALS=/etc/qcm/firebase-service-account.json
```

Puis :

```bash
chmod 600 /etc/qcm/firebase-service-account.json
```

### Méthode B — JSON en une seule ligne

Convertissez le fichier en une ligne :

```bash
jq -c . /etc/qcm/firebase-service-account.json
```

Puis collez le résultat dans le `.env` :

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...",...}
```

Les deux variables sont décrites dans `.env.example`.

---

## 6. Vérifier la configuration

Sur la machine qui déploie :

```bash
npm run firebase:check
```

Résultat attendu :

```text
✅ google-services.json présent
✅ package Android · org.qcmapp.app
✅ project_id Android · ...
✅ Identifiants serveur · JSON valide
✅ Champs du compte de service · project_id, client_email, private_key
✅ Même projet Firebase · ...
Configuration Firebase complète. Redémarrez le serveur puis régénérez l’APK.
```

---

## 7. Redémarrer le serveur

```bash
git pull origin master
npm ci
npm run build
# redémarrer Express (pm2/systemd). Exemple :
# pm2 restart qcm-app
```

Au démarrage, le log doit afficher :

```text
[push] Firebase Cloud Messaging actif
```

Si vous voyez encore :

```text
[push] Firebase non configuré · notifications push désactivées
```

alors une des deux variables d’environnement manque ou le JSON est invalide.

---

## 8. Régénérer l’APK avec Firebase

`google-services.json` est lu au moment du build Android. Il faut donc recompiler l’APK, puis le republier.

```bash
npm run build
npx cap sync android
cd android
JAVA_HOME=/tmp/opencode/jdk21 ./gradlew assembleRelease --no-daemon
cd ..
cp android/app/build/outputs/apk/release/app-release.apk downloads/qcm-app.apk
```

Vérification :

```bash
/home/elysee/Android/Sdk/build-tools/36.0.0/apksigner verify --print-certs downloads/qcm-app.apk
/home/elysee/Android/Sdk/build-tools/36.0.0/aapt dump badging downloads/qcm-app.apk | head -5
```

Enfin, pensez à incrémenter **ensemble** :

- `versionCode` / `versionName` dans `android/app/build.gradle` ;
- `versionCode` / `versionName` dans `downloads/release.json`.

C’est cette comparaison qui affiche le bandeau « Nouvelle version disponible » dans l’APK installé.

---

## 9. Tester une notification

1. Installez le nouvel APK sur un téléphone Android.
2. Connectez-vous avec un compte étudiant : le jeton FCM est envoyé à `POST /api/push/token`.
3. Vérifiez en base :

   ```bash
   node -e "import('./server/db.js').then(({db})=>console.log(db.prepare('SELECT userId, platform, createdAt FROM push_tokens').all()))"
   ```

4. Créez une épreuve avec une date d’ouverture :
   - une notification push est envoyée immédiatement ;
   - un rappel est envoyé 24 h avant ;
   - un second rappel est envoyé 1 h avant.

Les rappels sont dédupliqués dans la table `quiz_reminders` : redémarrer le serveur ou reprogrammer la même date ne crée pas de doublon.

---

## Comportement selon l’environnement

| Environment | Push |
| --- | --- |
| Navigateur Android | ❌ aucun push (l’API navigateur n’est pas utilisée) |
| APK installé, Firebase configuré | ✅ jeton FCM + notifications + rappels |
| APK installé, Firebase non configuré | ❌ le plugin échoue silencieusement, le reste de l’appli fonctionne |
| Serveur sans compte de service | ❌ aucun envoi, mais notifications internes et SMTP conservés |
