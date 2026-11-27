import { ChatItem, GroupItem, GroupMessage, Message, Profile } from '../types';

const CACHE_PREFIX = 'letchat_flow_cache_v1_';
const MAX_CACHED_MESSAGES = 80;

const memProfiles = new Map<string, Profile>();

function safeReadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function getDisplayName(profile?: Partial<Profile> | null): string {
  if (!profile) return 'LetChat Member';
  const raw =
    profile.display_name?.trim() ||
    profile.full_name?.trim() ||
    profile.name?.trim() ||
    profile.username?.trim();
  return raw && raw.length > 0 ? raw : 'LetChat Member';
}

export function getUsernameHandle(profile?: Partial<Profile> | null): string {
  const clean = profile?.username?.trim().replace(/^@+/, '');
  return clean && clean.length > 0 ? `@${clean}` : '';
}

export function getAvatarInitial(profile?: Partial<Profile> | null, fallbackName?: string): string {
  const candidate =
    profile?.display_name?.trim() ||
    profile?.full_name?.trim() ||
    profile?.name?.trim() ||
    profile?.username?.trim() ||
    fallbackName?.trim() ||
    'L';
  const match = candidate.match(/[A-Za-z0-9]/);
  return (match ? match[0] : candidate[0] || 'L').toUpperCase();
}

export function isProfileComplete(profile?: Partial<Profile> | null): boolean {
  if (!profile) return false;
  const hasUsername = Boolean(
    profile.username &&
      profile.username.trim().length >= 3 &&
      !profile.username.startsWith('temp_')
  );
  const hasName = Boolean(
    (profile.display_name || profile.full_name || profile.name || '').trim().length > 0
  );
  return hasUsername && hasName;
}

export function getCachedProfile(userId?: string | null): Profile | null {
  if (!userId) return null;
  const mem = memProfiles.get(userId);
  if (mem) return mem;
  const disk = safeReadJson<Profile>(`profile_${userId}`);
  if (disk) memProfiles.set(userId, disk);
  return disk;
}

export function setCachedProfile(profile?: Profile | null): void {
  if (!profile?.id) return;
  memProfiles.set(profile.id, profile);
  safeWriteJson(`profile_${profile.id}`, profile);
}

export function setCachedProfiles(profiles: Profile[]): void {
  for (const p of profiles) {
    if (p?.id) {
      memProfiles.set(p.id, p);
      safeWriteJson(`profile_${p.id}`, p);
    }
  }
}

export function getCachedChats(userId: string): ChatItem[] | null {
  return safeReadJson<ChatItem[]>(`chats_${userId}`);
}

export function setCachedChats(userId: string, items: ChatItem[]): void {
  safeWriteJson(`chats_${userId}`, items.slice(0, 60));
}

export function getCachedMessages(chatId: string): Message[] | null {
  return safeReadJson<Message[]>(`msgs_${chatId}`);
}

export function setCachedMessages(chatId: string, messages: Message[]): void {
  const clean = messages.filter((m) => !m.isSending).slice(-MAX_CACHED_MESSAGES);
  safeWriteJson(`msgs_${chatId}`, clean);
}

export function getCachedGroups(userId: string): {
  myGroups: GroupItem[];
  discoverGroups: GroupItem[];
} | null {
  return safeReadJson<{ myGroups: GroupItem[]; discoverGroups: GroupItem[] }>(`groups_${userId}`);
}

export function setCachedGroups(
  userId: string,
  payload: { myGroups: GroupItem[]; discoverGroups: GroupItem[] }
): void {
  safeWriteJson(`groups_${userId}`, payload);
}

export function getCachedGroupMessages(groupId: string): GroupMessage[] | null {
  return safeReadJson<GroupMessage[]>(`gmsgs_${groupId}`);
}

export function setCachedGroupMessages(groupId: string, messages: GroupMessage[]): void {
  const clean = messages.filter((m) => !m.isSending).slice(-MAX_CACHED_MESSAGES);
  safeWriteJson(`gmsgs_${groupId}`, clean);
}
