import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
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

export default function ReviewSession() {
    const { quizId } = useParams();
    usePageTitle(`Correction · ${quizId || ''}`);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState([]); // { selected, correct, isOk }[]
    const [score, setScore] = useState(null);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [quizMeta, setQuizMeta] = useState(null);

    // Tuteur IA (drawer) · contexte de la question actuellement discutée
    const [aiOpen, setAiOpen] = useState(false);
    const [aiContext, setAiContext] = useState(null);
    const [aiStatus, setAiStatus] = useState(null);

    const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };
    const safeName = (user.name || 'Anonyme').trim();
    const userEmail = (user.email || '').trim().toLowerCase();

    useEffect(() => {
        const load = async () => {
            // Questions du QCM + mes résultats pour cette UE (identité via jeton serveur)
            const [qData, rData, metaData] = await Promise.all([
                api(`/quizzes/${quizId}/questions`),
                api(`/results/mine?ue=${encodeURIComponent(quizId)}`, { auth: 'student' })
                    .catch(() => ({ results: [] })),
                api(`/quizzes/${encodeURIComponent(quizId)}`).catch(() => null)
            ]);

            setQuizMeta(metaData?.quiz || null);

            const raw = qData.questions.map((data) => {
                const q = { ...data };
                // Normaliser ReponseCorrecte (lettre → texte) identique à QuizSession
                const rc = (q.ReponseCorrecte || '').trim().toUpperCase();
                if (['A', 'B', 'C', 'D'].includes(rc)) {
                    q.ReponseCorrecte = (q['Opt' + rc] || rc).trim();
                } else {
                    q.ReponseCorrecte = (q.ReponseCorrecte || '').trim();
                }
                ['Question', 'OptA', 'OptB', 'OptC', 'OptD'].forEach(k => {
                    if (q[k]) q[k] = q[k].trim();
                });
                return q;
            });
            const qs = seededShuffle(raw, safeName);

            const matching = rData.results.filter(r => {
                const rEmail = (r.email || '').toLowerCase();
                const rName = (r.name || '').trim();
                return (userEmail && rEmail === userEmail) || (safeName && rName === safeName);
            });

            if (matching.length > 0) {
                const sorted = matching.sort((a, b) => new Date(b.date) - new Date(a.date));
                const result = sorted[0];
                setAnswers(result.answers || []);
                setScore(result.score);
                setTotal(result.total);
                setQuestions(qs);
            } else {
                setQuestions(qs);
            }
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

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center gap-3 text-slate-400">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm">Chargement de la correction...</span>
            </div>
        </div>
    );

    if (!questions.length || score === null) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center max-w-sm">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-600/30 text-indigo-400 flex items-center justify-center mb-4">
                    <Icon name="search" size={22} />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Aucun resultat trouve</h2>
                <p className="text-slate-400 text-sm">Connectez-vous avec le meme nom exact utilise lors du QCM.</p>
                <Link to="/schedule" className="mt-4 inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-bold text-sm">
                    <Icon name="arrow-left" size={14} />
                    Retour a l'emploi du temps
                </Link>
            </div>
        </div>
    );

    const note = (total && total > 0) ? ((score / total) * 20).toFixed(2) : '-';
    const aiAvailable = aiStatus?.available === true;

    // Ouvre le tuteur IA sur une question précise (mauvaise réponse)
    const openTutorForQuestion = (q, i) => {
        const optionsList = ['A', 'B', 'C', 'D']
            .map(l => ({ label: l, text: q['Opt' + l] }))
            .filter(o => typeof o.text === 'string' && o.text.trim() !== '');
        const ans = answers[i];
        const isNewFormat = ans && typeof ans === 'object';
        const givenText = isNewFormat ? (ans.selected || '') : (ans || '');
        const correctText = isNewFormat ? (ans.correct || q.ReponseCorrecte || '') : (q.ReponseCorrecte || '');
        const selectedLabel = optionsList.find(o => o.text.trim() === givenText.trim())?.label || null;
        const correctLabel = optionsList.find(o => o.text.trim() === correctText.trim())?.label || null;

        setAiContext({
            key: `q${i}_${quizId}`,
            kind: 'question',
            quizId,
            questionId: q.id,
            question: q.Question,
            options: optionsList,
            selected: selectedLabel,
            correct: correctLabel
        });
        setAiOpen(true);
    };

    // Ouvre le tuteur IA en mode conseils généraux sur ce QCM
    const openTutorGeneral = () => {
        setAiContext({ key: `general_${quizId}`, kind: 'general', quizId });
        setAiOpen(true);
    };

    const wrongCount = questions.reduce((acc, _q, i) => {
        const ans = answers[i];
        const isNewFormat = ans && typeof ans === 'object';
        const givenText = isNewFormat ? (ans.selected || '') : (ans || '');
        const correctText = isNewFormat ? (ans.correct || _q.ReponseCorrecte || '') : (_q.ReponseCorrecte || '');
        const isOk = isNewFormat ? ans.isOk : (givenText.trim() !== '' && givenText.trim() === correctText.trim());
        return isOk ? acc : acc + 1;
    }, 0);

    return (
        <div className="min-h-screen bg-slate-950 py-10 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <Link to="/dashboard" className="text-blue-400 hover:text-blue-300 font-bold text-xs flex items-center gap-1.5 mb-2 transition">
                        <Icon name="arrow-left" size={14} />
                        Retour à mon espace
                    </Link>
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

                {/* En-tête résumé */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-8 my-6 text-center shadow-lg shadow-blue-600/20">
                    <h1 className="text-2xl font-black mb-1">Correction · {quizId}</h1>
                    {quizMeta?.ueLabel && quizMeta.ueLabel !== quizId && (
                        <p className="text-sm font-semibold opacity-90">{quizMeta.ueLabel}</p>
                    )}
                    <p className="opacity-80 mb-6 text-sm">{safeName}</p>
                    <div className="flex justify-center gap-8">
                        <div className="bg-white/10 p-4 rounded-xl min-w-24">
                            <div className="text-4xl font-black">{score}/{total}</div>
                            <div className="text-xs font-bold opacity-75 mt-2 uppercase tracking-wider">Score</div>
                        </div>
                        <div className="bg-white/10 p-4 rounded-xl min-w-24">
                            <div className="text-4xl font-black">{note}/20</div>
                            <div className="text-xs font-bold opacity-75 mt-2 uppercase tracking-wider">Note</div>
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

                {/* Questions */}
                <div className="space-y-5">
                    {questions.map((q, i) => {
                        const ans = answers[i];
                        // Support de l'ancienne structure (string) et nouvelle structure ({selected, correct, isOk})
                        const isNewFormat = ans && typeof ans === 'object';
                        const givenText = isNewFormat ? (ans.selected || '') : (ans || '');
                        const correctText = isNewFormat ? (ans.correct || q.ReponseCorrecte || '') : (q.ReponseCorrecte || '');
                        const isOk = isNewFormat ? ans.isOk : (givenText.trim() !== '' && givenText.trim() === correctText.trim());
                        const notAnswered = !givenText.trim();

                        // Ordre des options identique au quiz (même seed)
                        const validOptions = ['OptA', 'OptB', 'OptC', 'OptD']
                            .map(k => q[k]).filter(v => typeof v === 'string' && v.trim() !== '');
                        const shuffledOptions = seededShuffle(validOptions, safeName + '_' + i);

                        return (
                            <div key={i} className={`bg-slate-900 rounded-2xl border border-slate-800 border-l-4 overflow-hidden ${isOk ? 'border-l-emerald-500' : notAnswered ? 'border-l-slate-600' : 'border-l-red-500'}`}>
                                {/* En-tête question */}
                                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                                    <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${isOk ? 'bg-emerald-500/15 text-emerald-300' : notAnswered ? 'bg-slate-800 text-slate-400' : 'bg-red-500/15 text-red-300'}`}>
                                        {isOk ? 'Correct' : notAnswered ? 'Sans reponse' : 'Incorrect'} · Q{i + 1}
                                    </span>
                                    <span className={`font-extrabold text-sm ${isOk ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isOk ? '+1 pt' : '0 pt'}
                                    </span>
                                </div>

                                <div className="px-6 pb-6">
                                    <h3 className="font-bold text-slate-100 mb-5 leading-relaxed">{q.Question}</h3>

                                    <div className="flex flex-col gap-2">
                                        {shuffledOptions.map(val => {
                                            const cleanVal = val.trim();
                                            const isCorrectOpt = cleanVal === correctText.trim();
                                            const isGivenOpt = cleanVal === givenText.trim();

                                            let cls = 'p-4 rounded-xl text-sm border transition font-medium ';
                                            let label = null;

                                            if (isOk && isGivenOpt) {
                                                cls += 'bg-emerald-950/50 border-emerald-600 text-emerald-200 font-bold';
                                                label = <span className="ml-2 text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-bold">Votre reponse</span>;
                                            } else if (!isOk && isGivenOpt) {
                                                cls += 'bg-red-950/50 border-red-600 text-red-200 font-bold';
                                                label = <span className="ml-2 text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">Votre reponse</span>;
                                            } else if (!isOk && isCorrectOpt) {
                                                cls += 'bg-emerald-950/50 border-emerald-600 text-emerald-200 font-bold';
                                                label = <span className="ml-2 text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded-full font-bold">Bonne reponse</span>;
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

                                    {/* Aide IA sur cette question (uniquement si erreur) */}
                                    {!isOk && aiAvailable && (
                                        <button
                                            onClick={() => openTutorForQuestion(q, i)}
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
        </div>
    );
}
