# Phase 4 Notes — Polish & Live Features

**Phase:** 4  
**Status:** ✅ Complete  
**Date:** April 9, 2026  
**Built by:** Monkey 🐒

---

## Summary

Phase 4 delivers the live features and polish layer: real-time chat, notifications, live scoreboard, commissioner tools, and an enhanced landing page. Both `api/` and `src/` compile cleanly with zero TypeScript errors.

---

## What Was Built

### 1. Live Chat (`/leagues/:id/chat`)

**Backend:** `api/src/routes/chat.ts`
- `GET /api/leagues/:id/chat` — Fetch last 100 messages (paginated via `?before=<timestamp>`)
- `POST /api/leagues/:id/chat` — Send a message (members only)
- `DELETE /api/leagues/:id/chat/:messageId` — Commissioner soft-deletes a message (sets `is_deleted = true`)
- `DELETE /api/leagues/:id/chat/:messageId/own` — User deletes their own message

**Frontend:** `src/src/pages/league/ChatPage.tsx`
- Scrollable message timeline with avatars and timestamps
- Auto-scrolls to newest message
- Polls for new messages every 5 seconds (fallback for when Supabase Realtime isn't configured)
- Commissioner delete button appears on hover over other users' messages
- Own messages appear on the right in a gold-tinted bubble
- Send via button or Enter key

**Supabase Realtime note:** The chat uses a 5-second polling fallback. To enable true WebSocket push, enable Realtime on the `chat_messages` table in the Supabase dashboard (Database → Replication → enable for `chat_messages`). The client-side polling will be replaced with a Realtime subscription in a future enhancement.

---

### 2. Notifications (`/notifications`)

**Backend:** `api/src/routes/notifications.ts`
- `GET /api/notifications` — All user notifications (supports `?unread=true`)
- `GET /api/notifications/unread-count` — Badge count only (polled every 30s in sidebar)
- `POST /api/notifications/:id/read` — Mark one as read
- `POST /api/notifications/read-all` — Mark all as read
- `DELETE /api/notifications/:id` — Dismiss one
- `DELETE /api/notifications` — Clear all
- `POST /api/notifications/internal/create` — Admin-only endpoint to create notifications
- Exported `createNotification()` function for use by other routes

**Notification types:**
| Type | Trigger |
|------|---------|
| `trade_offer` | Trade proposed/reviewed |
| `waiver_result` | Waiver claim processed |
| `card_played` | Card played against your team |
| `lineup_reminder` | Empty lineup slots Friday |
| `draft_starting` | Draft about to begin |
| `general` | Commissioner messages, system alerts |

**Frontend:** `src/src/pages/NotificationsPage.tsx`
- Full notification center page at `/notifications`
- Unread badge in sidebar nav (refreshes every 30s)
- Filter by unread only
- Mark individual or all as read
- Dismiss individual or clear all
- Icons per notification type
- Clicking an unread notification marks it read

---

### 3. Live Scoreboard (`/leagues/:id/scoreboard`)

**Backend:** `api/src/routes/scoreboard.ts`
- `GET /api/leagues/:id/scoreboard?week=N` — Weekly matchups with live scores
- `GET /api/leagues/:id/scoreboard/standings` — Full season standings
- `GET /api/leagues/:id/scoreboard/live-players` — All player scores for current week
- `POST /api/leagues/:id/scoreboard/update-score` — Admin endpoint to push Tank01 score updates

**Live score logic:**
- For the current week: sums up starting lineup scores from the `scores` table per team
- For past weeks: uses stored `home_score`/`away_score` from the `matchups` table
- Shows "Live" badge when `is_final = false` and league is active
- Auto-refreshes every 60 seconds when league is active

**Frontend:** `src/src/pages/league/ScoreboardPage.tsx`
- Two tabs: Scoreboard and Standings
- Week navigation (← Week N →) to browse history
- Each matchup card shows both teams with scores, live/final badge
- "Your Matchup" highlight when user is in the matchup
- Winner trophy badge on finalized matchups
- Medal icons (🥇🥈🥉) on standings
- Manual refresh button

---

### 4. Commissioner Panel (`/leagues/:id/commissioner`)

**Backend:** `api/src/routes/commissioner.ts`
- `GET /api/leagues/:id/commissioner/overview` — Dashboard: teams, pending trades, chat count
- `PATCH /api/leagues/:id/commissioner/settings` — Edit league name, trade deadline, draft timer
- `POST /api/leagues/:id/commissioner/pause` — Toggle pause/resume (adds `paused` status)
- `POST /api/leagues/:id/commissioner/reset-waivers` — Reorder waiver priority by standings
- `POST /api/leagues/:id/commissioner/roster-override` — Emergency add/drop with notification
- `POST /api/leagues/:id/commissioner/trade-review/:tradeId` — Approve or veto a trade
- `GET /api/leagues/:id/commissioner/pending-trades` — List pending trades for review
- `GET /api/leagues/:id/commissioner/chat` — Full chat including deleted messages

**Frontend:** `src/src/pages/league/CommissionerPage.tsx`
- Accordion-style sections (Settings, Season Controls, Trade Review, Roster Override)
- Quick stats bar: team count, chat messages, pending trades
- Settings form: league name, trade deadline week, draft timer
- Season pause/resume toggle (color-coded green/yellow)
- Waiver reset with confirmation
- Trade review: approve (one-click) or veto (with optional reason prompt)
- Emergency roster override: add/drop with team/player/slot selectors
- Only visible to the league commissioner (route-guarded)

**Notifications triggered:**
- Trade approved/vetoed → both teams notified
- Emergency roster add/drop → affected team notified

---

### 5. Landing Page Enhancement

**File:** `src/src/pages/LandingPage.tsx`

Upgraded from minimal placeholder to full marketing page:
- Sticky header with logo + CTA buttons
- Hero section with animated badge and 3-line headline
- Card system feature section with visual mock card
- 6-feature grid with hover lift effect
- "How It Works" 6-step flow
- CTA banner section
- Full footer with tagline

---

### 6. Database Migration

**File:** `db/migrations/008_phase4_polish.sql`

Changes:
- Added `paused` to `leagues.status` constraint
- Added `trade_review_enabled` column to `leagues`
- RLS policies for `chat_messages` and `notifications`
- Performance indexes:
  - `notifications(user_id, is_read, created_at DESC)`
  - `scores(league_id, week, season)`
  - `chat_messages(league_id, created_at DESC) WHERE is_deleted = FALSE`
  - `matchups(league_id, week, is_final)`

---

### 7. Updated Files

**New backend routes:**
```
api/src/routes/chat.ts
api/src/routes/notifications.ts
api/src/routes/scoreboard.ts
api/src/routes/commissioner.ts
```

**Modified backend:**
```
api/src/index.ts         — Registered 4 new routers
```

**New frontend pages:**
```
src/src/pages/league/ChatPage.tsx
src/src/pages/league/ScoreboardPage.tsx
src/src/pages/league/CommissionerPage.tsx
src/src/pages/NotificationsPage.tsx
```

**Modified frontend:**
```
src/src/pages/LandingPage.tsx        — Full redesign
src/src/pages/LeaguePage.tsx         — Added Chat/Scoreboard/Commissioner tabs + routes
src/src/components/layout/Layout.tsx — Notification bell with badge count
src/src/App.tsx                      — Added /notifications route
```

**New migration:**
```
db/migrations/008_phase4_polish.sql
```

---

## Deployment Notes

### Run Migration 008
In Supabase SQL editor, run `db/migrations/008_phase4_polish.sql`.

This is safe to run idempotently (uses `IF NOT EXISTS`, `IF NOT EXISTS`, `DROP POLICY IF EXISTS`).

### Enable Supabase Realtime (Optional but Recommended)
For true live chat without polling:
1. Supabase Dashboard → Database → Replication
2. Enable Realtime on: `chat_messages`, `scores`, `matchups`

The app will work with polling (5s for chat, 60s for scores) even without Realtime enabled.

### Tank01 Score Sync
Live scoreboard requires the Tank01 API to push scores via:
```
POST /api/leagues/:id/scoreboard/update-score
Authorization: Bearer <admin-jwt>
{
  "playerId": "...",
  "week": 1,
  "season": 2026,
  "basePoints": 24.5,
  "cardModifier": 0,
  "isFinal": false,
  "statsJson": { ... }
}
```

This is an admin-only endpoint. A cron job or background service should call Tank01 every 60 seconds and push updates here.

---

## Known Limitations (MVP)

- Chat uses polling (5s) instead of WebSocket push. Upgrade to Supabase Realtime when configured.
- Lineup reminder and draft-starting notifications are not auto-triggered (need a cron/scheduler to run).
- Live score updates require an external sync process (Tank01 → this API). The endpoint exists; the cron is not yet built.
- Scoreboard shows 0-0 for matchups that haven't been created yet (schedule generation is Phase 2 work).

---

*Built by Monkey 🐒 — Phase 4, April 9, 2026*
