import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminPanel from './AdminPanel';
import QuizSession from './QuizSession';
import Login from './components/Login';
import Schedule from './components/Schedule';
import ReviewSession from './components/ReviewSession';
import StudentAuth from './components/StudentAuth';
import StudentDashboard from './components/StudentDashboard';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import ScrollToTop from './components/ScrollToTop';
import Home from './components/pages/Home';
import NotFound from './components/pages/NotFound';
import ContactPage from './components/pages/ContactPage';
import { getCurrentUser } from './services/authService';

// ── Guard Admin ───────────────────────────────────────────────────────
function RequireAdmin({ children }) {
  const ok = sessionStorage.getItem('adminAuth') === '1';
  return ok ? children : <Navigate to="/admin-login" replace />;
}

// ── Guard Étudiant ───────────────────────────────────────────────────
function RequireStudent({ children }) {
  const user = getCurrentUser();
  return user ? children : <Navigate to="/login" replace />;
}

// ── Pages réservées aux non-connectés (login / inscription) ───────────
function OnlyPublic({ children }) {
  const user = getCurrentUser();
  return user ? <Navigate to="/dashboard" replace /> : children;
}

// ── Layout standard : navbar partagée + contenu + footer ─────────────
function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <Navbar />
      <div className="flex-1 flex flex-col">{children}</div>
      <Footer />
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        {/* Accueil public (présentation, stats, prochaines évaluations) */}
        <Route path="/" element={<Layout><Home /></Layout>} />

        {/* Authentification Étudiant (API Node.js) */}
        <Route
          path="/login"
          element={<OnlyPublic><Layout><StudentAuth defaultTab="login" /></Layout></OnlyPublic>}
        />
        <Route
          path="/register"
          element={<OnlyPublic><Layout><StudentAuth defaultTab="register" /></Layout></OnlyPublic>}
        />
        <Route path="/forgot-password" element={<Layout><StudentAuth defaultTab="forgot" /></Layout>} />

        {/* Espace Étudiant (Tableau de bord protégé) */}
        <Route
          path="/dashboard"
          element={<RequireStudent><Layout><StudentDashboard /></Layout></RequireStudent>}
        />

        {/* Emploi du temps public */}
        <Route path="/schedule" element={<Layout><Schedule /></Layout>} />

        {/* Contact administration (étudiant connecté) */}
        <Route
          path="/contact"
          element={<RequireStudent><Layout><ContactPage /></Layout></RequireStudent>}
        />

        {/* Sessions d'évaluation */}
        <Route path="/quiz/:quizId" element={<RequireStudent><QuizSession /></RequireStudent>} />
        <Route
          path="/review/:quizId"
          element={<RequireStudent><Layout><ReviewSession /></Layout></RequireStudent>}
        />

        {/* Espace Administrateur (interfaces dédiées, sans navbar) */}
        <Route path="/admin-login" element={<Login />} />
        <Route path="/admin" element={<RequireAdmin><AdminPanel /></RequireAdmin>} />

        {/* 404 — route inconnue */}
        <Route path="*" element={<Layout><NotFound /></Layout>} />
      </Routes>
    </Router>
  );
}
