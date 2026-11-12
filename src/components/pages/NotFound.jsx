import { Link } from 'react-router-dom';
import usePageTitle from '../../hooks/usePageTitle';

/**
 * Page 404 · affichée pour toute route inconnue au lieu d'une redirection silencieuse.
 */
export default function NotFound() {
  usePageTitle('Page introuvable');

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 bg-slate-950">
      <div className="text-7xl md:text-8xl font-black bg-gradient-to-r from-blue-500 to-indigo-400 bg-clip-text text-transparent">
        404
      </div>
      <h1 className="text-2xl font-black text-white mt-4">Page introuvable</h1>
      <p className="text-slate-400 text-sm mt-2 max-w-md leading-relaxed">
        La page que vous cherchez n'existe pas ou a été déplacée.
        Vérifiez l'adresse ou revenez à l'accueil.
      </p>

      <div className="flex gap-3 mt-8 flex-wrap justify-center">
        <Link
          to="/"
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-6 py-3 rounded-2xl transition shadow-lg shadow-blue-600/30"
        >
          ← Retour à l'accueil
        </Link>
        <Link
          to="/schedule"
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm px-6 py-3 rounded-2xl transition"
        >
          Emploi du temps
        </Link>
      </div>
    </div>
  );
}
