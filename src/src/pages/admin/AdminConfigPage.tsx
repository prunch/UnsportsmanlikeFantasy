import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiPut } from '../../utils/api';
import toast from 'react-hot-toast';
import { Key, Eye, EyeOff } from 'lucide-react';

export default function AdminConfigPage() {
  const { token } = useAuthStore();
  const [tank01Key, setTank01Key] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveTank01Key(e: React.FormEvent) {
    e.preventDefault();
    if (!tank01Key.trim()) return;
    setSaving(true);
    try {
      await apiPut('/admin/config/tank01_api_key', { value: tank01Key }, token || undefined);
      toast.success('Tank01 API key saved');
      setTank01Key('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">API Configuration</h1>

      <div className="space-y-6 max-w-2xl">
        {/* Tank01 API Key */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Key className="text-brand-400" size={20} />
            <div>
              <h2 className="text-white font-bold">Tank01 NFL API Key</h2>
              <p className="text-slate-400 text-sm">Required for live NFL stats and scoring</p>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-3 mb-4 text-sm text-slate-400">
            <p>Get your API key from <a href="https://rapidapi.com/tank01/api/tank01-nfl-live-in-game-real-time-statistics-nfl" target="_blank" className="text-brand-400 hover:underline">RapidAPI → Tank01 NFL</a>.</p>
            <p className="mt-1">Keys are stored securely in the database — never in code or environment files.</p>
          </div>

          <form onSubmit={saveTank01Key} className="space-y-3">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                className="input pr-10"
                placeholder="Enter your RapidAPI key..."
                value={tank01Key}
                onChange={e => setTank01Key(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <button type="submit" className="btn-primary" disabled={saving || !tank01Key.trim()}>
              {saving ? 'Saving...' : 'Save API Key'}
            </button>
          </form>
        </div>

        {/* Health Status */}
        <div className="card">
          <h2 className="text-white font-bold mb-3">System Health</h2>
          <div className="space-y-2">
            <HealthRow label="API Server" status="online" />
            <HealthRow label="Supabase DB" status={process.env.VITE_SUPABASE_URL ? 'online' : 'not_configured'} />
            <HealthRow label="Tank01 API" status="not_configured" note="Set key above" />
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthRow({ label, status, note }: { label: string; status: string; note?: string }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    online: { color: 'text-green-400', label: '● Online' },
    not_configured: { color: 'text-yellow-400', label: '● Not Configured' },
    offline: { color: 'text-red-400', label: '● Offline' }
  };

  const s = statusConfig[status] || statusConfig.not_configured;

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
      <span className="text-slate-300">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
        {note && <div className="text-xs text-slate-500">{note}</div>}
      </div>
    </div>
  );
}
