import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api, getSession } from './api';

let listenersReady = false;
let registering = false;

const CHANNEL_ID = 'qcm-app';

async function registerToken(token) {
  if (!token || !getSession()) return;
  try {
    await api('/push/token', {
      method: 'POST',
      auth: 'student',
      body: { token, platform: 'android' }
    });
  } catch (err) {
    console.warn('[push] Enregistrement du jeton serveur impossible :', err.message);
  }
}

function setupListeners() {
  if (listenersReady) return;
  listenersReady = true;

  PushNotifications.addListener('registration', ({ value }) => registerToken(value));
  PushNotifications.addListener('registrationError', err => {
    console.warn('[push] Erreur d’enregistrement :', err?.error || err?.message || err);
  });
  PushNotifications.addListener('pushNotificationReceived', () => {
    // La notification système est déjà affichée par le plugin Capacitor.
  });
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const link = notification?.data?.link || notification?.data?.url;
    if (typeof link === 'string' && link.startsWith('/')) window.location.href = link;
  });
}

/**
 * Demande l'autorisation et enregistre l'appareil auprès de FCM.
 * No-op dans le navigateur ou si aucun étudiant n'est connecté.
 */
export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform() || !getSession() || registering) return;
  registering = true;
  try {
    setupListeners();
    // Canal explicite : évite le canal générique de FCM sur Android 8+.
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'QCM App',
      description: 'Rappels d’épreuves et nouvelles évaluations',
      importance: 4,
      visibility: 1
    });
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;
    await PushNotifications.register();
  } catch (err) {
    console.warn('[push] Activation impossible :', err.message);
  } finally {
    registering = false;
  }
}
