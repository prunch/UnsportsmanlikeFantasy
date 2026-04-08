# Fantasy Football App — Project Index
**Project:** Gridiron Cards (Fantasy Football with MTG-style card system)  
**Location:** `/data/.openclaw/workspace/projects/fantasy-football/`  
**Spec:** `SPEC.md` (single source of truth)  
**Status:** Phase 1 — Foundation (in progress)  
**Deployed URL:** `http://srv1561102.hstgr.cloud:4444/` (target)  
**Port:** 4444 (nginx reverse proxy → Docker/PM2)  
**Database:** Supabase (PostgreSQL + Auth + Realtime)  
**API:** Tank01 NFL API via RapidAPI  

---

## Quick Start for Any Agent

1. **Read the spec:** `SPEC.md` — all requirements, tech stack, card system rules
2. **Check current status:** See `STATUS.md` (this folder) for what's built vs pending
3. **Check build notes:** See `BUILD_LOG.md` for decisions, issues, workarounds
4. **Code location:** `src/` (frontend), `api/` (backend), `db/` (migrations)
5. **Deploy:** `./deploy.sh` (or manual: build → Docker → PM2 → nginx)

---

## Project Structure

```
projects/fantasy-football/
├── SPEC.md              # Product spec (READ FIRST)
├── PROJECT_INDEX.md     # This file — orientation for agents
├── STATUS.md            # Current build status, what's done/pending
├── BUILD_LOG.md         # Decisions, issues, workarounds, lessons learned
├── .env.example         # Required environment variables
├── src/                 # React frontend
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── stores/
│   └── utils/
├── api/                 # Node.js/Express backend
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   └── types/
├── db/                  # Database migrations & seeds
│   ├── migrations/
│   └── seeds/
├── docker/              # Docker configs
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── nginx.conf
├── scripts/             # Build & deploy scripts
│   ├── setup.sh
│   ├── build.sh
│   └── deploy.sh
└── docs/                # Additional docs
    ├── API.md
    ├── CARD_SYSTEM.md
    └── DEPLOY.md
```

---

## Phase Breakdown (from SPEC.md)

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Foundation: Auth, user accounts, league create/join, DB schema, admin panel skeleton, Tank01 API config | **IN PROGRESS** |
| **Phase 2** | Core Fantasy: Roster management, lineup setting, waiver wire, trades, draft room, live scoring | Pending |
| **Phase 3** | Card System: Card manager (admin), card pool, weekly pick UI, card play UI, Switcheroo logic | Pending |
| **Phase 4** | Polish & Live: Live chat, notifications, scoreboard updates, landing page, commissioner tools | Pending |

---

## Environment Variables Required

Copy `.env.example` to `.env` and fill in:

```bash
# Supabase (DB + Auth + Realtime)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Tank01 NFL API (RapidAPI)
TANK01_API_KEY=

# App Config
NODE_ENV=production
PORT=3000
JWT_SECRET=
ADMIN_PASSWORD_HASH=

# Frontend
VITE_API_URL=http://srv1561102.hstgr.cloud:4444/api
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## Deployment Architecture

```
User → Hostinger VPS (srv1561102.hstgr.cloud)
            ↓
       Nginx (port 4444)
            ↓
    ┌───────┴───────┐
    ↓               ↓
Frontend (80)    API (3000)
(React static)   (Node/Express)
    ↓               ↓
    └───────┬───────┘
            ↓
       Supabase (cloud)
    (Postgres + Auth + Realtime)
```

---

## Key Decisions Logged

- **Port 4444** — Chosen to avoid conflict with Command Center (3333)
- **Supabase** — Cloud-hosted DB/Auth/Realtime (no VPS DB management)
- **PM2** — Process manager for Node API
- **Docker** — Containerized deployment
- **Tank01 API** — Live NFL stats via RapidAPI

---

## Agent Handoff Notes

**If you're a new agent picking this up:**

1. Read `SPEC.md` completely — it's comprehensive
2. Check `STATUS.md` for current progress
3. Check `BUILD_LOG.md` for any issues or workarounds
4. Run `./scripts/setup.sh` to install dependencies
5. Run `./scripts/build.sh` to build
6. Run `./scripts/deploy.sh` to deploy

**If switching models:**
- Kimi K2.5 (me/Viper) — good for architecture, planning, documentation
- Claude Sonnet 4.6 (Monkey) — good for coding, implementation, debugging
- Either can read this index and continue seamlessly

---

## Contact / Owner

- **Frank Higgins** — Product owner, requirements, testing
- **Viper** (main agent) — Architecture, coordination, documentation
- **Monkey** (subagent) — Implementation, coding, deployment

---

*Last updated: April 8, 2026 by Viper*  
*Next action: Monkey to rebuild Phase 1 and deploy*
