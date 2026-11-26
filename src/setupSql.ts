export const SETUP_SQL = `-- LETCHAT V2 COMPLETE DATABASE SETUP (Project: lqgixqbciaperisapfnm)
-- Run this entire script in your Supabase SQL Editor

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  status_text TEXT DEFAULT 'Hey there! I am using LetChat.',
  role TEXT DEFAULT 'user',
  is_banned BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_text TEXT DEFAULT 'Hey there! I am using LetChat.';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();
UPDATE profiles SET role = 'admin' WHERE LOWER(username) = 'bruce1';
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_all" ON profiles;
CREATE POLICY "profiles_all" ON profiles FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Backfill profiles for any existing authenticated or anonymous auth.users
INSERT INTO profiles (id, username, name, avatar_url, role)
SELECT
  au.id,
  CASE
    WHEN COALESCE(NULLIF(LOWER(REGEXP_REPLACE(COALESCE(au.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9_]', '', 'g')), ''), '') <> ''
      THEN LOWER(REGEXP_REPLACE(au.raw_user_meta_data->>'username', '[^a-zA-Z0-9_]', '', 'g')) || '_' || SUBSTRING(REPLACE(au.id::text, '-', '') FROM 1 FOR 4)
    WHEN au.is_anonymous
      THEN 'guest_' || SUBSTRING(REPLACE(au.id::text, '-', '') FROM 1 FOR 8)
    ELSE 'user_' || SUBSTRING(REPLACE(au.id::text, '-', '') FROM 1 FOR 8)
  END,
  COALESCE(
    NULLIF(au.raw_user_meta_data->>'name', ''),
    CASE WHEN au.is_anonymous THEN 'Guest User' ELSE 'LetChat User' END
  ),
  COALESCE(au.raw_user_meta_data->>'avatar_url', ''),
  CASE WHEN LOWER(COALESCE(au.raw_user_meta_data->>'username', '')) = 'bruce1' THEN 'admin' ELSE 'user' END
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.id)
ON CONFLICT DO NOTHING;

-- Auto-make bruce1 admin on insert/update
CREATE OR REPLACE FUNCTION set_bruce1_admin() RETURNS TRIGGER AS $$
BEGIN
  IF LOWER(NEW.username) = 'bruce1' THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_bruce1_admin ON profiles;
CREATE TRIGGER trg_bruce1_admin BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_bruce1_admin();

-- 2. FRIENDS
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'accepted',
  is_muted BOOLEAN DEFAULT false,
  is_blocked BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);
ALTER TABLE friends DROP CONSTRAINT IF EXISTS friends_user_id_fkey;
ALTER TABLE friends DROP CONSTRAINT IF EXISTS friends_friend_id_fkey;
ALTER TABLE friends
  ADD CONSTRAINT friends_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE friends
  ADD CONSTRAINT friends_friend_id_fkey
  FOREIGN KEY (friend_id) REFERENCES profiles(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "friends_all" ON friends;
CREATE POLICY "friends_all" ON friends FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 3. CHATS & GROUP MEMBERS
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_group BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chats_all" ON chats;
CREATE POLICY "chats_all" ON chats FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_members_all" ON chat_members;
CREATE POLICY "chat_members_all" ON chat_members FOR ALL USING (true) WITH CHECK (true);

-- 4. MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT DEFAULT '',
  image_url TEXT,
  video_url TEXT,
  sticker_url TEXT,
  voice_url TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT DEFAULT 0,
  duration INTEGER DEFAULT 0,
  type TEXT DEFAULT 'text',
  reply_to_id UUID,
  forwarded BOOLEAN DEFAULT false,
  deleted_for_everyone BOOLEAN DEFAULT false,
  is_flagged BOOLEAN DEFAULT false,
  report_count INTEGER DEFAULT 0,
  read_by JSONB DEFAULT '[]'::jsonb,
  read_at TIMESTAMP WITH TIME ZONE,
  reactions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sticker_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_everyone BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_by JSONB DEFAULT '[]'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ALTER COLUMN receiver_id DROP NOT NULL;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_text_len;
ALTER TABLE messages ADD CONSTRAINT messages_text_len CHECK (
  char_length(COALESCE(text, '')) >= 1
  OR media_url IS NOT NULL
  OR media_type IN ('audio', 'voice', 'video', 'image', 'sticker', 'document')
  OR voice_url IS NOT NULL
  OR video_url IS NOT NULL
  OR image_url IS NOT NULL
  OR file_url IS NOT NULL
  OR sticker_url IS NOT NULL
  OR type IN ('audio', 'voice', 'video', 'image', 'sticker', 'document')
);

-- Fix messages_sender_id_fkey so sender_id references profiles(id) (works for both regular & anonymous users)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey;
ALTER TABLE messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE NOT VALID;

-- Allow both authenticated and anonymous users to read, insert, update, delete messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_all" ON messages;
DROP POLICY IF EXISTS "messages_select_all" ON messages;
DROP POLICY IF EXISTS "messages_insert_all" ON messages;
DROP POLICY IF EXISTS "messages_update_all" ON messages;
DROP POLICY IF EXISTS "messages_delete_all" ON messages;
CREATE POLICY "messages_all" ON messages FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Open legacy public.users RLS if that table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "users_all" ON public.users;
    CREATE POLICY "users_all" ON public.users FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. MOMENTS + INTERACTIONS
CREATE TABLE IF NOT EXISTS moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT DEFAULT '',
  image_url TEXT,
  video_url TEXT,
  category TEXT DEFAULT 'General',
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE moments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moments_all" ON moments;
CREATE POLICY "moments_all" ON moments FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS moment_likes (
  moment_id UUID REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (moment_id, user_id)
);
ALTER TABLE moment_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moment_likes_all" ON moment_likes;
CREATE POLICY "moment_likes_all" ON moment_likes FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS moment_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT DEFAULT '',
  sticker_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE moment_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moment_comments_all" ON moment_comments;
CREATE POLICY "moment_comments_all" ON moment_comments FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS moment_saves (
  moment_id UUID REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (moment_id, user_id)
);
ALTER TABLE moment_saves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moment_saves_all" ON moment_saves;
CREATE POLICY "moment_saves_all" ON moment_saves FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows_all" ON follows;
CREATE POLICY "follows_all" ON follows FOR ALL USING (true) WITH CHECK (true);

-- 6. VIDEO CALLS (WebRTC Signaling + Call History)
CREATE TABLE IF NOT EXISTS video_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'ringing',
  call_type TEXT DEFAULT 'video',
  offer JSONB,
  answer JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE video_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_calls_all" ON video_calls;
CREATE POLICY "video_calls_all" ON video_calls FOR ALL USING (true) WITH CHECK (true);

-- 7. REPORTS & ADMIN LOGS
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES profiles(id),
  reported_user_id UUID REFERENCES profiles(id),
  content_type TEXT,
  content_id TEXT,
  content_text TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_all" ON reports;
CREATE POLICY "reports_all" ON reports FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES profiles(id),
  action TEXT,
  target_user_id UUID REFERENCES profiles(id),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_logs_all" ON admin_logs;
CREATE POLICY "admin_logs_all" ON admin_logs FOR ALL USING (true) WITH CHECK (true);

-- 8. STICKERS & FAVOURITES
CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  image_url TEXT NOT NULL,
  pack_name TEXT DEFAULT 'Custom',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stickers_all" ON stickers;
CREATE POLICY "stickers_all" ON stickers FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sticker_favourites (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sticker_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, sticker_id)
);
ALTER TABLE sticker_favourites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sticker_fav_all" ON sticker_favourites;
CREATE POLICY "sticker_fav_all" ON sticker_favourites FOR ALL USING (true) WITH CHECK (true);

-- 9. PUBLIC STORAGE BUCKETS FOR MEDIA (letchat-media + chat-media for fast audio/video)
INSERT INTO storage.buckets (id, name, public)
VALUES ('letchat-media', 'letchat-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
CREATE POLICY "public_media_read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id IN ('letchat-media', 'chat-media'));

DROP POLICY IF EXISTS "auth_media_insert" ON storage.objects;
CREATE POLICY "auth_media_insert" ON storage.objects FOR INSERT TO authenticated, anon WITH CHECK (bucket_id IN ('letchat-media', 'chat-media'));

DROP POLICY IF EXISTS "auth_media_update" ON storage.objects;
CREATE POLICY "auth_media_update" ON storage.objects FOR UPDATE TO authenticated, anon USING (bucket_id IN ('letchat-media', 'chat-media'));

-- 10. ENABLE REALTIME
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE video_calls;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE moments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE friends;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;
