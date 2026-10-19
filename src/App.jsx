import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminPanel from './AdminPanel';
import QuizSession from './QuizSession';
import Login from './components/Login';
import Schedule from './components/Schedule';
import ReviewSession from './components/ReviewSession';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import StudentDashboard from './components/StudentDashboard';
import ContactAdmin from './components/ContactAdmin';
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

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Router>
      <Routes>
        {/* Page d'accueil publique */}
        <Route path="/" element={<LandingPage />} />

        {/* Espace Étudiant Principal (Tableau de bord protégé) */}
        <Route path="/dashboard" element={<RequireStudent><StudentDashboard /></RequireStudent>} />

        {/* Authentification Étudiant (Sans Firebase Auth) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Sessions d'Évaluation & Emploi du Temps */}
        <Route path="/quiz/:quizId" element={<RequireStudent><QuizSession /></RequireStudent>} />
        <Route path="/review/:quizId" element={<RequireStudent><ReviewSession /></RequireStudent>} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/contact" element={<RequireStudent><div className="min-h-screen bg-slate-100 p-6"><ContactAdmin /></div></RequireStudent>} />

        {/* Espace Administrateur */}
        <Route path="/admin-login" element={<Login />} />
        <Route path="/admin" element={<RequireAdmin><AdminPanel /></RequireAdmin>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
