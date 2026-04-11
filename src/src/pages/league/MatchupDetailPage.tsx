import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Trophy } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet } from '../../utils/api';
import { League } from '../LeaguePage';

interface PlayerRef {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  status: string | null;
  headshot_url: string | null;
}

interface ProjectionRef {
  season: number;
  proj_fantasy_pts_ppr: number | null;
  proj_ppg_ppr: number | null;
  bye_week: number | null;
}

interface Starter {
  roster_id: string;
  slot: string;
  player: PlayerRef | null;
  projection: ProjectionRef | null;
}

interface Lineup {
  starters: Starter[];
  projected_total: number;
}

interface TeamInfo {
  id: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for?: number;
  user: { id: string; display_name: string; avatar_url?: string };
}

interface MatchupDetailResponse {
  week: number;
  season: number;
  league_status: string;
  matchup: {
    id: string;
    week: number;
    home_score: number;
    away_score: number;
    is_final: boolean;
    is_playoff: boolean;
    winner_team_id: string | null;
    home_team: TeamInfo;
    away_team: TeamInfo;
  };
  home_lineup: Lineup | null;
  away_lineup: Lineup | null;
}

// Canonical slot ordering for side-by-side display
const SLOT_ORDER = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'WR3', 'TE', 'FLEX', 'K', 'DEF'];
const SLOT_LABEL: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  RB2: 'RB',
  WR: 'WR',
  WR2: 'WR',
  WR3: 'WR',
  TE: 'TE',
  FLEX: 'FLEX',
  K: 'K',
  DEF: 'DEF',
};

export default function MatchupDetailPage({ league }: { league: League }) {
  const { matchupId } = useParams<{ matchupId: string }>();
  const { token, user } = useAuthStore();
  const [data, setData] = useState<MatchupDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !matchupId) return;
    try {
      const res = await apiGet<MatchupDetailResponse>(
        `/leagues/${league.id}/matchups/${matchupId}`,
        token
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matchup');
    } finally {
      setLoading(false);
    }
  }, [league.id, token, matchupId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gridiron-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error || 'Matchup not found'}</p>
        <Link
          to={`/leagues/${league.id}/matchups`}
          className="text-gridiron-gold text-sm mt-4 inline-block"
        >
          ← Back to matchups
        </Link>
      </div>
    );
  }

  const { matchup, home_lineup, away_lineup } = data;
  const homeTeam = matchup.home_team;
  const awayTeam = matchup.away_team;

  const isMyMatchup =
    homeTeam?.user?.id === user?.id || awayTeam?.user?.id === user?.id;

  // Align starters side-by-side by SLOT_ORDER
  const homeByIdx = new Map<number, Starter>();
  const awayByIdx = new Map<number, Starter>();
  (home_lineup?.starters || []).forEach((s) => {
    const idx = SLOT_ORDER.indexOf(s.slot);
    if (idx >= 0) homeByIdx.set(idx, s);
  });
  (away_lineup?.starters || []).forEach((s) => {
    const idx = SLOT_ORDER.indexOf(s.slot);
    if (idx >= 0) awayByIdx.set(idx, s);
  });

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        to={`/leagues/${league.id}/matchups`}
        className="inline-flex items-center gap-1 text-slate-400 hover:text-gridiron-gold text-sm transition-colors"
      >
        <ChevronLeft size={16} /> Back to matchups
      </Link>

      {/* Header: team vs team totals */}
      <div
        className={`card ${
          isMyMatchup ? 'border-gridiron-gold/40 bg-gridiron-gold/5' : ''
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-slate-400 text-xs uppercase tracking-wide">
            Week {matchup.week}
          </div>
          <div className="flex items-center gap-2">
            {matchup.is_playoff && (
              <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/30">
                Playoffs
              </span>
            )}
            {isMyMatchup && (
              <span className="text-xs bg-gridiron-gold/20 text-gridiron-gold px-2 py-0.5 rounded-full border border-gridiron-gold/30">
                Your Matchup
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 items-center gap-4">
          <TeamHeader team={homeTeam} align="right" />
          <div className="text-center">
            <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">
              {matchup.is_final ? 'Final' : 'Projected'}
            </div>
            <div className="flex items-center justify-center gap-3">
              <span
                className={`text-3xl font-bold tabular-nums ${
                  matchup.is_final && matchup.winner_team_id === homeTeam?.id
                    ? 'text-gridiron-gold'
                    : matchup.is_final
                    ? 'text-slate-500'
                    : 'text-white'
                }`}
              >
                {Number(
                  matchup.is_final ? matchup.home_score : home_lineup?.projected_total || 0
                ).toFixed(1)}
              </span>
              <span className="text-slate-600 text-sm">—</span>
              <span
                className={`text-3xl font-bold tabular-nums ${
                  matchup.is_final && matchup.winner_team_id === awayTeam?.id
                    ? 'text-gridiron-gold'
                    : matchup.is_final
                    ? 'text-slate-500'
                    : 'text-white'
                }`}
              >
                {Number(
                  matchup.is_final ? matchup.away_score : away_lineup?.projected_total || 0
                ).toFixed(1)}
              </span>
            </div>
          </div>
          <TeamHeader team={awayTeam} align="left" />
        </div>

        {matchup.is_final && matchup.winner_team_id && (
          <div className="mt-4 text-center">
            <span className="text-xs text-gridiron-gold flex items-center justify-center gap-1">
              <Trophy size={12} />
              {matchup.winner_team_id === homeTeam?.id
                ? homeTeam?.team_name
                : awayTeam?.team_name}{' '}
              wins
            </span>
          </div>
        )}
      </div>

      {/* Lineups side-by-side */}
      <div className="card">
        <h2 className="text-white font-bold text-lg mb-3">Starting Lineups</h2>
        <div className="divide-y divide-slate-800">
          {SLOT_ORDER.map((slot, idx) => {
            const homeStart = homeByIdx.get(idx);
            const awayStart = awayByIdx.get(idx);
            return (
              <div
                key={slot}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2"
              >
                <LineupCell starter={homeStart} align="right" />
                <div className="text-slate-500 text-xs uppercase tracking-wider font-semibold text-center w-12">
                  {SLOT_LABEL[slot] || slot}
                </div>
                <LineupCell starter={awayStart} align="left" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Play bar placeholder — cards wiring lands in a follow-up */}
      <div className="card border-dashed border-slate-700 bg-slate-900/50">
        <div className="text-center text-slate-500 text-sm">
          🃏 Card play bar coming soon — Switcheroo / Buff / Debuff / Wild
        </div>
      </div>
    </div>
  );
}

function TeamHeader({ team, align }: { team: TeamInfo; align: 'left' | 'right' }) {
  return (
    <div
      className={`flex items-center gap-3 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <div className="w-12 h-12 rounded-full bg-brand-800 flex items-center justify-center text-lg font-bold text-white shrink-0">
        {team?.user?.display_name?.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="text-white font-bold text-base truncate">
          {team?.team_name || 'TBD'}
        </div>
        <div className="text-slate-400 text-xs truncate">
          {team?.user?.display_name}
        </div>
        <div className="text-slate-500 text-xs">
          {team?.wins}–{team?.losses}
          {team?.ties > 0 ? `–${team.ties}` : ''}
        </div>
      </div>
    </div>
  );
}

function LineupCell({ starter, align }: { starter: Starter | undefined; align: 'left' | 'right' }) {
  if (!starter || !starter.player) {
    return (
      <div className={`text-slate-600 text-sm ${align === 'right' ? 'text-right' : ''}`}>
        —
      </div>
    );
  }
  const p = starter.player;
  const proj = starter.projection?.proj_ppg_ppr ?? null;
  const bye = starter.projection?.bye_week ?? null;

  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-white text-sm font-medium truncate">{p.name}</div>
        <div className="text-slate-500 text-xs truncate">
          {p.position} &middot; {p.nfl_team || 'FA'}
          {bye ? ` · Bye ${bye}` : ''}
        </div>
      </div>
      <div className="text-right shrink-0 w-14">
        <div className="text-white text-sm font-semibold tabular-nums">
          {proj != null ? Number(proj).toFixed(1) : '—'}
        </div>
        <div className="text-slate-600 text-[10px] uppercase tracking-wide">proj</div>
      </div>
    </div>
  );
}
