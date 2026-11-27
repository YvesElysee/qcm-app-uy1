import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui/icons.jsx';
import { api } from '../services/api';

const PRESETS = [500, 1000, 2000, 5000, 10000, 25000];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;
const NETWORKS = [
  { id: 'orange_cm', label: 'Orange Money', sub: 'Orange Cameroun' },
  { id: 'mtn_cm', label: 'MTN Mobile Money', sub: 'MTN Cameroun' }
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
    const onKey = (e) => { if (e.key === 'Escape' && !loading) { stopPolling(); setOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading]);

  function resetFlow() {
    stopPolling();
    setStep(1); setError(''); setLoading(false);
    setPaymentId(''); setPaymentStatus(''); setLastCheck('');
  }
  function openModal() { setError(''); setOpen(true); }
  function closeModal() { if (loading) return; stopPolling(); setOpen(false); }

  async function verifyPayment(id = paymentId, silent = false) {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const data = await api(`/donations/status/${encodeURIComponent(id)}`);
      const status = String(data?.status || 'PENDING').toUpperCase();
      setPaymentStatus(status);
      setLastCheck(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (isFinalSuccess(status)) { stopPolling(); setStep(4); setError(''); }
      else if (isFinalFailure(status)) { stopPolling(); setError(data?.failureReason || 'Le paiement n’a pas été confirmé. Vous pouvez refaire un don.'); }
      else setError('');
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
    if (!amountValid) { setError(`Choisissez un montant entre ${MIN_AMOUNT.toLocaleString('fr-FR')} et ${MAX_AMOUNT.toLocaleString('fr-FR')} FCFA.`); return; }
    if (!phoneValid) { setError('Entrez un numéro Cameroun valide (ex : 6XXXXXXXX ou +2376XXXXXXXX).'); return; }
    setLoading(true);
    try {
      const data = await api('/donations/initiate', {
        method: 'POST',
        body: { amount: selectedAmount, name, email, phone: normalizedPhone, network }
      });
      if (data?.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      if (data?.paymentId) {
        setPaymentId(data.paymentId);
        setPaymentStatus(String(data?.status || 'PENDING').toUpperCase());
        setStep(3);
        setLastCheck(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
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

  const currentStep = step === 4 ? 3 : step;

  return (
    <>
      <button type="button" onClick={openModal} className={btnClass} title="Soutenir QCM App">
        <Icon name="heart" size={isMenu || isCard ? 18 : 16} className={isCard ? 'text-white' : 'text-indigo-400'} />
        <span className={isMenu ? 'flex-1 text-left' : ''}>{compact ? 'Don' : 'Faire un don'}</span>
        {isMenu && <span className="text-[10px] font-bold text-indigo-300/80 bg-indigo-500/10 px-2 py-0.5 rounded-full">soutien</span>}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={closeModal} />
          <div
            role="dialog" aria-modal="true" aria-label="Soutenir QCM App"
            className="relative w-full sm:max-w-[560px] bg-slate-900 sm:border border-slate-800 sm:rounded-3xl shadow-2xl overflow-hidden max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col"
          >
            {/* Header */}
            <div className="px-4 sm:px-7 pt-4 sm:pt-6 pb-4 border-b border-slate-800/80">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-1">QCM App</p>
                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">Soutenir QCM App</h2>
                </div>
                <button type="button" onClick={closeModal} disabled={loading} className="shrink-0 w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition disabled:opacity-50" aria-label="Fermer">
                  <Icon name="close" size={18} />
                </button>
              </div>

              {/* Stepper */}
              <div className="flex items-center gap-2 sm:gap-3 mt-5">
                {['Montant', 'Paiement', 'Confirmation'].map((label, i) => {
                  const n = i + 1;
                  const done = currentStep > n;
                  const active = currentStep === n;
                  return (
                    <div key={label} className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition ${done ? 'bg-indigo-500 text-white' : active ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/40' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                          {done ? <Icon name="check" size={14} /> : n}
                        </span>
                        <span className={`text-xs sm:text-sm font-bold truncate ${active ? 'text-white' : done ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span>
                      </div>
                      {n < 3 && <div className={`h-px flex-1 ${done ? 'bg-indigo-500/50' : 'bg-slate-800'}`} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="px-4 sm:px-7 py-5 sm:py-6 overflow-y-auto">
              {step === 1 && (
                <div className="space-y-6">
                  <div className="max-w-md">
                    <h3 className="text-2xl sm:text-[2rem] font-black text-white leading-tight tracking-tight">Un geste à votre mesure.</h3>
                    <p className="text-sm sm:text-base text-slate-400 mt-2 leading-relaxed">Choisissez le montant qui vous fait plaisir pour encourager les administrateurs de QCM App.</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    {PRESETS.map((value) => {
                      const active = !useCustom && amount === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => { setUseCustom(false); setAmount(value); setError(''); }}
                          className={`relative px-3 py-3.5 sm:py-4 rounded-2xl text-sm sm:text-base font-bold border transition-all ${active ? 'bg-indigo-500/15 border-indigo-400/60 text-white shadow-[0_0_0_1px_rgba(129,140,248,0.25)]' : 'bg-slate-800/40 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:bg-slate-800/70'}`}
                        >
                          {formatFcfa(value)}
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Ou un autre montant</label>
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border bg-slate-950/50 transition ${useCustom ? 'border-indigo-400/60 shadow-[0_0_0_1px_rgba(129,140,248,0.2)]' : 'border-slate-700'}`}>
                      <input
                        type="number" min={MIN_AMOUNT} max={MAX_AMOUNT} step="100" inputMode="numeric"
                        value={custom}
                        onFocus={() => { setUseCustom(true); setError(''); }}
                        onChange={(e) => { setUseCustom(true); setCustom(e.target.value); setError(''); }}
                        placeholder="100"
                        className="w-full bg-transparent text-white text-base font-semibold placeholder:text-slate-600 outline-none"
                      />
                      <span className="text-sm font-bold text-slate-500 shrink-0">FCFA</span>
                    </div>
                  </div>

                  {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</div>}

                  <div className="pt-1">
                    <button
                      type="button"
                      disabled={!amountValid}
                      onClick={() => { if (amountValid) { setError(''); setStep(2); } }}
                      className="w-full sm:w-auto sm:min-w-[180px] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-black transition shadow-lg shadow-indigo-500/20"
                    >
                      Continuer
                      <Icon name="arrow-right" size={16} />
                    </button>
                    <p className="text-xs text-slate-500 mt-4 leading-relaxed">Un don ponctuel. Aucun abonnement. Paiement sécurisé via SasPay.</p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <form onSubmit={handleInitiate} className="space-y-5">
                  <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-950/40 border border-slate-800">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Votre soutien</p>
                      <p className="text-xl font-black text-white mt-0.5">{formatFcfa(selectedAmount)}</p>
                    </div>
                    <button type="button" onClick={() => { setError(''); setStep(1); }} className="text-sm font-bold text-indigo-300 hover:text-indigo-200 px-3 py-2 rounded-xl hover:bg-indigo-500/10 transition">Modifier</button>
                  </div>

                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">On y est presque.</h3>
                    <p className="text-sm text-slate-400 mt-1.5">Choisissez comment faire votre don.</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Moyen de paiement</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {NETWORKS.map((n) => {
                        const active = network === n.id;
                        return (
                          <button key={n.id} type="button" onClick={() => setNetwork(n.id)}
                            className={`p-4 rounded-2xl border text-left transition ${active ? 'bg-indigo-500/12 border-indigo-400/60 shadow-[0_0_0_1px_rgba(129,140,248,0.2)]' : 'bg-slate-800/35 border-slate-700 hover:border-slate-500'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className={`text-sm font-black ${active ? 'text-white' : 'text-slate-200'}`}>{n.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{n.sub}</p>
                              </div>
                              <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${active ? 'border-indigo-400 bg-indigo-500' : 'border-slate-600'}`}>
                                {active && <Icon name="check" size={12} className="text-white" />}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Numéro de téléphone <span className="text-indigo-400">*</span></span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="Ex : 6XXXXXXXX"
                      className="mt-2 w-full px-4 py-3 rounded-2xl bg-slate-950/50 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-400/60 transition" />
                    <span className="text-[11px] text-slate-500 mt-2 block leading-relaxed">Validez ensuite avec votre opérateur. Ne saisissez jamais votre code PIN ici.</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500">Prénom et nom</span>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Votre nom complet"
                        className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-950/50 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-400/60 transition" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500">Adresse e-mail</span>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com"
                        className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-950/50 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-400/60 transition" />
                    </label>
                  </div>

                  {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</div>}

                  <div className="pt-1">
                    <button type="submit" disabled={loading || !phoneValid}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-black transition shadow-lg shadow-indigo-500/20">
                      {loading ? 'Envoi en cours...' : `Donner ${formatFcfa(selectedAmount)}`}
                    </button>
                    <p className="text-[11px] text-slate-500 text-center mt-4">Paiement sécurisé · SasPay</p>
                    <p className="text-[11px] text-slate-600 text-center mt-1">Petit ou grand, votre soutien fait la différence. ♡</p>
                  </div>
                </form>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="text-center py-2">
                    <div className="w-16 h-16 rounded-full bg-indigo-500/12 border border-indigo-400/20 text-indigo-300 flex items-center justify-center mx-auto mb-4">
                      <Icon name="phone" size={28} />
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-400 mb-2">Confirmation</p>
                    <h3 className="text-2xl sm:text-3xl font-black text-white">Validez votre paiement.</h3>
                    <p className="text-3xl sm:text-4xl font-black text-indigo-300 mt-3">{formatFcfa(selectedAmount)}</p>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 sm:p-5 text-center">
                    <p className="text-sm text-slate-200 font-medium">
                      {isFinalFailure(paymentStatus)
                        ? 'Le paiement n’a pas été confirmé. Vous pouvez refaire un autre don.'
                        : 'Demande reçue. En attente de confirmation de l’opérateur.'}
                    </p>
                    {!isFinalFailure(paymentStatus) && (
                      <p className="text-xs text-slate-500 mt-2">
                        Actualisation automatique toutes les 5 secondes{lastCheck ? ` · Dernière vérification : ${lastCheck}` : ''}.
                      </p>
                    )}
                  </div>

                  {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-center">{error}</div>}

                  <div className="space-y-2.5">
                    <button type="button" onClick={() => verifyPayment(paymentId, false)} disabled={loading}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-black transition shadow-lg shadow-indigo-500/20">
                      {loading ? 'Vérification...' : 'J’ai reçu un code de confirmation'}
                    </button>
                    <button type="button" onClick={() => verifyPayment(paymentId, false)} disabled={loading}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-white text-sm font-bold transition">
                      Vérifier le paiement
                    </button>
                    <button type="button" onClick={() => { stopPolling(); setError(''); setStep(2); }}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800/60 text-sm font-bold transition">
                      Modifier les informations
                    </button>
                  </div>

                  <details className="bg-slate-950/30 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-slate-400">
                    <summary className="cursor-pointer font-bold text-slate-300 select-none">Détails du paiement</summary>
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between gap-3"><span>Montant</span><span className="text-slate-200 font-semibold">{formatFcfa(selectedAmount)}</span></div>
                      <div className="flex justify-between gap-3"><span>Réseau</span><span className="text-slate-200 font-semibold">{NETWORKS.find(n => n.id === network)?.label || network}</span></div>
                      <div className="flex justify-between gap-3"><span>Numéro</span><span className="text-slate-200 font-semibold">{normalizedPhone || phone}</span></div>
                      {paymentId && <div className="flex justify-between gap-3"><span>Référence</span><span className="text-slate-200 font-mono text-[11px] break-all text-right">{paymentId}</span></div>}
                    </div>
                  </details>

                  <div className="text-center pt-1">
                    <button type="button" onClick={() => { stopPolling(); resetFlow(); }}
                      className="text-xs text-slate-500 hover:text-white underline underline-offset-2 transition">
                      Faire un autre don
                    </button>
                    <p className="text-[11px] text-slate-600 mt-3">Paiement sécurisé · SasPay</p>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="text-center py-6 sm:py-8 space-y-4">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/12 border border-emerald-400/20 text-emerald-400 flex items-center justify-center mx-auto">
                    <Icon name="check-circle" size={40} />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-400 mb-2">Paiement confirmé</p>
                    <h3 className="text-2xl sm:text-3xl font-black text-white">Merci pour votre soutien !</h3>
                    <p className="text-sm sm:text-base text-slate-400 mt-3 max-w-sm mx-auto leading-relaxed">
                      Votre don de <span className="text-white font-semibold">{formatFcfa(selectedAmount)}</span> a bien été confirmé. Les administrateurs de QCM App vous remercient sincèrement.
                    </p>
                  </div>
                  <button type="button" onClick={() => { closeModal(); resetFlow(); }}
                    className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-black transition shadow-lg shadow-indigo-500/20">
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
