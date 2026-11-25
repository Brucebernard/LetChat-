import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, verifyRequiredTables } from '../supabaseClient';
import { Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  missingTables: string[];
  checkSchema: () => Promise<string[]>;
  signUp: (params: { username: string; name: string; password: string }) => Promise<Profile>;
  signIn: (params: { username: string; password: string }) => Promise<Profile | null>;
  signInAsGuest: () => Promise<Profile>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

function toSyntheticEmail(username: string): string {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return `${clean}@letchat.app`;
}

function deriveProfileDefaults(
  user: User,
  preferred?: { username?: string; name?: string; avatar_url?: string }
) {
  const shortId = user.id.replace(/-/g, '').slice(0, 8);
  const metaUsername =
    typeof user.user_metadata?.username === 'string' ? user.user_metadata.username : '';
  const emailPrefix = user.email ? user.email.split('@')[0] : '';
  const rawBase = (preferred?.username || metaUsername || emailPrefix || '').toLowerCase();
  const sanitized = rawBase.replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const username =
    sanitized.length >= 3
      ? sanitized
      : user.is_anonymous
        ? `guest_${shortId}`
        : `user_${shortId}`;

  const metaName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '';
  const name =
    preferred?.name?.trim() ||
    metaName.trim() ||
    (user.is_anonymous ? `Guest ${shortId.slice(0, 4).toUpperCase()}` : username);

  const metaAvatar =
    typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '';
  const avatarUrl = preferred?.avatar_url ?? metaAvatar ?? '';
  const role = username === 'bruce1' ? 'admin' : 'user';

  return { username, name, avatar_url: avatarUrl, role };
}

async function syncLegacyUsersRow(prof: { id: string; username: string; avatar_url?: string }) {
  try {
    await supabase
      .from('users')
      .upsert(
        {
          id: prof.id,
          username: prof.username,
          avatar_url: prof.avatar_url || null,
        },
        { onConflict: 'id' }
      );
  } catch {
    // Ignore if legacy `users` table does not exist or has restrictive RLS prior to migration
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [missingTables, setMissingTables] = useState<string[]>([]);

  const checkSchema = async () => {
    const missing = await verifyRequiredTables();
    setMissingTables(missing);
    return missing;
  };

  const ensureProfileForUser = async (
    user: User | null,
    preferred?: { username?: string; name?: string; avatar_url?: string }
  ): Promise<Profile | null> => {
    if (!user) {
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        await checkSchema();
        return null;
      }
    }

    if (data) {
      const existing = data as Profile;
      if (existing.username?.toLowerCase() === 'bruce1' && existing.role !== 'admin') {
        const { data: updated } = await supabase
          .from('profiles')
          .update({ role: 'admin', last_seen: new Date().toISOString() })
          .eq('id', user.id)
          .select()
          .single();
        const finalProf = (updated || { ...existing, role: 'admin' }) as Profile;
        setProfile(finalProf);
        await syncLegacyUsersRow(finalProf);
        return finalProf;
      }
      setProfile(existing);
      supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {});
      await syncLegacyUsersRow(existing);
      return existing;
    }

    // Profile does not exist yet — automatically create / upsert it immediately
    const defaults = deriveProfileDefaults(user, preferred);
    const shortSuffix = user.id.replace(/-/g, '').slice(0, 6);

    let { data: created, error: createErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          username: defaults.username,
          name: defaults.name,
          bio: '',
          avatar_url: defaults.avatar_url,
          role: defaults.role,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single();

    if (createErr && createErr.code === '23505') {
      // Handle username uniqueness collision cleanly
      const fallbackUsername = `${defaults.username.slice(0, 16)}_${shortSuffix}`;
      const retry = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            username: fallbackUsername,
            name: defaults.name,
            bio: '',
            avatar_url: defaults.avatar_url,
            role: defaults.role,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select('*')
        .single();
      created = retry.data;
      createErr = retry.error;
    }

    if (createErr || !created) {
      return null;
    }

    const createdProfile = created as Profile;
    setProfile(createdProfile);
    await syncLegacyUsersRow(createdProfile);
    return createdProfile;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await checkSchema();
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        const prof = await ensureProfileForUser(data.session.user);
        if (prof?.is_banned) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
        }
      }
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        await ensureProfileForUser(newSession.user);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const touchLastSeen = () => {
      const nowIso = new Date().toISOString();
      supabase
        .from('profiles')
        .update({ last_seen: nowIso })
        .eq('id', profile.id)
        .then(() => {});
    };

    const timer = setInterval(touchLastSeen, 60_000);
    const onVisibility = () => {
      if (!document.hidden) touchLastSeen();
    };
    window.addEventListener('focus', touchLastSeen);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', touchLastSeen);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [profile?.id]);

  const signUp = async ({
    username,
    name,
    password,
  }: {
    username: string;
    name: string;
    password: string;
  }): Promise<Profile> => {
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      throw new Error('Username must be 3-24 characters (letters, numbers, underscore only).');
    }
    if (!name.trim()) {
      throw new Error('Full name is required.');
    }
    const missing = await checkSchema();
    if (missing.length > 0) {
      throw new Error(
        `Missing database tables: ${missing.join(', ')}. Open Setup SQL and run it in Supabase first.`
      );
    }

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', cleanUsername)
      .maybeSingle();
    if (existing) {
      throw new Error('Username is already taken.');
    }

    const email = toSyntheticEmail(cleanUsername);
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: cleanUsername, name: name.trim(), avatar_url: '' } },
    });
    if (authErr) throw authErr;
    if (!authData.user) {
      throw new Error('Signup failed. Check Supabase Auth Email settings (disable Confirm Email).');
    }

    const created = await ensureProfileForUser(authData.user, {
      username: cleanUsername,
      name: name.trim(),
      avatar_url: '',
    });
    if (!created) {
      throw new Error('Unable to create user profile. Check Supabase RLS policies.');
    }
    return created;
  };

  const signIn = async ({
    username,
    password,
  }: {
    username: string;
    password: string;
  }): Promise<Profile | null> => {
    const cleanUsername = username.trim().toLowerCase();
    const missing = await checkSchema();
    if (missing.length > 0) {
      throw new Error(
        `Missing database tables: ${missing.join(', ')}. Open Setup SQL and run it in Supabase first.`
      );
    }
    const email = toSyntheticEmail(cleanUsername);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const loaded = await ensureProfileForUser(data.user, {
      username: cleanUsername,
      name: cleanUsername,
    });
    if (loaded?.is_banned) {
      await supabase.auth.signOut();
      throw new Error('Your account has been banned by an administrator.');
    }
    return loaded;
  };

  const signInAsGuest = async (): Promise<Profile> => {
    const missing = await checkSchema();
    if (missing.length > 0) {
      throw new Error(
        `Missing database tables: ${missing.join(', ')}. Open Setup SQL and run it in Supabase first.`
      );
    }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!data.user) {
      throw new Error('Guest sign-in failed. Enable Anonymous Sign-Ins in Supabase Auth.');
    }
    const guestProfile = await ensureProfileForUser(data.user);
    if (!guestProfile) {
      throw new Error('Could not create guest profile. Run Setup SQL to verify RLS policies.');
    }
    return guestProfile;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session?.user) return ensureProfileForUser(session.user);
    return null;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        missingTables,
        checkSchema,
        signUp,
        signIn,
        signInAsGuest,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
