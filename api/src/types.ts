// ============================================================
// Shared TypeScript types for the Fantasy Football server
// ============================================================

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface League {
  id: string;
  name: string;
  commissioner_id: string;
  team_count: number; // 10-12
  invite_code: string;
  season_year: number;
  status: 'pending' | 'drafting' | 'active' | 'playoffs' | 'complete';
  trade_deadline_week: number;
  draft_timer_seconds: number; // 60, 90, or 120
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  league_id: string;
  user_id: string;
  team_name: string;
  avatar_url: string | null;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  waiver_priority: number;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  tank01_id: string | null;
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
  nfl_team: string;
  status: 'active' | 'injured' | 'ir' | 'out' | 'questionable' | 'doubtful';
  injury_designation: string | null;
  value_rank: number | null; // Expert consensus rank (lower = more valuable); null = unranked
  created_at: string;
  updated_at: string;
}

export interface ApiConfig {
  id: string;
  key_name: string;
  encrypted_value: string;
  created_at: string;
  updated_at: string;
}

// JWT payload attached to authenticated requests
// Note: tokens are signed with { id, email, role } — NOT using 'sub'
export interface JwtPayload {
  id: string;    // Supabase user ID (matches what signToken() embeds)
  email: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
}

// Express request extension — adds the decoded user to req.user
// Shape must match the payload set by requireAuth() in middleware/auth.ts
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}
