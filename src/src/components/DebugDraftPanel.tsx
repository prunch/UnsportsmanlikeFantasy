// DEBUG-ONLY: REMOVE FOR PROD
// Debug panel for testing the fantasy football draft system.
// Only renders when VITE_DEBUG_DRAFT=true.

import { useState, useRef, useCallback, useEffect } from 'react';

// DEBUG-ONLY: REMOVE FOR PROD
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_DRAFT === 'true';

interface LogEntry {
  time: string;
  msg: string;
  type: 'info' | 'success' | 'error';
}

// DEBUG-ONLY: REMOVE FOR PROD
export default function DebugDraftPanel() {
  if (!DEBUG_ENABLED) return null; // DEBUG-ONLY: REMOVE FOR PROD

  const [leagueId, setLeagueId] = useState('');
  const [speed, setSpeed] = useState<'1000' | '2000' | '5000' | '0'>('2000');
  const [autoRunning, setAutoRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const autoRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLog(prev => [...prev.slice(-99), { time, msg, type }]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // DEBUG-ONLY: REMOVE FOR PROD
  async function apiCall(method: string, path: string, body?: object) {
    try {
      const res = await fetch(`${API_BASE}/debug${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  // DEBUG-ONLY: REMOVE FOR PROD
  async function handleCreateLeague() {
    try {
      addLog('Creating dummy league…');
      const data = await apiCall('POST', '/create-dummy-league', {});
      setLeagueId(data.league.id);
      addLog(`✅ Created: ${data.league.name} (${data.league.id})`, 'success');
      addLog(`   ${data.teamCount} teams ready`);
    } catch (err) {
      addLog(`❌ Create failed: ${(err as Error).message}`, 'error');
    }
  }

  // DEBUG-ONLY: REMOVE FOR PROD
  async function handleForcePick() {
    if (!leagueId) { addLog('❌ No league ID set', 'error'); return; }
    try {
      const data = await apiCall('POST', `/force-pick/${leagueId}`);
      if (data.draftComplete) {
        addLog(`🏁 Draft complete! Last pick: ${data.player.name} (${data.player.position}) → ${data.team.team_name}`, 'success');
        setAutoRunning(false);
        autoRef.current = false;
      } else {
        addLog(`Pick #${data.pickNumber}: ${data.team.team_name} → ${data.player.name} (${data.player.position}) [${data.slot}] — ${data.remainingPicks} left`, 'success');
      }
      return data;
    } catch (err) {
      addLog(`❌ Force pick failed: ${(err as Error).message}`, 'error');
      return null;
    }
  }

  // DEBUG-ONLY: REMOVE FOR PROD
  async function handleResetDraft() {
    if (!leagueId) { addLog('❌ No league ID set', 'error'); return; }
    try {
      autoRef.current = false;
      setAutoRunning(false);
      addLog('Resetting draft…');
      const data = await apiCall('POST', `/reset-draft/${leagueId}`);
      addLog(`✅ ${data.message}`, 'success');
    } catch (err) {
      addLog(`❌ Reset failed: ${(err as Error).message}`, 'error');
    }
  }

  // DEBUG-ONLY: REMOVE FOR PROD
  async function handleDeleteLeague() {
    if (!leagueId) { addLog('❌ No league ID set', 'error'); return; }
    try {
      autoRef.current = false;
      setAutoRunning(false);
      addLog(`Deleting league ${leagueId}…`);
      const data = await apiCall('DELETE', `/cleanup/${leagueId}`);
      addLog(`✅ ${data.message}`, 'success');
      setLeagueId('');
    } catch (err) {
      addLog(`❌ Delete failed: ${(err as Error).message}`, 'error');
    }
  }

  // DEBUG-ONLY: REMOVE FOR PROD
  async function runAutoPickLoop() {
    autoRef.current = true;
    setAutoRunning(true);
    addLog(`▶ Auto-pick started (${speed === '0' ? 'instant' : speed + 'ms interval'})`);

    while (autoRef.current) {
      const result = await handleForcePick();
      if (!result || result.draftComplete) break;

      if (speed === '0') {
        // Instant — yield to allow UI updates between iterations
        await new Promise(r => setTimeout(r, 10));
      } else {
        await new Promise(r => setTimeout(r, parseInt(speed)));
      }
    }

    if (autoRef.current) {
      autoRef.current = false;
      setAutoRunning(false);
      addLog('⏹ Auto-pick finished');
    }
  }

  // DEBUG-ONLY: REMOVE FOR PROD
  function handleAutoToggle() {
    if (autoRunning) {
      autoRef.current = false;
      setAutoRunning(false);
      addLog('⏸ Auto-pick paused');
    } else {
      if (!leagueId) { addLog('❌ No league ID set', 'error'); return; }
      runAutoPickLoop();
    }
  }

  const logColor = (type: LogEntry['type']) => {
    if (type === 'success') return '#4ade80';
    if (type === 'error') return '#f87171';
    return '#e5e7eb';
  };

  // DEBUG-ONLY: REMOVE FOR PROD
  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 9999,
      width: collapsed ? 'auto' : 360,
      background: '#1a1a1a',
      border: '2px solid #facc15',
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#e5e7eb',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      userSelect: 'none'
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: '6px 10px',
          background: '#facc15',
          color: '#000',
          fontWeight: 'bold',
          cursor: 'pointer',
          borderRadius: collapsed ? 6 : '6px 6px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span>🐛 DEBUG DRAFT</span>
        <span style={{ fontSize: 10 }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* League ID input */}
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={leagueId}
              onChange={e => setLeagueId(e.target.value)}
              placeholder="League ID"
              style={{
                flex: 1,
                padding: '4px 6px',
                background: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#e5e7eb',
                fontFamily: 'monospace',
                fontSize: 11
              }}
            />
          </div>

          {/* Speed selector */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ color: '#9ca3af', minWidth: 50 }}>Speed:</span>
            {(['1000', '2000', '5000', '0'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                style={{
                  padding: '2px 8px',
                  background: speed === s ? '#facc15' : '#333',
                  color: speed === s ? '#000' : '#e5e7eb',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'monospace'
                }}
              >
                {s === '0' ? 'Instant' : s === '1000' ? '1s' : s === '2000' ? '2s' : '5s'}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <button onClick={handleCreateLeague} style={btnStyle('#22c55e', '#000')}>
              ➕ Create League
            </button>
            <button onClick={handleForcePick} style={btnStyle('#3b82f6', '#fff')}>
              ⚡ Force Pick
            </button>
            <button onClick={handleAutoToggle} style={btnStyle(autoRunning ? '#f59e0b' : '#6366f1', '#fff')}>
              {autoRunning ? '⏸ Pause Auto' : '▶ Auto-Pick'}
            </button>
            <button onClick={handleResetDraft} style={btnStyle('#6b7280', '#fff')}>
              🔄 Reset Draft
            </button>
            <button onClick={handleDeleteLeague} style={{ ...btnStyle('#ef4444', '#fff'), gridColumn: '1 / -1' }}>
              🗑 Delete League
            </button>
          </div>

          {/* Activity log */}
          <div style={{
            height: 120,
            overflowY: 'auto',
            background: '#0d0d0d',
            border: '1px solid #333',
            borderRadius: 4,
            padding: '4px 6px',
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}>
            {log.length === 0 && (
              <span style={{ color: '#4b5563' }}>No activity yet…</span>
            )}
            {log.map((entry, i) => (
              <div key={i} style={{ color: logColor(entry.type), lineHeight: 1.4 }}>
                <span style={{ color: '#4b5563' }}>{entry.time} </span>
                {entry.msg}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* Clear log */}
          <button
            onClick={() => setLog([])}
            style={{ ...btnStyle('#374151', '#9ca3af'), fontSize: 10 }}
          >
            Clear Log
          </button>
        </div>
      )}
    </div>
  );
}

// DEBUG-ONLY: REMOVE FOR PROD
function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '5px 8px',
    background: bg,
    color,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold'
  };
}
