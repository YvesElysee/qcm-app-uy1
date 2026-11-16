import { useEffect, useMemo, useState } from 'react';
import Icon from '../ui/icons.jsx';
import AiTutor from './AiTutor.jsx';
import { getCurrentUser } from '../../services/authService';

/**
 * Lanceur global du tuteur IA pour les étudiants connectés.
 *
 * - Bouton flottant visible sur desktop (sur mobile, la barre du bas s'en
 *   charge déjà).
 * - Écoute l'événement `qcm:open-ai` pour être ouvert depuis n'importe quelle
 *   page (tableau de bord, fin de QCM, menu…).
 * - Affiche une courte présentation lors de la première visite, pour que les
 *   étudiants découvrent l'existence de l'assistant.
 */
export default function AiLauncher() {
  const user = getCurrentUser();
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  const context = useMemo(() => ({ key: 'general', kind: 'general' }), []);
  const identity = user?.id || user?.email || '';
  const hintKey = identity ? `qcm_ai_hint_seen:${identity}` : '';

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setShowHint(false);
      setHintDismissed(true);
    };
    window.addEventListener('qcm:open-ai', onOpen);
    return () => window.removeEventListener('qcm:open-ai', onOpen);
  }, []);

  // Petite bulle de découverte, une seule fois par étudiant.
  useEffect(() => {
    if (!hintKey) return undefined;
    let seen;
    try {
      seen = localStorage.getItem(hintKey) === '1';
    } catch {
      seen = true;
    }
    if (seen) return undefined;
    const timer = setTimeout(() => setShowHint(true), 3200);
    return () => clearTimeout(timer);
  }, [hintKey]);

  const dismissHint = () => {
    setHintDismissed(true);
    setShowHint(false);
    if (hintKey) {
      try { localStorage.setItem(hintKey, '1'); } catch { /* ignore */ }
    }
  };

  const openTutor = () => {
    dismissHint();
    setOpen(true);
  };

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={openTutor}
        className="hidden md:inline-flex fixed bottom-5 right-5 z-40 items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-3 rounded-2xl shadow-2xl shadow-blue-900/50 border border-blue-400/30 transition"
        title="Poser une question au tuteur IA"
      >
        <Icon name="sparkles" size={16} />
        Tuteur IA
      </button>

      {showHint && !hintDismissed && (
        <div className="fixed bottom-24 right-4 left-4 sm:left-auto sm:w-80 z-40 bg-slate-900 border border-blue-500/40 rounded-2xl shadow-2xl shadow-black/60 p-4 animate-in">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 flex items-center justify-center shrink-0">
              <Icon name="sparkles" size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-white">Une IA peut vous aider</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Expliquez-lui une notion, une erreur de QCM ou demandez une méthode de révision.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissHint}
              aria-label="Fermer"
              className="shrink-0 text-slate-500 hover:text-white"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={openTutor}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black py-2 rounded-xl transition"
            >
              Essayer maintenant
            </button>
            <button
              type="button"
              onClick={dismissHint}
              className="px-3 text-[11px] font-bold text-slate-400 hover:text-white transition"
            >
              Plus tard
            </button>
          </div>
        </div>
      )}

      <AiTutor open={open} onClose={() => setOpen(false)} context={context} />
    </>
  );
}
