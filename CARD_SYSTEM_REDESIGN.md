# Card System — Redesign Spec (v2)

**Status:** 🟡 Design locked, not yet implemented
**Date:** April 11, 2026
**Supersedes (partially):** `CARD_SYSTEM.md` (Phase 3, April 9, 2026)

---

## Why this doc exists

The Phase 3 card system shipped with a working schema, APIs, and a `CardDeckPage`
play surface. Product review surfaced several rule and UX changes that require
schema, API, and page-level work to implement. This doc is the spec for that
redesign. It is a **diff against the existing system**, not a greenfield spec —
everything not called out explicitly is unchanged from `CARD_SYSTEM.md`.

Think of this as "v2 of the card system." The name and branding is still
Gridiron Cards; the mechanics and the play flow are what's moving.

---

## What's changing (TL;DR)

| Area | v1 (current) | v2 (this spec) |
|---|---|---|
| Weekly play slots | 3 (`own_team` / `opponent` / `any_team`) | **4** (Switcheroo + buff + debuff + wild) |
| Switcheroo | Separate endpoint, separate UI | **Lives in the play bar as slot #1** |
| Wild slot target | Any team in the league | **Any team *except* your current opponent** |
| Target scopes | `player` / `position` / `all` | **`player` / `group`** (team-scope removed) |
| Group = "All WRs" | Conflated with single-player `position` targeting | **Explicit `group` scope, distinct from single-player** |
| Group blast radius | N/A | **Active starters only, FLEX counted by slotted position** |
| Deck cap | 6 unplayed cards | **12 unplayed cards** |
| Weekly pick pool | 12 cards, pick 3 | ✅ unchanged |
| Season-start draw | 6 from 12 (? — not in v1 doc) | **6 from 12, one-time, at season start** |
| Play surface | `CardDeckPage` (standalone) | **This Week's Matchups → Matchup Detail page** |
| Lock timing | Lineup lock (Thu 8PM ET) | ✅ unchanged (same barriers as setting lineup) |
| Reveal timing | Sunday 1PM ET kickoff | ✅ unchanged |
| Effect display | Raw modifier_value | **Always shown as % in UI** (decimal storage OK internally) |
| Impact preview | None | **New: live projected Δ before play confirmation** |

---

## Rules (locked decisions)

### Deck and weekly pool
- **Season-start draw:** at season start each manager is offered 12 cards and
  picks 6 to seed their deck. Click-to-select, no confirm step.
- **Weekly pool:** each week after the previous week resolves, the system rolls
  a new pool of 12 cards per user. User picks **3**. Same click-to-select UX.
- **Pool composition:** 7 common / 4 uncommon / 1 rare, duplicates allowed.
- **Pool balancing:** **none.** Pure RNG. A user can legitimately roll 12
  cards of the same effect type and have to live with it.
- **Carry over:** unplayed cards persist across weeks. Played cards are burned.
- **Deck cap:** 12 unplayed cards max. If a user would exceed the cap on a new
  weekly pick, they must either play enough to fit or forfeit picks that week.

### Weekly play structure
- **4 slots per week**, all optional (0 to 4 cards per week):
  1. **Ole Switcheroo** — 1/week, own team only, always available (does not
     consume a deck slot, it's a permanent card).
  2. **Buff slot** — one card with `effect_type='buff'`, target must be on the
     user's own team.
  3. **Debuff slot** — one card with `effect_type='debuff'`, target must be on
     the user's **current-week opponent's** team.
  4. **Wild slot** — one card (buff OR debuff, user's choice), target must be
     on a user who is **neither** the player **nor** the current-week opponent.
- All slots are optional. A cautious user can play 0 cards in a week and lose
  nothing.

### Targeting rules
- **Card targeting shape is declared on the card itself** via two fields:
  - `target_scope` — `'player'` (single) or `'group'` (all in a position bloc)
  - `target_position` — the eligible position(s) for the card
- **Group scope = active starters only.** A group debuff on "All WRs" hits
  every WR in the target team's *starting lineup*, including a WR slotted at
  FLEX. Bench players are NOT affected. Rationale: bench players don't score,
  so hitting them is wasted magnitude.
- **FLEX counting:** a player started at FLEX counts as whichever position they
  actually play. RB-in-FLEX counts as an RB for "All RBs." WR-in-FLEX counts as
  a WR for "All WRs." This rewards scouting the opponent's lineup decisions.
- **Team-wide cards are OUT.** No card can target "all players on a team."
  Group scope at `target_position='all'` is removed. Migration must repurpose
  or deactivate existing v1 `'all'` cards.
- **Both buff and debuff cards exist in both scopes.** "All my RBs +15%" is a
  legal card. "All opponent's WRs -20%" is a legal card.

### Timing
- **Play window:** cards can be played at any time between the end of the
  previous week and the start of the next week, subject to the **same lock
  rules as setting your lineup** (i.e., once a player's game has kicked off,
  you can't play a card on them).
- **Reveal:** cards remain hidden until Sunday 1PM ET kickoff, at which point
  all plays become visible simultaneously (unchanged from v1).
- **Cancel before lock:** a played card that has not yet locked can be
  unplayed and returned to the deck. Once the target player's game locks, the
  play is committed.
- **Stacking:** multiple cards on the same target stack **additively**
  (sequential application in `played_at` order).

### The Ole Switcheroo
- Permanent, every user has it, doesn't count toward deck cap.
- 1 use per week, own team only, cannot target same player 2 weeks in a row.
- Lives as **slot #1 in the play bar** rather than as a separate endpoint/page.
- Internal effect: protects one player; any debuff landed on that player this
  week is reflected back to the attacker (specific reflection math unchanged
  from v1).

---

## Play UX

This is the biggest v2 change. The play surface moves from the standalone
`CardDeckPage` to a new "This Week's Matchups" flow.

### New pages
- **`MatchupsPage`** — `/leagues/:id/matchups` — list view of the current
  week's head-to-head matchups (5 tiles for a 10-team league). Separate from
  the existing scoreboard page, which continues to serve final scores and
  week-in-review.
- **`MatchupDetailPage`** — `/leagues/:id/matchups/:matchupId` — one matchup,
  both teams' starting lineups side-by-side, projected scores, tiebreakers.
  This page is the primary card-play surface.

### The play bar (persistent)
- A bottom-fixed bar visible on both `MatchupsPage` and `MatchupDetailPage`
  (and optionally the deck page for context).
- Renders **4 slots** left-to-right:
  1. Switcheroo (permanent, always present)
  2. Buff slot (filled only if user selects a buff card from their deck)
  3. Debuff slot (filled only if user selects a debuff card from their deck)
  4. Wild slot (filled only if user selects any card for the wild play)
- Each slot shows empty state, armed state (card selected but not targeted),
  or played state (card + target + "Cancel" until lock).
- Hovering an empty slot shows a tooltip explaining what can fill it.

### Target selection — single-player cards
Hearthstone-style direct targeting:
1. User taps the slot → deck drawer opens showing only cards legal for that
   slot (buff cards for slot 2, debuff cards for slot 3, etc.).
2. User taps a card → card "arms" to the play bar, deck drawer closes.
3. Visible legal targets on the current page highlight. An arrow drags from
   the card in the play bar to whatever the user hovers. Invalid targets
   show a red X; valid targets show a green highlight.
4. User clicks a legal target → confirm modal appears with **projected Δ**
   ("reduces Patrick Mahomes's projection from 22.4 to 19.0, -15%").
5. User confirms → card is recorded in `played_cards`, UI updates.

### Target selection — group cards
Hearthstone AoE pattern:
1. Same arm flow. User taps slot, taps group card, card arms.
2. Instead of individual players highlighting, **position blocs** highlight.
   Hovering the "WR" bloc on the opponent's lineup glows all three starting
   WRs simultaneously (plus FLEX-if-WR).
3. One click on the bloc → confirm modal shows **aggregate Δ**
   ("reduces 3 WRs by 15%, total projected delta -18.5").
4. Confirm → one row inserted into `played_cards` with `target_player_id=NULL`
   and `target_group` set.

### The wild card flow (special-cased)
This is the flow the product discussion specifically called out. Since the
wild slot must target someone who is NOT the user and NOT the current-week
opponent, you can't play it from the user's own matchup detail page — there
are no legal targets on screen.

**Flow:**
1. User taps the wild slot from any card-eligible page (matchup detail, deck,
   or matchups index).
2. A **"Target a Rival"** modal opens, showing the 4 other matchups of the
   current week as compact tiles (your matchup is greyed out and unclickable).
   Each tile shows: matchup opponent names, current records, projected totals.
3. User clicks a tile → the tile expands in place into a side-by-side lineup
   view of the two teams, with legal targets highlighted per the armed card's
   scope (single player targeting, or position bloc targeting).
4. Same confirm → projected Δ → commit flow as the other slots.
5. Closing the modal returns the user to wherever they opened it from.

**Why a modal and not "just navigate to their matchup detail":** preserves
context (user doesn't lose their own matchup's state), tightens the target
universe to exactly the legal targets, and makes the wild card feel like a
deliberate "pick who to meddle with" decision rather than a buried side-action.

### Deck view
Existing `CardDeckPage` stays, but its role shrinks. In v2 it's a **browsing /
inventory** page: see all cards currently in the deck, read their effects,
view recent picks and history. Cards are **not** played from here — play
always originates in the matchup flow.

### Impact preview
Every confirm modal across all 4 slots shows a projected delta in percent for
the targeted player(s). Backend math lives in a shared util so the preview
and the post-kickoff resolution use the same code path. This is a v2
requirement, not a polish item.

---

## Schema changes (migration 016)

```sql
-- 016_card_system_v2.sql

-- 1) Add target_scope to cards, migrate existing rows
ALTER TABLE cards
  ADD COLUMN target_scope TEXT
    CHECK (target_scope IN ('player', 'group'));

-- Best-effort classification of existing v1 rows based on description.
-- Cards with descriptions containing "All <pos>s" or "every" become 'group';
-- all others default to 'player'. Final mapping should be reviewed manually.
UPDATE cards SET target_scope = CASE
  WHEN description ILIKE 'all %' OR description ILIKE 'every %' THEN 'group'
  ELSE 'player'
END
WHERE target_scope IS NULL;

ALTER TABLE cards ALTER COLUMN target_scope SET NOT NULL;

-- 2) Drop the now-redundant v1 target_type column after backfilling scope
--    (kept for one release as a nullable column for rollback safety)
ALTER TABLE cards ALTER COLUMN target_type DROP NOT NULL;

-- 3) Remove team-scope cards: deactivate any row with target_position='All'
UPDATE cards
  SET is_active = FALSE
  WHERE target_position = 'All';

-- 4) Played_cards: allow group targets and add target_group column
ALTER TABLE played_cards
  ADD COLUMN target_group TEXT
    CHECK (target_group IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF'));

-- Single-player plays: target_player_id set, target_group NULL
-- Group plays: target_player_id NULL, target_group set
ALTER TABLE played_cards
  DROP CONSTRAINT IF EXISTS played_cards_play_slot_check;

ALTER TABLE played_cards
  ADD CONSTRAINT played_cards_play_slot_check
    CHECK (play_slot IN ('switcheroo', 'buff', 'debuff', 'wild'));

-- 5) Raise deck cap enforcement: no schema change (cap is API-enforced),
--    but update any cap-check logic from 6 → 12

-- 6) Optional: pre-computed impact preview cache table (for hover previews)
CREATE TABLE IF NOT EXISTS card_play_preview (
  played_card_id UUID PRIMARY KEY REFERENCES played_cards(id) ON DELETE CASCADE,
  projected_delta NUMERIC(8, 2) NOT NULL,
  projected_delta_pct NUMERIC(6, 2) NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Existing v1 seed data cleanup
The v1 seed includes cards like "Deep Ball Magic — All WRs +5%" (group) and
"Hot Streak — One WR +15%" (single) under the same `target_type='position'`.
Migration 016 classifies these best-effort via description, but each card
should be reviewed by hand after migration to confirm the scope is right.

**Cards currently at `target_position='All'`:** none in the v1 seed (spot-check
shows all 12 seed cards have a specific position), but any admin-added cards
with `'All'` will be deactivated.

---

## API changes

### New
- `POST /api/leagues/:id/cards/play-wild` — dedicated endpoint for wild-card
  plays. Body: `{ card_id, target_user_id, target_player_id?, target_group? }`.
  Validates that target_user is neither the caller nor the caller's current
  opponent.
- `GET /api/leagues/:id/matchups/current` — list of this week's head-to-head
  matchups. Used to render the matchups index and the wild-card modal.
- `GET /api/leagues/:id/matchups/:matchupId` — one matchup, both lineups,
  projections. Used by `MatchupDetailPage`.
- `GET /api/leagues/:id/cards/preview` — query params describe an unplayed
  card and a target; returns the projected Δ without committing. Used by
  hover and confirm-modal previews.

### Modified
- `POST /api/leagues/:id/cards/play` — `play_slot` enum expands to include
  `switcheroo`, `buff`, `debuff`, `wild`. Validation logic updated for the
  new targeting rules (buff must hit own team, debuff must hit current
  opponent, wild must hit neither, switcheroo must hit own team).
- `POST /api/leagues/:id/switcheroo` — deprecated in favor of the unified
  `/cards/play` endpoint with `play_slot='switcheroo'`. Can ship both in
  parallel during rollout, then retire.
- `GET /api/leagues/:id/cards` — returns cards filtered to show which slots
  each is legal for (server-side affordance hint for the UI).

---

## Build order

1. **Spec doc locked** (this file) → `CARD_SYSTEM_REDESIGN.md` committed.
2. **Schema migration 016** → apply via Supabase MCP, verify on a branch first.
3. **`MatchupsPage` + `MatchupDetailPage`** (no cards) → just the matchups
   index and detail views, wired to the new API endpoints, no card bar yet.
4. **Play bar skeleton** → render the 4 slots as empty affordances on the new
   pages, no actual play wiring yet.
5. **Card arming + single-player targeting** → full flow for slots 1-3 on
   matchup detail.
6. **Group-card targeting** → position bloc highlighting, AoE confirmation.
7. **Wild-card modal** → "Target a Rival" flow.
8. **Impact preview util + API** → shared math, hover previews, confirm Δ.
9. **Reveal cron + resolution math** → already exists in v1; verify it handles
   group plays correctly (one `played_cards` row, multiple affected players).
10. **Retire v1 CardDeckPage play flow** → deck page becomes inventory-only,
    remove old play slots.

---

## Open questions still outstanding

None blocking the spec doc, but flagging for implementation time:

- **Magnitude tuning of group cards**: group cards are mathematically stronger
  than single-player cards (more targets = bigger total swing). Rebalance the
  rarity distribution so most group cards are uncommon or rare, with commons
  staying mostly single-player. Not a schema question, just a card-database
  curation task.
- **Cancel-before-lock UX**: how do we surface "you can still cancel this
  play" vs "this play is locked" on the play bar? Probably a small clock icon
  with time-until-lock, but worth prototyping.
- **Mobile play bar**: 4 slots may not fit on narrow widths. Collapse to a
  single "Cards" pill that expands into a drawer? Defer until we have a
  mobile breakpoint review.
- **Dropped players**: if a user cancels a buff card after the target player
  is dropped from the roster, what happens? Current v1 behavior unclear.
  Probably: card is wasted, returned to deck only if pre-lock.

---

## Appendix: card taxonomy cheat sheet

| Scope | Effect | Example card | Slot legality |
|---|---|---|---|
| player | buff | "Rocket Fuel" — one RB +20% | Buff slot (own team) or Wild slot (rival team) |
| player | debuff | "Cold Hands" — one QB -10 | Debuff slot (opponent) or Wild slot (rival team) |
| group  | buff | "Deep Ball Magic" — all WRs +5% | Buff slot (own WRs) or Wild slot (rival WRs) |
| group  | debuff | "Party Boat" — all WRs -15% | Debuff slot (opp WRs) or Wild slot (rival WRs) |
| permanent | reflect | "Ole Switcheroo" — reflect 1 debuff | Switcheroo slot only (own team) |

---

*Draft by Claude — April 11, 2026. Awaiting Frank's sign-off before schema work begins.*
