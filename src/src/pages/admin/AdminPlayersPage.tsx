import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost } from '../../utils/api';
import toast from 'react-hot-toast';
import { Database, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface PlayerCountResponse {
  count: number;
}

interface SyncResponse {
  success: boolean;
  playersSynced: number;
  skipped: number;
  message: string;
  syncedAt: string;
}

interface LastSync {
  playersSynced: number;
  skipped: number;
  syncedAt: string;
}

export default function AdminPlayersPage() {
  const { token } = useAuthStore();
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<LastSync | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayerCount = useCallback(async () => {
    try {
      setLoadingCount(true);
      const data = await apiGet<PlayerCountResponse>('/players/count', token || undefined);
      setPlayerCount(data.count);
    } catch (err) {
      console.error('Failed to fetch player count:', err);
      setPlayerCount(null);
    } finally {
      setLoadingCount(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPlayerCount();
  }, [fetchPlayerCount]);

  async function handleSync() {
    setSyncing(true);
    setError(null);

    try {
      const result = await apiPost<SyncResponse>('/admin/sync-players', {}, token || undefined);
      setLastSync({
        playersSynced: result.playersSynced,
        skipped: result.skipped,
        syncedAt: result.syncedAt,
      });
      toast.success(`✅ Synced ${result.playersSynced.toLocaleString()} players from Tank01`);
      // Refresh the count after sync
      await fetchPlayerCount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  }

  function formatSyncTime(isoString: string): string {
    return new Date(isoString).toLocaleString();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Player Database</h1>

      <div className="space-y-6 max-w-2xl">
        {/* Player Count Card */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Database className="text-brand-400" size={20} />
            <div>
              <h2 className="text-white font-bold">Database Status</h2>
              <p className="text-slate-400 text-sm">Current NFL player records in the database</p>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">Total Players</span>
              <span className="text-2xl font-bold text-white">
                {loadingCount ? (
                  <span className="text-slate-500 text-lg">Loading...</span>
                ) : playerCount !== null ? (
                  playerCount.toLocaleString()
                ) : (
                  <span className="text-slate-500 text-lg">—</span>
                )}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              Fantasy-eligible positions: QB, RB, WR, TE, K, DEF
            </p>
          </div>

          {/* Last Sync Info */}
          {lastSync && (
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="text-green-400" size={16} />
                <span className="text-green-400 text-sm font-medium">Last Sync Successful</span>
              </div>
              <div className="space-y-1 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Players synced</span>
                  <span className="text-white font-medium">{lastSync.playersSynced.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Skipped (non-fantasy)</span>
                  <span className="text-white font-medium">{lastSync.skipped.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Clock size={11} /> Synced at</span>
                  <span className="text-white font-medium">{formatSyncTime(lastSync.syncedAt)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertCircle className="text-red-400 mt-0.5 shrink-0" size={16} />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Sync Button */}
          <div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-primary flex items-center gap-2"
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing Players...' : 'Sync Players from Tank01'}
            </button>
            <p className="text-slate-500 text-xs mt-2">
              Fetches all NFL players from the Tank01 API and upserts them into the database.
              Rate-limited to once per minute.
            </p>
          </div>
        </div>

        {/* Info Card */}
        <div className="card">
          <h2 className="text-white font-bold mb-3">About Player Sync</h2>
          <div className="space-y-2 text-sm text-slate-400">
            <p>The sync pulls the full NFL player list from <span className="text-brand-400">Tank01</span> and upserts records in batches of 500.</p>
            <p>Only fantasy-eligible positions are stored: <span className="text-white">QB, RB, WR, TE, K, DEF</span>. Non-fantasy positions (OL, DL, LB, etc.) are skipped.</p>
            <p>Existing player records are updated with the latest injury status, team, and headshot.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
