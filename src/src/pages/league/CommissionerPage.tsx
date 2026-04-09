import { useState, useEffect, useCallback } from 'react';
import { Shield, Settings, Users, RefreshCw, Pause, Play, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost, apiPatch } from '../../utils/api';
import toast from 'react-hot-toast';
import { League } from '../LeaguePage';

interface TeamInfo {
  id: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  waiver_priority: number;
  user: { id: string; display_name: string; email?: string };
}

interface PendingTrade {
  id: string;
  status: string;
  week: number;
  created_at: string;
  notes?: string;
  team?: { id: string; team_name: string; user?: { display_name: string } };
  related_team?: { id: string; team_name: string; user?: { display_name: string } };
  player?: { id: string; name: string; position: string; nfl_team: string };
}

interface OverviewData {
  league: League & { trade_deadline_week?: number };
  teams: TeamInfo[];
  pendingTrades: PendingTrade[];
  chatMessageCount: number;
}

export default function CommissionerPage({ league, onLeagueUpdate }: {
  league: League;
  onLeagueUpdate: () => void;
}) {
  const { token } = useAuthStore();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>('settings');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    name: league.name,
    tradeDeadlineWeek: 11,
    draftTimerSeconds: league.draft_timer_seconds || 90
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Roster override state
  const [rosterTeamId, setRosterTeamId] = useState('');
  const [rosterPlayerId, setRosterPlayerId] = useState('');
  const [rosterSlot, setRosterSlot] = useState('BN1');
  const [rosterAction, setRosterAction] = useState<'add' | 'drop'>('drop');
  const [savingRoster, setSavingRoster] = useState(false);

  const loadOverview = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<OverviewData>(`/leagues/${league.id}/commissioner/overview`, token);
      setOverview(data);
      setSettingsForm(prev => ({
        ...prev,
        name: data.league.name,
        tradeDeadlineWeek: (data.league as { trade_deadline_week?: number }).trade_deadline_week ?? 11
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load commissioner data');
    } finally {
      setLoading(false);
    }
  }, [league.id, token]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  async function saveSettings() {
    if (!token) return;
    setSavingSettings(true);
    try {
      await apiPatch(`/leagues/${league.id}/commissioner/settings`, {
        name: settingsForm.name,
        tradeDeadlineWeek: settingsForm.tradeDeadlineWeek,
        draftTimerSeconds: settingsForm.draftTimerSeconds
      }, token);
      toast.success('Settings saved');
      onLeagueUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function togglePause() {
    if (!token) return;
    try {
      const data = await apiPost<{ status: string; message: string }>(
        `/leagues/${league.id}/commissioner/pause`, {}, token
      );
      toast.success(data.message);
      onLeagueUpdate();
      loadOverview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pause/resume season');
    }
  }

  async function resetWaivers() {
    if (!token) return;
    if (!window.confirm('Reset waiver priority order? This will reorder all teams based on current standings.')) return;
    try {
      const data = await apiPost<{ message: string }>(
        `/leagues/${league.id}/commissioner/reset-waivers`, {}, token
      );
      toast.success(data.message);
      loadOverview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset waivers');
    }
  }

  async function reviewTrade(tradeId: string, action: 'approve' | 'veto') {
    if (!token) return;
    const reason = action === 'veto' ? window.prompt('Reason for veto (optional):') ?? '' : '';
    try {
      await apiPost(`/leagues/${league.id}/commissioner/trade-review/${tradeId}`, { action, reason }, token);
      toast.success(`Trade ${action === 'approve' ? 'approved' : 'vetoed'}!`);
      loadOverview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to review trade');
    }
  }

  async function rosterOverride() {
    if (!token || !rosterTeamId || !rosterPlayerId) return;
    setSavingRoster(true);
    try {
      await apiPost(`/leagues/${league.id}/commissioner/roster-override`, {
        action: rosterAction,
        teamId: rosterTeamId,
        playerId: rosterPlayerId,
        slot: rosterAction === 'add' ? rosterSlot : undefined
      }, token);
      toast.success(`Player ${rosterAction === 'add' ? 'added' : 'dropped'} successfully`);
      setRosterPlayerId('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update roster');
    } finally {
      setSavingRoster(false);
    }
  }

  function SectionToggle({ id, title, icon }: { id: string; title: string; icon: React.ReactNode }) {
    const isOpen = activeSection === id;
    return (
      <button
        onClick={() => setActiveSection(isOpen ? null : id)}
        className="w-full flex items-center justify-between p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-3 text-white font-semibold">
          {icon}
          {title}
        </div>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gridiron-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const slots = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'TE', 'FLEX', 'K', 'DEF',
    'BN1', 'BN2', 'BN3', 'BN4', 'BN5', 'BN6', 'IR1', 'IR2'];

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Shield size={22} className="text-gridiron-gold" />
        <h2 className="text-2xl font-bold text-white">Commissioner Panel</h2>
        <span className="text-xs bg-gridiron-gold/20 text-gridiron-gold px-2.5 py-1 rounded-full border border-gridiron-gold/30">
          Commissioner Only
        </span>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Teams', value: overview?.teams?.length ?? 0 },
          { label: 'Chat Messages', value: overview?.chatMessageCount ?? 0 },
          { label: 'Pending Trades', value: overview?.pendingTrades?.length ?? 0 }
        ].map(stat => (
          <div key={stat.label} className="card text-center py-3">
            <div className="text-2xl font-bold text-gridiron-gold">{stat.value}</div>
            <div className="text-slate-400 text-xs mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Season Controls */}
      <SectionToggle id="controls" title="Season Controls" icon={<Play size={16} />} />
      {activeSection === 'controls' && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
            <div>
              <div className="text-white font-medium text-sm">Pause / Resume Season</div>
              <div className="text-slate-500 text-xs">Emergency control — stops all processing</div>
            </div>
            <button
              onClick={togglePause}
              className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
                league.status === 'paused'
                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
              }`}
            >
              {league.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
              {league.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
            <div>
              <div className="text-white font-medium text-sm">Reset Waiver Priority</div>
              <div className="text-slate-500 text-xs">Reorders based on current standings (worst team first)</div>
            </div>
            <button
              onClick={resetWaivers}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              <RefreshCw size={14} />
              Reset
            </button>
          </div>
        </div>
      )}

      {/* League Settings */}
      <SectionToggle id="settings" title="League Settings" icon={<Settings size={16} />} />
      {activeSection === 'settings' && (
        <div className="card space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">League Name</label>
            <input
              type="text"
              value={settingsForm.name}
              onChange={e => setSettingsForm(prev => ({ ...prev, name: e.target.value }))}
              className="input w-full"
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Trade Deadline (Week)</label>
            <select
              value={settingsForm.tradeDeadlineWeek}
              onChange={e => setSettingsForm(prev => ({ ...prev, tradeDeadlineWeek: parseInt(e.target.value) }))}
              className="input w-full"
            >
              {Array.from({ length: 14 }, (_, i) => i + 1).map(w => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Draft Pick Timer (seconds)</label>
            <select
              value={settingsForm.draftTimerSeconds}
              onChange={e => setSettingsForm(prev => ({ ...prev, draftTimerSeconds: parseInt(e.target.value) }))}
              className="input w-full"
            >
              {[60, 90, 120].map(s => (
                <option key={s} value={s}>{s}s</option>
              ))}
            </select>
          </div>

          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className="btn-primary w-full disabled:opacity-50"
          >
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Trade Review */}
      <SectionToggle id="trades" title="Trade Review" icon={<CheckCircle size={16} />} />
      {activeSection === 'trades' && (
        <div className="card">
          {!overview?.pendingTrades?.length ? (
            <p className="text-slate-400 text-sm text-center py-4">No trades pending review.</p>
          ) : (
            <div className="space-y-3">
              {overview.pendingTrades.map(trade => (
                <div key={trade.id} className="p-3 bg-slate-700/30 rounded-xl">
                  <div className="text-white text-sm font-medium mb-1">
                    {(trade.team && typeof trade.team === 'object' && 'team_name' in trade.team)
                      ? (trade.team as { team_name: string }).team_name
                      : 'Unknown'}{' '}
                    ↔{' '}
                    {(trade.related_team && typeof trade.related_team === 'object' && 'team_name' in trade.related_team)
                      ? (trade.related_team as { team_name: string }).team_name
                      : 'Unknown'}
                  </div>
                  {trade.player && (
                    <div className="text-slate-400 text-xs mb-2">
                      Player: {(trade.player as { name: string; position: string; nfl_team: string }).name} ({(trade.player as { position: string }).position}, {(trade.player as { nfl_team: string }).nfl_team})
                    </div>
                  )}
                  <div className="text-slate-500 text-xs mb-3">
                    Week {trade.week} · {new Date(trade.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => reviewTrade(trade.id, 'approve')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm font-medium transition-colors"
                    >
                      <CheckCircle size={14} />
                      Approve
                    </button>
                    <button
                      onClick={() => reviewTrade(trade.id, 'veto')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-medium transition-colors"
                    >
                      <XCircle size={14} />
                      Veto
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Roster Override */}
      <SectionToggle id="roster" title="Emergency Roster Override" icon={<Users size={16} />} />
      {activeSection === 'roster' && (
        <div className="card space-y-4">
          <p className="text-yellow-400 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            ⚠️ Use with caution. This directly modifies a team's roster and creates a transaction log entry.
          </p>

          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Action</label>
            <div className="flex gap-2">
              {(['drop', 'add'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => setRosterAction(a)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    rosterAction === a
                      ? 'bg-gridiron-gold/20 text-gridiron-gold border border-gridiron-gold/40'
                      : 'bg-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {a === 'drop' ? '🗑️ Drop Player' : '➕ Add Player'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Target Team</label>
            <select
              value={rosterTeamId}
              onChange={e => setRosterTeamId(e.target.value)}
              className="input w-full"
            >
              <option value="">Select a team...</option>
              {overview?.teams?.map(team => (
                <option key={team.id} value={team.id}>
                  {team.team_name} ({team.user?.display_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Player ID (Tank01)</label>
            <input
              type="text"
              value={rosterPlayerId}
              onChange={e => setRosterPlayerId(e.target.value)}
              placeholder="e.g. 4362887"
              className="input w-full"
            />
          </div>

          {rosterAction === 'add' && (
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Roster Slot</label>
              <select
                value={rosterSlot}
                onChange={e => setRosterSlot(e.target.value)}
                className="input w-full"
              >
                {slots.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={rosterOverride}
            disabled={savingRoster || !rosterTeamId || !rosterPlayerId}
            className="btn-primary w-full disabled:opacity-50"
          >
            {savingRoster ? 'Processing...' : `Execute ${rosterAction === 'drop' ? 'Drop' : 'Add'}`}
          </button>
        </div>
      )}
    </div>
  );
}
