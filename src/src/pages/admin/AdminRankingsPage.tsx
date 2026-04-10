import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ListOrdered,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

interface FailureDetail {
  rank: number;
  player: string;
  pos: string | null;
  team: string | null;
  reason: string;
}

interface ImportResult {
  total: number;
  matched: number;
  failed: number;
  failures: FailureDetail[];
}

interface RankedPlayer {
  id: string;
  name: string;
  position: string | null;
  nfl_team: string | null;
  status: string | null;
  adp: number | null;
  value_rank: number | null;
  headshot_url: string | null;
  updated_at: string | null;
}

interface PlayersResponse {
  players: RankedPlayer[];
  total: number;
  limit: number;
  offset: number;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';
const PAGE_SIZE = 25;
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
type PositionFilter = (typeof POSITIONS)[number];

export default function AdminRankingsPage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Ranked players table state ─────────────────────────────
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [page, setPage] = useState(0);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [rankedOnly, setRankedOnly] = useState(true);

  // Debounce the search input so we don't hammer the API on every keystroke
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchPlayers = useCallback(async () => {
    setTableLoading(true);
    setTableError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sortBy: 'value_rank',
      });
      if (positionFilter !== 'ALL') params.set('position', positionFilter);
      if (searchQuery) params.set('q', searchQuery);
      if (rankedOnly) params.set('rankedOnly', 'true');

      const response = await fetch(`${API_URL}/players?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      const payload = data as PlayersResponse;
      setPlayers(payload.players);
      setTotalPlayers(payload.total);
    } catch (err) {
      setTableError(err instanceof Error ? err.message : 'Failed to load players');
      setPlayers([]);
      setTotalPlayers(0);
    } finally {
      setTableLoading(false);
    }
  }, [token, page, positionFilter, searchQuery, rankedOnly]);

  // Fetch whenever filters/page change, and on first mount
  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
  }

  async function handleImport() {
    if (!selectedFile) {
      toast.error('Please select a CSV file first');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('rankings', selectedFile);

      const response = await fetch(`${API_URL}/admin/rankings/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        // Surface the full server error: short `error` plus the `detail`
        // (and `hint`, if Supabase supplied one) so admins can diagnose
        // DB issues without having to dig through Render logs.
        const parts = [data.error || `HTTP ${response.status}`];
        if (data.detail) parts.push(data.detail);
        if (data.hint) parts.push(`Hint: ${data.hint}`);
        throw new Error(parts.join(' — '));
      }

      setResult(data as ImportResult);
      toast.success(`Import complete: ${data.matched} matched`);
      // Refresh the player table so the new rankings appear right away
      setPage(0);
      fetchPlayers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSelectedFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Import Rankings</h1>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
        <h2 className="text-white font-semibold mb-2 flex items-center gap-2">
          <FileText size={18} className="text-brand-400" />
          CSV Format
        </h2>
        <p className="text-slate-400 text-sm mb-3">
          Upload a CSV with the following columns (headers are case-insensitive):
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            { col: 'RK', desc: 'Integer rank (required)' },
            { col: 'PLAYER', desc: 'Player name (required)' },
            { col: 'POS', desc: 'Position: QB/RB/WR/TE/K/DEF (optional)' },
            { col: 'TEAM', desc: 'NFL team abbreviation e.g. KC (optional)' },
          ].map(({ col, desc }) => (
            <div key={col} className="bg-slate-700/50 rounded-lg p-3">
              <div className="font-mono text-brand-400 font-bold mb-1">{col}</div>
              <div className="text-slate-400 text-xs">{desc}</div>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-xs mt-3">
          POS and TEAM improve match accuracy but are not required. DST and D/ST are treated as DEF.
        </p>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
        <h2 className="text-white font-semibold mb-4">Upload File</h2>

        <div
          className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-brand-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={32} className="mx-auto text-slate-500 mb-3" />
          {selectedFile ? (
            <div>
              <p className="text-white font-medium">{selectedFile.name}</p>
              <p className="text-slate-400 text-sm mt-1">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-slate-400">Click to select a CSV file</p>
              <p className="text-slate-500 text-sm mt-1">Max 2 MB</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleImport}
            disabled={!selectedFile || loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {loading ? 'Importing...' : 'Import Rankings'}
          </button>
          {(selectedFile || result) && (
            <button onClick={handleReset} className="btn-secondary">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Import Results</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{result.total}</div>
              <div className="text-slate-400 text-sm mt-1">Total Rows</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400 flex items-center justify-center gap-2">
                <CheckCircle size={20} />
                {result.matched}
              </div>
              <div className="text-slate-400 text-sm mt-1">Matched</div>
            </div>
            <div className={`rounded-lg p-4 text-center ${result.failed > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-slate-700/50'}`}>
              <div className={`text-2xl font-bold flex items-center justify-center gap-2 ${result.failed > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {result.failed > 0 ? <XCircle size={20} /> : <CheckCircle size={20} />}
                {result.failed}
              </div>
              <div className="text-slate-400 text-sm mt-1">Failed</div>
            </div>
          </div>

          {result.failures.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-amber-400 font-medium mb-3">
                <AlertTriangle size={16} />
                Unmatched Players ({result.failures.length})
              </div>
              <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                <div className="grid grid-cols-[3rem_1fr_4rem_4rem_1fr] text-xs text-slate-500 font-medium px-4 py-2 border-b border-slate-700">
                  <span>Rank</span>
                  <span>Player</span>
                  <span>Pos</span>
                  <span>Team</span>
                  <span>Reason</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {result.failures.map((f, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[3rem_1fr_4rem_4rem_1fr] text-sm px-4 py-2 border-b border-slate-800 last:border-0 hover:bg-slate-800/50"
                    >
                      <span className="text-slate-400">{f.rank}</span>
                      <span className="text-white">{f.player}</span>
                      <span className="text-slate-400">{f.pos ?? '—'}</span>
                      <span className="text-slate-400">{f.team ?? '—'}</span>
                      <span className="text-red-400 text-xs">{f.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Current rankings table ───────────────────────────── */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mt-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <ListOrdered size={18} className="text-brand-400" />
            Current Player Rankings
            <span className="text-slate-500 text-sm font-normal">
              ({totalPlayers.toLocaleString()} {rankedOnly ? 'ranked' : 'total'})
            </span>
          </h2>
          <button
            onClick={() => fetchPlayers()}
            disabled={tableLoading}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} className={tableLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
            {POSITIONS.map((pos) => (
              <button
                key={pos}
                onClick={() => {
                  setPositionFilter(pos);
                  setPage(0);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  positionFilter === pos
                    ? 'bg-brand-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by player name..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rankedOnly}
              onChange={(e) => {
                setRankedOnly(e.target.checked);
                setPage(0);
              }}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-brand-500 focus:ring-brand-500"
            />
            Ranked only
          </label>
        </div>

        {/* Table */}
        {tableError ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
            {tableError}
          </div>
        ) : (
          <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
            <div className="grid grid-cols-[4rem_1fr_4rem_5rem_5rem_6rem] text-xs text-slate-500 font-medium px-4 py-2 border-b border-slate-700 sticky top-0 bg-slate-900">
              <span>Rank</span>
              <span>Player</span>
              <span>Pos</span>
              <span>Team</span>
              <span className="text-right">ADP</span>
              <span>Status</span>
            </div>
            <div className="max-h-[32rem] overflow-y-auto">
              {tableLoading && players.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-500 text-sm">
                  Loading players...
                </div>
              ) : players.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-500 text-sm">
                  No players match the current filters.
                </div>
              ) : (
                players.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-[4rem_1fr_4rem_5rem_5rem_6rem] text-sm px-4 py-2 border-b border-slate-800 last:border-0 hover:bg-slate-800/50 items-center"
                  >
                    <span className="text-brand-400 font-mono font-semibold">
                      {p.value_rank ?? '—'}
                    </span>
                    <span className="text-white truncate">{p.name}</span>
                    <span className="text-slate-400">{p.position ?? '—'}</span>
                    <span className="text-slate-400">{p.nfl_team ?? 'FA'}</span>
                    <span className="text-slate-400 text-right tabular-nums">
                      {p.adp != null ? p.adp.toFixed(1) : '—'}
                    </span>
                    <span className="text-slate-500 text-xs truncate">
                      {p.status ?? 'active'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPlayers > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
            <div>
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, totalPlayers)} of{' '}
              {totalPlayers.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || tableLoading}
                className="btn-secondary px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="px-2">
                Page {page + 1} of {Math.max(1, Math.ceil(totalPlayers / PAGE_SIZE))}
              </span>
              <button
                onClick={() =>
                  setPage((p) =>
                    (p + 1) * PAGE_SIZE < totalPlayers ? p + 1 : p
                  )
                }
                disabled={(page + 1) * PAGE_SIZE >= totalPlayers || tableLoading}
                className="btn-secondary px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
