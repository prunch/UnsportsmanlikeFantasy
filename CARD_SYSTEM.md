# Card System — Technical Documentation

**Phase:** 3  
**Status:** ✅ Built  
**Date:** April 9, 2026

---

## Overview

The MTG-inspired Card System lets each league manager hold a personal "stack" of cards they play weekly to buff or debuff NFL players. Cards can target their own team, their weekly opponent's team, or any team in the league.

---

## Database Schema

### `cards` (Migration 004)
The global pool of cards, managed by admin.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| title | TEXT | e.g. "Party Boat" |
| description | TEXT | Flavor text |
| target_type | TEXT | `player`, `position`, or `all` |
| target_position | TEXT | `QB`, `RB`, `WR`, `TE`, `K`, `DEF`, `All` |
| effect_type | TEXT | `buff` or `debuff` |
| modifier_type | TEXT | `absolute` (pts) or `percentage` |
| modifier_value | NUMERIC | e.g. 15.0 |
| rarity | TEXT | `common`, `uncommon`, `rare` |
| is_active | BOOLEAN | Only active cards enter the weekly pick pool |
| created_at | TIMESTAMPTZ | |

### `user_cards` (Migration 005)
Each row is one card instance in a user's hand for a specific league.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| league_id | UUID | FK → leagues |
| card_id | UUID | FK → cards |
| obtained_at | TIMESTAMPTZ | When the card was added |
| played_at | TIMESTAMPTZ | NULL = unplayed; set when played |

### `weekly_card_picks` (Migration 005)
Tracks the 12-card flip session per user per week.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| league_id | UUID | FK → leagues |
| week | INTEGER | Current league week |
| season | INTEGER | Season year |
| card_pool | JSONB | Array of 12 card IDs presented |
| picked_ids | JSONB | Array of chosen card IDs (up to 3) |
| completed_at | TIMESTAMPTZ | NULL = still in progress |

### `played_cards` (Migration 006)
Log of every card played in a week.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| league_id | UUID | FK → leagues |
| card_id | UUID | FK → cards |
| user_card_id | UUID | FK → user_cards |
| target_player_id | TEXT | Tank01 player ID (optional) |
| target_team_id | UUID | FK → teams (optional) |
| play_slot | TEXT | `own_team`, `opponent`, `any_team` |
| played_at | TIMESTAMPTZ | When card was played |
| week | INTEGER | |
| season | INTEGER | |
| revealed_at | TIMESTAMPTZ | Set at Sunday 1PM ET kickoff |
| resolved | BOOLEAN | Whether score has been applied |
| score_delta | NUMERIC | Points added/subtracted after resolution |

### `user_switcheroo` (Migration 007)
Each user's Switcheroo permanent card state per league.

| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID | PK (composite) |
| league_id | UUID | PK (composite) |
| protected_player_id | TEXT | Current week's protected player |
| last_used_week | INTEGER | Week when last used |
| last_player_id | TEXT | Player used last time (2-week restriction) |

### `switcheroo_log` (Migration 007)
Full audit trail of every Switcheroo play.

---

## API Endpoints

### User Card Stack
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leagues/:id/cards` | Get my card stack (unplayed cards) |
| GET | `/api/leagues/:id/cards/pick` | Get/create weekly 12-card pick session |
| POST | `/api/leagues/:id/cards/pick` | Submit picks (body: `{ cardIds: string[] }`) |
| POST | `/api/leagues/:id/cards/play` | Play a card from stack |
| GET | `/api/leagues/:id/cards/played` | Get played cards for current week |
| POST | `/api/leagues/:id/switcheroo` | Activate Switcheroo on a player |
| GET | `/api/leagues/:id/switcheroo` | Get Switcheroo status |

### Admin Card Management
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/cards` | List all cards |
| POST | `/api/admin/cards` | Create card |
| PUT | `/api/admin/cards/:id` | Replace card (full update) |
| PATCH | `/api/admin/cards/:id` | Partial update |
| DELETE | `/api/admin/cards/:id` | Delete card |

---

## Card Play Rules

### Three Play Slots
Each user gets 3 play slots per week:
1. **own_team** — target a player on your own roster
2. **opponent** — target a player on your weekly opponent's roster
3. **any_team** — target any player in the league

One card per slot per week. Slots are independent — you can use 0, 1, 2, or all 3.

### Stack Rules
- Maximum 6 unplayed cards in stack
- Weekly pick: choose 3 from 12 presented
- Unplayed cards persist across weeks (don't burn until played)
- After Sunday night, all played cards are burned from stacks

### Reveal Timing
- Cards played Thu–Sun are **hidden** until Sunday 1PM ET kickoff
- At kickoff, `revealed_at` is set and all plays become visible
- Implementation: check `revealed_at IS NOT NULL` for visibility

### Score Resolution
- Applied sequentially by `played_at` timestamp
- Sequential math (not additive): each card modifies the running total
- `resolved` flag set after scoring

---

## The Ole Switcheroo

- **Permanent card** — every manager always has it, doesn't count toward the 6-card stack
- **Effect:** Protects one player. Any debuff played on that player this week is reflected back to the attacker (targeting their equivalent position or highest scorer)
- **Limits:** 1 use per week; cannot target same player 2 weeks in a row
- **Tracked via:** `user_switcheroo` table (upserted each play) + `switcheroo_log` (audit)

---

## Weekly Card Cycle

```
Monday night     → Played cards burned, removed from stacks
Tue–Wed          → Pick phase opens: 12 cards presented, user picks 3
Thu 8PM ET       → Play window opens (lineup lock)
Thu–Sun 12:59 PM → Cards played (secret / face-down)
Sun 1PM ET       → Cards revealed simultaneously to all league members
Final scoring    → Cards applied sequentially to scores, `resolved = true`
```

---

## Frontend Pages

| Page | Path | Description |
|------|------|-------------|
| `CardDeckPage` | `/leagues/:id/cards` | Stack view, play slots, switcheroo |
| `CardPickPage` | `/leagues/:id/cards/pick` | 12-card flip UI |

### Components (`src/src/components/cards/`)
- **`Card.tsx`** — Card display with flip animation (face-up/face-down)
- **`CardStack.tsx`** — Grid display of user's 6-slot stack
- **`CardPlaySlot.tsx`** — Individual play slot (own_team / opponent / any_team)
- **`CardReveal.tsx`** — Post-kickoff reveal display with visibility logic

---

## Files Added / Modified

### New
```
db/migrations/004_phase3_cards.sql
db/migrations/005_phase3_user_cards.sql
db/migrations/006_phase3_played_cards.sql
db/migrations/007_phase3_switcheroo.sql
api/src/routes/cards.ts
src/src/components/cards/Card.tsx
src/src/components/cards/CardStack.tsx
src/src/components/cards/CardPlaySlot.tsx
src/src/components/cards/CardReveal.tsx
src/src/pages/CardDeckPage.tsx
src/src/pages/CardPickPage.tsx
CARD_SYSTEM.md
```

### Modified
```
api/src/index.ts          — Added cardsRouter
api/src/routes/admin.ts   — Added PUT /cards/:id endpoint
src/src/pages/LeaguePage.tsx   — Added Cards tab + routes
src/src/pages/admin/AdminCardsPage.tsx — Preview modal, PUT support, rarity styling
```

---

## Deployment Notes

Run these migrations in Supabase SQL Editor in order:
1. `004_phase3_cards.sql`
2. `005_phase3_user_cards.sql`
3. `006_phase3_played_cards.sql`
4. `007_phase3_switcheroo.sql`

Migration 004 includes 12 seed cards to populate the pool immediately.

---

*Built by Monkey 🐒 — Phase 3, April 9, 2026*
