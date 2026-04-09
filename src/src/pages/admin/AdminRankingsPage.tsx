import { useState, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

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

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function AdminRankingsPage() {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setResult(data as ImportResult);
      toast.success(`Import complete: ${data.matched} matched`);
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
    </div>
  );
}
