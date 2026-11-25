import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui/icons.jsx';
import { api } from '../services/api';
import { getCurrentUser } from '../services/authService';

const PRESETS = [500, 1000, 1500];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;
const NETWORKS = [
  { id: 'mtn_cm', label: 'MTN MoMo', hint: 'MTN Cameroun' },
  { id: 'orange_cm', label: 'Orange Money', hint: 'Orange Cameroun' }
];

function formatFcfa(value) {
  return `${Number(value).toLocaleString('fr-FR')} FCFA`;
}

function normalizeCmPhone(value) {
  const raw = String(value || '').trim().replace(/[\s().-]/g, '');
  if (/^\+237[26]\d{8}$/.test(raw)) return raw;
  if (/^237[26]\d{8}$/.test(raw)) return `+${raw}`;
  if (/^[26]\d{8}$/.test(raw)) return `+237${raw}`;
  return '';
}

/**
 * Petit bouton de don volontaire (SasPay softpay). L'utilisateur saisit son
 * numéro Mobile Money, reçoit un push USSD sur son téléphone et confirme.
 */
export default function DonationButton({ className = '', compact = false, variant = 'pill' }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [network, setNetwork] = useState('mtn_cm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('form'); // form | pending | success | failed
  const pollRef = useRef(null);
  const attemptsRef = useRef(0);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !loading && phase !== 'pending') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openModal() {
    const user = getCurrentUser();
    setName((prev) => prev || user?.name || '');
    setEmail((prev) => prev || user?.email || '');
    setError('');
    setPhase('form');
    setOpen(true);
  }

  function closeModal() {
    stopPolling();
    setOpen(false);
    setLoading(false);
    if (phase === 'success' || phase === 'failed') {
      setPhase('form');
        setError('');
    }
  }

  const selectedAmount = useCustom ? Math.round(Number(custom)) : amount;
  const amountValid = Number.isFinite(selectedAmount) && selectedAmount >= MIN_AMOUNT && selectedAmount <= MAX_AMOUNT;
  const phoneValid = !!normalizeCmPhone(phone);

  async function pollStatus(id) {
    attemptsRef.current += 1;
    if (attemptsRef.current > 45) { // ~3 min
      stopPolling();
      setPhase('failed');
      setError('La confirmation prend trop de temps. Si vous avez validé sur votre téléphone, le don sera pris en compte.');
      return;
    }
    try {
      const data = await api(`/donations/status/${encodeURIComponent(id)}`);
      const status = String(data?.status || '').toUpperCase();
      if (status === 'SUCCESS' || status === 'SUCCESSFUL' || status === 'PAID') {
        stopPolling();
        setPhase('success');
        setError('');
      } else if (['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(status)) {
        stopPolling();
        setPhase('failed');
        setError('Le paiement n’a pas été confirmé. Aucun montant n’a été débité si vous n’avez pas validé.');
      }
    } catch {
      // ignorer les erreurs transitoires de sondage
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!amountValid) {
      setError(`Choisissez un montant entre ${MIN_AMOUNT.toLocaleString('fr-FR')} et ${MAX_AMOUNT.toLocaleString('fr-FR')} FCFA.`);
      return;
    }
    const normalizedPhone = normalizeCmPhone(phone);
    if (!normalizedPhone) {
      setError('Entrez un numéro Cameroun valide (ex : 6XXXXXXXX ou +2376XXXXXXXX).');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/donations/initiate', {
        method: 'POST',
        body: { amount: selectedAmount, name, email, phone: normalizedPhone, network }
      });
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data?.paymentId) {
        setPhase('pending');
        attemptsRef.current = 0;
        stopPolling();
        pollRef.current = setInterval(() => { pollStatus(data.paymentId); }, 4000);
        return;
      }
      setError('Réponse de paiement invalide. Merci de réessayer.');
    } catch (err) {
      setError(err?.message || 'Impossible d’initier le paiement. Merci de réessayer.');
    } finally {
      setLoading(false);
    }
  }

  const isMenu = variant === 'menu';
  const btnClass = isMenu
    ? `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-rose-300 transition ${className}`
    : `inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 transition ${className}`;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={btnClass}
        title="Soutenir QCM App (volontaire)"
      >
        <Icon name="heart" size={isMenu ? 16 : 14} className={isMenu ? 'text-rose-400/70' : 'text-rose-400'} />
        <span className={isMenu ? 'flex-1 text-left' : ''}>{compact ? 'Don' : 'Faire un don'}</span>
        {isMenu && <span className="text-[10px] text-slate-500">volontaire</span>}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => { if (!loading && phase !== 'pending') closeModal(); }} />
          <div role="dialog" aria-modal="true" aria-label="Faire un don" className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-rose-300 font-black text-base">
                  <Icon name="heart" size={18} className="text-rose-400" />
                  Soutenir QCM App
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Don <span className="text-slate-200 font-semibold">volontaire</span>, pour encourager les administrateurs et soutenir la maintenance.
                </p>
              </div>
              <button type="button" onClick={closeModal} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50" aria-label="Fermer">
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="p-5">
              {phase === 'success' ? (
                <div className="text-center py-4 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto"><Icon name="check-circle" size={30} /></div>
                  <p className="text-white font-bold">Merci pour votre soutien !</p>
                  <p className="text-sm text-slate-400">Votre don a été confirmé. L’équipe QCM App vous en est reconnaissante.</p>
                  <button type="button" onClick={closeModal} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition">Fermer</button>
                </div>
              ) : phase === 'pending' ? (
                <div className="text-center py-4 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto"><Icon name="phone" size={28} /></div>
                  <p className="text-white font-bold">Confirmez sur votre téléphone</p>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Une demande USSD / Mobile Money a été envoyée au <span className="text-slate-200 font-semibold">{normalizeCmPhone(phone)}</span>.
                    Validez le paiement sur votre téléphone pour terminer le don de <span className="text-slate-200 font-semibold">{formatFcfa(selectedAmount)}</span>.
                  </p>
                  <p className="text-[11px] text-slate-500">En attente de confirmation… cette fenêtre se mettra à jour automatiquement.</p>
                  {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</div>}
                  <button type="button" onClick={() => { stopPolling(); setPhase('form'); }} className="text-xs text-slate-400 hover:text-white underline">Modifier le numéro</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {phase === 'failed' && error && (
                    <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">{error}</div>
                  )}

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Montant</p>
                    <div className="grid grid-cols-3 gap-2">
                      {PRESETS.map((value) => {
                        const active = !useCustom && amount === value;
                        return (
                          <button key={value} type="button" onClick={() => { setUseCustom(false); setAmount(value); }}
                            className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition ${active ? 'bg-rose-500/20 border-rose-400/50 text-rose-200' : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                            {formatFcfa(value)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <input type="number" min={MIN_AMOUNT} max={MAX_AMOUNT} step="100" inputMode="numeric" value={custom}
                        onFocus={() => setUseCustom(true)} onChange={(e) => { setUseCustom(true); setCustom(e.target.value); }}
                        placeholder="Montant libre"
                        className={`w-full px-3 py-2.5 rounded-xl bg-slate-950 border text-sm text-white placeholder:text-slate-600 outline-none transition ${useCustom ? 'border-rose-400/50' : 'border-slate-700 focus:border-slate-500'}`} />
                      <span className="text-sm font-bold text-slate-400 shrink-0">FCFA</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Réseau Mobile Money</p>
                    <div className="grid grid-cols-2 gap-2">
                      {NETWORKS.map((n) => (
                        <button key={n.id} type="button" onClick={() => setNetwork(n.id)}
                          className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition ${network === n.id ? 'bg-rose-500/20 border-rose-400/50 text-rose-200' : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                          {n.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Numéro Mobile Money <span className="text-rose-400">*</span></span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="Ex : 6XXXXXXXX"
                      className="mt-2 w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-slate-500" />
                    <span className="text-[11px] text-slate-500 mt-1 block">Le numéro qui recevra la demande de confirmation USSD.</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500">Nom (optionnel)</span>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-slate-500" placeholder="Votre nom" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500">Email (optionnel)</span>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-slate-500" placeholder="vous@email.com" />
                    </label>
                  </div>

                  {phase !== 'failed' && error && (
                    <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</div>
                  )}

                  <button type="submit" disabled={loading || !amountValid || !phoneValid}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black transition">
                    {loading ? 'Envoi en cours...' : `Recevoir la demande USSD · ${amountValid ? formatFcfa(selectedAmount) : '—'}`}
                  </button>

                  <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                    Vous validerez le paiement directement sur votre téléphone. Aucun don n’est obligatoire pour utiliser QCM App.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
