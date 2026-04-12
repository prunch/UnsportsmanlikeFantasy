import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiGet, apiPost } from '../utils/api';
import toast from 'react-hot-toast';
import { Layers, Zap, Shield, Eye, RefreshCw, Target } from 'lucide-react';
import CardStack, { UserCard } from '../components/cards/CardStack';
import CardPlaySlot, { PlaySlot } from '../components/cards/CardPlaySlot';
import CardReveal from '../components/cards/CardReveal';
import { CardData } from '../components/cards/Card';

interface PlayedCardEntry {
  id: string;
  user_id: string;
  card_id: string;
  card: CardData;
  play_slot: 'own_team' | 'opponent' | 'any_team';
  target_player_id: string | null;
  played_at: string;
  revealed_at: string | null;
}

interface PlayedCardsResponse {
  week: number;
  season: number;
  kickoff_passed: boolean;
  plays: PlayedCardEntry[];
}

interface SwitcherooStatus {
  protected_player_id: string | null;
  used_this_week: boolean;
  last_used_week: number | null;
  restricted_player_id: string | null;
  available: boolean;
}

// Play card modal state
interface PlayIntent {
  userCard: UserCard;
  slot: PlaySlot;
}

type DeckTab = 'stack' | 'play' | 'played' | 'switcheroo';

export default function CardDeckPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { token, user } = useAuthStore();

  const [tab, setTab] = useState<DeckTab>('stack');
  const [stack, setStack] = useState<UserCard[]>([]);
  const [playedData, setPlayedData] = useState<PlayedCardsResponse | null>(null);
  const [switcheroo, setSwitcheroo] = useState<SwitcherooStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [playIntent, setPlayIntent] = useState<PlayIntent | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [switcherooPlayer, setSwitcherooPlayer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Derive played cards per slot
  const myPlays = (playedData?.plays || []).filter(p => p.user_id === user?.id);
  const playedBySlot: Record<PlaySlot, UserCard | null> = {
    own_team: null,
    opponent: null,
    any_team: null
  };
  myPlays.forEach(p => {
    const slot = p.play_slot as PlaySlot;
    if (!playedBySlot[slot]) {
      // Convert PlayedCardEntry to UserCard shape for display
      playedBySlot[slot] = {
        id: p.id,
        user_id: p.user_id,
        league_id: leagueId!,
        card_id: p.card_id,
        card: p.card,
        obtained_at: p.played_at,
        played_at: p.played_at
      };
    }
  });

  useEffect(() => {
    loadAll();
  }, [leagueId]);

  async function loadAll() {
    if (!leagueId) return;
    setLoading(true);
    try {
      const [stackData, playedResponse, switcherooData] = await Promise.all([
        apiGet<UserCard[]>(`/leagues/${leagueId}/cards`, token || undefined),
        apiGet<PlayedCardsResponse>(`/leagues/${leagueId}/cards/played`, token || undefined),
        apiGet<SwitcherooStatus>(`/leagues/${leagueId}/switcheroo`, token || undefined)
      ]);
      setStack(stackData);
      setPlayedData(playedResponse);
      setSwitcheroo(switcherooData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load card data');
    } finally {
      setLoading(false);
    }
  }

  function handleInitPlay(userCard: UserCard) {
    setTab('play');
    // Just open the play tab; user selects slot there
    toast('Select a slot to play this card', { icon: '🎯' });
  }

  function handleSlotClick(slot: PlaySlot) {
    if (stack.length === 0) {
      toast.error('Your card stack is empty');
      return;
    }
    // Show the first available card as play intent
    const firstCard = stack[0];
    setPlayIntent({ userCard: firstCard, slot });
  }

  async function handlePlayCard() {
    if (!playIntent || !leagueId) return;
    setSubmitting(true);
    try {
      await apiPost(`/leagues/${leagueId}/cards/play`, {
        user_card_id: playIntent.userCard.id,
        play_slot: playIntent.slot,
        target_player_id: targetPlayerId || undefined
      }, token || undefined);
      toast.success('Card played!');
      setPlayIntent(null);
      setTargetPlayerId('');
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to play card');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSwitcheroo() {
    if (!leagueId || !switcherooPlayer.trim()) {
      toast.error('Enter a player ID to protect');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost(`/leagues/${leagueId}/switcheroo`, {
        player_id: switcherooPlayer.trim()
      }, token || undefined);
      toast.success('Switcheroo activated! Player protected.');
      setSwitcherooPlayer('');
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to play Switcheroo');
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { key: DeckTab; label: string; icon: React.ReactNode }[] = [
    { key: 'stack', label: 'My Stack', icon: <Layers size={15} /> },
    { key: 'play', label: 'Play Cards', icon: <Zap size={15} /> },
    { key: 'played', label: 'Played This Week', icon: <Eye size={15} /> },
    { key: 'switcheroo', label: 'Switcheroo', icon: <Shield size={15} /> }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap size={22} className="text-gridiron-gold" />
            Card Deck
          </h2>
          {playedData && (
            <p className="text-slate-400 text-sm mt-1">Week {playedData.week} · {stack.length}/6 cards in stack</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadAll}
            disabled={loading}
            className="btn-secondary text-sm py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            to={`/leagues/${leagueId}/cards/play`}
            className="btn-primary text-sm py-1.5 flex items-center gap-1.5"
          >
            <Target size={14} />
            Play Cards
          </Link>
          <Link
            to={`/leagues/${leagueId}/cards/pick`}
            className="btn-secondary text-sm py-1.5"
          >
            + Pick Cards
          </Link>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === t.key
                ? 'border-gridiron-gold text-gridiron-gold'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="space-y-3">
          <div className="h-4 bg-slate-700 rounded w-1/4 animate-pulse" />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-52 bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Stack tab */}
          {tab === 'stack' && (
            <CardStack
              cards={stack}
              onPlayCard={handleInitPlay}
            />
          )}

          {/* Play tab */}
          {tab === 'play' && (
            <div className="space-y-6">
              <p className="text-slate-400 text-sm">
                You have <strong className="text-white">{stack.length}</strong> card{stack.length !== 1 ? 's' : ''} to play.
                Each slot can hold 1 card per week.
              </p>

              {/* Play intent modal */}
              {playIntent && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
                    <h3 className="text-white font-bold text-lg">Play Card</h3>
                    <p className="text-slate-400 text-sm">
                      Playing <strong className="text-white">{playIntent.userCard.card.title}</strong> in the{' '}
                      <strong className="text-gridiron-gold">{playIntent.slot.replace('_', ' ')}</strong> slot.
                    </p>
                    <div>
                      <label className="label">Target Player ID (optional)</label>
                      <input
                        className="input"
                        value={targetPlayerId}
                        onChange={e => setTargetPlayerId(e.target.value)}
                        placeholder="e.g. 4046 (Tank01 player ID)"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Leave blank for position-wide / all cards
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handlePlayCard}
                        disabled={submitting}
                        className="btn-primary flex-1 disabled:opacity-50"
                      >
                        {submitting ? 'Playing...' : 'Play Card'}
                      </button>
                      <button
                        onClick={() => { setPlayIntent(null); setTargetPlayerId(''); }}
                        className="btn-secondary flex-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Three play slots */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(['own_team', 'opponent', 'any_team'] as PlaySlot[]).map(slot => (
                  <CardPlaySlot
                    key={slot}
                    slot={slot}
                    playedCard={playedBySlot[slot]}
                    onPlay={handleSlotClick}
                    disabled={stack.length === 0 || !!playedBySlot[slot]}
                  />
                ))}
              </div>

              {stack.length > 0 && !playIntent && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <h4 className="text-white font-medium mb-3 text-sm">Your Stack — click a slot above or pick a card to play:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {stack.map(uc => (
                      <div key={uc.id} className="text-center">
                        <div className="text-xs text-white font-medium mb-1 truncate">{uc.card.title}</div>
                        <div className="text-xs text-slate-500">{uc.card.effect_type} · {uc.card.rarity}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Played this week tab */}
          {tab === 'played' && playedData && (
            <CardReveal
              plays={playedData.plays}
              kickoffPassed={playedData.kickoff_passed}
              currentUserId={user?.id || ''}
            />
          )}

          {/* Switcheroo tab */}
          {tab === 'switcheroo' && (
            <div className="space-y-6">
              {/* Switcheroo description */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield size={20} className="text-gridiron-gold" />
                  <h3 className="text-white font-bold text-lg">The Ole Switcheroo</h3>
                  <span className="text-xs bg-gridiron-gold/10 text-gridiron-gold border border-gridiron-gold/30 px-2 py-0.5 rounded-full">
                    Permanent Card
                  </span>
                </div>
                <p className="text-slate-400 text-sm">
                  Protect one player on your roster. Any debuff played on that player this week will be 
                  reflected back onto the opponent who played it (targeting their equivalent position).
                </p>
                <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
                  <li>1 use per week</li>
                  <li>Cannot target the same player 2 weeks in a row</li>
                  <li>Never expires or burns</li>
                  <li>Does not count toward your 6-card stack limit</li>
                </ul>
              </div>

              {/* Current status */}
              {switcheroo && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                  <h4 className="text-white font-medium">This Week's Status</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Available:</span>{' '}
                      <span className={switcheroo.available ? 'text-green-400' : 'text-red-400'}>
                        {switcheroo.available ? '✓ Yes' : '✗ Used this week'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Protected player:</span>{' '}
                      <span className="text-white">
                        {switcheroo.protected_player_id || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Last used week:</span>{' '}
                      <span className="text-white">{switcheroo.last_used_week || '—'}</span>
                    </div>
                    {switcheroo.restricted_player_id && (
                      <div>
                        <span className="text-slate-500">Can't use on:</span>{' '}
                        <span className="text-red-400">{switcheroo.restricted_player_id}</span>
                      </div>
                    )}
                  </div>

                  {/* Play form */}
                  {switcheroo.available && (
                    <div className="pt-4 border-t border-slate-700 space-y-3">
                      <label className="label">Player ID to Protect</label>
                      <div className="flex gap-3">
                        <input
                          className="input flex-1"
                          value={switcherooPlayer}
                          onChange={e => setSwitcherooPlayer(e.target.value)}
                          placeholder="Tank01 player ID (e.g. 4046)"
                        />
                        <button
                          onClick={handleSwitcheroo}
                          disabled={submitting || !switcherooPlayer.trim()}
                          className="btn-primary disabled:opacity-50 whitespace-nowrap"
                        >
                          {submitting ? 'Activating...' : '🔄 Activate'}
                        </button>
                      </div>
                      {switcheroo.restricted_player_id && (
                        <p className="text-xs text-yellow-400">
                          ⚠️ Cannot use on player {switcheroo.restricted_player_id} (used last week)
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
