export const SETUP_SQL = `-- LETCHAT FLOW DATABASE SETUP (Project: lqgixqbciaperisapfnm)
-- Run this script in your Supabase SQL Editor

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  about TEXT DEFAULT 'On LetChat FLOW',
  bio TEXT DEFAULT '',
  status_text TEXT DEFAULT 'On LetChat FLOW',
  role TEXT DEFAULT 'user',
  is_banned BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS about TEXT DEFAULT 'On LetChat FLOW';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_text TEXT DEFAULT 'On LetChat FLOW';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE OR REPLACE FUNCTION sync_flow_profile_fields() RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NULLIF(TRIM(NEW.full_name), ''), '') <> '' AND COALESCE(NULLIF(TRIM(NEW.name), ''), '') = '' THEN
    NEW.name := NEW.full_name;
  ELSIF COALESCE(NULLIF(TRIM(NEW.name), ''), '') <> '' AND COALESCE(NULLIF(TRIM(NEW.full_name), ''), '') = '' THEN
    NEW.full_name := NEW.name;
  END IF;
  IF COALESCE(NEW.about, '') <> '' AND COALESCE(NEW.bio, '') = '' THEN
    NEW.bio := NEW.about;
  ELSIF COALESCE(NEW.bio, '') <> '' AND COALESCE(NEW.about, '') = '' THEN
    NEW.about := NEW.bio;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_flow_profile_fields ON profiles;
CREATE TRIGGER trg_sync_flow_profile_fields
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_flow_profile_fields();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_all" ON profiles;
CREATE POLICY "profiles_all" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. FRIENDS
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  is_muted BOOLEAN DEFAULT false,
  is_blocked BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "friends_all" ON friends;
CREATE POLICY "friends_all" ON friends FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. CHATS & DIRECT MESSAGES
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_group BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chats_all" ON chats;
CREATE POLICY "chats_all" ON chats FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_members_all" ON chat_members;
CREATE POLICY "chat_members_all" ON chat_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT DEFAULT '',
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  text TEXT DEFAULT '',
  type TEXT DEFAULT 'text',
  media_type TEXT,
  media_url TEXT,
  image_url TEXT,
  video_url TEXT,
  sticker_url TEXT,
  voice_url TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT DEFAULT 0,
  duration INTEGER DEFAULT 0,
  reply_to_id UUID,
  forwarded BOOLEAN DEFAULT false,
  deleted_for_everyone BOOLEAN DEFAULT false,
  is_flagged BOOLEAN DEFAULT false,
  report_count INTEGER DEFAULT 0,
  is_read BOOLEAN DEFAULT false,
  read_by JSONB DEFAULT '[]'::jsonb,
  read_at TIMESTAMP WITH TIME ZONE,
  reactions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS text TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sticker_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_for_everyone BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_by JSONB DEFAULT '[]'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
ALTER TABLE messages ALTER COLUMN receiver_id DROP NOT NULL;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_text_len;

CREATE OR REPLACE FUNCTION sync_flow_message_fields() RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.content, '') <> '' AND COALESCE(NEW.text, '') = '' THEN
    NEW.text := NEW.content;
  ELSIF COALESCE(NEW.text, '') <> '' AND COALESCE(NEW.content, '') = '' THEN
    NEW.content := NEW.text;
  END IF;
  IF NEW.is_read = true AND NEW.read_at IS NULL THEN
    NEW.read_at := NOW();
  ELSIF NEW.read_at IS NOT NULL THEN
    NEW.is_read := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_flow_message_fields ON messages;
CREATE TRIGGER trg_sync_flow_message_fields
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION sync_flow_message_fields();

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_all" ON messages;
CREATE POLICY "messages_all" ON messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. MOMENTS (TikTok-style Real Posts + Follows + Saves + News Reactions)
CREATE TABLE IF NOT EXISTS moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  media_url TEXT,
  caption TEXT DEFAULT '',
  text TEXT DEFAULT '',
  image_url TEXT,
  video_url TEXT,
  category TEXT DEFAULT 'General',
  hashtags TEXT[] DEFAULT '{}',
  music_name TEXT DEFAULT 'Original Sound',
  visibility TEXT DEFAULT 'everyone' CHECK (visibility IN ('everyone', 'friends', 'only_me')),
  is_pinned BOOLEAN DEFAULT false,
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE moments ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS caption TEXT DEFAULT '';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS text TEXT DEFAULT '';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS music_name TEXT DEFAULT 'Original Sound';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'everyone';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_flow_moment_fields() RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.caption, '') <> '' AND COALESCE(NEW.text, '') = '' THEN
    NEW.text := NEW.caption;
  ELSIF COALESCE(NEW.text, '') <> '' AND COALESCE(NEW.caption, '') = '' THEN
    NEW.caption := NEW.text;
  END IF;
  IF COALESCE(NEW.media_url, '') = '' THEN
    NEW.media_url := COALESCE(NEW.video_url, NEW.image_url);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_flow_moment_fields ON moments;
CREATE TRIGGER trg_sync_flow_moment_fields
  BEFORE INSERT OR UPDATE ON moments
  FOR EACH ROW EXECUTE FUNCTION sync_flow_moment_fields();

ALTER TABLE moments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moments_all" ON moments;
CREATE POLICY "moments_all" ON moments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS moment_likes (
  moment_id UUID REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (moment_id, user_id)
);
ALTER TABLE moment_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moment_likes_all" ON moment_likes;
CREATE POLICY "moment_likes_all" ON moment_likes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS moment_saves (
  moment_id UUID REFERENCES moments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (moment_id, user_id)
);
ALTER TABLE moment_saves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "moment_saves_all" ON moment_saves;
CREATE POLICY "moment_saves_all" ON moment_saves FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
CREATE POLICY "moment_comments_all" ON moment_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows_all" ON follows;
CREATE POLICY "follows_all" ON follows FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS news_likes (
  news_id TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (news_id, user_id)
);
ALTER TABLE news_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "news_likes_all" ON news_likes;
CREATE POLICY "news_likes_all" ON news_likes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS news_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE news_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "news_comments_all" ON news_comments;
CREATE POLICY "news_comments_all" ON news_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. CHATROOM GROUPS (groups, group_members, group_messages)
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  is_public BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "groups_all" ON groups;
CREATE POLICY "groups_all" ON groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "group_members_all" ON group_members;
CREATE POLICY "group_members_all" ON group_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT DEFAULT '',
  type TEXT DEFAULT 'text',
  media_url TEXT,
  file_name TEXT,
  file_size BIGINT DEFAULT 0,
  duration INTEGER DEFAULT 0,
  reply_to_id UUID,
  reactions JSONB DEFAULT '{}'::jsonb,
  deleted_for_everyone BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "group_messages_all" ON group_messages;
CREATE POLICY "group_messages_all" ON group_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. CALLS (Real WebRTC Signaling & History)
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT DEFAULT 'voice' CHECK (type IN ('voice', 'video')),
  status TEXT DEFAULT 'ringing',
  offer JSONB,
  answer JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calls_all" ON calls;
CREATE POLICY "calls_all" ON calls FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. REPORTS, ADMIN LOGS & STICKERS
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content_type TEXT,
  content_id TEXT,
  content_text TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_all" ON reports;
CREATE POLICY "reports_all" ON reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT,
  target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_logs_all" ON admin_logs;
CREATE POLICY "admin_logs_all" ON admin_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  pack_name TEXT DEFAULT 'Custom',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stickers_all" ON stickers;
CREATE POLICY "stickers_all" ON stickers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sticker_favourites (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sticker_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, sticker_id)
);
ALTER TABLE sticker_favourites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sticker_fav_all" ON sticker_favourites;
CREATE POLICY "sticker_fav_all" ON sticker_favourites FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public)
VALUES ('letchat-media', 'letchat-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
CREATE POLICY "public_media_read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id IN ('letchat-media', 'chat-media'));

DROP POLICY IF EXISTS "auth_media_insert" ON storage.objects;
CREATE POLICY "auth_media_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('letchat-media', 'chat-media'));

DROP POLICY IF EXISTS "auth_media_update" ON storage.objects;
CREATE POLICY "auth_media_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('letchat-media', 'chat-media'));

-- 9. ENABLE REALTIME
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE friends; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE moments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE moment_comments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE moment_likes; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE follows; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE groups; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE group_members; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE group_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE calls; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE profiles; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;
