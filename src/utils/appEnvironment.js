import { Capacitor } from '@capacitor/core';

/**
 * Détecte l'environnement d'exécution pour n'afficher le téléchargement de
 * l'APK que là où il est utile : dans un navigateur Android, jamais dans
 * l'application installée (Capacitor) ni sur ordinateur.
 */
export const isNativeApp = () => Capacitor.isNativePlatform();

export const isAndroidBrowser = () =>
  !isNativeApp() && /android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');

export const showApkDownload = () => isAndroidBrowser();
