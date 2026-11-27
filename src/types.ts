export interface Profile {
  id: string;
  username: string;
  name: string;
  full_name?: string;
  bio: string;
  about?: string;
  phone?: string | null;
  avatar_url: string;
  status_text?: string;
  role: 'user' | 'admin' | string;
  is_banned?: boolean;
  is_muted?: boolean;
  last_seen?: string;
  created_at?: string;
}

export interface FriendRecord {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'declined' | string;
  created_at?: string;
  user?: Profile;
  friend?: Profile;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  receiver_id?: string | null;
  text: string;
  content?: string;
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
  is_read?: boolean;
  read_by?: string[];
  read_at?: string | null;
  reactions?: Record<string, string[]> | null;
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

export type MomentVisibility = 'everyone' | 'friends' | 'only_me';

export interface MomentItem {
  id: string;
  user_id: string;
  text: string;
  caption?: string;
  media_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  category: string;
  hashtags?: string[];
  music_name?: string;
  visibility?: MomentVisibility;
  is_pinned?: boolean;
  views_count?: number;
  likes_count: number;
  created_at: string;
  author?: Profile;
}

export interface MomentDraft {
  id: string;
  caption: string;
  hashtagsText: string;
  musicName: string;
  visibility: MomentVisibility;
  category: string;
  mediaType: 'image' | 'video' | null;
  mediaDataUrl: string | null;
  fileName: string | null;
  updatedAt: string;
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

export type NewsCategory =
  | 'All'
  | 'Football'
  | 'Global'
  | 'Ghana'
  | 'Entertainment'
  | 'Tech'
  | 'Politics';

export interface NewsArticleItem {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  category: Exclude<NewsCategory, 'All'>;
  imageUrl: string;
  videoUrl: string | null;
  articleUrl: string;
  publishedAt: string;
  isBreaking: boolean;
}

export interface NewsComment {
  id: string;
  news_id: string;
  user_id: string;
  text: string;
  created_at: string;
  user?: Profile;
}

export interface GroupItem {
  id: string;
  name: string;
  description: string;
  photo_url: string;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  member_count?: number;
  my_role?: 'admin' | 'member';
  last_message?: GroupMessage | null;
  unread_count?: number;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  last_read_at?: string | null;
  joined_at?: string;
  profile?: Profile;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'voice' | 'audio' | 'document' | 'sticker';
  media_url?: string | null;
  file_name?: string | null;
  file_size?: number;
  duration?: number;
  reply_to_id?: string | null;
  reactions?: Record<string, string[]> | null;
  deleted_for_everyone?: boolean;
  created_at: string;
  sender?: Profile;
  isSending?: boolean;
}

export interface GroupCallSession {
  group: GroupItem;
  callType: 'voice' | 'video';
  initiatorId: string;
}

export interface CallRow {
  id: string;
  caller_id: string;
  receiver_id: string;
  type: 'voice' | 'video' | string;
  call_type?: 'video' | 'audio' | 'voice' | string;
  status: 'ringing' | 'accepted' | 'ended' | 'declined' | 'rejected' | 'missed' | string;
  offer?: RTCSessionDescriptionInit | null;
  answer?: RTCSessionDescriptionInit | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  caller?: Profile;
  receiver?: Profile;
}

export type VideoCallRow = CallRow;

export interface CallSession {
  id?: string;
  callerId: string;
  receiverId: string;
  status: string;
  callType: 'video' | 'voice';
  peer?: Profile;
  offer?: RTCSessionDescriptionInit | null;
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

export interface ReportTarget {
  contentType: 'message' | 'moment' | 'comment' | 'group_message' | 'profile';
  contentId: string;
  reportedUserId?: string | null;
  contentText?: string;
}
