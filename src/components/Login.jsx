import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';
import { ADMIN_PANEL_PATH } from '../config';

export default function Login() {
    usePageTitle('Accès administrateur');

    const [pwd, setPwd] = useState('');
    const [error, setError] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    // La redirection 401 de l'API ajoute ?expired=1 quand la session a expiré
    const [searchParams] = useSearchParams();
    const expired = searchParams.get('expired') === '1';

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(false);
        try {
            // Le mot de passe est vérifié côté serveur (ADMIN_PASSWORD du .env)
            const data = await api('/admin/login', { method: 'POST', body: { password: pwd } });
            sessionStorage.setItem('adminAuth', '1');
            sessionStorage.setItem('adminToken', data.token);
            navigate(ADMIN_PANEL_PATH);
        } catch (err) {
            setError(true);
            setErrorMsg(err.message || 'Mot de passe incorrect.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4">
            <div className="w-full max-w-sm">
                <form onSubmit={handleLogin} className="bg-slate-900 p-10 rounded-2xl shadow-2xl shadow-black/50 w-full border border-slate-800">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-600/15 border border-blue-600/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-400">
                        <Icon name="shield" size={30} />
                    </div>
                    <h1 className="text-2xl font-black text-white">Accès Administrateur</h1>
                    <p className="text-slate-400 text-sm mt-1">QCM App</p>
                </div>

                {expired && (
                    <div className="mb-5 flex items-start gap-2 bg-indigo-950/50 border border-indigo-800 text-indigo-300 text-xs rounded-xl px-3.5 py-3">
                        <Icon name="clock" size={15} className="mt-0.5" />
                        <span>
                            Session expirée ou fermée à distance. Reconnectez-vous pour
                            continuer.
                        </span>
                    </div>
                )}

                <label className="block text-sm font-bold text-slate-200 mb-2">Mot de passe :</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    required
                    className={`w-full p-3 mb-1 border rounded-xl bg-slate-950 text-slate-100 outline-none transition placeholder:text-slate-600 ${error ? 'border-red-600 focus:border-red-500' : 'border-slate-800 focus:border-blue-600'}`}
                    value={pwd}
                    onChange={e => { setPwd(e.target.value); setError(false); }}
                />
                {error && (
                    <p className="flex items-center gap-1.5 text-red-400 text-sm mb-3 mt-1.5">
                        <Icon name="alert" size={14} />
                        {errorMsg}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-4 bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-500 transition disabled:opacity-70"
                >
                    {loading ? 'Vérification...' : 'Se connecter'}
                </button>
            </form>
            <p className="text-center mt-5">
                <Link to="/" className="text-xs text-slate-500 hover:text-slate-300 transition flex items-center justify-center gap-1.5">
                    <Icon name="arrow-left" size={13} />
                    Retour à l'accueil
                </Link>
            </p>
            </div>
        </div>
    );
}
