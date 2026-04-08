import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/layout/Layout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import CreateLeaguePage from './pages/CreateLeaguePage';
import JoinLeaguePage from './pages/JoinLeaguePage';
import LeaguePage from './pages/LeaguePage';
import AdminPage from './pages/admin/AdminPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminLeaguesPage from './pages/admin/AdminLeaguesPage';
import AdminCardsPage from './pages/admin/AdminCardsPage';
import AdminConfigPage from './pages/admin/AdminConfigPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
      <Route path="/signup" element={<RequireGuest><SignupPage /></RequireGuest>} />

      {/* Authenticated */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/leagues/create" element={<CreateLeaguePage />} />
        <Route path="/leagues/join" element={<JoinLeaguePage />} />
        <Route path="/leagues/:id/*" element={<LeaguePage />} />
      </Route>

      {/* Admin */}
      <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>}>
        <Route index element={<Navigate to="/admin/users" replace />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="leagues" element={<AdminLeaguesPage />} />
        <Route path="cards" element={<AdminCardsPage />} />
        <Route path="config" element={<AdminConfigPage />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
