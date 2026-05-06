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
            // Charger les questions
            const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
            const qs = qSnap.docs.map(d => d.data());

            // Charger la résultat de l'étudiant
            const rSnap = await getDocs(query(collection(db, "results"), where("ue", "==", quizId), where("name", "==", user.name)));
            if (!rSnap.empty) {
                const result = rSnap.docs[0].data();
                setAnswers(result.answers || []);
                setScore(result.score);
                setTotal(result.total);
            }
            setQuestions(qs);
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
                <span className="text-4xl">📭</span>
                <h2 className="text-xl font-bold mt-4 text-gray-700">Aucun résultat trouvé</h2>
                <p className="text-gray-500 mt-2">Vous n'avez peut-être pas passé ce QCM.</p>
                <Link to="/schedule" className="mt-4 inline-block text-blue-600 hover:underline">← Retour à l'emploi du temps</Link>
            </div>
        </div>
    );

    const note = total > 0 ? ((score / total) * 20).toFixed(2) : '—';

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-3xl mx-auto">
                <Link to="/schedule" className="text-blue-600 hover:underline text-sm">&larr; Retour à l'emploi du temps</Link>

                <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-2xl p-8 my-6 text-center">
                    <h1 className="text-2xl font-black mb-1">Correction — {quizId}</h1>
                    <p className="opacity-80 mb-3">Étudiant : {user.name}</p>
                    {score !== null ? (
                        <div className="flex justify-center gap-8">
                            <div><div className="text-4xl font-black">{score}/{total}</div><div className="text-sm opacity-75 mt-1">Score</div></div>
                            <div><div className="text-4xl font-black">{note}/20</div><div className="text-sm opacity-75 mt-1">Note</div></div>
                        </div>
                    ) : <p className="opacity-75">Résultats non disponibles</p>}
                </div>

                <div className="space-y-4">
                    {questions.map((q, i) => {
                        const given = answers[i] || null;
                        const correct = q.ReponseCorrecte;
                        const isOk = given === correct;
                        return (
                            <div key={i} className={`bg-white rounded-xl shadow-sm border-l-4 p-6 ${isOk ? 'border-green-500' : given ? 'border-red-400' : 'border-gray-300'}`}>
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-full">Q{i + 1}</span>
                                    {given ? (isOk ? <span className="text-green-600 text-sm font-bold">✅ Correct</span> : <span className="text-red-500 text-sm font-bold">❌ Incorrect</span>) : <span className="text-gray-400 text-sm">— Sans réponse</span>}
                                </div>
                                <h3 className="font-bold text-gray-800 mb-4 leading-relaxed">{q.Question}</h3>
                                <div className="grid grid-cols-1 gap-2">
                                    {['OptA', 'OptB', 'OptC', 'OptD'].map(opt => q[opt] && (
                                        <div key={opt} className={`p-3 rounded-lg text-sm font-medium border-2 transition
                      ${q[opt] === correct ? 'bg-green-50 border-green-400 text-green-800' : ''}
                      ${q[opt] === given && !isOk ? 'bg-red-50 border-red-300 text-red-700' : ''}
                      ${q[opt] !== correct && q[opt] !== given ? 'bg-gray-50 border-gray-100 text-gray-600' : ''}
                    `}>
                                            {q[opt]}
                                            {q[opt] === correct && <span className="ml-2 text-green-600 font-bold">✓ Bonne réponse</span>}
                                            {q[opt] === given && !isOk && <span className="ml-2 text-red-500 font-bold">← Votre réponse</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
