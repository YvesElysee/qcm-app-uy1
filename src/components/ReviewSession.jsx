import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

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
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState([]); // { selected, correct, isOk }[]
    const [score, setScore] = useState(null);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);

    const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };
    const safeName = (user.name || 'Anonyme').trim();

    useEffect(() => {
        const load = async () => {
            const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
            const raw = qSnap.docs.map(d => {
                const data = d.data();
                // Normaliser ReponseCorrecte (lettre → texte) identique à QuizSession
                const rc = (data.ReponseCorrecte || '').trim().toUpperCase();
                if (['A', 'B', 'C', 'D'].includes(rc)) {
                    data.ReponseCorrecte = (data['Opt' + rc] || rc).trim();
                } else {
                    data.ReponseCorrecte = (data.ReponseCorrecte || '').trim();
                }
                ['Question', 'OptA', 'OptB', 'OptC', 'OptD'].forEach(k => {
                    if (data[k]) data[k] = data[k].trim();
                });
                return data;
            });
            const qs = seededShuffle(raw, safeName);

            const rSnap = await getDocs(query(
                collection(db, "results"),
                where("ue", "==", quizId),
                where("name", "==", safeName)
            ));

            if (!rSnap.empty) {
                const sorted = rSnap.docs.map(d => d.data()).sort((a, b) => new Date(b.date) - new Date(a.date));
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
    }, [quizId, safeName]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-gray-400 text-lg">Chargement de la correction...</div>
        </div>
    );

    if (!questions.length || score === null) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-xl shadow text-center max-w-sm border">
                <h2 className="text-xl font-bold text-gray-700 mb-2">Aucun resultat trouve</h2>
                <p className="text-gray-500 text-sm">Connectez-vous avec le meme nom exact utilise lors du QCM.</p>
                <Link to="/schedule" className="mt-4 inline-block text-blue-600 font-bold hover:underline">Retour a l'emploi du temps</Link>
            </div>
        </div>
    );

    const note = (total && total > 0) ? ((score / total) * 20).toFixed(2) : '—';

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-3xl mx-auto">
                <Link to="/schedule" className="text-blue-600 font-bold hover:underline text-sm">Retour a l'emploi du temps</Link>

                {/* En-tête résumé */}
                <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl p-8 my-6 text-center shadow-lg">
                    <h1 className="text-2xl font-black mb-1">Correction — {quizId}</h1>
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
                            <div key={i} className={`bg-white rounded-xl shadow-sm border-l-4 overflow-hidden ${isOk ? 'border-green-500' : notAnswered ? 'border-gray-300' : 'border-red-500'}`}>
                                {/* En-tête question */}
                                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                                    <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${isOk ? 'bg-green-100 text-green-700' : notAnswered ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'}`}>
                                        {isOk ? 'Correct' : notAnswered ? 'Sans reponse' : 'Incorrect'} — Q{i + 1}
                                    </span>
                                    <span className={`font-extrabold text-sm ${isOk ? 'text-green-600' : 'text-red-600'}`}>
                                        {isOk ? '+1 pt' : '0 pt'}
                                    </span>
                                </div>

                                <div className="px-6 pb-6">
                                    <h3 className="font-bold text-gray-800 mb-5 leading-relaxed">{q.Question}</h3>

                                    <div className="flex flex-col gap-2">
                                        {shuffledOptions.map(val => {
                                            const cleanVal = val.trim();
                                            const isCorrectOpt = cleanVal === correctText.trim();
                                            const isGivenOpt = cleanVal === givenText.trim();

                                            let cls = 'p-4 rounded-xl text-sm border-2 transition font-medium ';
                                            let label = null;

                                            if (isOk && isGivenOpt) {
                                                cls += 'bg-green-50 border-green-500 text-green-900 font-bold';
                                                label = <span className="ml-2 text-xs bg-green-600 text-white px-1.5 py-0.5 rounded-full font-bold">Votre reponse</span>;
                                            } else if (!isOk && isGivenOpt) {
                                                cls += 'bg-red-50 border-red-400 text-red-900 font-bold';
                                                label = <span className="ml-2 text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold">Votre reponse</span>;
                                            } else if (!isOk && isCorrectOpt) {
                                                cls += 'bg-green-50 border-green-500 text-green-900 font-bold';
                                                label = <span className="ml-2 text-xs bg-green-600 text-white px-1.5 py-0.5 rounded-full font-bold">Bonne reponse</span>;
                                            } else {
                                                cls += 'bg-gray-50 border-gray-100 text-gray-400';
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
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
