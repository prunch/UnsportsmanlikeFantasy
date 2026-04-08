import { Outlet, Link, useLocation } from 'react-router-dom';
import { Users, Trophy, CreditCard, Settings, BarChart2, ArrowLeft, Database } from 'lucide-react';

const navItems = [
  { path: '/admin/users', label: 'Users', icon: <Users size={18} /> },
  { path: '/admin/leagues', label: 'Leagues', icon: <Trophy size={18} /> },
  { path: '/admin/cards', label: 'Card Manager', icon: <CreditCard size={18} /> },
  { path: '/admin/players', label: 'Players', icon: <Database size={18} /> },
  { path: '/admin/config', label: 'API Config', icon: <Settings size={18} /> }
];

export default function AdminPage() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-700 flex flex-col">
        <div className="p-5 border-b border-slate-700">
          <Link to="/dashboard" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-4">
            <ArrowLeft size={16} /> Back to App
          </Link>
          <div className="flex items-center gap-2">
            <BarChart2 size={20} className="text-brand-400" />
            <span className="font-bold text-white">Admin Panel</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === item.path
                  ? 'bg-brand-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
