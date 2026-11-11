import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { getCurrentUser, logoutStudent } from '../../services/authService';
import StudentProfile from '../StudentProfile';
import Icon from '../ui/icons.jsx';

/**
 * Barre de navigation partagée par toutes les pages publiques/étudiantes.
 * - Responsive : liens à plat sur desktop, menu hamburger sur mobile
 * - Zone utilisateur connecté : avatar + menu déroulant (espace, profil, sortie)
 * - Non connecté : boutons Connexion / Inscription
 * Thème sombre (slate-900) pour rester lisible au-dessus des pages claires et sombres.
 */
export default function Navbar() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const userMenuRef = useRef(null);

  // Ferme le menu utilisateur au clic extérieur ou sur Échap
  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onPointerDown = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [userMenuOpen]);

  const handleLogout = () => {
    logoutStudent();
    navigate('/');
  };

  const openProfile = () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    setShowProfile(true);
  };

  // Liens principaux (Contact et Mon espace n'ont de sens que connecté)
  const links = [
    { to: '/', label: 'Accueil', end: true },
    { to: '/schedule', label: 'Planning' },
    ...(user
      ? [
          { to: '/contact', label: 'Contact' },
          { to: '/dashboard', label: 'Mon espace' }
        ]
      : [])
  ];

  const desktopLinkClass = ({ isActive }) =>
    `text-xs font-bold px-3 py-2 rounded-xl transition ${
      isActive
        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
        : 'text-slate-300 hover:text-white hover:bg-slate-800'
    }`;

  const mobileLinkClass = ({ isActive }) =>
    `block px-3 py-2.5 rounded-xl text-sm font-bold transition ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-slate-300 hover:text-white hover:bg-slate-800'
    }`;

  const initials = (user?.name || '?')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* ── Marque ── */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-lg shadow-md shadow-blue-500/20">
              UY1
            </div>
            <div className="hidden sm:block leading-tight">
              <span className="font-black text-base tracking-tight text-white flex items-center gap-2">
                Portail QCM
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold px-2 py-0.5 rounded-full">
                  Téléévaluation 2026
                </span>
              </span>
              <span className="block text-[11px] text-slate-400">UY1</span>
            </div>
          </Link>

          {/* ── Liens desktop ── */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navigation principale">
            {links.map(l => (
              <NavLink key={l.to} to={l.to} end={l.end} className={desktopLinkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          {/* ── Zone droite ── */}
          <div className="flex items-center gap-2">
            {user ? (
              <div className="relative hidden md:block" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl pl-1.5 pr-2.5 py-1.5 transition"
                >
                  <span className="w-7 h-7 rounded-lg bg-blue-600 text-white text-[11px] font-black flex items-center justify-center">
                    {initials}
                  </span>
                  <span className="text-xs font-bold text-slate-200 max-w-28 truncate hidden lg:block">
                    {user.name?.split(' ')[0]}
                  </span>
                  <Icon
                    name="chevron-down"
                    size={14}
                    className={`text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-700">
                      <p className="text-sm font-black text-white truncate">{user.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                      <p className="text-[11px] text-blue-300 mt-1 font-bold">
                        {user.filiere} • {user.niveau}
                      </p>
                    </div>
                    <div className="p-1.5">
                      <NavLink
                        to="/dashboard"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                      >
                        <Icon name="graduation" size={15} />
                        Mon espace
                      </NavLink>
                      <button
                        type="button"
                        onClick={openProfile}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                      >
                        <Icon name="user" size={15} />
                        Mon profil
                      </button>
                      <div className="h-px bg-slate-700 my-1.5" />
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-950/50 hover:text-red-300 transition"
                      >
                        <Icon name="logout" size={15} />
                        Se déconnecter
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link
                  to="/login"
                  className="text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 rounded-xl transition"
                >
                  Connexion
                </Link>
                <Link
                  to="/register"
                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl transition shadow-md shadow-blue-600/30"
                >
                  Inscription
                </Link>
              </div>
            )}

            {/* Burger mobile */}
            <button
              type="button"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Ouvrir le menu"
              aria-expanded={mobileOpen}
              className="md:hidden w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 transition"
            >
              {mobileOpen ? (
                <Icon name="close" size={20} />
              ) : (
                <Icon name="menu" size={20} />
              )}
            </button>
          </div>
        </div>

        {/* ── Menu mobile déroulant ── */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-slate-800 bg-slate-900 px-4 py-3 space-y-1" aria-label="Navigation mobile">
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setMobileOpen(false)}
                className={mobileLinkClass}
              >
                {l.label}
              </NavLink>
            ))}

            <div className="h-px bg-slate-800 my-2" />

            {user ? (
              <>
                <div className="px-3 py-2">
                  <p className="text-xs font-black text-white truncate">{user.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                  <p className="text-[11px] text-blue-300 mt-0.5 font-bold">
                    {user.filiere} • {user.niveau}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openProfile}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                >
                  <Icon name="user" size={16} />
                  Mon profil
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-red-400 hover:bg-red-950/50 hover:text-red-300 transition"
                >
                  <Icon name="logout" size={16} />
                  Se déconnecter
                </button>
              </>
            ) : (
              <div className="flex gap-2 pt-1">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center text-sm font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 rounded-xl transition"
                >
                  Connexion
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-xl transition"
                >
                  Inscription
                </Link>
              </div>
            )}
          </nav>
        )}
      </header>

      {/* ── Modal profil (point d'entrée unique, partagé entre pages) ── */}
      {showProfile && user && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <StudentProfile
            onClose={() => setShowProfile(false)}
            onProfileUpdated={() => {
              // Prévenir les pages (ex : tableau de bord) du changement de profil
              window.dispatchEvent(new Event('qcm:profile-updated'));
              setShowProfile(false);
            }}
          />
        </div>
      )}
    </>
  );
}
