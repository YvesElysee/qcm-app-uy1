import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Link } from 'react-router-dom';

export default function Schedule() {
    const [upcomingQuizzes, setUpcomingQuizzes] = useState([]);
    const [pastQuizzes, setPastQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ filiere: '', niveau: '' });
    const user = JSON.parse(localStorage.getItem('userSession')) || null;

    useEffect(() => {
        const fetchAll = async () => {
            const snapshot = await getDocs(query(collection(db, "quizzes"), orderBy("launchTime", "asc")));
            const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const now = Date.now();
            setUpcomingQuizzes(all.filter(q => q.launchTime > now));
            setPastQuizzes(all.filter(q => q.launchTime <= now).reverse());
            setLoading(false);
        };
        fetchAll();
    }, []);

    const filtered = (list) => list.filter(q =>
        (!filter.filiere || q.filiere === filter.filiere) &&
        (!filter.niveau || q.niveau === filter.niveau)
    );

    const formatDate = (ts) => new Date(ts).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });

    const badgeColor = (filiere) => {
        if (filiere === 'Informatique') return 'bg-blue-100 text-blue-700';
        if (filiere === 'Mathématiques') return 'bg-purple-100 text-purple-700';
        if (filiere === 'Physique') return 'bg-orange-100 text-orange-700';
        return 'bg-gray-100 text-gray-700';
    };

    const QuizCard = ({ quiz, past }) => (
        <div className={`bg-white rounded-xl shadow-sm border-l-4 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:shadow-md ${past ? 'border-gray-300 opacity-80' : 'border-blue-500'}`}>
            <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor(quiz.filiere)}`}>{quiz.filiere}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{quiz.niveau}</span>
                    {quiz.semestre && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">S{quiz.semestre}</span>}
                </div>
                <h3 className="font-black text-gray-800 text-lg">{quiz.ue || quiz.id}</h3>
                <p className="text-gray-500 text-sm mt-1">
                    {past ? 'Terminé — ' : 'Prévu le '}
                    <span className="font-semibold text-gray-700">{formatDate(quiz.launchTime)}</span>
                </p>
                {quiz.endTime && <p className="text-gray-400 text-xs mt-0.5">Heure de fin : {formatDate(quiz.endTime)}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
                {past ? (
                    user && <Link to={`/review/${quiz.id}`} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition">Relire mon test</Link>
                ) : (
                    <Link to="/" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition">Rejoindre</Link>
                )}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <Link to="/" className="text-blue-600 hover:underline text-sm">← Retour</Link>
                    <div>
                        <h1 className="text-3xl font-black text-gray-800">Emploi du temps QCM</h1>
                        <p className="text-gray-500 text-sm">Prochains tests et évaluations — UY1</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex gap-4 flex-wrap">
                    <select className="flex-1 min-w-32 p-2 border-2 border-gray-100 rounded-lg outline-none focus:border-blue-500 text-sm" value={filter.filiere} onChange={e => setFilter(f => ({ ...f, filiere: e.target.value }))}>
                        <option value="">Toutes filières</option>
                        <option>Informatique</option>
                        <option>Mathématiques</option>
                        <option>Physique</option>
                    </select>
                    <select className="flex-1 min-w-24 p-2 border-2 border-gray-100 rounded-lg outline-none focus:border-blue-500 text-sm" value={filter.niveau} onChange={e => setFilter(f => ({ ...f, niveau: e.target.value }))}>
                        <option value="">Tous niveaux</option>
                        <option>L1</option><option>L2</option><option>L3</option>
                        <option>M1</option><option>M2</option>
                    </select>
                </div>

                {loading ? (
                    <div className="text-center py-20 text-gray-400">Chargement...</div>
                ) : (
                    <>
                        <section className="mb-8">
                            <h2 className="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
                                Prochains QCM ({filtered(upcomingQuizzes).length})
                            </h2>
                            {filtered(upcomingQuizzes).length === 0
                                ? <div className="text-center py-8 bg-white rounded-xl text-gray-400 border border-dashed">Aucun QCM programmé</div>
                                : <div className="space-y-3">{filtered(upcomingQuizzes).map(q => <QuizCard key={q.id} quiz={q} past={false} />)}</div>
                            }
                        </section>
                        <section>
                            <h2 className="text-xl font-bold text-gray-700 mb-4">📚 QCM Passés ({filtered(pastQuizzes).length})</h2>
                            {filtered(pastQuizzes).length === 0
                                ? <div className="text-center py-8 bg-white rounded-xl text-gray-400 border border-dashed">Aucun QCM terminé</div>
                                : <div className="space-y-3">{filtered(pastQuizzes).map(q => <QuizCard key={q.id} quiz={q} past={true} />)}</div>
                            }
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
