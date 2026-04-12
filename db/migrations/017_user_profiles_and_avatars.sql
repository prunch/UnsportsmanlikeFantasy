-- Migration 017: User profiles & avatar storage
-- Adds username, bio, notification prefs, public profile toggle
-- Creates avatars storage bucket with RLS

-- 1. Add new profile columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS notify_matchup_results BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_trade_offers BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_league_chat BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_card_events BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_profile_public BOOLEAN NOT NULL DEFAULT true;

-- 2. Add CHECK constraint on username (alphanumeric + underscores, 3-24 chars)
ALTER TABLE public.users
  ADD CONSTRAINT users_username_format
  CHECK (username IS NULL OR (username ~ '^[a-zA-Z0-9_]{3,24}$'));

-- 3. Add CHECK constraint on bio length
ALTER TABLE public.users
  ADD CONSTRAINT users_bio_length
  CHECK (bio IS NULL OR length(bio) <= 500);

-- 4. Replace restrictive SELECT policy with public profile support
DROP POLICY IF EXISTS users_select_own ON public.users;

CREATE POLICY users_select_public ON public.users
  FOR SELECT
  USING (
    id = auth.uid()
    OR is_profile_public = true
  );

-- 5. Create avatars storage bucket (public, 2MB limit, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- 6. Storage RLS policies for avatars bucket
CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY avatars_upload_own ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
