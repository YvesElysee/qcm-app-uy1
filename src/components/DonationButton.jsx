import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui/icons.jsx';
import { api } from '../services/api';
import { getCurrentUser } from '../services/authService';

const PRESETS = [500, 1000, 1500];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;

function formatFcfa(value) {
  return `${Number(value).toLocaleString('fr-FR')} FCFA`;
}

/**
 * Petit bouton de don volontaire (SasPay). Ouvre une modale avec montants
 * suggérés ou montant libre, puis redirige vers le checkout SasPay.
 */
export default function DonationButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function openModal() {
    const user = getCurrentUser();
    setName((prev) => prev || user?.name || '');
    setEmail((prev) => prev || user?.email || '');
    setError('');
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const selectedAmount = useCustom ? Math.round(Number(custom)) : amount;
  const amountValid = Number.isFinite(selectedAmount) && selectedAmount >= MIN_AMOUNT && selectedAmount <= MAX_AMOUNT;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!amountValid) {
      setError(`Choisissez un montant entre ${MIN_AMOUNT.toLocaleString('fr-FR')} et ${MAX_AMOUNT.toLocaleString('fr-FR')} FCFA.`);
      return;
    }
    setLoading(true);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?don=merci`;
      const data = await api('/donations/checkout', {
        method: 'POST',
        body: { amount: selectedAmount, name, email, returnUrl }
      });
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setError('Réponse de paiement invalide. Merci de réessayer.');
    } catch (err) {
      setError(err?.message || 'Impossible d’initier le paiement. Merci de réessayer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 transition ${className}`}
      >
        <Icon name="heart" size={14} className="text-rose-400" />
        Faire un don
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => !loading && setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Faire un don"
            className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-rose-300 font-black text-base">
                  <Icon name="heart" size={18} className="text-rose-400" />
                  Soutenir QCM App
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Le don est <span className="text-slate-200 font-semibold">entièrement volontaire</span>.
                  Il aide à encourager les administrateurs et à couvrir la maintenance des services.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !loading && setOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Fermer"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Choisir un montant</p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((value) => {
                    const active = !useCustom && amount === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => { setUseCustom(false); setAmount(value); }}
                        className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition ${
                          active
                            ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {formatFcfa(value)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2 block">Ou montant libre</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={MIN_AMOUNT}
                    max={MAX_AMOUNT}
                    step="100"
                    inputMode="numeric"
                    value={custom}
                    onFocus={() => setUseCustom(true)}
                    onChange={(e) => { setUseCustom(true); setCustom(e.target.value); }}
                    placeholder="Ex : 2000"
                    className={`w-full px-3 py-2.5 rounded-xl bg-slate-950 border text-sm text-white placeholder:text-slate-600 outline-none transition ${
                      useCustom ? 'border-rose-400/50' : 'border-slate-700 focus:border-slate-500'
                    }`}
                  />
                  <span className="text-sm font-bold text-slate-400 shrink-0">FCFA</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-bold text-slate-500">Nom (optionnel)</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-slate-500"
                    placeholder="Votre nom"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold text-slate-500">Email (optionnel)</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-slate-500"
                    placeholder="vous@email.com"
                  />
                </label>
              </div>

              {error && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !amountValid}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black transition"
              >
                {loading ? 'Redirection...' : `Continuer vers le paiement · ${amountValid ? formatFcfa(selectedAmount) : '—'}`}
              </button>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                Paiement sécurisé via SasPay. Aucun don n’est obligatoire pour utiliser QCM App.
              </p>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
