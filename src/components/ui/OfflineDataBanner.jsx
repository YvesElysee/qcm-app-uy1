import { useEffect, useState } from 'react';
import Icon from './icons.jsx';

/**
 * Petit bandeau temporaire quand une page affiche des données issues du
 * cache local parce que le réseau est indisponible.
 */
export default function OfflineDataBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer;
    const show = () => {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 6000);
    };
    window.addEventListener('qcm:offline-cache', show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('qcm:offline-cache', show);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-slate-700 text-slate-100 px-4 py-2 text-center text-[11px] font-bold"
    >
      <Icon name="info" size={14} />
      Données enregistrées affichées · reconnexion nécessaire pour les actualiser.
    </div>
  );
}
