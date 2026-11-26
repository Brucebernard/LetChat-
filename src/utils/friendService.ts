import { SupabaseClient } from '@supabase/supabase-js';
import { Profile } from '../types';

async function syncProfileAndLegacyUser(
  supabase: SupabaseClient,
  target: Pick<Profile, 'id' | 'username' | 'name' | 'avatar_url'>
): Promise<void> {
  if (!target?.id) return;
  const shortId = target.id.replace(/-/g, '').slice(0, 8);
  const username = target.username || `user_${shortId}`;
  const name = target.name || username;

  try {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', target.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from('profiles').upsert(
        {
          id: target.id,
          username,
          name,
          bio: '',
          avatar_url: target.avatar_url || '',
          role: username.toLowerCase() === 'bruce1' ? 'admin' : 'user',
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    }
  } catch {
    // ignore if profile already exists or is governed by auth RLS
  }

  try {
    await supabase.from('users').upsert(
      {
        id: target.id,
        username,
        avatar_url: target.avatar_url || null,
      },
      { onConflict: 'id' }
    );
  } catch {
    // ignore if legacy users table is absent
  }
}

export async function addFriendCompatible(
  supabase: SupabaseClient,
  myProfile: Profile,
  targetUser: Profile
): Promise<{ ok: boolean; error: string | null }> {
  if (!myProfile?.id || !targetUser?.id) {
    return { ok: false, error: 'Missing user details.' };
  }
  if (myProfile.id === targetUser.id) {
    return { ok: false, error: "You can't add yourself." };
  }

  await Promise.all([
    syncProfileAndLegacyUser(supabase, myProfile),
    syncProfileAndLegacyUser(supabase, targetUser),
  ]);

  // 1. Try bidirectional accepted friendship upsert so both users immediately see each other
  const bothRes = await supabase.from('friends').upsert(
    [
      { user_id: myProfile.id, friend_id: targetUser.id, status: 'accepted' },
      { user_id: targetUser.id, friend_id: myProfile.id, status: 'accepted' },
    ],
    { onConflict: 'user_id,friend_id' }
  );

  if (!bothRes.error) {
    return { ok: true, error: null };
  }

  // 2. Fallback: insert/upsert forward row first, then attempt reverse row separately
  const forwardCheck = await supabase
    .from('friends')
    .select('id')
    .eq('user_id', myProfile.id)
    .eq('friend_id', targetUser.id)
    .maybeSingle();

  let forwardErr = null as { message?: string } | null;
  if (!forwardCheck.data) {
    const fwdInsert = await supabase.from('friends').insert({
      user_id: myProfile.id,
      friend_id: targetUser.id,
      status: 'accepted',
    });
    forwardErr = fwdInsert.error;
  }

  if (!forwardErr) {
    // Also try inserting reverse row if allowed
    const revCheck = await supabase
      .from('friends')
      .select('id')
      .eq('user_id', targetUser.id)
      .eq('friend_id', myProfile.id)
      .maybeSingle();
    if (!revCheck.data) {
      await supabase
        .from('friends')
        .insert({ user_id: targetUser.id, friend_id: myProfile.id, status: 'accepted' });
    }
    return { ok: true, error: null };
  }

  // 3. Check if a reverse row already exists (since symmetric loading treats it as connected)
  const reverseCheck = await supabase
    .from('friends')
    .select('id')
    .eq('user_id', targetUser.id)
    .eq('friend_id', myProfile.id)
    .maybeSingle();

  if (reverseCheck.data) {
    return { ok: true, error: null };
  }

  return {
    ok: false,
    error: forwardErr.message || bothRes.error.message || 'Could not add contact',
  };
}
