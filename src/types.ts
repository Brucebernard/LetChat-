export interface Profile {
  id: string;
  username: string;
  name: string;
  bio: string;
  avatar_url: string;
  status_text?: string;
  role: 'user' | 'admin' | string;
  is_banned?: boolean;
  is_muted?: boolean;
  last_seen?: string;
  created_at?: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  receiver_id?: string | null;
  text: string;
  image_url?: string | null;
  video_url?: string | null;
  sticker_url?: string | null;
  voice_url?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number;
  duration?: number;
  type: 'text' | 'image' | 'video' | 'sticker' | 'voice' | 'audio' | 'document';
  reply_to_id?: string | null;
  forwarded?: boolean;
  deleted_for_everyone?: boolean;
  is_flagged?: boolean;
  report_count?: number;
  read_by?: string[];
  created_at: string;
  sender?: Profile;
  isSending?: boolean;
}

export interface ChatItem {
  id: string;
  title: string;
  subtitle?: string;
  isGroup: boolean;
  receiverId?: string | null;
  peer?: Profile;
  avatar?: string | null;
  isOnline: boolean;
  lastMsg?: Message;
  unread: number;
  isMuted?: boolean;
}

export interface MomentItem {
  id: string;
  user_id: string;
  text: string;
  image_url?: string | null;
  video_url?: string | null;
  category: 'General' | 'Music' | 'News' | 'Entertainment' | 'Funny' | 'Football' | string;
  likes_count: number;
  created_at: string;
  author?: Profile;
}

export interface MomentComment {
  id: string;
  moment_id: string;
  user_id: string;
  text: string;
  sticker_url?: string | null;
  created_at: string;
  user?: Profile;
}

export interface VideoCallRow {
  id: string;
  caller_id: string;
  receiver_id: string;
  status: 'ringing' | 'accepted' | 'ended' | 'rejected' | string;
  call_type?: 'video' | 'audio' | string;
  offer?: RTCSessionDescriptionInit | null;
  answer?: RTCSessionDescriptionInit | null;
  created_at: string;
  caller?: Profile;
  receiver?: Profile;
}

export interface CallSession {
  id?: string;
  callerId: string;
  receiverId: string;
  status: string;
  callType: 'video' | 'audio';
  peer?: Profile;
}

export interface ReportRow {
  id: string;
  reporter_id: string;
  reported_user_id?: string | null;
  content_type: string;
  content_id: string;
  content_text?: string;
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed' | string;
  created_at: string;
  reporter?: Profile;
  reported_user?: Profile;
}

export interface AdminLogRow {
  id: string;
  admin_id: string;
  action: string;
  target_user_id?: string | null;
  reason?: string;
  created_at: string;
  admin?: Profile;
  target_user?: Profile;
}

export interface StickerItem {
  id: string;
  user_id?: string;
  image_url: string;
  fallback_url?: string;
  pack_name: string;
  label?: string;
  tags?: string;
  is_public?: boolean;
  created_at?: string;
}

export interface FootballSourcesConfig {
  facebookToken: string;
  facebookPageIds: string;
  instagramToken: string;
  instagramAccountIds: string;
  xBearerToken: string;
  xUsernames: string;
  youtubeApiKey: string;
  youtubeChannelIds: string;
  customRssUrls: string;
}

export interface FootballPost {
  id: string;
  platform: 'YouTube' | 'Facebook' | 'Instagram' | 'X' | 'RSS' | 'LetChat';
  pageName: string;
  userId?: string | null;
  time: string;
  title: string;
  description: string;
  thumbnail: string;
  originalUrl: string;
  videoUrl: string | null;
  isYoutube: boolean;
  category: 'News' | 'Videos' | 'Transfers' | 'Scores' | 'Highlights' | string;
  likes: number;
}

export type SocialPlatform = 'TikTok' | 'Instagram' | 'X' | 'Facebook' | 'YouTube' | 'News';

export interface GeneratedMomentNews {
  id: string;
  platform: SocialPlatform;
  handle: string;
  title: string;
  summary: string;
  category: 'News' | 'Music' | 'Entertainment' | 'Funny' | string;
  sourceUrl: string;
  thumbnail?: string;
  videoUrl?: string | null;
  isYoutube?: boolean;
  publishedAt: string;
  groundingSources?: { title: string; uri: string }[];
}

export interface ReportTarget {
  contentType: 'message' | 'moment' | 'comment' | 'football_post' | 'profile';
  contentId: string;
  reportedUserId?: string | null;
  contentText?: string;
}
