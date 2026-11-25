import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { getCurrentUser, logoutStudent } from '../../services/authService';
import StudentProfile from '../StudentProfile';
import NotificationBell from '../NotificationBell';
import OnboardingGuide from '../OnboardingGuide';
import AiTutor from '../ai/AiTutor';
import Icon from '../ui/icons.jsx';
import BrandLogo from '../ui/BrandLogo.jsx';
import DonationButton from '../DonationButton.jsx';
import { pathwayFor } from '../../utils/studentProfile.js';
import { APK_DOWNLOAD_URL } from '../../constants/portalInfo.js';
import { showApkDownload } from '../../utils/appEnvironment.js';

const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029Vb96OnjLCoXA4RDPES2n';

/**
 * Clé de suivi du mode d'emploi : le guide ne s'ouvre automatiquement qu'une
 * seule fois par étudiant (et par navigateur).
 */
const guideSeenKey = (identity) => `qcm_guide_seen_v2:${identity}`;

/**
 * Barre de navigation partagée par toutes les pages publiques/étudiantes.
 * - Desktop : liens à plat + menu utilisateur.
 * - Mobile  : tiroir latéral coulissant sur fond flouté + barre de navigation
 *   fixe en bas de l'écran (accueil, planning, IA, ressources, espace).
 * Thème sombre (slate-900) pour rester lisible au-dessus des pages claires.
 */
export default function Navbar() {
  const user = getCurrentUser();
  const apkDownloadAvailable = showApkDownload();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInitialMessage, setAiInitialMessage] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const userMenuRef = useRef(null);
  const identity = user?.id || user?.email || '';

  // Premier passage : on présente le mode d'emploi (une seule fois par compte).
  useEffect(() => {
    if (!identity) return undefined;
    let seen;
    try {
      seen = localStorage.getItem(guideSeenKey(identity)) === '1';
    } catch {
      seen = false;
    }
    if (seen) return undefined;
    const timer = setTimeout(() => setGuideOpen(true), 800);
    return () => clearTimeout(timer);
  }, [identity]);

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

  // Tiroir mobile : fermeture sur Échap + blocage du défilement de fond
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const handleLogout = () => {
    logoutStudent();
    navigate('/');
  };

  const openProfile = () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    setShowProfile(true);
  };

  const openAi = useCallback((message = '') => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    setAiInitialMessage(String(message || ''));
    setAiOpen(true);
  }, [setUserMenuOpen, setMobileOpen, setAiInitialMessage, setAiOpen]);

  const openGuide = () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    setGuideOpen(true);
  };

  // Les pages (tableau de bord, générateur) peuvent ouvrir le tuteur global.
  // Une page peut pré-remplir le champ avec une invite de révision.
  useEffect(() => {
    const onOpenAi = (event) => openAi(event?.detail?.message || '');
    window.addEventListener('qcm:open-ai', onOpenAi);
    return () => window.removeEventListener('qcm:open-ai', onOpenAi);
  }, [openAi]);

  // Objet stable : évite de reinterroger le quota à chaque rendu de la navbar.
  const aiContext = useMemo(() => ({ key: 'general_navbar', kind: 'general', quizId: '' }), []);

  const closeGuide = () => {
    setGuideOpen(false);
    if (!identity) return;
    try {
      localStorage.setItem(guideSeenKey(identity), '1');
    } catch {
      /* stockage indisponible : le guide se réaffichera à la prochaine visite */
    }
  };

  // Liens principaux (Contact et Mon espace n'ont de sens que connecté)
  const pathway = pathwayFor(user);
  const canGenerateExercises = !!user && (
    pathway.maths || pathway.physics || pathway.l3plus
  );

  const links = [
    { to: '/', label: 'Accueil', end: true },
    { to: '/schedule', label: 'Planning' },
    ...(user
      ? [
          ...(canGenerateExercises ? [{ to: '/exercises', label: 'Exercices' }] : []),
          { to: '/ues', label: 'UE', highlight: true },
          { to: '/resources', label: 'Ressources' },
          { to: '/contact', label: 'Contact' },
          { to: '/dashboard', label: 'Mon espace' }
        ]
      : [])
  ];

  const bottomLinks = user
    ? [
        { to: '/', label: 'Accueil', icon: 'home', end: true },
        { to: '/ues', label: 'UE', icon: 'book' },
        { to: '/schedule', label: 'Planning', icon: 'calendar' },
        { action: 'ai', label: 'Tuteur IA', icon: 'sparkles' },
        { to: '/resources', label: 'Ressources', icon: 'document' },
        { to: '/dashboard', label: 'Espace', icon: 'graduation' }
      ]
    : [
        { to: '/', label: 'Accueil', icon: 'home', end: true },
        { to: '/schedule', label: 'Planning', icon: 'calendar' },
        ...(apkDownloadAvailable ? [{ action: 'apk', label: 'APK', icon: 'download' }] : []),
        { to: '/login', label: 'Connexion', icon: 'user' },
        { to: '/register', label: 'Inscription', icon: 'graduation' }
      ];

  const desktopLinkClass = ({ isActive }) =>
    `text-xs font-bold px-3 py-2 rounded-xl transition ${
      isActive
        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
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
            <BrandLogo size={40} className="shadow-md shadow-blue-500/20" />
            <div className="hidden sm:block leading-tight">
              <span className="font-black text-base tracking-tight text-white flex items-center gap-2">
                QCM App
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold px-2 py-0.5 rounded-full">
                  Évaluation 2026
                </span>
              </span>
              <span className="block text-[11px] text-slate-400">Plateforme d'évaluation</span>
            </div>
          </Link>

          {/* ── Liens desktop ── */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navigation principale">
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => l.highlight
                  ? `inline-flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border transition ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/25'
                        : 'bg-emerald-600/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/25'
                    }`
                  : desktopLinkClass({ isActive })
              }
              >
                {l.highlight && <Icon name="book" size={13} />}
                {l.label}
              </NavLink>
            ))}
            {user && (
              <button
                type="button"
                onClick={openAi}
                title="Ouvrir le tuteur IA"
                className="ml-1 inline-flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-300 transition"
              >
                <Icon name="sparkles" size={14} />
                <span className="hidden xl:inline">Tuteur IA</span>
              </button>
            )}
          </nav>

          {/* ── Zone droite ── */}
          <div className="flex items-center gap-2">
            {user && (
              <button
                type="button"
                onClick={openGuide}
                aria-label="Guide d'utilisation des boutons"
                title="Guide d'utilisation des boutons"
                className="hidden sm:flex items-center justify-center gap-2 w-10 h-10 lg:w-auto lg:h-auto lg:px-3 lg:py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-bold transition"
              >
                <Icon name="lightbulb" size={17} />
                <span className="hidden lg:inline">Guide</span>
              </button>
            )}
            {!user && apkDownloadAvailable && (
              <a
                href={APK_DOWNLOAD_URL}
                download="QCM App.apk"
                aria-label="Télécharger l'application Android"
                title="Télécharger l'application Android (APK)"
                className="inline-flex items-center justify-center gap-2 w-10 h-10 lg:w-auto lg:h-auto lg:px-3 lg:py-2 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 text-xs font-bold transition"
              >
                <Icon name="download" size={17} />
                <span className="hidden lg:inline">Application Android</span>
              </a>
            )}
            <a
              href={WHATSAPP_CHANNEL}
              target="_blank"
              rel="noreferrer"
              aria-label="Rejoindre la chaîne WhatsApp QCM App"
              title="Rejoindre la chaîne WhatsApp QCM App"
              className="inline-flex items-center justify-center gap-2 w-10 h-10 lg:w-auto lg:h-auto lg:px-3 lg:py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition"
            >
              <Icon name="chat" size={17} />
              <span className="hidden lg:inline">Chaîne WhatsApp</span>
            </a>
            {user && <NotificationBell />}
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
                      {pathway.highlighted && (
                        <p className="text-[10px] text-indigo-300 mt-1.5 leading-relaxed">
                          {pathway.title} · utilisez le Tuteur IA pour produire vos sujets.
                        </p>
                      )}
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
                      <NavLink
                        to="/ues"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-black text-emerald-300 bg-emerald-600/10 hover:bg-emerald-600/20 transition"
                      >
                        <Icon name="book" size={15} />
                        Toutes mes UE
                      </NavLink>
                      <NavLink
                        to="/resources"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                      >
                        <Icon name="document" size={15} />
                        Ressources de cours
                      </NavLink>
                      {canGenerateExercises && (
                        <NavLink
                          to="/exercises"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                        >
                          <Icon name="sparkles" size={15} />
                          Générateur d'exercices
                        </NavLink>
                      )}
                      <button
                        type="button"
                        onClick={openAi}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-blue-300 hover:bg-blue-600/15 hover:text-blue-200 transition"
                      >
                        <Icon name="sparkles" size={15} />
                        Tuteur IA
                      </button>
                      <button
                        type="button"
                        onClick={openGuide}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                      >
                        <Icon name="lightbulb" size={15} />
                        Guide des boutons
                      </button>
                      <button
                        type="button"
                        onClick={openProfile}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                      >
                        <Icon name="user" size={15} />
                        Mon profil
                      </button>
                      <DonationButton variant="menu" className="!text-xs !font-bold !text-slate-400 !px-3 !py-2.5 !gap-2.5" />
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
              onClick={() => setMobileOpen(true)}
              aria-label="Ouvrir le menu"
              aria-expanded={mobileOpen}
              className="md:hidden w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 transition"
            >
              <Icon name="menu" size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Tiroir mobile coulissant + fond flouté ── */}
      <div
        className={`md:hidden fixed inset-0 z-[70] ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity duration-300 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <aside
          role="dialog"
          aria-label="Menu mobile"
          className={`absolute right-0 top-0 h-full w-[86%] max-w-sm bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <BrandLogo size={36} />
              <div className="min-w-0">
                <p className="text-sm font-black text-white leading-tight">QCM App</p>
                <p className="text-[11px] text-slate-400 truncate">Plateforme d'évaluation</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
              className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {user && (
              <div className="mb-3 rounded-2xl bg-slate-800/70 border border-slate-700 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-blue-600 text-white text-sm font-black flex items-center justify-center">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
                <p className="text-[11px] text-blue-300 mt-2 font-bold">
                  {user.filiere} • {user.niveau}
                </p>
                {pathway.highlighted && (
                  <p className="text-[10px] text-indigo-300 mt-1.5 leading-relaxed">
                    {pathway.messages[0]}
                  </p>
                )}
              </div>
            )}

            {!user && apkDownloadAvailable && (
              <a
                href={APK_DOWNLOAD_URL}
                download="QCM App.apk"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/25 transition"
              >
                <Icon name="download" size={17} />
                Télécharger l'application Android
              </a>
            )}
            <a
              href={WHATSAPP_CHANNEL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold bg-emerald-600/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/25 transition"
            >
              <Icon name="chat" size={17} />
              Rejoindre la chaîne WhatsApp
            </a>

            {user && (
              <>
                <div className="h-px bg-slate-800 my-3" />
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={openAi}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-blue-300 hover:bg-blue-600/15 hover:text-blue-200 transition"
                  >
                    <Icon name="sparkles" size={17} />
                    Tuteur IA
                  </button>
                  <NavLink
                    to="/ues"
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-black transition ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20'
                      }`
                    }
                  >
                    <Icon name="book" size={17} />
                    Toutes mes UE
                  </NavLink>
                  <button
                    type="button"
                    onClick={openGuide}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Icon name="lightbulb" size={17} />
                    Guide des boutons
                  </button>
                  <button
                    type="button"
                    onClick={openProfile}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Icon name="user" size={17} />
                    Mon profil
                  </button>
                  <DonationButton variant="menu" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-red-400 hover:bg-red-950/50 hover:text-red-300 transition"
                  >
                    <Icon name="logout" size={17} />
                    Se déconnecter
                  </button>
                </div>
              </>
            )}

            {!user && (
              <div className="flex gap-2 pt-4">
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
          </div>
        </aside>
      </div>

      {/* ── Navigation fixe du bas (mobile) ── */}
      <nav
        aria-label="Navigation rapide"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-6">
          {bottomLinks.map((item) => {
            if (item.action === 'ai') {
              return (
                <button
                  key="ai"
                  type="button"
                  onClick={openAi}
                  className="flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-bold transition active:bg-slate-800 text-blue-300"
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </button>
              );
            }
            if (item.action === 'apk') {
              return (
                <a
                  key="apk"
                  href={APK_DOWNLOAD_URL}
                  download="QCM App.apk"
                  aria-label="Télécharger l'application Android"
                  className="flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-bold transition active:bg-slate-800 text-indigo-300"
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </a>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-bold transition active:bg-slate-800 ${
                    isActive ? 'text-blue-300' : 'text-slate-400'
                  }`
                }
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* ── Modal profil (point d'entrée unique, partagé entre pages) ── */}
      {showProfile && user && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
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
      {/* ── Tuteur IA global (accès depuis la navbar) ── */}
      {user && (
        <AiTutor
          key={`general:${aiInitialMessage}`}
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          context={aiContext}
          initialMessage={aiInitialMessage}
        />
      )}

      {/* ── Mode d'emploi de première utilisation ── */}
      {user && <OnboardingGuide open={guideOpen} onClose={closeGuide} />}
    </>
  );
}
