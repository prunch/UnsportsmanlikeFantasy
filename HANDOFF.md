# Gridiron Cards — Cowork Handoff (paused mid-audit)

**Last updated:** April 10, 2026
**Previous handoff chain:** OpenClaw ("Viper") → Cowork (Claude Opus 4.6)
**Status:** League-loading bug fixed, password reset, SPA-404 fix written but not pushed, security audit paused mid-way. Safe to resume on any machine.

---

## TL;DR — paste this into a new Cowork session to resume

> Read `HANDOFF.md` at the root of this repo and pick up where the previous Cowork session left off. Start by checking git state — look for uncommitted changes to `src/public/_redirects`, `.claude/skills/simplify/SKILL.md`, `.claude/skills/frontend-design/SKILL.md`, and this handoff doc. Then continue the pending audit tasks listed in the handoff.

---

## Project basics

- **Repo:** `UnsportsmanlikeFantasy` (check `git remote -v` for remote URL)
- **Stack:** Vite + React + TypeScript + Tailwind (frontend), Node + Express + TypeScript (backend API), Supabase Postgres 17 + Auth, Render static host with auto-deploy from GitHub
- **Production URLs:**
  - Frontend: https://gridiron-frontend-jbfv.onrender.com
  - Backend: same origin, mounted at `/api`
- **Supabase project:** `Unsportsmanlike` — ref `dwtvqphgeuxvzueiaurl`, region `us-east-1`, Postgres 17.6.1.104
- **Frank's Supabase user ID:** `9bb71524-f0f2-493a-8071-8c83d9186398`
- **Frank's password:** was reset this session. Stored in Frank's password manager. Not recorded in this file.

---

## Critical architectural truths (verified this session)

Some of these were unclear in the docs and the previous agent got them wrong. Trust these:

1. **The frontend NEVER talks to Supabase directly.** `grep -r "supabase\|createClient\|@supabase/supabase-js" src/src/` returns zero matches. `src/src/utils/api.ts` is a plain `fetch` wrapper against `/api/*`. `src/src/stores/authStore.ts` is a Zustand store holding only `{token, user}`. All data access goes through the Express backend.

2. **The backend uses `service_role` exclusively.** All 19 `.from(...)` calls across `api/src/routes/` use `supabaseAdmin` (service_role), which bypasses RLS entirely. The anon `supabase` client exported from `api/src/utils/supabase.ts` is **never imported or used** anywhere. Confirmed by grep.

3. **Therefore: RLS on public tables is currently defense-in-depth only.** No live application traffic depends on RLS evaluation. This matters for the pending card-tables RLS migration — it's hardening, not functional.

4. **When you see `permission denied for table X`, think GRANTs, not RLS.** RLS failures return empty result sets, not permission errors. Check `information_schema.role_table_grants` first.

---

## What got fixed this session

### 1. League-loading bug ("Could not load your leagues: Failed to fetch leagues") — FIXED ✓

**Previous agent's theory (wrong):** Circular RLS on `teams` via `is_league_member()`, plus a missing `cards` SELECT policy. They shipped migration `20260410181040_fix_circular_rls_and_missing_cards_policy` which made `is_league_member` `SECURITY DEFINER` and added `cards` policies. That migration is on the database, but (a) RLS is disabled on `cards` so the new policies are inert, and (b) neither change addressed the real bug.

**Actual root cause:** Postgres logs showed `ERROR: permission denied for table teams` and `ERROR: permission denied for table notifications` — these are GRANT errors, not RLS errors. A query against `information_schema.role_table_grants` showed that only `users` and `waiver_claims` had grants for the `authenticated` role; every other public table had zero grants for `authenticated`/`anon`. Six card-related tables were missing even `service_role` grants.

**Fix applied:** Migration `20260410182541_fix_missing_table_grants_for_supabase_roles` grants:

- `USAGE` on schema `public` to `anon`, `authenticated`, `service_role`
- `SELECT/INSERT/UPDATE/DELETE` on `teams`, `leagues`, `notifications`, `chat_messages`, `draft_picks`, `matchups`, `rosters`, `scores`, `transactions` to `authenticated`
- `SELECT` on `players`, `leagues` to `anon`
- `ALL` on `cards`, `played_cards`, `user_cards`, `switcheroo_log`, `user_switcheroo`, `weekly_card_picks`, `draft_picks` to `service_role`
- `USAGE, SELECT` on all sequences to `authenticated, service_role`
- `ALTER DEFAULT PRIVILEGES` for future tables created by `postgres`

**Verified:** Simulated `authenticated` role with Frank's UUID via `SET LOCAL role = 'authenticated'; SET LOCAL request.jwt.claim.sub = '9bb71524-...';` and confirmed both leagues return: "Juana Maria" (status: draft) and "yyyyy" (status: setup).

### 2. Password reset — DONE ✓

The previous OpenClaw agent had changed Frank's password and not communicated the new value. Reset via direct SQL on `auth.users`:

```sql
UPDATE auth.users
SET encrypted_password = crypt('<new password>', gen_salt('bf')),
    updated_at = now()
WHERE email = 'frank.higgins@gmail.com';
```

New password is in Frank's password manager. Not recorded here.

### 3. SPA refresh-404 — FIX WRITTEN, NOT PUSHED ⚠️

Refreshing `https://gridiron-frontend-jbfv.onrender.com/dashboard` returned 404 because Render's static host has no knowledge of React Router client-side routes.

**Fix:** Created `src/public/_redirects`:

```
/*    /index.html   200
```

Vite copies `src/public/` → `dist/` on build, and Render honors `_redirects` files in the served directory. This turns all unknown routes into a 200 serving `index.html`, letting React Router take over.

**Status:** File exists locally. **Not committed, not pushed, not deployed.** Needs to ship before the fix is live.

---

## Uncommitted changes to commit & push before switching machines

```
src/public/_redirects                                # SPA 404 fix
.claude/skills/simplify/SKILL.md                     # installed this session
.claude/skills/frontend-design/SKILL.md              # installed this session
HANDOFF.md                                           # this file
```

Suggested commit:

```bash
git add src/public/_redirects .claude/skills HANDOFF.md
git commit -m "Add SPA redirect fix, install simplify/frontend-design skills, add handoff doc"
git push
```

---

## Pending work — the 5-task audit (paused mid-way)

Frank asked for 5 audit tasks. Three are complete, two remain, plus a final consolidated report.

### Completed ✓

1. **Read project docs** — STATUS.md, SPEC.md, BUILD_LOG.md, PHASE4_NOTES.md, CARD_SYSTEM.md, PROJECT_INDEX.md. Context established.
2. **Audit committed `.env`** — file IS committed but every `SUPABASE_*` value is `placeholder-*`. One real-ish value: `JWT_SECRET=dev-secret-change-in-production`. Render overrides everything at deploy time so no production secret is actually leaked. Still worth tightening (see pending decisions).
3. **Run Supabase advisors** — findings below.
4. **Code-level security review** — verified the "frontend never touches Supabase" fact above, which simplifies the pending RLS work considerably.

### Pending

1. **Clean up duplicate `chat_messages` RLS policies.** Migration `002_rls_policies.sql` created `chat_select_member` and `chat_insert_member`. Migration `008_phase4_polish.sql` then created duplicate `chat_messages_select` and `chat_messages_insert` doing the same thing. Need a cleanup migration that DROPs the duplicates (probably the 008 versions, since they're the later addition).

2. **Write RLS-on migration draft for card tables** (Frank reviews before applying). Tables: `cards`, `played_cards`, `user_cards`, `switcheroo_log`, `user_switcheroo`, `weekly_card_picks`. All currently have RLS disabled — the advisors flag this as an ERROR for the three tables with orphaned policies. Recommended posture based on verified architecture: enable RLS, create NO policies for `authenticated`/`anon` (locks them out of direct REST access entirely), `service_role` continues to bypass and serves all app traffic via the backend. Frank needs to sign off before applying.

3. **Deliver consolidated findings report** — one clean message summarizing all 5 audit tasks, advisor output, and recommendations. Not yet written.

---

## Supabase advisor findings (as of April 10, 2026)

### Security — ERROR
- `policy_exists_rls_disabled` on `public.cards` — has policies `cards_all_admin`, `cards_select_authenticated`, but RLS is disabled.
- `policy_exists_rls_disabled` on `public.played_cards` — has policy `played_cards_select`, but RLS is disabled.
- `policy_exists_rls_disabled` on `public.user_cards` — has policy `user_cards_select_own`, but RLS is disabled.

Fix: the pending RLS-on migration (pending task #2 above).

### Security — INFO / WARN
- `rls_enabled_no_policy` on `public.api_config` — RLS on, no policies, so non-service-role access is blocked entirely. Probably intentional.
- `rls_enabled_no_policy` on `public.draft_picks` — same. Probably intentional.
- `function_search_path_mutable` on `public.update_updated_at` — mutable search_path. Fix: `ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;`
- `rls_policy_always_true` on `public.users` — the `users_insert` policy uses `WITH CHECK (true)`, i.e. unrestricted. Is this intentional for the signup flow? Frank needs to confirm.
- `auth_leaked_password_protection` — HaveIBeenPwned integration is disabled in Supabase Auth. Enable in Supabase dashboard → Auth → Policies.

Performance advisors were also run; findings were minor and non-blocking.

---

## Supabase migrations applied this session

1. `20260410181040_fix_circular_rls_and_missing_cards_policy` — **previous agent (Viper).** Added `SECURITY DEFINER` to `is_league_member()`, added `cards` policies. Harmless but not the actual fix.
2. `20260410182541_fix_missing_table_grants_for_supabase_roles` — **this session.** The real fix for the league-loading bug. Grants table privileges to `authenticated`/`anon`/`service_role` and sets default privileges.

Both are in `db/migrations/` once you export them, or visible via `mcp__supabase__list_migrations` with project ref `dwtvqphgeuxvzueiaurl`.

---

## Known gotchas & things not to trust

- **STATUS.md is stale.** It references a VPS deployment at `srv1561102.hstgr.cloud:4444`. The app moved to Render. Don't trust STATUS.md for deployment info.
- **The previous agent's "circular RLS loop" diagnosis was wrong.** If future issues look similar, check grants before blaming RLS.
- **The `.env` file at repo root is committed with placeholders**, so it's NOT a source of secrets — but it's also not a source of truth for what env vars the app needs. Cross-reference with `api/src/index.ts` and Render's env-var dashboard.

---

## Pending decisions for Frank

1. **RLS posture for card tables:** approve the "enable RLS, no authenticated policies, service_role continues to bypass" recommendation, or want something else?
2. **Committed `.env` file:** keep as-is with placeholders, or move to `.env.example` + `.gitignore` the real file?
3. **`users_insert` RLS policy** with `WITH CHECK (true)`: intentional for signup flow, or tighten?
4. **Promote skills to Cowork-global?** They're currently project-local. Instructions below if yes.

---

## Cross-machine transfer (Mac → Windows)

### Before leaving the Mac
1. Commit and push the uncommitted changes listed above. Without this, nothing crosses over.
2. *(Optional)* Copy the two new skills to your Cowork-global folder so they load in sessions on any project:
   ```bash
   mkdir -p ~/.claude/skills
   cp -R ~/Code/UnsportsmanlikeFantasy/.claude/skills/simplify ~/.claude/skills/
   cp -R ~/Code/UnsportsmanlikeFantasy/.claude/skills/frontend-design ~/.claude/skills/
   ```

### On Windows
1. Install Cowork from the Claude desktop app.
2. Clone the repo:
   ```
   git clone <repo url> %USERPROFILE%\Code\UnsportsmanlikeFantasy
   ```
3. In Cowork, select `%USERPROFILE%\Code\UnsportsmanlikeFantasy` as your workspace folder.
4. *(Optional)* Promote skills to Cowork-global on Windows:
   ```
   mkdir %USERPROFILE%\.claude\skills 2>nul
   xcopy /E /I /Y "%USERPROFILE%\Code\UnsportsmanlikeFantasy\.claude\skills\simplify" "%USERPROFILE%\.claude\skills\simplify"
   xcopy /E /I /Y "%USERPROFILE%\Code\UnsportsmanlikeFantasy\.claude\skills\frontend-design" "%USERPROFILE%\.claude\skills\frontend-design"
   ```
5. Start a new Cowork chat and paste the TL;DR prompt from the top of this document.

### What won't auto-travel
- Cowork conversation history (new session starts fresh on Windows — hence this doc)
- Any local `.env` files you have outside the repo
- Cowork connectors / MCP server configurations (per-install)

### What travels for free
- All Supabase state (migrations, grants, password, data) — it's on the server
- The Render deployment — unchanged
- Anything in git once pushed

---

*Written by Cowork (Claude Opus 4.6) after taking over from OpenClaw. Reflects only what was verified this session — if anything looks wrong or stale, check before acting on it.*
