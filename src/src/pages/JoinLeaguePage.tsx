import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { apiPost } from '../utils/api';

export default function JoinLeaguePage() {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ inviteCode: '', teamName: '' });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiPost<{ league: { id: string; name: string } }>('/leagues/join', form, token || undefined);
      toast.success(`Joined "${data.league.name}"! 🏈`);
      navigate(`/leagues/${data.league.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join league');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Join a League</h1>
        <p className="text-slate-400 mt-1">Enter your invite code to join a league.</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label">Invite Code</label>
            <input
              type="text"
              name="inviteCode"
              className="input font-mono text-center text-lg tracking-widest uppercase"
              placeholder="XXXXXXXX"
              value={form.inviteCode}
              onChange={handleChange}
              minLength={6}
              maxLength={20}
              required
            />
            <p className="text-slate-500 text-xs mt-1">Ask your commissioner for the invite code.</p>
          </div>

          <div>
            <label className="label">Your Team Name</label>
            <input
              type="text"
              name="teamName"
              className="input"
              placeholder="The Touchdown Bandits"
              value={form.teamName}
              onChange={handleChange}
              minLength={2}
              maxLength={50}
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full text-base py-3" disabled={loading}>
            {loading ? 'Joining...' : 'Join League'}
          </button>
        </form>
      </div>
    </div>
  );
}
