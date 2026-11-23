import { App } from '@capacitor/app';
import { api } from '../services/api';
import { isNativeApp } from './appEnvironment';

/**
 * Compare la version installée de l'APK (versionCode natif) avec celle
 * publiée sur le serveur. Retourne null dans le navigateur ou si l'APK est
 * déjà à jour.
 */
export async function checkForAppUpdate() {
  if (!isNativeApp()) return null;
  try {
    const [info, release] = await Promise.all([App.getInfo(), api('/app-version')]);
    const installed = Number(info.build || 0);
    const available = Number(release.versionCode || 0);
    if (available > installed) {
      return {
        ...release,
        installedVersion: info.version || '',
        availableVersion: release.versionName || ''
      };
    }
    return null;
  } catch (err) {
    console.warn('[update] Vérification impossible :', err);
    return null;
  }
}
