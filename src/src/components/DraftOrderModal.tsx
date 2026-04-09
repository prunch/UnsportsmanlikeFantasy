/**
 * DraftOrderModal
 *
 * Lets users drag-and-drop their position priority list before (or during) a
 * draft.  Saves preferences via PUT /api/users/me/draft-order/:leagueId.
 *
 * Props:
 *   leagueId   - the league whose team settings to update
 *   token      - auth JWT
 *   onClose    - close handler
 *   onSaved    - optional callback after a successful save
 */

import { useState, useEffect, useRef } from 'react';
import { apiGet, apiPut } from '../utils/api';
import toast from 'react-hot-toast';
import { GripVertical, X, Save, Zap } from 'lucide-react';

interface DraftOrderPrefs {
  teamId: string;
  draftOrder: string[];
  autoPickEnabled: boolean;
}

interface Props {
  leagueId: string;
  token: string;
  onClose: () => void;
  onSaved?: (prefs: DraftOrderPrefs) => void;
}

const POSITION_COLORS: Record<string, string> = {
  QB:  'bg-red-500/20 text-red-400 border-red-500/40',
  RB:  'bg-blue-500/20 text-blue-400 border-blue-500/40',
  WR:  'bg-green-500/20 text-green-400 border-green-500/40',
  TE:  'bg-purple-500/20 text-purple-400 border-purple-500/40',
  K:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  DEF: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
};

const POSITION_LABELS: Record<string, string> = {
  QB:  'Quarterback',
  RB:  'Running Back',
  WR:  'Wide Receiver',
  TE:  'Tight End',
  K:   'Kicker',
  DEF: 'Defense / ST',
};

export default function DraftOrderModal({ leagueId, token, onClose, onSaved }: Props) {
  const [order, setOrder] = useState<string[]>(['RB', 'WR', 'QB', 'TE', 'K', 'DEF']);
  const [autoPickEnabled, setAutoPickEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Drag state
  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<DraftOrderPrefs>(
          `/users/me/draft-order/${leagueId}`,
          token
        );
        setOrder(data.draftOrder);
        setAutoPickEnabled(data.autoPickEnabled);
      } catch {
        // use defaults silently
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId, token]);

  // ── Drag handlers ────────────────────────────────────────────────────────────

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragEnter(index: number) {
    dragOverIndex.current = index;
    if (dragIndex.current === null || dragIndex.current === index) return;

    const newOrder = [...order];
    const dragged = newOrder.splice(dragIndex.current, 1)[0];
    newOrder.splice(index, 0, dragged);
    dragIndex.current = index;
    setOrder(newOrder);
  }

  function handleDragEnd() {
    dragIndex.current = null;
    dragOverIndex.current = null;
  }

  // ── Touch / pointer fallback (mobile) ────────────────────────────────────────

  const touchStartY = useRef<number>(0);
  const touchStartIndex = useRef<number | null>(null);

  function handleTouchStart(e: React.TouchEvent, index: number) {
    touchStartY.current = e.touches[0].clientY;
    touchStartIndex.current = index;
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault(); // prevent page scroll while dragging
    const deltaY = e.touches[0].clientY - touchStartY.current;
    const itemHeight = 56; // approximate px height per row
    const steps = Math.round(deltaY / itemHeight);
    if (steps === 0 || touchStartIndex.current === null) return;
    const from = touchStartIndex.current;
    const to = Math.max(0, Math.min(order.length - 1, from + steps));
    if (to === from) return;
    const newOrder = [...order];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, moved);
    touchStartIndex.current = to;
    touchStartY.current = e.touches[0].clientY;
    setOrder(newOrder);
  }

  function handleTouchEnd() {
    touchStartIndex.current = null;
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const data = await apiPut<DraftOrderPrefs>(
        `/users/me/draft-order/${leagueId}`,
        { draftOrder: order, autoPickEnabled },
        token
      );
      toast.success('Draft preferences saved!');
      onSaved?.(data);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-bold text-lg">Draft Preferences</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Drag to rank the positions you want prioritized during auto-pick
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-14 bg-slate-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                Position Priority — #1 is highest
              </p>

              <ul className="space-y-2 select-none">
                {order.map((pos, idx) => (
                  <li
                    key={pos}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragEnter={() => handleDragEnter(idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => e.preventDefault()}
                    onTouchStart={e => handleTouchStart(e, idx)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-xl border cursor-grab active:cursor-grabbing
                      transition-all duration-150
                      ${POSITION_COLORS[pos] || 'bg-slate-800 text-slate-300 border-slate-700'}
                    `}
                  >
                    <GripVertical size={18} className="opacity-50 flex-shrink-0" />
                    <span className="w-6 text-center text-xs font-bold opacity-60">#{idx + 1}</span>
                    <span className="w-10 text-center font-bold text-sm">{pos}</span>
                    <span className="flex-1 text-sm opacity-80">{POSITION_LABELS[pos]}</span>
                  </li>
                ))}
              </ul>

              {/* Auto-pick toggle */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={autoPickEnabled}
                      onChange={e => setAutoPickEnabled(e.target.checked)}
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${autoPickEnabled ? 'bg-gridiron-gold' : 'bg-slate-700'}`} />
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoPickEnabled ? 'translate-x-5' : ''}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-white font-medium text-sm">
                      <Zap size={14} className={autoPickEnabled ? 'text-gridiron-gold' : 'text-slate-400'} />
                      Always Auto-Pick
                    </div>
                    <p className="text-slate-400 text-xs">
                      Skip your turn and always use these preferences automatically
                    </p>
                  </div>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 btn-primary flex items-center justify-center gap-2"
          >
            <Save size={15} />
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
