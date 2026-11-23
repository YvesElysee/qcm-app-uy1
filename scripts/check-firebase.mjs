/**
 * Vérifie la configuration Firebase sans jamais afficher les secrets.
 * Usage : npm run firebase:check
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const googleServicesPath = path.join(root, 'android', 'app', 'google-services.json');
const expectedPackage = 'org.qcmapp.app';
let ok = true;

function report(label, valid, detail = '') {
  console.log(`${valid ? '✅' : '❌'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!valid) ok = false;
}

// 1. Configuration Android (nécessaire pour enregistrer l'app auprès de FCM)
let androidProjectId = '';
try {
  const json = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
  const packages = (json.client || []).map(c => c.client_info?.android_client_info?.package_name);
  report('google-services.json présent', true, path.relative(root, googleServicesPath));
  report('package Android', packages.includes(expectedPackage), expectedPackage);
  androidProjectId = json.project_info?.project_id || '';
  report('project_id Android', !!androidProjectId, androidProjectId || 'introuvable');
} catch (err) {
  report('google-services.json présent', false, 'android/app/google-services.json manquant ou invalide');
}

// 2. Compte de service serveur (nécessaire pour envoyer les push depuis Express)
let serverProjectId = '';
const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : '';

try {
  let serviceAccount;
  if (inline) {
    serviceAccount = JSON.parse(inline);
    report('FIREBASE_SERVICE_ACCOUNT_JSON', true, 'JSON valide');
  } else if (credentialsPath) {
    serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    report('GOOGLE_APPLICATION_CREDENTIALS', true, 'fichier JSON valide');
  } else {
    report('Identifiants serveur', false, 'définir FIREBASE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS');
  }
  if (serviceAccount) {
    const valid = !!serviceAccount.project_id && !!serviceAccount.client_email && !!serviceAccount.private_key;
    report('Champs du compte de service', valid, valid ? 'project_id, client_email, private_key' : 'champs manquants');
    serverProjectId = serviceAccount.project_id || '';
  }
} catch (err) {
  report('Identifiants serveur', false, `JSON invalide (${err.message})`);
}

if (androidProjectId && serverProjectId) {
  report('Même projet Firebase', androidProjectId === serverProjectId,
    androidProjectId === serverProjectId ? androidProjectId : `${androidProjectId} ≠ ${serverProjectId}`);
}

console.log('');
if (ok) {
  console.log('Configuration Firebase complète. Redémarrez le serveur puis régénérez l’APK.');
} else {
  console.log('Configuration incomplète : voir FIREBASE_SETUP.md.');
  process.exitCode = 1;
}
