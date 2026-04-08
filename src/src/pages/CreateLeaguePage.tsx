import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { apiPost } from '../utils/api';

interface League {
  id: string;
  name: string;
  invite_code: string;
}

export default function CreateLeaguePage() {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    maxTeams: 10,
    draftTimerSeconds: 90,
    tradeDeadlineWeek: 11
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'name' ? value : parseInt(value) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const league = await apiPost<League>('/leagues', form, token || undefined);
      toast.success(`League "${league.name}" created! Invite code: ${league.invite_code}`);
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create league');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Create a League</h1>
        <p className="text-slate-400 mt-1">Set up your league settings. You'll be the commissioner.</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* League Name */}
          <div>
            <label className="label">League Name</label>
            <input
              type="text"
              name="name"
              className="input"
              placeholder="The Monday Night Dumpster Fire"
              value={form.name}
              onChange={handleChange}
              minLength={3}
              maxLength={100}
              required
            />
          </div>

          {/* Teams */}
          <div>
            <label className="label">Number of Teams</label>
            <select name="maxTeams" className="input" value={form.maxTeams} onChange={handleChange}>
              <option value={10}>10 Teams</option>
              <option value={12}>12 Teams</option>
            </select>
            <p className="text-slate-500 text-xs mt-1">10 or 12 teams. Standard PPR scoring.</p>
          </div>

          {/* Draft Timer */}
          <div>
            <label className="label">Draft Pick Timer</label>
            <select name="draftTimerSeconds" className="input" value={form.draftTimerSeconds} onChange={handleChange}>
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds (recommended)</option>
              <option value={120}>120 seconds</option>
            </select>
          </div>

          {/* Trade Deadline */}
          <div>
            <label className="label">Trade Deadline (Week)</label>
            <select name="tradeDeadlineWeek" className="input" value={form.tradeDeadlineWeek} onChange={handleChange}>
              {[9, 10, 11, 12].map(w => (
                <option key={w} value={w}>Week {w}{w === 11 ? ' (recommended)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Scoring note */}
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <p className="text-sm text-slate-400">
              <span className="text-white font-semibold">Scoring:</span> Standard PPR (Point Per Reception), Yahoo defaults. Snake draft, randomized order.
            </p>
          </div>

          <button type="submit" className="btn-primary w-full text-base py-3" disabled={loading}>
            {loading ? 'Creating league...' : 'Create League 🏈'}
          </button>
        </form>
      </div>
    </div>
  );
}
