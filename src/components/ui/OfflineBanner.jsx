import { useEffect, useState } from 'react';
import Icon from './icons.jsx';

/**
 * Bandeau d'alerte affiché dès que le navigateur / la WebView n'a plus
 * d'accès réseau. Rappelle à l'étudiant d'activer les données mobiles ou
 * le Wi-Fi pour continuer à utiliser le portail.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  );

  useEffect(() => {
    const update = () => setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 bg-amber-400 text-slate-950 px-4 py-2 text-center text-xs font-black"
    >
      <Icon name="alert" size={16} />
      <span>
        Pas de connexion Internet. Veuillez activer les données mobiles ou vous connecter à un Wi‑Fi.
      </span>
    </div>
  );
}
