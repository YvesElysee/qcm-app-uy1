import { Link } from 'react-router-dom';
import { getCurrentUser } from '../../services/authService';

/**
 * Pied de page partagé : identité, navigation rapide et informations
 * institutionnelles. Le lien "Accès Enseignant / Admin" reste discret.
 */
export default function Footer() {
  const user = getCurrentUser();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-400">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8">
        {/* ── Marque ── */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-sm">
              QA
            </div>
            <span className="font-black text-white text-sm">QCM App</span>
          </div>
          <p className="text-xs leading-relaxed">
            Plateforme d'évaluation en ligne par QCM :
            épreuves chronométrées, rattrapages garantis et suivi de vos résultats.
          </p>
        </div>

        {/* ── Navigation ── */}
        <nav aria-label="Navigation pied de page">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-3">Navigation</h3>
          <ul className="space-y-2 text-xs font-bold">
            <li><Link to="/" className="hover:text-white transition">Accueil</Link></li>
            <li><Link to="/schedule" className="hover:text-white transition">Emploi du temps</Link></li>
            {user ? (
              <>
                <li><Link to="/dashboard" className="hover:text-white transition">Mon espace étudiant</Link></li>
                <li><Link to="/contact" className="hover:text-white transition">Contacter l'administration</Link></li>
              </>
            ) : (
              <>
                <li><Link to="/login" className="hover:text-white transition">Connexion</Link></li>
                <li><Link to="/register" className="hover:text-white transition">Inscription</Link></li>
              </>
            )}
          </ul>
        </nav>

        {/* ── Informations ── */}
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-3">Informations</h3>
          <ul className="space-y-2 text-xs">
            <li>QCM App</li>
            <li>Évaluation en ligne — Année académique 2025-2026</li>
            <li>
              <Link to="/admin-login" className="font-bold hover:text-white transition">
                Accès Enseignant / Admin
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800/70 py-4 text-center text-[11px] text-slate-500">
        © {year} QCM App. Tous droits réservés.
      </div>
    </footer>
  );
}
