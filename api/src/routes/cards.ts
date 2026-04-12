import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ============================================================
// HELPERS
// ============================================================

/** Asserts user is a member of the league and returns their team_id */
async function requireMembership(leagueId: string, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new AppError('Not a member of this league', 403);
  return data.id;
}

/** Returns current week/season for a league */
async function getLeagueWeek(leagueId: string): Promise<{ week: number; season: number }> {
  const { data, error } = await supabaseAdmin
    .from('leagues')
    .select('current_week, season')
    .eq('id', leagueId)
    .single();
  if (error || !data) throw new AppError('League not found', 404);
  return { week: data.current_week, season: data.season };
}

/**
 * Checks if the current NFL week is locked (first game has kicked off).
 * NFL weeks typically start Thursday ~8:20 PM ET.
 * We use a simple heuristic: Thursday 8:00 PM ET of the current week.
 * In production this could be replaced with real schedule data.
 */
async function isWeekLocked(leagueId: string): Promise<boolean> {
  // Get the league status
  const { data: league } = await supabaseAdmin
    .from('leagues')
    .select('status')
    .eq('id', leagueId)
    .single();

  // If league hasn't started (still in draft/setup), nothing is locked
  if (!league || league.status === 'draft' || league.status === 'setup' || league.status === 'pre_draft') {
    return false;
  }

  // Default heuristic: Thursday 8:00 PM ET of the current week
  // This matches when the first NFL game of the week kicks off.
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 4=Thu
  const hour = et.getHours();

  // After Thursday 8 PM ET: locked
  if (day === 4 && hour >= 20) return true;
  // Friday or Saturday: locked
  if (day === 5 || day === 6) return true;
  // Sunday: locked
  if (day === 0) return true;
  // Monday (games might still be on): locked
  if (day === 1 && hour < 6) return true; // unlock early Tuesday

  return false;
}

/** Returns count of unplayed cards in a user's stack for a league */
async function getStackSize(userId: string, leagueId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('user_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('league_id', leagueId)
    .is('played_at', null);
  if (error) return 0;
  return count || 0;
}

// ============================================================
// USER CARD STACK — GET /api/leagues/:id/cards
// ============================================================
router.get('/leagues/:id/cards', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const { data, error } = await supabaseAdmin
      .from('user_cards')
      .select('*, card:cards(*)')
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .is('played_at', null)
      .order('obtained_at', { ascending: true });

    if (error) throw new AppError('Failed to fetch card stack', 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// WEEKLY PICK — GET /api/leagues/:id/cards/pick
// Returns existing pick session or generates a fresh one (12 cards).
// Pre-week-1 seed: if user has 0 cards in deck, they pick 6.
// All other weeks: pick 3.
// ============================================================
router.get('/leagues/:id/cards/pick', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const { week, season } = await getLeagueWeek(leagueId);

    // Determine pick limit: 6 for pre-week-1 seed (deck is empty), 3 otherwise
    const currentStack = await getStackSize(req.user!.id, leagueId);
    const maxPicks = currentStack === 0 ? 6 : 3;

    // Check for existing pick session this week
    const { data: existing } = await supabaseAdmin
      .from('weekly_card_picks')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .eq('week', week)
      .eq('season', season)
      .maybeSingle();

    if (existing) {
      // Hydrate card_pool IDs with full card data
      const cardIds = existing.card_pool as string[];
      const { data: cards } = await supabaseAdmin
        .from('cards')
        .select('*')
        .in('id', cardIds);

      const cardsById = Object.fromEntries((cards || []).map(c => [c.id, c]));
      return res.json({
        ...existing,
        max_picks: (existing as any).max_picks ?? maxPicks,
        cards: cardIds.map(id => cardsById[id]).filter(Boolean)
      });
    }

    // Generate 12 random active cards for this pick session
    const { data: allCards, error: cardsError } = await supabaseAdmin
      .from('cards')
      .select('*')
      .eq('is_active', true);

    if (cardsError || !allCards || allCards.length === 0) {
      throw new AppError('No cards available in the pool', 404);
    }

    // Shuffle and pick 12 (or fewer if pool is small)
    const shuffled = [...allCards].sort(() => Math.random() - 0.5);
    const picked12 = shuffled.slice(0, Math.min(12, shuffled.length));
    const cardIds = picked12.map(c => c.id);

    // Store the pick session with max_picks baked in
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('weekly_card_picks')
      .insert({
        user_id: req.user!.id,
        league_id: leagueId,
        week,
        season,
        card_pool: cardIds,
        picked_ids: [],
        max_picks: maxPicks
      })
      .select()
      .single();

    if (sessionError) throw new AppError('Failed to create pick session', 500);

    res.json({ ...session, cards: picked12 });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// WEEKLY PICK — POST /api/leagues/:id/cards/pick
// Body: { cardIds: string[] } — select cards from the 12
// Limit is dynamic: 6 for pre-week-1 seed, 3 otherwise
// ============================================================
router.post('/leagues/:id/cards/pick', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    // Accepts a single cardId or an array — supports one-at-a-time flips
    const body = z.object({
      cardId: z.string().uuid().optional(),
      cardIds: z.array(z.string().uuid()).min(1).max(6).optional()
    }).refine(d => d.cardId || d.cardIds, 'Provide cardId or cardIds')
      .parse(req.body);

    const cardIds = body.cardIds || [body.cardId!];

    const { week, season } = await getLeagueWeek(leagueId);

    // Load the existing pick session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('weekly_card_picks')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .eq('week', week)
      .eq('season', season)
      .single();

    if (sessionError || !session) throw new AppError('No pick session found — GET /cards/pick first', 400);
    if (session.completed_at) throw new AppError('Pick session already completed this week', 400);

    // Use the max_picks stored in the session (6 for seed, 3 for normal weeks)
    const sessionMaxPicks = (session as any).max_picks ?? 3;
    const alreadyPicked = (session.picked_ids as string[]) || [];
    const remaining = sessionMaxPicks - alreadyPicked.length;

    if (remaining <= 0) throw new AppError('You have already picked all your cards this week', 400);
    if (cardIds.length > remaining) {
      throw new AppError(`You can only pick ${remaining} more card${remaining !== 1 ? 's' : ''} this week`, 400);
    }

    // Validate that all chosen cardIds are in the presented pool and not already picked
    const pool = session.card_pool as string[];
    const invalid = cardIds.filter(id => !pool.includes(id));
    if (invalid.length > 0) throw new AppError('One or more card IDs are not in your pick pool', 400);
    const dupes = cardIds.filter(id => alreadyPicked.includes(id));
    if (dupes.length > 0) throw new AppError('Card already picked', 400);

    // Check stack size — deck cap is 12 unplayed cards
    const currentStack = await getStackSize(req.user!.id, leagueId);
    const available = Math.max(0, 12 - currentStack);
    if (available === 0) throw new AppError('Your card stack is full (max 12 cards)', 400);
    const toAdd = cardIds.slice(0, Math.min(cardIds.length, available));

    // Add cards to user's stack
    const insertRows = toAdd.map(cardId => ({
      user_id: req.user!.id,
      league_id: leagueId,
      card_id: cardId
    }));

    const { error: insertError } = await supabaseAdmin
      .from('user_cards')
      .insert(insertRows);

    if (insertError) throw new AppError('Failed to add cards to stack', 500);

    // Update picked_ids; mark complete if all picks used
    const newPickedIds = [...alreadyPicked, ...toAdd];
    const isComplete = newPickedIds.length >= sessionMaxPicks;

    await supabaseAdmin
      .from('weekly_card_picks')
      .update({
        picked_ids: newPickedIds,
        ...(isComplete ? { completed_at: new Date().toISOString() } : {})
      })
      .eq('id', session.id);

    // Return updated stack
    const { data: stack } = await supabaseAdmin
      .from('user_cards')
      .select('*, card:cards(*)')
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .is('played_at', null)
      .order('obtained_at', { ascending: true });

    res.json({ success: true, added: toAdd.length, stack: stack || [] });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PLAY A CARD — POST /api/leagues/:id/cards/play
// Body: { user_card_id, play_slot, target_player_id?, target_team_id? }
// ============================================================
router.post('/leagues/:id/cards/play', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    const teamId = await requireMembership(leagueId, req.user!.id);

    // v2: expand play_slot enum to include switcheroo/buff/debuff/wild.
    // v1 values ('own_team','opponent','any_team') stay valid for backward
    // compatibility while the v1 CardDeckPage is retired. target_group is
    // accepted for group-scope plays (target_player_id should be null when
    // target_group is set).
    const playSchema = z.object({
      user_card_id: z.string().uuid(),
      // play_slot is now optional — auto-determined from card effect_type if omitted
      play_slot: z.enum([
        'own_team', 'opponent', 'any_team',
        'switcheroo', 'buff', 'debuff', 'wild'
      ]).optional(),
      target_player_id: z.string().optional(),
      target_team_id: z.string().uuid().optional(),
      target_group: z.enum(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']).optional()
    });
    const body = playSchema.parse(req.body);

    const { week, season } = await getLeagueWeek(leagueId);

    // Verify the user owns this card (unplayed)
    const { data: userCard, error: cardFetchError } = await supabaseAdmin
      .from('user_cards')
      .select('*, card:cards(*)')
      .eq('id', body.user_card_id)
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .is('played_at', null)
      .single();

    if (cardFetchError || !userCard) throw new AppError('Card not found in your stack', 404);

    // Lock check: cannot play new cards after first kickoff
    if (await isWeekLocked(leagueId)) {
      throw new AppError('Cards are locked — the first game of the week has kicked off', 400);
    }

    // Enforce play limit: max 3 cards per week (any combination of types)
    const { count: weeklyCount } = await supabaseAdmin
      .from('played_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .eq('week', week)
      .eq('season', season);

    if ((weeklyCount || 0) >= 3) {
      throw new AppError('You have already played 3 cards this week', 400);
    }

    // v2: ensure exactly one of target_player_id / target_group is set,
    // matching the card's declared target_scope
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = (userCard as any).card;
    if (card?.target_scope === 'group' && !body.target_group) {
      throw new AppError('Group-scope cards require a target_group (QB, RB, WR, TE, K, DEF)', 400);
    }
    if (card?.target_scope === 'player' && !body.target_player_id) {
      throw new AppError('Player-scope cards require a target_player_id', 400);
    }

    // Auto-determine play_slot from card effect_type if not provided
    const resolvedSlot = body.play_slot || card?.effect_type || 'buff';

    // Record the play
    const { data: playedCard, error: playError } = await supabaseAdmin
      .from('played_cards')
      .insert({
        user_id: req.user!.id,
        league_id: leagueId,
        card_id: userCard.card_id,
        user_card_id: userCard.id,
        target_player_id: body.target_player_id || null,
        target_team_id: body.target_team_id || null,
        target_group: body.target_group || null,
        play_slot: resolvedSlot,
        week,
        season
      })
      .select()
      .single();

    if (playError) throw new AppError('Failed to play card', 500);

    // Mark the user_card as played
    await supabaseAdmin
      .from('user_cards')
      .update({ played_at: new Date().toISOString() })
      .eq('id', userCard.id);

    res.status(201).json({ success: true, played: playedCard });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// UNPLAY A CARD — DELETE /api/leagues/:id/cards/play/:playedCardId
// Allows a user to take back a played card before first kickoff of the week.
// Returns the card to their unplayed stack.
// ============================================================
router.delete('/leagues/:id/cards/play/:playedCardId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId, playedCardId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    // Fetch the played card
    const { data: playedCard, error: fetchErr } = await supabaseAdmin
      .from('played_cards')
      .select('*, card:cards(*)')
      .eq('id', playedCardId)
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .single();

    if (fetchErr || !playedCard) throw new AppError('Played card not found', 404);

    // Check lock: cards lock at first kickoff of the week (Thursday ~8:20 PM ET)
    if (await isWeekLocked(leagueId)) {
      throw new AppError('Cards are locked — the first game of the week has kicked off', 400);
    }

    // Remove the played_cards row
    const { error: deleteErr } = await supabaseAdmin
      .from('played_cards')
      .delete()
      .eq('id', playedCardId);

    if (deleteErr) throw new AppError('Failed to unplay card', 500);

    // Mark the user_card as unplayed again
    await supabaseAdmin
      .from('user_cards')
      .update({ played_at: null })
      .eq('id', playedCard.user_card_id);

    res.json({ success: true, message: 'Card returned to your stack' });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// REASSIGN A CARD — PUT /api/leagues/:id/cards/play/:playedCardId
// Change the target of an already-played card before lock.
// ============================================================
router.put('/leagues/:id/cards/play/:playedCardId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId, playedCardId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const reassignSchema = z.object({
      target_player_id: z.string().optional(),
      target_team_id: z.string().uuid().optional(),
      target_group: z.enum(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']).optional()
    });
    const body = reassignSchema.parse(req.body);

    // Fetch the played card
    const { data: playedCard, error: fetchErr } = await supabaseAdmin
      .from('played_cards')
      .select('*, card:cards(*)')
      .eq('id', playedCardId)
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .single();

    if (fetchErr || !playedCard) throw new AppError('Played card not found', 404);

    if (await isWeekLocked(leagueId)) {
      throw new AppError('Cards are locked — the first game of the week has kicked off', 400);
    }

    // Validate target matches card scope
    const card = (playedCard as any).card;
    if (card?.target_scope === 'group' && !body.target_group) {
      throw new AppError('Group-scope cards require a target_group', 400);
    }
    if (card?.target_scope === 'player' && !body.target_player_id) {
      throw new AppError('Player-scope cards require a target_player_id', 400);
    }

    // Update the target
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('played_cards')
      .update({
        target_player_id: body.target_player_id || null,
        target_team_id: body.target_team_id || null,
        target_group: body.target_group || null
      })
      .eq('id', playedCardId)
      .select('*, card:cards(*)')
      .single();

    if (updateErr) throw new AppError('Failed to reassign card', 500);

    res.json({ success: true, played: updated });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// LEAGUE PLAYED CARDS — GET /api/leagues/:id/cards/league-plays
// Returns ALL played cards in the league for this week.
// Own cards always visible. Opponent cards hidden until locked.
// ============================================================
router.get('/leagues/:id/cards/league-plays', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const { week, season } = await getLeagueWeek(leagueId);
    const locked = await isWeekLocked(leagueId);

    // Always return the user's own plays
    const { data: myPlays } = await supabaseAdmin
      .from('played_cards')
      .select('*, card:cards(*)')
      .eq('league_id', leagueId)
      .eq('user_id', req.user!.id)
      .eq('week', week)
      .eq('season', season);

    let opponentPlays: any[] = [];
    if (locked) {
      // After lock, reveal all plays in the league
      const { data } = await supabaseAdmin
        .from('played_cards')
        .select('*, card:cards(*)')
        .eq('league_id', leagueId)
        .eq('week', week)
        .eq('season', season)
        .neq('user_id', req.user!.id);
      opponentPlays = data || [];
    }

    res.json({
      week,
      season,
      locked,
      my_plays: myPlays || [],
      opponent_plays: opponentPlays
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PLAYED CARDS — GET /api/leagues/:id/cards/played
// Returns played cards for current week; cards are hidden until kickoff
// ============================================================
router.get('/leagues/:id/cards/played', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const { week, season } = await getLeagueWeek(leagueId);

    // Determine if kickoff has passed (Sunday 1PM ET)
    // For MVP: any card with revealed_at set is visible; otherwise only your own plays are visible
    const { data: myPlays, error: myError } = await supabaseAdmin
      .from('played_cards')
      .select('*, card:cards(*)')
      .eq('league_id', leagueId)
      .eq('user_id', req.user!.id)
      .eq('week', week)
      .eq('season', season)
      .order('played_at', { ascending: true });

    if (myError) throw new AppError('Failed to fetch played cards', 500);

    // Also fetch revealed opponent plays
    const { data: revealedPlays } = await supabaseAdmin
      .from('played_cards')
      .select('*, card:cards(*)')
      .eq('league_id', leagueId)
      .eq('week', week)
      .eq('season', season)
      .not('revealed_at', 'is', null)
      .order('played_at', { ascending: true });

    // Merge: my plays + any revealed plays (deduplicate by id)
    const allPlays = [...(myPlays || [])];
    for (const play of (revealedPlays || [])) {
      if (!allPlays.find(p => p.id === play.id)) {
        allPlays.push(play);
      }
    }

    const kickoffPassed = (revealedPlays || []).length > 0;

    res.json({
      week,
      season,
      kickoff_passed: kickoffPassed,
      plays: allPlays
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// SWITCHEROO — POST /api/leagues/:id/switcheroo
// Body: { player_id } — protect a player this week
// ============================================================
router.post('/leagues/:id/switcheroo', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const { player_id } = z.object({
      player_id: z.string().min(1)
    }).parse(req.body);

    const { week, season } = await getLeagueWeek(leagueId);

    // Load existing switcheroo state
    const { data: existing } = await supabaseAdmin
      .from('user_switcheroo')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .maybeSingle();

    // Enforce: cannot use on same player 2 weeks in a row
    if (existing && existing.last_used_week === week - 1 && existing.last_player_id === player_id) {
      throw new AppError('Cannot use Switcheroo on the same player 2 weeks in a row', 400);
    }

    // Enforce: max 1 per week
    if (existing && existing.last_used_week === week) {
      throw new AppError('You already used the Switcheroo this week', 400);
    }

    // Upsert switcheroo state
    const { error: upsertError } = await supabaseAdmin
      .from('user_switcheroo')
      .upsert({
        user_id: req.user!.id,
        league_id: leagueId,
        protected_player_id: player_id,
        last_used_week: week,
        last_player_id: player_id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,league_id' });

    if (upsertError) throw new AppError('Failed to save Switcheroo', 500);

    // Log it
    await supabaseAdmin
      .from('switcheroo_log')
      .insert({
        user_id: req.user!.id,
        league_id: leagueId,
        protected_player_id: player_id,
        week,
        season
      });

    res.json({
      success: true,
      protected_player_id: player_id,
      week,
      message: `Switcheroo activated! Player ${player_id} is protected this week.`
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// SWITCHEROO STATUS — GET /api/leagues/:id/switcheroo
// ============================================================
router.get('/leagues/:id/switcheroo', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const { week } = await getLeagueWeek(leagueId);

    const { data } = await supabaseAdmin
      .from('user_switcheroo')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('league_id', leagueId)
      .maybeSingle();

    const usedThisWeek = data?.last_used_week === week;
    const lastPlayerRestricted = data?.last_used_week === week - 1 ? data.last_player_id : null;

    res.json({
      protected_player_id: usedThisWeek ? data?.protected_player_id : null,
      used_this_week: usedThisWeek,
      last_used_week: data?.last_used_week || null,
      restricted_player_id: lastPlayerRestricted,
      available: !usedThisWeek
    });
  } catch (err) {
    next(err);
  }
});

export default router;
