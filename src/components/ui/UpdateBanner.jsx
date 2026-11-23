import { useEffect, useState } from 'react';
import Icon from './icons.jsx';
import { checkForAppUpdate } from '../../utils/appUpdate';

/**
 * Bandeau de mise à jour, visible uniquement depuis l'APK installé et
 * uniquement lorsqu'une version plus récente est publiée sur le serveur.
 */
export default function UpdateBanner() {
  const [release, setRelease] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const info = await checkForAppUpdate();
      if (alive && info) setRelease(info);
    };
    check();
    const timer = setInterval(check, 30 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!release || dismissed) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 bg-indigo-600 text-white px-4 py-2.5"
    >
      <div className="flex items-center gap-2 min-w-0 text-xs font-bold">
        <Icon name="download" size={16} />
        <span className="truncate">
          Nouvelle version de QCM App disponible
          {release.notes ? ` · ${release.notes}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={release.apkUrl || '/download/apk'}
          download="QCM App.apk"
          className="rounded-lg bg-white text-indigo-700 text-[11px] font-black px-3 py-1.5 hover:bg-indigo-50 transition"
        >
          Mettre à jour
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Masquer le rappel de mise à jour"
          className="rounded-lg p-1.5 hover:bg-white/15 transition"
        >
          ×
        </button>
      </div>
    </div>
  );
}
