# Fantasy Football App — Product Specification
**Version:** 1.0 MVP  
**Date:** April 7, 2026  
**Status:** Approved for Development

---

## 1. OVERVIEW

A full-featured NFL fantasy football web app modeled after Yahoo Fantasy Football, with an added MTG-inspired card system that lets users buff/debuff players weekly, adding conflict and strategy. MVP targets a single season, snake draft, standard PPR scoring.

---

## 2. TECH STACK

**Frontend:** React + TypeScript + Tailwind CSS  
**Backend:** Node.js + Express + TypeScript  
**Database:** PostgreSQL (via Supabase — already connected via Maton)  
**Auth:** Supabase Auth (email/password + Google OAuth)  
**Real-time:** Supabase Realtime (live chat, score updates, card reveals)  
**Live Stats:** Tank01 NFL API via RapidAPI (key supplied via admin panel)  
**Hosting:** Hostinger VPS (Docker) — same server as OpenClaw  
**Process Manager:** PM2  
**Rationale:** Scalable, well-documented, easy for a dev to pick up, all open-source except Supabase hosted tier

---

## 3. LEAGUE STRUCTURE

| Setting | Value |
|---|---|
| Teams per league | 10–12 (commissioner-configurable at creation) |
| League type | Private only (invite via link/code) |
| Multiple leagues | Yes — one user can create/join multiple leagues |
| Commissioner | One per league; the user who creates the league |
| Super Admin | Separate admin panel for app owner only |
| Public leagues | Not in MVP (architected for future addition) |

---

## 4. SEASON STRUCTURE

Following standard Yahoo Fantasy Football defaults:

| Setting | Value |
|---|---|
| Regular season | Weeks 1–14 |
| Playoffs | Weeks 15–17 |
| Teams in playoffs | Top 6 (1st-place teams in each division get byes if applicable; else top 2 get byes) |
| Consolation bracket | Yes — eliminated teams continue playing |
| Trade deadline | Commissioner-configurable week (default: Week 11) |
| Waiver wire | Simple priority order (worst record gets first waiver priority) |
| Waiver reset | Weekly, priority resets based on standings |

---

## 5. DRAFT

| Setting | Value |
|---|---|
| Draft type | Snake (standard serpentine) |
| Order | Randomized at commissioner's command |
| Timer | 90 seconds per pick (commissioner-configurable: 60/90/120s) |
| Auto-pick | Yes — if timer expires, best available player by ADP auto-picked |
| Draft lobby | Live room — all managers see picks in real-time |
| Pre-draft rankings | Each user can set personal rankings before draft |
| Draft board | Full board visible to all during draft |

---

## 6. ROSTER

Following standard Yahoo roster exactly:

| Slot | Count |
|---|---|
| QB | 1 |
| RB | 2 |
| WR | 2 |
| TE | 1 |
| FLEX (RB/WR/TE) | 1 |
| K | 1 |
| DEF | 1 |
| Bench | 6 |
| IR | 2 |
| **Total** | **17** |

**IR rules:** Player must have official "IR" or "Out" designation to be placed on IR slot.

---

## 7. SCORING

Standard Yahoo PPR (Point Per Reception). All values match Yahoo defaults exactly:

**Passing:**
- TD pass: 4 pts
- 25 passing yards: 1 pt
- INT thrown: -1 pt
- 2pt conversion pass: 2 pts

**Rushing:**
- TD rush: 6 pts
- 10 rushing yards: 1 pt
- 2pt conversion rush: 2 pts

**Receiving:**
- Reception: 1 pt (PPR)
- TD reception: 6 pts
- 10 receiving yards: 1 pt
- 2pt conversion reception: 2 pts

**Kicking:**
- FG 0-19 yds: 3 pts
- FG 20-29 yds: 3 pts
- FG 30-39 yds: 3 pts
- FG 40-49 yds: 4 pts
- FG 50+ yds: 5 pts
- PAT made: 1 pt
- PAT missed: -1 pt

**Defense/ST:**
- TD: 6 pts
- Sack: 1 pt
- INT: 2 pts
- Fumble recovery: 2 pts
- Safety: 2 pts
- Blocked kick: 2 pts
- 0 pts allowed: 10 pts
- 1-6 pts allowed: 7 pts
- 7-13 pts allowed: 4 pts
- 14-20 pts allowed: 1 pt
- 21-27 pts allowed: 0 pts
- 28-34 pts allowed: -1 pt
- 35+ pts allowed: -4 pts

---

## 8. CARD SYSTEM

### 8.1 Overview
Each manager has a personal "stack" (hand) of cards they can play weekly to buff or debuff players — their own, their weekly opponent's, or any player in the league.

### 8.2 Card Anatomy

Each card has:
| Field | Description |
|---|---|
| **Title** | Funny/creative name (e.g. "Party Boat") |
| **Description** | Flavor text describing the effect (e.g. "All WRs lose 15% of points after a fun day on the boat") |
| **Target type** | Individual player OR position group (QB / RB / WR / TE / K / DEF / All RBs / All WRs etc.) |
| **Effect type** | Buff or Debuff |
| **Modifier type** | Absolute (e.g. +10 points) or Percentage (e.g. +15%) |
| **Modifier value** | Numeric value |
| **Rarity** | Common / Uncommon / Rare (visual only in MVP, affects card back art) |

### 8.3 Card Pool Management (Admin)

Admin panel includes a **Card Manager** with full CRUD:
- Create cards with all fields above
- Edit existing cards
- Delete/disable cards
- Preview card UI before publishing
- Cards enter the pool and become available for the weekly pick phase

### 8.4 Weekly Card Cycle

**Timeline (example: Monday night = end of week)**

| Phase | Timing | What Happens |
|---|---|---|
| Week ends | Monday night (NFL Monday Night Football final whistle) | Played cards burned, removed from all stacks |
| New card pick | Tuesday–Wednesday | Users presented with "Pick 3 new cards" UI |
| Card pick UI | Presented with 12 face-down cards | User selects 3; cards flip and reveal |
| Cards in stack | Rest of week | User holds up to 6 cards (3 persistent slots, up to 3 new) |
| Play window | Opens with lineup lock (Thu ~8PM ET) | Users play up to 3 cards |
| Cards revealed | Sunday 1PM ET (first game kickoff) | Opponent can see played cards |
| Cards resolved | Final score calculation | Applied to final weekly scores |

### 8.5 Stack Size & Limits

| Rule | Value |
|---|---|
| Max cards in stack | 6 |
| Cards received per week | 3 (via pick UI) |
| Cards playable per week | Up to 3 (1 on own team, 1 on weekly opponent, 1 on any team in league) |
| Unplayed cards | Remain in stack for future weeks (don't expire until played or week burn) |

### 8.6 Card Play Rules

**Three play slots per week:**
1. **Your team** — buff or debuff a player on your own roster
2. **Your weekly opponent** — buff or debuff a player on their roster
3. **Any team ("just because")** — buff or debuff any player in the league

Played cards are secret (face-down) until the first game of the week kicks off (Sunday 1PM ET). At kickoff, all played cards are simultaneously revealed to all league members.

**Math resolution when cards conflict:**
- Cards resolve in the order they were played (timestamp)
- Example: Opponent plays "All RBs -10%" first, user plays "All RBs +15%" second → net effect is +15% applied after -10% (sequential math, not additive)
- A card cannot be directly countered except by the Switcheroo (see below)

### 8.7 The Ole Switcheroo (Persistent Card)

- Every manager has 1 permanent card: **"The Ole Switcheroo"**
- This card is always in their hand — it does not count toward the 6-card stack limit
- **Effect:** Protects one chosen player on your roster; any debuff played on that player this week is reflected back onto the player it was meant to debuff (on the opponent's team who played it, targeting their equivalent position if possible, else their highest scorer)
- **Weekly limit:** 1 play per week
- **Restriction:** Cannot be played on the same player 2 weeks in a row
- **Does not expire; does not burn; cannot be lost**

### 8.8 Card Pick UI

- Presented with 12 cards, face-down with card back design
- User clicks/taps to flip and reveal cards one at a time (reveal animation)
- After revealing any card, user can "Take it" or "Keep flipping"
- Once 3 cards are selected, the pick phase closes
- If user skips the pick phase entirely (doesn't log in), 3 random cards are auto-assigned

### 8.9 Cards in Playoffs

Card system operates identically in playoffs — no changes to rules.

---

## 9. LIVE STATS INTEGRATION

**Provider:** Tank01 NFL Live In-Game Real-Time Statistics (RapidAPI)  
**Key:** Supplied by admin via Admin Panel (stored securely in DB, never in code)  
**Update frequency:** Every 60 seconds during live games  
**Data used:** Live player stats → calculate live fantasy scores → update scoreboard in real-time  
**Off-season / preseason:** Scores frozen; no live updates

---

## 10. USER ACCOUNTS & AUTH

| Feature | Detail |
|---|---|
| Sign up | Email/password OR Google OAuth |
| Login | Same |
| Password reset | Email-based |
| Profile | Display name, avatar (upload or default generated), team name |
| Multiple leagues | One account can join/create multiple leagues |

---

## 11. FRONTEND PAGES & FEATURES

### Public (unauthenticated)
- **Landing page** — clean/vanilla for MVP: headline, feature bullets, Sign Up / Log In CTAs. Not pretty yet — functional only.
- **Login / Sign Up pages**

### Authenticated — League Hub
- **My Leagues** dashboard — all leagues user is in, quick stats
- **Create League** flow — name, size (10-12), scoring (PPR locked for MVP), draft settings
- **Join League** — via invite code or link

### Per-League Pages
- **League Home** — current week scores, standings, news ticker
- **My Team** — roster management, lineup setting, add/drop players
- **Scoreboard** — current week matchups with live scores
- **Standings** — full season standings table
- **Schedule** — full season schedule
- **Players** — player search, stats, add/drop/waiver claims
- **Trade Center** — propose/accept/reject trades
- **Draft Room** — live draft interface
- **Card Deck** — user's current stack, play cards, view played cards
- **Card Pick** — weekly 12-card flip UI (available Tue-Wed)
- **Live Chat** — league-wide chat (Supabase Realtime)
- **Transactions** — full log of all adds/drops/trades
- **Settings** — commissioner-only league settings panel

### Admin Panel (super-admin only, separate subdomain or /admin route)
- User management
- League oversight (view/edit any league)
- Card Manager (CRUD)
- Tank01 API key configuration
- System health / logs

---

## 12. LIVE CHAT

- League-wide chat room per league (not DMs in MVP)
- Supabase Realtime WebSocket
- Basic moderation: commissioner can delete messages
- Messages persist (stored in DB, viewable as history)
- No push notifications in MVP

---

## 13. NOTIFICATIONS (MVP SCOPE)

In-app only (no push/email in MVP):
- Trade offer received
- Waiver claim result
- Card played against you (revealed at kickoff)
- Lineup reminder (Friday 6PM if lineup has empty slots)
- Draft starting soon

---

## 14. COMMISSIONER TOOLS

| Tool | Description |
|---|---|
| League settings | Edit name, rules within season limits |
| Trade deadline | Set week number |
| Trade review | Approve/veto trades (optional setting) |
| Manage rosters | Emergency add/drop override |
| Reset waivers | Manual waiver priority reset |
| Start draft | Trigger draft when all teams filled |
| Chat moderation | Delete messages |
| Pause/resume season | Emergency control |

---

## 15. DATA ARCHITECTURE (HIGH LEVEL)

**Core tables:**
- `users` — auth + profile
- `leagues` — settings, commissioner, season state
- `teams` — one per user per league
- `rosters` — player slots per team per week
- `matchups` — weekly head-to-head pairings
- `scores` — live + final scores per player per week
- `players` — NFL player registry (synced from Tank01)
- `transactions` — add/drop/trade/waiver log
- `draft_picks` — full draft history
- `cards` — card pool (admin-managed)
- `user_cards` — each user's current stack
- `played_cards` — cards played per week, timestamps, targets
- `chat_messages` — league chat
- `notifications` — in-app notification queue
- `api_config` — admin-stored API keys (encrypted)

---

## 16. DEPLOYMENT

- Hosted on existing Hostinger VPS (Docker)
- Port: TBD (not 3333 — that's Command Center)
- PM2 process manager
- Nginx reverse proxy (same as existing setup)
- Environment variables for all secrets
- Supabase for DB + Auth + Realtime (cloud-hosted, no VPS DB management)

---

## 17. OUT OF SCOPE (MVP)

- Public leagues
- Mobile app (web responsive only)
- Push notifications
- Real-money / paid leagues
- Multiple seasons / historical data
- Auction draft
- Dynasty leagues
- Custom scoring beyond PPR
- Advanced player projections
- Social features beyond league chat

---

## 18. OPEN QUESTIONS / FUTURE CONSIDERATIONS

- Card rarity system — purely visual in MVP but system is ready to expand (rare cards could have stronger effects, limited supply, etc.)
- Card trading between users — future feature
- Public leagues — architecture already supports it
- Mobile app — React Native reuse of component logic
- Monetization — commissioner pays to create league, or premium card packs

---

## 19. DEVELOPMENT PHASES

**Phase 1 — Foundation**
- Auth, user accounts, league creation/join, basic DB schema, admin panel skeleton, Tank01 API config

**Phase 2 — Core Fantasy**
- Roster management, lineup setting, waiver wire, trades, draft room, live scoring

**Phase 3 — Card System**
- Card manager (admin), card pool, weekly pick UI, card play UI, Switcheroo logic, score resolution

**Phase 4 — Polish & Live**
- Live chat, notifications, scoreboard live updates, landing page, commissioner tools, full QA

---

*Spec authored by Viper · April 7, 2026*  
*Ready for development handoff to Monkey*
