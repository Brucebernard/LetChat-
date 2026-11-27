import { SupabaseClient } from '@supabase/supabase-js';
import { FriendRecord, Profile } from '../types';

export type RelationshipStatus =
  | 'accepted'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'none';

export function normalizeProfileRecord(raw: Record<string, unknown>): Profile {
  const username = String(raw.username || '');
  const fullName = String(raw.full_name || raw.name || username);
  const about = String(raw.about || raw.bio || '');
  return {
    id: String(raw.id || ''),
    username,
    name: String(raw.name || fullName),
    full_name: fullName,
    bio: String(raw.bio || about),
    about,
    phone: typeof raw.phone === 'string' ? raw.phone : null,
    avatar_url: String(raw.avatar_url || ''),
    status_text: typeof raw.status_text === 'string' ? raw.status_text : undefined,
    role: String(raw.role || 'user'),
    is_banned: Boolean(raw.is_banned),
    is_muted: Boolean(raw.is_muted),
    last_seen: typeof raw.last_seen === 'string' ? raw.last_seen : undefined,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  };
}

export async function searchRealProfiles(
  supabase: SupabaseClient,
  myId: string,
  query: string
): Promise<Profile[]> {
  const clean = query.trim().replace(/^@/, '');
  if (!clean) return [];

  const safePattern = clean.replace(/[%_,]/g, '');
  if (!safePattern) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', myId)
    .or(
      `username.ilike.%${safePattern}%,phone.ilike.%${safePattern}%,full_name.ilike.%${safePattern}%,name.ilike.%${safePattern}%`
    )
    .limit(20);

  if (error) {
    // Fallback for schemas without full_name/phone columns yet
    const fallback = await supabase
      .from('profiles')
      .select('*')
      .neq('id', myId)
      .or(`username.ilike.%${safePattern}%,name.ilike.%${safePattern}%`)
      .limit(20);
    return ((fallback.data || []) as Record<string, unknown>[]).map(normalizeProfileRecord);
  }

  return ((data || []) as Record<string, unknown>[]).map(normalizeProfileRecord);
}

export async function loadFriendshipsAndRequests(
  supabase: SupabaseClient,
  myId: string
): Promise<{
  acceptedFriends: Profile[];
  incomingRequests: FriendRecord[];
  outgoingRequests: FriendRecord[];
  acceptedIds: Set<string>;
  outgoingIds: Set<string>;
  incomingIds: Set<string>;
}> {
  const { data: rows } = await supabase
    .from('friends')
    .select('*')
    .or(`user_id.eq.${myId},friend_id.eq.${myId}`)
    .order('created_at', { ascending: false });

  const allRows = (rows || []) as FriendRecord[];
  const peerIds = new Set<string>();
  for (const r of allRows) {
    if (r.user_id !== myId) peerIds.add(r.user_id);
    if (r.friend_id !== myId) peerIds.add(r.friend_id);
  }

  const profileMap = new Map<string, Profile>();
  if (peerIds.size > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('*')
      .in('id', Array.from(peerIds));
    for (const p of (profs || []) as Record<string, unknown>[]) {
      const normalized = normalizeProfileRecord(p);
      profileMap.set(normalized.id, normalized);
    }
  }

  const acceptedIds = new Set<string>();
  const outgoingIds = new Set<string>();
  const incomingIds = new Set<string>();
  const incomingRequests: FriendRecord[] = [];
  const outgoingRequests: FriendRecord[] = [];

  for (const r of allRows) {
    const otherId = r.user_id === myId ? r.friend_id : r.user_id;
    const otherProf = profileMap.get(otherId);
    if (r.status === 'accepted') {
      acceptedIds.add(otherId);
    } else if (r.status === 'pending') {
      if (r.friend_id === myId) {
        incomingIds.add(r.user_id);
        incomingRequests.push({ ...r, user: otherProf });
      } else if (r.user_id === myId) {
        outgoingIds.add(r.friend_id);
        outgoingRequests.push({ ...r, friend: otherProf });
      }
    }
  }

  const acceptedFriends = Array.from(acceptedIds)
    .map((id) => profileMap.get(id))
    .filter((p): p is Profile => Boolean(p));

  return {
    acceptedFriends,
    incomingRequests,
    outgoingRequests,
    acceptedIds,
    outgoingIds,
    incomingIds,
  };
}

export async function getRelationshipStatus(
  supabase: SupabaseClient,
  myId: string,
  otherId: string
): Promise<RelationshipStatus> {
  const { data } = await supabase
    .from('friends')
    .select('user_id, friend_id, status')
    .or(
      `and(user_id.eq.${myId},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${myId})`
    );

  const rows = (data || []) as { user_id: string; friend_id: string; status: string }[];
  if (rows.some((r) => r.status === 'accepted')) return 'accepted';
  if (rows.some((r) => r.status === 'pending' && r.user_id === otherId && r.friend_id === myId)) {
    return 'pending_incoming';
  }
  if (rows.some((r) => r.status === 'pending' && r.user_id === myId && r.friend_id === otherId)) {
    return 'pending_outgoing';
  }
  return 'none';
}

export async function sendFriendRequest(
  supabase: SupabaseClient,
  myProfile: Profile,
  targetUser: Profile
): Promise<{ ok: boolean; status: 'accepted' | 'pending'; error: string | null }> {
  if (!myProfile?.id || !targetUser?.id) {
    return { ok: false, status: 'pending', error: 'Missing user details.' };
  }
  if (myProfile.id === targetUser.id) {
    return { ok: false, status: 'pending', error: "You can't add yourself." };
  }

  const { data: existing } = await supabase
    .from('friends')
    .select('*')
    .or(
      `and(user_id.eq.${myProfile.id},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${myProfile.id})`
    );

  const rows = (existing || []) as FriendRecord[];
  if (rows.some((r) => r.status === 'accepted')) {
    return { ok: true, status: 'accepted', error: null };
  }

  // If target already sent us a pending request, accept immediately!
  const incoming = rows.find(
    (r) => r.user_id === targetUser.id && r.friend_id === myProfile.id && r.status === 'pending'
  );
  if (incoming) {
    const res = await acceptFriendRequest(supabase, myProfile.id, targetUser.id);
    return { ok: res.ok, status: 'accepted', error: res.error };
  }

  // If we already sent a pending request
  const outgoing = rows.find(
    (r) => r.user_id === myProfile.id && r.friend_id === targetUser.id && r.status === 'pending'
  );
  if (outgoing) {
    return { ok: true, status: 'pending', error: null };
  }

  // Update declined row back to pending or insert fresh pending request
  const declined = rows.find(
    (r) => r.user_id === myProfile.id && r.friend_id === targetUser.id
  );
  if (declined) {
    const upd = await supabase
      .from('friends')
      .update({ status: 'pending' })
      .eq('id', declined.id);
    return {
      ok: !upd.error,
      status: 'pending',
      error: upd.error?.message || null,
    };
  }

  const ins = await supabase.from('friends').insert({
    user_id: myProfile.id,
    friend_id: targetUser.id,
    status: 'pending',
  });

  if (ins.error) {
    return { ok: false, status: 'pending', error: ins.error.message };
  }
  return { ok: true, status: 'pending', error: null };
}

export async function acceptFriendRequest(
  supabase: SupabaseClient,
  myId: string,
  requesterId: string
): Promise<{ ok: boolean; error: string | null }> {
  const upd = await supabase
    .from('friends')
    .update({ status: 'accepted' })
    .eq('user_id', requesterId)
    .eq('friend_id', myId);

  if (upd.error) {
    return { ok: false, error: upd.error.message };
  }

  await supabase.from('friends').upsert(
    {
      user_id: myId,
      friend_id: requesterId,
      status: 'accepted',
    },
    { onConflict: 'user_id,friend_id' }
  );

  return { ok: true, error: null };
}

export async function declineFriendRequest(
  supabase: SupabaseClient,
  myId: string,
  requesterId: string
): Promise<{ ok: boolean; error: string | null }> {
  const del = await supabase
    .from('friends')
    .delete()
    .eq('user_id', requesterId)
    .eq('friend_id', myId)
    .eq('status', 'pending');

  if (del.error) {
    const upd = await supabase
      .from('friends')
      .update({ status: 'declined' })
      .eq('user_id', requesterId)
      .eq('friend_id', myId);
    return { ok: !upd.error, error: upd.error?.message || null };
  }
  return { ok: true, error: null };
}

// Legacy compatibility wrapper used by QR scan / invite flows
export async function addFriendCompatible(
  supabase: SupabaseClient,
  myProfile: Profile,
  targetUser: Profile
): Promise<{ ok: boolean; status?: 'accepted' | 'pending'; error: string | null }> {
  return sendFriendRequest(supabase, myProfile, targetUser);
}
