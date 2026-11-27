import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui/icons.jsx';
import { api } from '../services/api';

const PRESETS = [500, 1000, 2000, 5000, 10000, 25000];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;
const NETWORKS = [
  { id: 'orange_cm', label: 'Orange Money' },
  { id: 'mtn_cm', label: 'MTN Mobile Money' }
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

function isFinalSuccess(status) {
  const s = String(status || '').toUpperCase();
  return s === 'SUCCESS' || s === 'SUCCESSFUL' || s === 'PAID';
}

function isFinalFailure(status) {
  return ['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(String(status || '').toUpperCase());
}

/**
 * Don volontaire QCM App via SasPay softpay (backend).
 * Flux 3 étapes : Montant -> Paiement -> Confirmation.
 */
export default function DonationButton({ className = '', compact = false, variant = 'pill' }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [network, setNetwork] = useState('orange_cm');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [lastCheck, setLastCheck] = useState('');
  const pollRef = useRef(null);

  const selectedAmount = useCustom ? Math.round(Number(custom)) : amount;
  const amountValid = Number.isFinite(selectedAmount) && selectedAmount >= MIN_AMOUNT && selectedAmount <= MAX_AMOUNT;
  const normalizedPhone = normalizeCmPhone(phone);
  const phoneValid = !!normalizedPhone;

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !loading) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading]);

  function resetFlow() {
    stopPolling();
    setStep(1);
    setError('');
    setLoading(false);
    setPaymentId('');
    setPaymentStatus('');
    setLastCheck('');
  }

  function openModal() {
    setError('');
    setOpen(true);
  }

  function closeModal() {
    if (loading) return;
    stopPolling();
    setOpen(false);
  }

  async function verifyPayment(id = paymentId, silent = false) {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const data = await api(`/donations/status/${encodeURIComponent(id)}`);
      const status = String(data?.status || 'PENDING').toUpperCase();
      setPaymentStatus(status);
      setLastCheck(new Date().toLocaleTimeString('fr-FR'));
      if (isFinalSuccess(status)) {
        stopPolling();
        setStep(4);
        setError('');
      } else if (isFinalFailure(status)) {
        stopPolling();
        setError(data?.failureReason || 'Le paiement n’a pas été confirmé. Vous pouvez réessayer un autre don.');
      } else {
        setError('');
      }
    } catch (err) {
      if (!silent) setError(err?.message || 'Impossible de vérifier le paiement pour le moment.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function startPolling(id) {
    stopPolling();
    pollRef.current = setInterval(() => { verifyPayment(id, true); }, 5000);
  }

  async function handleInitiate(e) {
    e.preventDefault();
    setError('');
    if (!amountValid) {
      setError(`Choisissez un montant entre ${MIN_AMOUNT.toLocaleString('fr-FR')} et ${MAX_AMOUNT.toLocaleString('fr-FR')} FCFA.`);
      return;
    }
    if (!phoneValid) {
      setError('Entrez un numéro Cameroun valide (ex : 6XXXXXXXX ou +2376XXXXXXXX).');
      return;
    }
    setLoading(true);
    try {
      const data = await api('/donations/initiate', {
        method: 'POST',
        body: {
          amount: selectedAmount,
          name,
          email,
          phone: normalizedPhone,
          network
        }
      });
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data?.paymentId) {
        setPaymentId(data.paymentId);
        setPaymentStatus(String(data?.status || 'PENDING').toUpperCase());
        setStep(3);
        setLastCheck(new Date().toLocaleTimeString('fr-FR'));
        startPolling(data.paymentId);
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
  const isCard = variant === 'card';
  const btnClass = isMenu
    ? `w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold max-w-full bg-indigo-500/12 border border-indigo-400/30 text-indigo-200 hover:bg-indigo-500/20 hover:border-indigo-400/45 transition ${className}`
    : isCard
      ? `inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-black whitespace-nowrap max-w-full bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25 transition ${className}`
      : `inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap max-w-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 hover:bg-indigo-500/25 hover:text-white transition ${className}`;

  const stepLabels = ['Montant', 'Paiement', 'Confirmation'];

  return (
    <>
      <button type="button" onClick={openModal} className={btnClass} title="Soutenir QCM App">
        <Icon name="heart" size={isMenu || isCard ? 18 : 16} className={isCard ? 'text-white' : 'text-indigo-400'} />
        <span className={isMenu ? 'flex-1 text-left' : ''}>{compact ? 'Don' : 'Faire un don'}</span>
        {isMenu && <span className="text-[10px] font-bold text-indigo-300/80 bg-indigo-500/10 px-2 py-0.5 rounded-full">soutien</span>}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-2 sm:p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={closeModal} />
          <div role="dialog" aria-modal="true" aria-label="Faire un don" className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-indigo-300 font-black text-base">
                  <Icon name="heart" size={18} className="text-indigo-400" />
                  Soutenir QCM App
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] font-bold">
                  {stepLabels.map((label, i) => {
                    const n = i + 1;
                    const active = (step === 4 ? 3 : step) === n;
                    const done = (step === 4 ? 3 : step) > n;
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${done || active ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>{n}</span>
                        <span className={active ? 'text-indigo-300' : done ? 'text-slate-300' : 'text-slate-500'}>{label}</span>
                        {n < 3 && <span className="text-slate-700">/</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <button type="button" onClick={closeModal} disabled={loading} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50" aria-label="Fermer">
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto">
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-black text-white">Un geste à votre mesure.</h3>
                    <p className="text-sm text-slate-400 mt-1">Choisissez le montant qui vous fait plaisir pour encourager les administrateurs de QCM App.</p>
                  </div>
                  <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-xs text-slate-400">
                    <span className="font-bold text-slate-300">Mobile Money</span> · Cameroun · Devise de paiement : <span className="font-bold text-slate-300">XAF</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PRESETS.map((value) => {
                      const active = !useCustom && amount === value;
                      return (
                        <button key={value} type="button" onClick={() => { setUseCustom(false); setAmount(value); }}
                          className={`px-3 py-3 rounded-xl text-sm font-bold border transition ${active ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200' : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                          {formatFcfa(value)}
                        </button>
                      );
                    })}
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Ou un autre montant</label>
                    <div className="flex items-center gap-2 mt-2">
                      <input type="number" min={MIN_AMOUNT} max={MAX_AMOUNT} step="100" inputMode="numeric" value={custom}
                        onFocus={() => setUseCustom(true)} onChange={(e) => { setUseCustom(true); setCustom(e.target.value); }}
                        placeholder="500" className={`w-full px-3 py-2.5 rounded-xl bg-slate-950 border text-sm text-white placeholder:text-slate-600 outline-none transition ${useCustom ? 'border-indigo-400/50' : 'border-slate-700 focus:border-slate-500'}`} />
                      <span className="text-sm font-bold text-slate-400 shrink-0">FCFA</span>
                    </div>
                  </div>
                  {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</div>}
                  <button type="button" disabled={!amountValid} onClick={() => { if (amountValid) { setError(''); setStep(2); } }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-black transition">
                    Continuer
                    <Icon name="arrow-right" size={16} />
                  </button>
                  <p className="text-[11px] text-slate-500 text-center">Un don ponctuel. Aucun abonnement. Paiement sécurisé via SasPay.</p>
                </div>
              )}

              {step === 2 && (
                <form onSubmit={handleInitiate} className="space-y-4">
                  <div className="flex items-center justify-between gap-3 bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                    <div>
                      <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Votre soutien</p>
                      <p className="text-white font-black">{formatFcfa(selectedAmount)}</p>
                    </div>
                    <button type="button" onClick={() => setStep(1)} className="text-xs font-bold text-indigo-300 hover:text-indigo-200">Modifier</button>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">On y est presque.</h3>
                    <p className="text-sm text-slate-400 mt-1">Choisissez comment faire votre don.</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Moyen de paiement</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {NETWORKS.map((n) => (
                        <button key={n.id} type="button" onClick={() => setNetwork(n.id)}
                          className={`px-3 py-3 rounded-xl text-sm font-bold border transition text-left ${network === n.id ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200' : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'}`}>
                          {n.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Numéro de téléphone <span className="text-indigo-400">*</span></span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="Ex : 6XXXXXXXX"
                      className="mt-2 w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-slate-500" />
                    <span className="text-[11px] text-slate-500 mt-1 block">Validez ensuite avec votre opérateur. Ne saisissez jamais votre code PIN ici.</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500">Prénom et nom</span>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-slate-500" placeholder="Votre nom complet" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500">Adresse e-mail</span>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-slate-500" placeholder="vous@exemple.com" />
                    </label>
                  </div>

                  {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</div>}

                  <button type="submit" disabled={loading || !phoneValid}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black transition">
                    {loading ? 'Envoi en cours...' : `Donner ${formatFcfa(selectedAmount)}`}
                  </button>
                  <p className="text-[11px] text-slate-500 text-center">Paiement sécurisé · SasPay. Petit ou grand, votre soutien fait la différence.</p>
                </form>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto mb-3">
                      <Icon name="phone" size={28} />
                    </div>
                    <h3 className="text-lg font-black text-white">Validez votre paiement.</h3>
                    <p className="text-2xl font-black text-indigo-300 mt-1">{formatFcfa(selectedAmount)}</p>
                  </div>

                  <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2 text-sm text-slate-300">
                    <p>Demande reçue. En attente de confirmation de l’opérateur.</p>
                    <p className="text-[11px] text-slate-500">Actualisation automatique toutes les 5 secondes{lastCheck ? ` · Dernière vérification : ${lastCheck}` : ''}.</p>
                    {isFinalFailure(paymentStatus) && (
                      <p className="text-xs text-red-300">Le paiement a échoué ou a été annulé. Vous pouvez réessayer un autre don.</p>
                    )}
                  </div>

                  {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</div>}

                  <button type="button" onClick={() => verifyPayment(paymentId, false)} disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-black transition">
                    {loading ? 'Vérification...' : 'J’ai reçu un code de confirmation'}
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button type="button" onClick={() => verifyPayment(paymentId, false)} disabled={loading}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm font-bold transition">
                      Vérifier le paiement
                    </button>
                    <button type="button" onClick={() => { stopPolling(); setStep(2); setError(''); }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition">
                      Modifier
                    </button>
                  </div>

                  <details className="bg-slate-950/40 border border-slate-800 rounded-xl p-3 text-xs text-slate-400">
                    <summary className="cursor-pointer font-bold text-slate-300">Détails du paiement</summary>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between gap-3"><span>Montant</span><span className="text-slate-200 font-semibold">{formatFcfa(selectedAmount)}</span></div>
                      <div className="flex justify-between gap-3"><span>Réseau</span><span className="text-slate-200 font-semibold">{NETWORKS.find(n => n.id === network)?.label || network}</span></div>
                      <div className="flex justify-between gap-3"><span>Numéro</span><span className="text-slate-200 font-semibold">{normalizedPhone || phone}</span></div>
                      {paymentId && <div className="flex justify-between gap-3"><span>Référence</span><span className="text-slate-200 font-mono text-[11px] break-all">{paymentId}</span></div>}
                    </div>
                  </details>

                  <button type="button" onClick={() => { stopPolling(); resetFlow(); }}
                    className="w-full text-xs text-slate-400 hover:text-white underline">
                    Faire un autre don
                  </button>

                  <p className="text-[11px] text-slate-500 text-center">Paiement sécurisé · SasPay</p>
                </div>
              )}

              {step === 4 && (
                <div className="text-center py-4 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
                    <Icon name="check-circle" size={30} />
                  </div>
                  <h3 className="text-lg font-black text-white">Merci pour votre soutien !</h3>
                  <p className="text-sm text-slate-400">Votre don de <span className="text-slate-200 font-semibold">{formatFcfa(selectedAmount)}</span> a été confirmé. Les administrateurs de QCM App vous remercient.</p>
                  <button type="button" onClick={() => { closeModal(); resetFlow(); }}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black transition">
                    Fermer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
