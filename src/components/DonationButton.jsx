import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui/icons.jsx';
import { api } from '../services/api';

const PRESETS = [500, 1000, 2000, 5000, 10000, 25000];
const MIN_AMOUNT = 200;
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
  const [info, setInfo] = useState('');
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
    setStep(1); setError(''); setInfo(''); setLoading(false);
    setPaymentId(''); setPaymentStatus(''); setLastCheck('');
  }
  function openModal() { setError(''); setInfo(''); setOpen(true); }
  function closeModal() { if (loading) return; stopPolling(); setOpen(false); }

  async function verifyPayment(id = paymentId, silent = false) {
    if (!id) return;
    if (!silent) { setLoading(true); setInfo(''); }
    try {
      const data = await api(`/donations/status/${encodeURIComponent(id)}`);
      const status = String(data?.status || 'PENDING').toUpperCase();
      setPaymentStatus(status);
      setLastCheck(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (isFinalSuccess(status)) {
        stopPolling();
        setError('');
        setInfo('');
        setStep(4);
      } else if (isFinalFailure(status)) {
        stopPolling();
        setInfo('');
        setError(data?.failureReason || 'Le paiement n’a pas abouti. Vous pouvez relancer un soutien.');
      } else {
        setError('');
        if (!silent) setInfo('Paiement toujours en attente. Confirmez la demande sur votre téléphone, puis réessayez.');
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
    setInfo('');
    if (!amountValid) { setError(`Montant invalide : entre ${MIN_AMOUNT.toLocaleString('fr-FR')} et ${MAX_AMOUNT.toLocaleString('fr-FR')} FCFA.`); return; }
    if (!phoneValid) { setError('Numéro Cameroun invalide. Exemple : 6XXXXXXXX ou +2376XXXXXXXX.'); return; }
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
      setError('Réponse de paiement inattendue. Merci de réessayer.');
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
  const steps = [
    { n: 1, label: 'Montant' },
    { n: 2, label: 'Infos' },
    { n: 3, label: 'Validation' }
  ];

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
          <div role="dialog" aria-modal="true" aria-label="Soutenir QCM App"
            className="relative w-full sm:max-w-[540px] bg-slate-900 sm:border border-slate-700/80 sm:rounded-3xl shadow-2xl overflow-hidden max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col">

            <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-400/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <Icon name="heart" size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-black text-white truncate">Soutenir QCM App</p>
                  <p className="text-[11px] text-slate-400 truncate">Encouragez les administrateurs de la plateforme</p>
                </div>
              </div>
              <button type="button" onClick={closeModal} disabled={loading} className="shrink-0 w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition disabled:opacity-50" aria-label="Fermer">
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="px-4 sm:px-6 pt-4">
              <div className="grid grid-cols-3 gap-2">
                {steps.map((s) => {
                  const active = currentStep === s.n;
                  const done = currentStep > s.n;
                  return (
                    <div key={s.n} className={`rounded-xl px-3 py-2 text-center border transition ${active ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200' : done ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
                      <div className="text-[10px] font-black uppercase tracking-wider">{s.n}. {s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-4 sm:px-6 py-5 overflow-y-auto">
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-white">Choisissez votre contribution</h3>
                    <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">Votre don aide les administrateurs à faire évoluer QCM App et à maintenir les services pour les étudiants.</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {PRESETS.map((value) => {
                      const active = !useCustom && amount === value;
                      return (
                        <button key={value} type="button" onClick={() => { setUseCustom(false); setAmount(value); setError(''); }}
                          className={`px-3 py-3 rounded-2xl border text-sm font-black transition ${active ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/20' : 'bg-slate-800/50 border-slate-700 text-slate-200 hover:border-indigo-400/40 hover:text-white'}`}>
                          {formatFcfa(value)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Autre montant</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={MIN_AMOUNT} max={MAX_AMOUNT} step="100" inputMode="numeric" value={custom}
                        onFocus={() => { setUseCustom(true); setError(''); }}
                        onChange={(e) => { setUseCustom(true); setCustom(e.target.value); setError(''); }}
                        placeholder="Ex : 3000"
                        className={`w-full px-4 py-3 rounded-xl bg-slate-900 border text-sm text-white placeholder:text-slate-600 outline-none transition ${useCustom ? 'border-indigo-400/60' : 'border-slate-700 focus:border-slate-500'}`} />
                      <span className="text-sm font-bold text-slate-400 shrink-0">FCFA</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">Minimum {MIN_AMOUNT.toLocaleString('fr-FR')} FCFA.</p>
                  </div>

                  {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</div>}

                  <button type="button" disabled={!amountValid} onClick={() => { if (amountValid) { setError(''); setStep(2); } }}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-black transition">
                    Passer au paiement
                    <Icon name="arrow-right" size={16} />
                  </button>
                  <p className="text-[11px] text-slate-500 text-center">Paiement unique via SasPay.</p>
                </div>
              )}

              {step === 2 && (
                <form onSubmit={handleInitiate} className="space-y-5">
                  <div className="flex items-center justify-between gap-3 bg-indigo-500/10 border border-indigo-400/20 rounded-2xl p-4">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wider text-indigo-300/80">Montant choisi</p>
                      <p className="text-xl font-black text-white mt-0.5">{formatFcfa(selectedAmount)}</p>
                    </div>
                    <button type="button" onClick={() => { setError(''); setStep(1); }} className="text-xs font-bold text-indigo-200 bg-slate-900/40 hover:bg-slate-900/70 border border-indigo-400/20 px-3 py-2 rounded-xl transition">Changer</button>
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-white">Vos informations de paiement</h3>
                    <p className="text-sm text-slate-400 mt-1.5">Sélectionnez votre opérateur Mobile Money et le numéro à débiter.</p>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Opérateur</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {NETWORKS.map((n) => {
                        const active = network === n.id;
                        return (
                          <button key={n.id} type="button" onClick={() => setNetwork(n.id)}
                            className={`p-4 rounded-2xl border text-left transition ${active ? 'bg-slate-800 border-indigo-400/50' : 'bg-slate-950/30 border-slate-700 hover:border-slate-500'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className={`text-sm font-black ${active ? 'text-white' : 'text-slate-200'}`}>{n.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{n.sub}</p>
                              </div>
                              <span className={`w-5 h-5 rounded-full border-2 shrink-0 ${active ? 'border-indigo-400 bg-indigo-400' : 'border-slate-600'}`} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Numéro Mobile Money <span className="text-indigo-400">*</span></span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="6XXXXXXXX"
                      className="mt-2 w-full px-4 py-3 rounded-2xl bg-slate-950/50 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-400/60 transition" />
                    <span className="text-[11px] text-slate-500 mt-2 block">Vous confirmerez la transaction sur votre téléphone. Ne partagez jamais votre code PIN.</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500">Nom (optionnel)</span>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Votre nom"
                        className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-950/50 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-400/60 transition" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-500">Email (optionnel)</span>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@email.com"
                        className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-950/50 border border-slate-700 text-sm text-white placeholder:text-slate-600 outline-none focus:border-indigo-400/60 transition" />
                    </label>
                  </div>

                  {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">{error}</div>}

                  <button type="submit" disabled={loading || !phoneValid}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-black transition shadow-lg shadow-indigo-500/20">
                    {loading ? 'Traitement...' : `Envoyer la demande de ${formatFcfa(selectedAmount)}`}
                  </button>
                  <p className="text-[11px] text-slate-500 text-center">Transaction sécurisée via SasPay.</p>
                </form>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="bg-slate-950/40 border border-slate-800 rounded-3xl p-5 sm:p-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/12 border border-amber-400/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
                      <Icon name="phone" size={26} />
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">En attente de validation</p>
                    <h3 className="text-2xl font-black text-white mt-2">{formatFcfa(selectedAmount)}</h3>
                    <p className="text-sm text-slate-400 mt-3 leading-relaxed">
                      {isFinalFailure(paymentStatus)
                        ? 'La transaction n’a pas été confirmée. Vous pouvez réessayer.'
                        : 'Une demande a été envoyée sur votre téléphone. Confirmez-la avec votre code opérateur pour finaliser le don.'}
                    </p>
                    {!isFinalFailure(paymentStatus) && (
                      <p className="text-[11px] text-slate-500 mt-3">Vérification automatique toutes les 5s{lastCheck ? ` · ${lastCheck}` : ''}</p>
                    )}
                  </div>

                  {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-center">{error}</div>}
                  {info && !error && <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 text-center">{info}</div>}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button type="button" onClick={() => verifyPayment(paymentId, false)} disabled={loading}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-black transition">
                      {loading ? 'Vérification...' : 'J’ai confirmé sur mon téléphone'}
                    </button>
                    <button type="button" onClick={() => verifyPayment(paymentId, false)} disabled={loading}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 text-slate-200 text-sm font-bold transition">
                      Actualiser le statut
                    </button>
                  </div>

                  <details className="bg-slate-950/30 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-slate-400">
                    <summary className="cursor-pointer font-bold text-slate-300 select-none">Détails</summary>
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between gap-3"><span>Montant</span><span className="text-slate-200 font-semibold">{formatFcfa(selectedAmount)}</span></div>
                      <div className="flex justify-between gap-3"><span>Opérateur</span><span className="text-slate-200 font-semibold">{NETWORKS.find(n => n.id === network)?.label || network}</span></div>
                      <div className="flex justify-between gap-3"><span>Numéro</span><span className="text-slate-200 font-semibold">{normalizedPhone || phone}</span></div>
                      {paymentId && <div className="flex justify-between gap-3"><span>Référence</span><span className="text-slate-200 font-mono text-[11px] break-all text-right">{paymentId}</span></div>}
                    </div>
                  </details>

                  <div className="flex flex-col sm:flex-row gap-2 sm:justify-center">
                    <button type="button" onClick={() => { stopPolling(); setError(''); setInfo(''); setStep(2); }} className="text-sm font-bold text-slate-400 hover:text-white px-3 py-2 rounded-xl hover:bg-slate-800 transition">Modifier les infos</button>
                    <button type="button" onClick={() => { stopPolling(); resetFlow(); }} className="text-sm font-bold text-indigo-300 hover:text-indigo-200 px-3 py-2 rounded-xl hover:bg-indigo-500/10 transition">Nouveau don</button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="text-center py-6 sm:py-8 space-y-4">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/12 border border-emerald-400/20 text-emerald-400 flex items-center justify-center mx-auto">
                    <Icon name="check-circle" size={40} />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-emerald-400 mb-2">Don confirmé</p>
                    <h3 className="text-2xl sm:text-3xl font-black text-white">Merci pour votre soutien</h3>
                    <p className="text-sm text-slate-400 mt-3 max-w-sm mx-auto leading-relaxed">
                      Votre contribution de <span className="text-white font-semibold">{formatFcfa(selectedAmount)}</span> a été reçue. Elle aide les administrateurs de QCM App à maintenir la plateforme.
                    </p>
                  </div>
                  <button type="button" onClick={() => { closeModal(); resetFlow(); }}
                    className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-black transition">
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
