import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default function ReviewSession() {
    const { quizId } = useParams();
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState([]);
    const [score, setScore] = useState(null);
    const [total, setTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };

    useEffect(() => {
        const load = async () => {
            const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
            const qs = qSnap.docs.map(d => d.data());

            const rSnap = await getDocs(query(
                collection(db, "results"),
                where("ue", "==", quizId),
                where("name", "==", user.name)
            ));

            if (!rSnap.empty) {
                // Prendre le résultat le plus récent
                const sorted = rSnap.docs.map(d => d.data()).sort((a, b) => new Date(b.date) - new Date(a.date));
                const result = sorted[0];
                setAnswers(result.answers || []);
                setScore(result.score);
                setTotal(result.total);
                // Réordonner les questions dans le même ordre que lors du quiz
                // (les réponses sont indexées)
                setQuestions(qs);
            } else {
                setQuestions(qs);
            }
            setLoading(false);
        };
        load();
    }, [quizId]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-gray-400 text-lg">Chargement de la correction...</div>
        </div>
    );

    if (questions.length === 0) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-xl shadow text-center max-w-sm">
                <h2 className="text-xl font-bold mt-4 text-gray-700">Aucun resultat trouve</h2>
                <p className="text-gray-500 mt-2">Vous n'avez pas passe ce QCM ou n'etes pas connecte avec le meme nom.</p>
                <Link to="/schedule" className="mt-4 inline-block text-blue-600 hover:underline">Retour a l'emploi du temps</Link>
            </div>
        </div>
    );

    const note = (total && total > 0) ? ((score / total) * 20).toFixed(2) : '—';
    const correctCount = answers.filter((ans, i) => ans === questions[i]?.ReponseCorrecte).length;

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-3xl mx-auto">
                <Link to="/schedule" className="text-blue-600 hover:underline text-sm">&larr; Retour a l'emploi du temps</Link>

                {/* Recap card */}
                <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl p-8 my-6 text-center">
                    <h1 className="text-2xl font-black mb-1">Correction — {quizId}</h1>
                    <p className="opacity-80 mb-4 text-sm">{user.name}</p>
                    {score !== null ? (
                        <div className="flex justify-center gap-8">
                            <div>
                                <div className="text-4xl font-black">{score}/{total}</div>
                                <div className="text-sm opacity-75 mt-1">Score</div>
                            </div>
                            <div>
                                <div className="text-4xl font-black">{note}/20</div>
                                <div className="text-sm opacity-75 mt-1">Note</div>
                            </div>
                        </div>
                    ) : (
                        <p className="opacity-75">Resultats non disponibles — connectez-vous avec votre nom de depart</p>
                    )}
                </div>

                {/* Questions */}
                <div className="space-y-4">
                    {questions.map((q, i) => {
                        const given = answers[i] !== undefined ? answers[i] : null;
                        const correct = q.ReponseCorrecte;
                        const isOk = given === correct;
                        const notAnswered = given === null || given === undefined;

                        return (
                            <div key={i} className={`bg-white rounded-xl shadow-sm border-l-4 p-6 ${isOk ? 'border-green-500' : notAnswered ? 'border-gray-300' : 'border-red-400'}`}>
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-full shrink-0">Q{i + 1}</span>
                                    {notAnswered && <span className="text-gray-400 text-sm font-medium">Sans reponse</span>}
                                </div>
                                <h3 className="font-bold text-gray-800 mb-4 leading-relaxed">{q.Question}</h3>
                                <div className="flex flex-col gap-2">
                                    {['OptA', 'OptB', 'OptC', 'OptD'].map(opt => {
                                        if (!q[opt]) return null;
                                        const val = q[opt];
                                        const isCorrectChoice = val === correct;
                                        const isGivenWrong = val === given && !isOk;
                                        const isGivenCorrect = val === given && isOk;

                                        let cls = 'p-3 rounded-lg text-sm font-medium border-2 ';
                                        if (isGivenCorrect) cls += 'bg-green-50 border-green-500 text-green-800 font-bold';
                                        else if (isGivenWrong) cls += 'bg-red-50 border-red-400 text-red-700 font-bold';
                                        else if (isCorrectChoice && !isOk) cls += 'bg-green-50 border-green-400 text-green-800';
                                        else cls += 'bg-gray-50 border-gray-100 text-gray-500';

                                        return (
                                            <div key={opt} className={cls}>
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
