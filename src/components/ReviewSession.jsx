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
    const [answers, setAnswers] = useState([]);
    const [score, setScore] = useState(null);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };
    const safeName = user.name ? user.name.trim() : 'Anonyme';

    useEffect(() => {
        const load = async () => {
            // 1. Charger les questions dans le MÊME ordre aléatoire que pendant le QCM
            const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
            const raw = qSnap.docs.map(d => d.data());
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

    if (questions.length === 0 || score === null) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-xl shadow text-center max-w-sm border border-gray-200">
                <h2 className="text-xl font-bold mt-4 text-gray-700">Aucun resultat trouve</h2>
                <p className="text-gray-500 mt-2 text-sm">Vous n'avez pas passe ce QCM ou vous n'etes pas connecte avec le meme nom exact.</p>
                <Link to="/schedule" className="mt-4 inline-block text-blue-600 font-bold hover:underline">Retour a l'emploi du temps</Link>
            </div>
        </div>
    );

    const note = (total && total > 0) ? ((score / total) * 20).toFixed(2) : '—';

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-3xl mx-auto">
                <Link to="/schedule" className="text-blue-600 font-bold hover:underline text-sm">Retour a l'emploi du temps</Link>

                {/* Recap card */}
                <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl p-8 my-6 text-center shadow-lg">
                    <h1 className="text-2xl font-black mb-1">Correction — {quizId}</h1>
                    <p className="opacity-80 mb-6 text-sm">{safeName}</p>
                    <div className="flex justify-center gap-8">
                        <div className="bg-white/10 p-4 rounded-xl">
                            <div className="text-4xl font-black">{score}/{total}</div>
                            <div className="text-xs font-bold opacity-75 mt-2 uppercase tracking-wider">Score</div>
                        </div>
                        <div className="bg-white/10 p-4 rounded-xl">
                            <div className="text-4xl font-black">{note}/20</div>
                            <div className="text-xs font-bold opacity-75 mt-2 uppercase tracking-wider">Note</div>
                        </div>
                    </div>
                </div>

                {/* Questions */}
                <div className="space-y-4">
                    {questions.map((q, i) => {
                        const given = answers[i] !== undefined ? answers[i] : null;
                        // Nettoyage (.trim()) complet des chaines pour la comparaison
                        const correct = q.ReponseCorrecte ? q.ReponseCorrecte.trim() : "";
                        const cleanGiven = given ? given.trim() : "";

                        const isOk = cleanGiven && cleanGiven === correct;
                        const notAnswered = !cleanGiven;

                        // Recréer le même ordre d'options que pendant l'épreuve !
                        const validOptions = ['OptA', 'OptB', 'OptC', 'OptD'].map(k => q[k]).filter(v => typeof v === 'string' && v.trim() !== '');
                        const shuffledOptions = seededShuffle(validOptions, safeName + "_" + i);

                        return (
                            <div key={i} className={`bg-white rounded-xl shadow-sm border-l-4 p-6 ${isOk ? 'border-green-500' : notAnswered ? 'border-gray-300' : 'border-red-500'}`}>
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <span className="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1 rounded-full shrink-0">Question {i + 1}</span>
                                    {notAnswered && <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Sans reponse</span>}
                                </div>
                                <h3 className="font-bold text-gray-800 mb-6 leading-relaxed">{q.Question}</h3>

                                <div className="flex flex-col gap-2">
                                    {shuffledOptions.map(val => {
                                        const cleanVal = val.trim();
                                        const isCorrectChoice = cleanVal === correct;
                                        const isGivenWrong = cleanVal === cleanGiven && !isOk;
                                        const isGivenCorrect = cleanVal === cleanGiven && isOk;

                                        let cls = 'p-4 rounded-xl text-sm border-2 transition '

                                        if (isGivenCorrect) {
                                            cls += 'bg-green-50 border-green-500 text-green-900 font-bold';
                                        } else if (isGivenWrong) {
                                            cls += 'bg-red-50 border-red-400 text-red-800 font-bold';
                                        } else if (isCorrectChoice) {
                                            cls += 'bg-green-50 border-green-500 text-green-800 font-bold';
                                        } else {
                                            cls += 'bg-gray-50 border-gray-100 text-gray-500 font-medium';
                                        }

                                        return (
                                            <div key={val} className={cls}>
                                                {val}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
