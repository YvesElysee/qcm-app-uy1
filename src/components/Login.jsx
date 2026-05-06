import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function Login() {
    const [pwd, setPwd] = useState('');
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(false);
        const envHash = await hashPassword(import.meta.env.VITE_ADMIN_PASSWORD || '');
        const inputHash = await hashPassword(pwd);
        if (inputHash === envHash) {
            sessionStorage.setItem('adminAuth', '1');
            navigate('/admin');
        } else {
            setError(true);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950 p-4">
            <form onSubmit={handleLogin} className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-black text-gray-800">Accès Administrateur</h1>
                    <p className="text-gray-500 text-sm mt-1">Portail QCM — UY1</p>
                </div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Mot de passe :</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    required
                    className={`w-full p-3 mb-1 border-2 rounded-lg outline-none transition ${error ? 'border-red-400 focus:border-red-500' : 'border-gray-100 focus:border-blue-500'}`}
                    value={pwd}
                    onChange={e => { setPwd(e.target.value); setError(false); }}
                />
                {error && <p className="text-red-500 text-sm mb-3">Mot de passe incorrect.</p>}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-4 bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-70"
                >
                    {loading ? 'Vérification...' : 'Se connecter'}
                </button>
            </form>
        </div>
    );
}
