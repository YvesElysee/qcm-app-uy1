import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { api } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';
import AiTutor from './ai/AiTutor.jsx';
import { fetchAiStatus } from '../services/aiService';

function seededShuffle(arr, seed) {
    const a = [...arr];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
    for (let i = a.length - 1; i > 0; i--) {
        h = (Math.imul(h, 1664525) + 1013904223) | 0;
        const j = Math.abs(h) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function optionsOf(question) {
    return {
        OptA: question?.OptA || '',
        OptB: question?.OptB || '',
        OptC: question?.OptC || '',
        OptD: question?.OptD || ''
    };
}

function optionsListOf(options) {
    return ['A', 'B', 'C', 'D']
        .map(label => ({ label, text: options?.['Opt' + label] }))
        .filter(o => typeof o.text === 'string' && o.text.trim() !== '');
}

/**
 * Retrouve l'option réellement cochée, que la copie stocke le texte complet
 * (nouvelles copies) ou seulement la lettre A/B/C/D (anciennes copies).
 */
function resolveChoice(raw, optionsList) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return null;

    const lower = value.toLowerCase();
    const byText = optionsList.find(o => o.text.trim() === value);
    if (byText) return byText;

    const letter = lower.match(/^([a-f])[).\-:]?\s*$/);
    if (letter) {
        const byLabel = optionsList.find(o => o.label.toLowerCase() === letter[1]);
        if (byLabel) return byLabel;
    }

    const prefixed = optionsList.find(o => {
        const t = o.text.trim();
        return value === `${o.label}. ${t}` ||
            value === `${o.label}) ${t}` ||
            value === `${o.label} - ${t}` ||
            value === `${o.label}.${t}`;
    });
    if (prefixed) return prefixed;

    const byLooseText = optionsList.find(o => o.text.trim().toLowerCase() === lower);
    if (byLooseText) return byLooseText;

    // Valeur inconnue (copie ancienne sans options) : on l'affiche telle quelle.
    return { label: null, text: value };
}

export default function ReviewSession() {
    const { quizId } = useParams();
    usePageTitle(`Correction · ${quizId || ''}`);
    const [items, setItems] = useState([]);
    const [score, setScore] = useState(null);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [quizMeta, setQuizMeta] = useState(null);

    // Affichage de la correction
    const [onlyErrors, setOnlyErrors] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef(null);

    // Entraînement « Refaire mes erreurs »
    const [practiceOpen, setPracticeOpen] = useState(false);
    const [practiceAnswers, setPracticeAnswers] = useState({});
    const [practiceResult, setPracticeResult] = useState(null);
    const [practiceSubmitting, setPracticeSubmitting] = useState(false);
    const [practiceError, setPracticeError] = useState('');

    // Tuteur IA (drawer) · contexte de la question actuellement discutée
    const [aiOpen, setAiOpen] = useState(false);
    const [aiContext, setAiContext] = useState(null);
    const [aiStatus, setAiStatus] = useState(null);

    const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };
    const safeName = (user.name || 'Anonyme').trim();
    const userEmail = (user.email || '').trim().toLowerCase();

    useEffect(() => {
        const load = async () => {
            // Question publique en secours pour les anciennes copies (sans détail
            // dans `answers`), métadonnées et historique personnel.
            const [qData, rData, metaData] = await Promise.all([
                api(`/quizzes/${quizId}/questions`, { auth: 'student' }).catch(() => ({ questions: [] })),
                api(`/results/mine?quizId=${encodeURIComponent(quizId)}`, { auth: 'student' })
                    .catch(() => ({ results: [] })),
                api(`/quizzes/${encodeURIComponent(quizId)}`).catch(() => null)
            ]);

            setQuizMeta(metaData?.quiz || null);

            const fallbackQuestions = (qData.questions || []).map((data) => {
                const q = { ...data };
                ['Question', 'OptA', 'OptB', 'OptC', 'OptD'].forEach(k => {
                    if (q[k]) q[k] = q[k].trim();
                });
                return q;
            });

            const matching = rData.results.filter(r => {
                const rEmail = (r.email || '').toLowerCase();
                const rName = (r.name || '').trim();
                return (userEmail && rEmail === userEmail) || (safeName && rName === safeName);
            });

            if (matching.length === 0) {
                setItems([]);
                setLoading(false);
                return;
            }

            const sorted = matching.sort((a, b) => new Date(b.date) - new Date(a.date));
            const result = sorted[0];
            const rawAnswers = Array.isArray(result.answers) ? result.answers : [];

            const nextItems = rawAnswers.map((a, index) => {
                const isObject = a && typeof a === 'object';
                const fallback = fallbackQuestions[index] || {};
                const selected = isObject ? (a.selected || '') : (a || '');
                const correct = isObject ? (a.correct || fallback.ReponseCorrecte || '') : (fallback.ReponseCorrecte || '');
                const itemOptions = isObject && a.question ? (a.options || {}) : optionsOf(fallback);
                const itemOptionsList = optionsListOf(itemOptions);
                const selectedChoice = resolveChoice(selected, itemOptionsList);
                const correctChoice = resolveChoice(correct, itemOptionsList);

                // `isOk` est fourni par le serveur pour les copies récentes.
                // Pour les anciennes copies (lettres A/B/C/D), on compare les
                // textes résolus afin de retrouver la bonne case cochée.
                const isOk = isObject && typeof a.isOk === 'boolean'
                    ? a.isOk
                    : !!(selectedChoice && correctChoice &&
                        selectedChoice.text.trim() === correctChoice.text.trim());

                if (isObject && a.question) {
                    return {
                        questionId: a.questionId ?? index,
                        Question: a.question,
                        options: itemOptions,
                        selected,
                        correct,
                        isOk,
                        explication: a.explication || fallback.explication || '',
                        tags: a.tags || '',
                        difficulte: a.difficulte || 'moyenne'
                    };
                }

                return {
                    questionId: fallback.id ?? index,
                    Question: fallback.Question || `Question ${index + 1}`,
                    options: itemOptions,
                    selected,
                    correct,
                    isOk,
                    explication: fallback.explication || '',
                    tags: fallback.tags || '',
                    difficulte: fallback.difficulte || 'moyenne'
                };
            });

            setItems(nextItems);
            setScore(result.score);
            setTotal(result.total);
            setLoading(false);
        };
        load();
    }, [quizId, safeName, userEmail]);

    // Disponibilité de l'assistant : les boutons IA restent masqués tant que
    // les clés ne sont pas configurées côté serveur.
    useEffect(() => {
        let active = true;
        fetchAiStatus()
            .then((next) => { if (active) setAiStatus(next); })
            .catch(() => { /* assistant indisponible */ });
        return () => { active = false; };
    }, []);

    const wrongItems = useMemo(() => items.filter(item => !item.isOk), [items]);
    const visibleItems = useMemo(
        () => (onlyErrors ? items.filter(item => !item.isOk) : items),
        [items, onlyErrors]
    );

    const practiceById = useMemo(() => {
        const map = new Map();
        (practiceResult?.answers || []).forEach(a => map.set(Number(a.questionId), a));
        return map;
    }, [practiceResult]);

    // Le filtre « mes erreurs seulement » change la liste : on revient à la
    // première question visible au moment du clic (pas dans un effet).
    const showAllItems = () => {
        setOnlyErrors(false);
        setActiveIndex(0);
    };
    const showOnlyErrors = () => {
        setOnlyErrors(true);
        setActiveIndex(0);
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center gap-3 text-slate-400">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm">Chargement de la correction...</span>
            </div>
        </div>
    );

    if (!items.length || score === null) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center max-w-sm">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 border border-amber-600/30 text-amber-400 flex items-center justify-center mb-4">
                    <Icon name="search" size={22} />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Aucun résultat trouvé</h2>
                <p className="text-slate-400 text-sm">Connectez-vous avec le même nom exact utilisé lors du QCM.</p>
                <Link to="/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-bold text-sm">
                    <Icon name="arrow-left" size={14} />
                    Retour à mon espace
                </Link>
            </div>
        </div>
    );

    const note = (total && total > 0) ? ((score / total) * 20).toFixed(2) : '-';
    const aiAvailable = aiStatus?.available === true;
    const wrongCount = wrongItems.length;
    const successCount = items.length - wrongCount;

    const scrollToItem = (index) => {
        const clamped = Math.max(0, Math.min(visibleItems.length - 1, index));
        setActiveIndex(clamped);
        const target = document.getElementById(`review-q-${clamped}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Ouvre le tuteur IA sur une question précise (mauvaise réponse)
    const openTutorForQuestion = (item, i) => {
        const optionsList = optionsListOf(item.options);
        const selectedChoice = resolveChoice(item.selected, optionsList);
        const correctChoice = resolveChoice(item.correct, optionsList);

        setAiContext({
            key: `q${i}_${quizId}`,
            kind: 'question',
            quizId,
            questionId: item.questionId,
            question: item.Question,
            options: optionsList,
            // On transmet le texte exact de la case cochée : l'IA ne doit plus
            // répondre « aucune réponse » alors que l'étudiant a bien choisi.
            selected: selectedChoice?.text || '',
            correct: correctChoice?.text || item.correct || ''
        });
        setAiOpen(true);
    };

    // Ouvre le tuteur IA en mode conseils généraux sur ce QCM
    const openTutorGeneral = () => {
        setAiContext({ key: `general_${quizId}`, kind: 'general', quizId });
        setAiOpen(true);
    };

    const openPractice = () => {
        setPracticeAnswers({});
        setPracticeResult(null);
        setPracticeError('');
        setPracticeOpen(true);
    };

    const submitPractice = async () => {
        const answers = wrongItems
            .filter(item => practiceAnswers[item.questionId])
            .map(item => ({
                questionId: item.questionId,
                selected: practiceAnswers[item.questionId]
            }));

        if (answers.length === 0) {
            setPracticeError('Répondez au moins à une question avant de corriger.');
            return;
        }

        setPracticeSubmitting(true);
        setPracticeError('');
        try {
            const data = await api('/results/training', {
                method: 'POST',
                auth: 'student',
                body: {
                    quizId,
                    questionIds: wrongItems.map(item => item.questionId),
                    answers
                }
            });
            setPracticeResult(data);
            const byId = new Map((data.answers || []).map(a => [Number(a.questionId), a]));
            setPracticeAnswers(prev => {
                const next = { ...prev };
                byId.forEach((a, id) => {
                    next[id] = a.selected || next[id] || '';
                });
                return next;
            });
        } catch (err) {
            setPracticeError(err.message || "L'entraînement n'a pas pu être corrigé.");
        } finally {
            setPracticeSubmitting(false);
        }
    };

    const exportCorrectionPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        const title = quizMeta?.title || quizId;
        doc.setFontSize(14);
        doc.text(`Correction · ${title}`, 14, 14);
        doc.setFontSize(9);
        doc.text(
            `${safeName} · UE ${quizMeta?.ue || quizId} · Score ${score}/${total} · Note ${note}/20 · ` +
            `Généré le ${new Date().toLocaleString('fr-FR')}`,
            14,
            21
        );

        const rows = items.map((item, index) => {
            const optionsList = optionsListOf(item.options);
            const selectedChoice = resolveChoice(item.selected, optionsList);
            const correctChoice = resolveChoice(item.correct, optionsList);
            return [
                String(index + 1),
                String(item.Question || '').slice(0, 220),
                selectedChoice?.text || '—',
                correctChoice?.text || item.correct || '—',
                item.isOk ? 'Correct' : (selectedChoice ? 'Incorrect' : 'Sans réponse'),
                String(item.explication || '').slice(0, 260)
            ];
        });

        doc.autoTable({
            startY: 28,
            head: [['N°', 'Question', 'Votre réponse', 'Bonne réponse', 'Statut', 'Explication']],
            body: rows,
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 58, 138] },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 90 },
                2: { cellWidth: 50 },
                3: { cellWidth: 50 },
                4: { cellWidth: 22 },
                5: { cellWidth: 100 }
            }
        });

        doc.save(`Correction_${String(title).replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`);
    };

    return (
        <div className="min-h-screen bg-slate-950 py-10 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <Link to="/dashboard" className="text-blue-400 hover:text-blue-300 font-bold text-xs flex items-center gap-1.5 mb-2 transition">
                        <Icon name="arrow-left" size={14} />
                        Retour à mon espace
                    </Link>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={exportCorrectionPDF}
                            className="mb-2 inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs px-3.5 py-2 rounded-xl transition"
                        >
                            <Icon name="download" size={14} />
                            Télécharger en PDF
                        </button>
                        {aiAvailable && (
                            <button
                                onClick={openTutorGeneral}
                                className="mb-2 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-lg shadow-blue-600/25"
                            >
                                <Icon name="sparkles" size={14} />
                                Aide IA pour réviser
                            </button>
                        )}
                    </div>
                </div>

                {/* En-tête résumé */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-8 my-6 text-center shadow-lg shadow-blue-600/20">
                    <h1 className="text-2xl font-black mb-1">
                        Correction · {quizMeta?.title || quizId}
                    </h1>
                    {(quizMeta?.ue || quizMeta?.ueLabel) && (
                        <p className="text-sm font-semibold opacity-90">
                            UE {quizMeta?.ue || quizId}
                            {quizMeta?.ueLabel && quizMeta.ueLabel !== (quizMeta.ue || quizId)
                                ? ` · ${quizMeta.ueLabel}`
                                : ''}
                            {quizMeta?.semestre ? ` · Semestre ${quizMeta.semestre}` : ''}
                        </p>
                    )}
                    <p className="opacity-80 mb-6 text-sm">{safeName}</p>
                    <div className="flex justify-center gap-8 flex-wrap">
                        <div className="bg-white/10 p-4 rounded-xl min-w-24">
                            <div className="text-4xl font-black">{score}/{total}</div>
                            <div className="text-xs font-bold opacity-75 mt-2 uppercase tracking-wider">Score</div>
                        </div>
                        <div className="bg-white/10 p-4 rounded-xl min-w-24">
                            <div className="text-4xl font-black">{note}/20</div>
                            <div className="text-xs font-bold opacity-75 mt-2 uppercase tracking-wider">Note</div>
                        </div>
                        <div className="bg-white/10 p-4 rounded-xl min-w-24">
                            <div className="text-4xl font-black">{wrongCount}</div>
                            <div className="text-xs font-bold opacity-75 mt-2 uppercase tracking-wider">Erreur(s)</div>
                        </div>
                    </div>
                </div>

                {/* Bandeau tuteur IA si des erreurs existent */}
                {wrongCount > 0 && aiAvailable && (
                    <div className="bg-blue-950/50 border border-blue-800 rounded-2xl p-4 mb-5 flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-600/40 text-blue-300 flex items-center justify-center shrink-0">
                                <Icon name="lightbulb" size={17} />
                            </span>
                            <p className="text-xs text-blue-200 leading-relaxed">
                                Vous avez <strong className="text-white">{wrongCount}</strong> mauvaise(s) réponse(s).
                                Discutez-en avec le tuteur IA pour comprendre vos erreurs.
                            </p>
                        </div>
                        <button
                            onClick={openTutorGeneral}
                            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition"
                        >
                            <Icon name="chat" size={14} />
                            Discuter avec le tuteur
                        </button>
                    </div>
                )}

                {/* Barre d'outils de navigation dans la correction */}
                <div className="sticky top-2 z-20 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-2xl px-3 py-2.5 mb-5 flex items-center justify-between gap-2 flex-wrap shadow-lg shadow-black/30">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            onClick={showAllItems}
                            className={`text-[11px] font-black px-3 py-1.5 rounded-xl border transition ${
                                !onlyErrors
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                            Toutes ({items.length})
                        </button>
                        <button
                            onClick={showOnlyErrors}
                            className={`text-[11px] font-black px-3 py-1.5 rounded-xl border transition ${
                                onlyErrors
                                    ? 'bg-red-600 border-red-500 text-white'
                                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                            Mes erreurs ({wrongCount})
                        </button>
                        {wrongCount > 0 && (
                            <button
                                onClick={openPractice}
                                className="text-[11px] font-black px-3 py-1.5 rounded-xl border border-amber-600/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition inline-flex items-center gap-1"
                            >
                                <Icon name="refresh" size={12} />
                                Refaire mes erreurs
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => scrollToItem(activeIndex - 1)}
                            disabled={activeIndex <= 0}
                            aria-label="Question précédente"
                            className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center transition"
                        >
                            <Icon name="arrow-left" size={14} />
                        </button>
                        <span className="text-[11px] font-bold text-slate-400 min-w-14 text-center">
                            {visibleItems.length ? activeIndex + 1 : 0}/{visibleItems.length}
                        </span>
                        <button
                            onClick={() => scrollToItem(activeIndex + 1)}
                            disabled={activeIndex >= visibleItems.length - 1}
                            aria-label="Question suivante"
                            className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center transition"
                        >
                            <Icon name="arrow-right" size={14} />
                        </button>
                    </div>
                </div>

                {/* Questions */}
                <div className="space-y-5" ref={listRef}>
                    {visibleItems.length === 0 ? (
                        <div className="text-center py-12 bg-slate-900 rounded-2xl border border-dashed border-slate-700">
                            <p className="text-2xl mb-2">🎉</p>
                            <p className="text-sm font-black text-emerald-300">Aucune erreur à afficher</p>
                            <p className="text-xs text-slate-500 mt-1">Vous avez réussi toutes les questions de ce test.</p>
                        </div>
                    ) : visibleItems.map((item, i) => {
                        const choiceOptions = optionsListOf(item.options);
                        const selectedChoice = resolveChoice(item.selected, choiceOptions);
                        const correctChoice = resolveChoice(item.correct, choiceOptions);
                        const notAnswered = !selectedChoice;

                        // Ordre des options identique au quiz (même seed)
                        const validOptions = ['OptA', 'OptB', 'OptC', 'OptD']
                            .map(k => item.options?.[k]).filter(v => typeof v === 'string' && v.trim() !== '');
                        const shuffledOptions = seededShuffle(validOptions, safeName + '_' + i);

                        return (
                            <div
                                key={item.questionId ?? i}
                                id={`review-q-${i}`}
                                className={`bg-slate-900 rounded-2xl border border-slate-800 border-l-4 overflow-hidden scroll-mt-24 ${item.isOk ? 'border-l-emerald-500' : notAnswered ? 'border-l-slate-600' : 'border-l-red-500'}`}
                            >
                                {/* En-tête question */}
                                <div className="flex items-center justify-between px-6 pt-5 pb-3 gap-2 flex-wrap">
                                    <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${item.isOk ? 'bg-emerald-500/15 text-emerald-300' : notAnswered ? 'bg-slate-800 text-slate-400' : 'bg-red-500/15 text-red-300'}`}>
                                        {item.isOk ? 'Correct' : notAnswered ? 'Sans réponse' : 'Incorrect'} · Q{i + 1}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        {item.tags && String(item.tags).split(/[;,]/).filter(Boolean).map(tag => (
                                            <span key={tag} className="text-[10px] font-bold text-blue-300 bg-blue-600/15 border border-blue-600/30 px-2 py-0.5 rounded-full">
                                                {tag.trim()}
                                            </span>
                                        ))}
                                        <span className={`font-extrabold text-sm ${item.isOk ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {item.isOk ? '+1 pt' : '0 pt'}
                                        </span>
                                    </div>
                                </div>

                                <div className="px-6 pb-6">
                                    <h3 className="font-bold text-slate-100 mb-3 leading-relaxed">{item.Question}</h3>

                                    {notAnswered && (
                                        <p className="mb-3 inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5">
                                            <Icon name="info" size={12} />
                                            Vous n'avez coché aucune case pour cette question.
                                        </p>
                                    )}

                                    <div className="flex flex-col gap-2">
                                        {shuffledOptions.map(val => {
                                            const cleanVal = val.trim();
                                            const isCorrectOpt = correctChoice ? cleanVal === correctChoice.text.trim() : false;
                                            const isGivenOpt = selectedChoice ? cleanVal === selectedChoice.text.trim() : false;

                                            let cls = 'p-4 rounded-xl text-sm border transition font-medium ';
                                            let label = null;

                                            if (item.isOk && isGivenOpt) {
                                                cls += 'bg-emerald-950/50 border-emerald-600 text-emerald-200 font-bold';
                                                label = <span className="ml-2 text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-bold">Votre réponse</span>;
                                            } else if (!item.isOk && isGivenOpt) {
                                                cls += 'bg-red-950/50 border-red-600 text-red-200 font-bold';
                                                label = <span className="ml-2 text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">Votre réponse</span>;
                                            } else if (!item.isOk && isCorrectOpt) {
                                                cls += 'bg-emerald-950/50 border-emerald-600 text-emerald-200 font-bold';
                                                label = <span className="ml-2 text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-bold">Bonne réponse</span>;
                                            } else {
                                                cls += 'bg-slate-950 border-slate-800 text-slate-500';
                                            }

                                            return (
                                                <div key={val} className={cls}>
                                                    <div className="flex items-center flex-wrap gap-1">
                                                        <span>{val}</span>
                                                        {label}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {selectedChoice && !shuffledOptions.some(v => v.trim() === selectedChoice.text.trim()) && (
                                        <p className="mt-3 text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
                                            Votre réponse enregistrée : <strong className="text-white">{selectedChoice.text}</strong>
                                        </p>
                                    )}
                                    {correctChoice && !shuffledOptions.some(v => v.trim() === correctChoice.text.trim()) && (
                                        <p className="mt-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded-lg px-3 py-2">
                                            Bonne réponse : <strong className="text-white">{correctChoice.text}</strong>
                                        </p>
                                    )}

                                    {item.explication && (
                                        <div className="mt-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl px-3.5 py-3">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-300 mb-1 flex items-center gap-1.5">
                                                <Icon name="lightbulb" size={12} />
                                                Explication
                                            </p>
                                            <p className="text-xs text-slate-200 leading-relaxed">{item.explication}</p>
                                        </div>
                                    )}

                                    {/* Aide IA sur cette question (uniquement si erreur) */}
                                    {!item.isOk && aiAvailable && (
                                        <button
                                            onClick={() => openTutorForQuestion(item, i)}
                                            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-blue-300 hover:text-white bg-blue-950/60 hover:bg-blue-900 border border-blue-800 hover:border-blue-700 px-3.5 py-2 rounded-xl transition"
                                        >
                                            <Icon name="sparkles" size={14} />
                                            Comprendre cette erreur avec l'IA
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Bandeau de fin : IA de révision suggérée en fin de sujet */}
                <div className="mt-6 bg-gradient-to-r from-indigo-950/70 to-blue-950/60 border border-indigo-700/40 rounded-2xl p-5">
                    <div className="flex items-start gap-3">
                        <span className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
                            <Icon name="sparkles" size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-black text-white">
                                {successCount === items.length ? 'Sujet terminé — bravo !' : 'Besoin de réviser ?'}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                {aiAvailable
                                    ? "Posez jusqu'à 5 questions par jour à l'aide à la révision, toutes matières confondues : notions, exemples, exercices corrigés, ou compréhension de vos erreurs."
                                    : "Refaites vos erreurs pour les ancrer, puis relisez les explications de chaque question."}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {wrongCount > 0 && (
                                    <button
                                        onClick={openPractice}
                                        className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-bold text-xs px-3.5 py-2 rounded-xl transition"
                                    >
                                        <Icon name="refresh" size={14} />
                                        Refaire mes erreurs
                                    </button>
                                )}
                                {aiAvailable && (
                                    <button
                                        onClick={openTutorGeneral}
                                        className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition"
                                    >
                                        <Icon name="chat" size={14} />
                                        Aide à la révision
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Drawer Tuteur IA · remonté (discussion vierge) à chaque nouveau contexte */}
            {aiContext && (
              <AiTutor
                key={aiContext.key || 'none'}
                open={aiOpen}
                onClose={() => setAiOpen(false)}
                context={aiContext}
                status={aiStatus}
              />
            )}

            {/* Modale « Refaire mes erreurs » */}
            {practiceOpen && (
                <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm overflow-y-auto p-4">
                    <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/50 my-6">
                        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 sticky top-0 bg-slate-900 rounded-t-2xl z-10">
                            <div>
                                <h3 className="text-sm font-black text-white flex items-center gap-2">
                                    <Icon name="refresh" size={15} className="text-amber-400" />
                                    Refaire mes erreurs
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Entraînement non noté · {wrongItems.length} question(s)
                                </p>
                            </div>
                            <button
                                onClick={() => setPracticeOpen(false)}
                                aria-label="Fermer l'entraînement"
                                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition"
                            >
                                <Icon name="close" size={16} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {practiceResult && (
                                <div className={`rounded-xl border p-4 ${
                                    practiceResult.score === practiceResult.total
                                        ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
                                        : 'bg-amber-950/40 border-amber-700/60 text-amber-200'
                                }`}>
                                    <p className="text-sm font-black text-white">
                                        Entraînement corrigé : {practiceResult.score}/{practiceResult.total}
                                        {' · '}{Number(practiceResult.note).toFixed(2)}/20
                                    </p>
                                    <p className="text-[11px] mt-0.5 opacity-80">
                                        Aucune copie enregistrée : cet entraînement ne modifie ni votre note ni le classement.
                                    </p>
                                </div>
                            )}

                            {practiceError && (
                                <div className="bg-red-950/50 border border-red-800 text-red-200 text-xs rounded-xl p-3">
                                    {practiceError}
                                </div>
                            )}

                            {wrongItems.map((item, index) => {
                                const corrected = practiceById.get(Number(item.questionId));
                                const optionsList = optionsListOf(item.options);
                                const options = seededShuffle(optionsList, safeName + '_practice_' + item.questionId);
                                const selectedText = practiceAnswers[item.questionId] || '';

                                return (
                                    <div key={item.questionId ?? index} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                                        <p className="text-xs font-bold text-slate-200 leading-relaxed">
                                            <span className="text-slate-500 mr-1.5">Q{index + 1}.</span>
                                            {item.Question}
                                        </p>
                                        <div className="mt-3 space-y-2">
                                            {options.map(option => {
                                                const isSelected = selectedText === option.text;
                                                let cls = 'w-full text-left p-3 rounded-xl border text-xs transition ';
                                                if (corrected) {
                                                    if (option.text === corrected.correct) {
                                                        cls += 'bg-emerald-950/50 border-emerald-600 text-emerald-200 font-bold';
                                                    } else if (isSelected) {
                                                        cls += 'bg-red-950/50 border-red-600 text-red-200 font-bold';
                                                    } else {
                                                        cls += 'bg-slate-900 border-slate-800 text-slate-500';
                                                    }
                                                } else if (isSelected) {
                                                    cls += 'bg-blue-950/60 border-blue-600 text-blue-100 font-bold';
                                                } else {
                                                    cls += 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600';
                                                }
                                                return (
                                                    <button
                                                        key={option.label}
                                                        type="button"
                                                        disabled={!!corrected}
                                                        onClick={() => setPracticeAnswers(prev => ({
                                                            ...prev,
                                                            [item.questionId]: option.text
                                                        }))}
                                                        className={cls}
                                                    >
                                                        <span className="font-black mr-1.5">{option.label}.</span>
                                                        {option.text}
                                                        {corrected && option.text === corrected.correct && (
                                                            <span className="ml-2 text-[10px] font-black uppercase">Bonne réponse</span>
                                                        )}
                                                        {corrected && isSelected && option.text !== corrected.correct && (
                                                            <span className="ml-2 text-[10px] font-black uppercase">Votre réponse</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {corrected?.explication && (
                                            <div className="mt-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl px-3 py-2">
                                                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-300 mb-0.5">Explication</p>
                                                <p className="text-[11px] text-slate-300 leading-relaxed">{corrected.explication}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap sticky bottom-0 bg-slate-900 rounded-b-2xl">
                            <p className="text-[11px] text-slate-500">
                                {Object.keys(practiceAnswers).length}/{wrongItems.length} question(s) répondue(s)
                            </p>
                            <div className="flex gap-2">
                                <button onClick={() => setPracticeOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-bold text-xs hover:bg-slate-800 transition">
                                    Fermer
                                </button>
                                <button
                                    onClick={submitPractice}
                                    disabled={practiceSubmitting}
                                    className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition"
                                >
                                    <Icon name="check" size={13} strokeWidth={3} />
                                    {practiceSubmitting ? 'Correction…' : practiceResult ? 'Corriger à nouveau' : 'Corriger mon entraînement'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
