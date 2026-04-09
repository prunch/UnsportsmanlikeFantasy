-- Gridiron Cards — Phase 3: Card System
-- Migration 004: Cards pool table
-- Run this in your Supabase SQL editor AFTER 001, 002, 003

-- ============================================================
-- CARDS (admin-managed pool of available cards)
-- ============================================================
CREATE TABLE IF NOT EXISTS cards (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  target_type    TEXT NOT NULL DEFAULT 'position' CHECK (target_type IN ('player', 'position', 'all')),
  target_position TEXT CHECK (target_position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'All')),
  effect_type    TEXT NOT NULL CHECK (effect_type IN ('buff', 'debuff')),
  modifier_type  TEXT NOT NULL CHECK (modifier_type IN ('absolute', 'percentage')),
  modifier_value NUMERIC(10, 2) NOT NULL,
  rarity         TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active cards (most common query for weekly pick)
CREATE INDEX IF NOT EXISTS idx_cards_active ON cards(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);

-- Seed some starter cards so the pool isn't empty
INSERT INTO cards (title, description, target_type, target_position, effect_type, modifier_type, modifier_value, rarity) VALUES
  ('Party Boat',       'All WRs lose 15% of points after a fun day on the water.',          'position', 'WR',  'debuff', 'percentage', 15,   'uncommon'),
  ('Rocket Fuel',      'One RB gets an extra burst — +20% points this week.',                'position', 'RB',  'buff',   'percentage', 20,   'rare'),
  ('Cold Hands',       'A QB fumbles the snap. -10 points this week.',                       'position', 'QB',  'debuff', 'absolute',   10,   'common'),
  ('Hot Streak',       'One WR is on fire. +15% points.',                                    'position', 'WR',  'buff',   'percentage', 15,   'common'),
  ('Coach''s Favorite','A TE gets featured in the game plan. +8 points.',                    'position', 'TE',  'buff',   'absolute',   8,    'uncommon'),
  ('Nagging Hamstring','An RB is dealing with a nagging injury. -15% points.',               'position', 'RB',  'debuff', 'percentage', 15,   'common'),
  ('Field Goal Clinic','A K is money from anywhere this week. +6 points.',                   'position', 'K',   'buff',   'absolute',   6,    'common'),
  ('Turnover Machine', 'A DEF is opportunistic — +10% points.',                              'position', 'DEF', 'buff',   'percentage', 10,   'uncommon'),
  ('Red Zone Target',  'A TE sees extra targets near the goal line. +10% points.',           'position', 'TE',  'buff',   'percentage', 10,   'common'),
  ('Rookie Wall',      'A QB hits the rookie wall hard. -20% points.',                       'position', 'QB',  'debuff', 'percentage', 20,   'rare'),
  ('Deep Ball Magic',  'All WRs benefit from a vertical passing scheme. +5% points.',        'position', 'WR',  'buff',   'percentage', 5,    'common'),
  ('Run Stuff Defense','All RBs get stuffed at the line. -10% points.',                      'position', 'RB',  'debuff', 'percentage', 10,   'uncommon')
ON CONFLICT DO NOTHING;
