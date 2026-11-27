import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui/icons.jsx';

const SASPAY_DONATION_URL = 'https://link.saspay.me/57g4vjdnyl0';

/**
 * Bouton de soutien à la plateforme. Redirige vers la page de paiement SasPay.
 */
export default function DonationButton({ className = '', compact = false, variant = 'pill' }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const isMenu = variant === 'menu';
  const isCard = variant === 'card';
  const btnClass = isMenu
    ? `w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold max-w-full bg-indigo-500/12 border border-indigo-400/30 text-indigo-200 hover:bg-indigo-500/20 hover:border-indigo-400/45 transition ${className}`
    : isCard
      ? `inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-black whitespace-nowrap max-w-full bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25 transition ${className}`
      : `inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap max-w-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 hover:bg-indigo-500/25 hover:text-white transition ${className}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnClass}
        title="Soutenir QCM App"
      >
        <Icon name="heart" size={isMenu || isCard ? 18 : 16} className={isCard ? 'text-white' : 'text-indigo-400'} />
        <span className={isMenu ? 'flex-1 text-left' : ''}>{compact ? 'Don' : 'Faire un don'}</span>
        {isMenu && <span className="text-[10px] font-bold text-indigo-300/80 bg-indigo-500/10 px-2 py-0.5 rounded-full">soutien</span>}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Faire un don"
            className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-indigo-300 font-black text-base">
                  <Icon name="heart" size={18} className="text-indigo-400" />
                  Soutenir QCM App
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Votre soutien encourage les administrateurs de la plateforme et aide à maintenir QCM App.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Fermer"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto">
              <div className="space-y-4">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Vous pouvez faire un don pour encourager les administrateurs de la plateforme et soutenir la maintenance des services. Chaque contribution aide à faire vivre QCM App pour les étudiants.
                  </p>
                </div>

                <a
                  href={SASPAY_DONATION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black transition shadow-lg shadow-indigo-500/20"
                >
                  <Icon name="heart" size={16} />
                  Continuer vers le paiement
                </a>

                <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                  Vous serez redirigé vers la page de paiement sécurisée SasPay.
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
