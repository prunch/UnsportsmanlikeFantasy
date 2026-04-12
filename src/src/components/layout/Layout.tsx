import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { LogOut, LayoutDashboard, Plus, Users, Settings, Bell } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { apiGet } from '../../utils/api';
import toast from 'react-hot-toast';

export default function Layout() {
  const { user, logout, token } = useAuthStore();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<{ count: number }>('/notifications/unread-count', token);
      setUnreadCount(data.count);
    } catch {
      // silent
    }
  }, [token]);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  function handleLogout() {
    logout();
    toast.success('Logged out');
    navigate('/');
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-700 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-slate-700">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="text-2xl">🏈</span>
            <div>
              <div className="font-bold text-white text-lg leading-tight">Gridiron</div>
              <div className="text-xs text-gridiron-gold font-semibold tracking-wider">CARDS</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/dashboard" icon={<LayoutDashboard size={18} />}>My Leagues</NavLink>
          <NavLink to="/leagues/create" icon={<Plus size={18} />}>Create League</NavLink>
          <NavLink to="/leagues/join" icon={<Users size={18} />}>Join League</NavLink>
          <Link
            to="/notifications"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            <div className="relative">
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gridiron-gold rounded-full text-black text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            Notifications
          </Link>
          {user?.role === 'admin' && (
            <NavLink to="/admin" icon={<Settings size={18} />}>Admin Panel</NavLink>
          )}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-slate-700">
          <Link to={`/profile/${user?.id}`} className="flex items-center gap-3 mb-3 group">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-600 group-hover:border-gridiron-gold transition-colors" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-brand-700 flex items-center justify-center text-sm font-bold group-hover:ring-1 group-hover:ring-gridiron-gold transition-all">
                {user?.displayName?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate group-hover:text-gridiron-gold transition-colors">{user?.displayName}</div>
              <div className="text-xs text-slate-400 truncate">{user?.email}</div>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/settings"
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <Settings size={14} />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content.
          max-w-screen-2xl (1536px) is wide enough to fit the Players grid with
          all its position-specific stat columns on typical desktop monitors,
          while still centering content comfortably on ultra-wide displays. */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-screen-2xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
    >
      {icon}
      {children}
    </Link>
  );
}
