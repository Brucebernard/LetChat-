import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, verifyRequiredTables, uploadWithProgress } from '../supabaseClient';
import { Profile } from '../types';
import { compressImage } from '../utils/mediaUtils';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  needsProfileSetup: boolean;
  pendingVerificationEmail: string | null;
  missingTables: string[];
  checkSchema: () => Promise<string[]>;
  sendPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<Profile | null>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    username: string;
    fullName: string;
    phone?: string;
    avatarFile?: File | null;
  }) => Promise<{ needsEmailVerification: boolean; profile: Profile | null }>;
  signInWithEmail: (params: { email: string; password: string }) => Promise<Profile | null>;
  resendVerificationEmail: (email: string) => Promise<void>;
  completeProfileSetup: (params: {
    fullName: string;
    username: string;
    phone?: string;
    about?: string;
    avatarFile?: File | null;
  }) => Promise<Profile>;
  clearPendingVerification: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue);

export function normalizePhoneE164(raw: string): string {
  const cleaned = raw.trim().replace(/[\s\-()]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

function normalizeProfileRow(raw: Record<string, unknown>): Profile {
  const username = String(raw.username || '');
  const fullName = String(raw.full_name || raw.name || username || '');
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

function isProfileIncomplete(prof: Profile | null): boolean {
  if (!prof) return true;
  const hasUsername = Boolean(prof.username && prof.username.trim().length >= 3 && !prof.username.startsWith('temp_'));
  const hasName = Boolean((prof.full_name || prof.name || '').trim());
  return !hasUsername || !hasName;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [needsProfileSetup, setNeedsProfileSetup] = useState<boolean>(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [missingTables, setMissingTables] = useState<string[]>([]);

  const checkSchema = async () => {
    const missing = await verifyRequiredTables();
    setMissingTables(missing);
    return missing;
  };

  const loadOrSyncUserProfile = async (
    user: User | null,
    preferred?: {
      username?: string;
      fullName?: string;
      phone?: string;
      about?: string;
      avatar_url?: string;
    }
  ): Promise<Profile | null> => {
    if (!user) {
      setProfile(null);
      setNeedsProfileSetup(false);
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
      const normalized = normalizeProfileRow(data as Record<string, unknown>);
      if (normalized.is_banned) {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setNeedsProfileSetup(false);
        return null;
      }

      setProfile(normalized);
      setNeedsProfileSetup(isProfileIncomplete(normalized));

      supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {});
      return normalized;
    }

    // No profile row yet — check if signup metadata has enough info to create it automatically
    const metaUsername =
      preferred?.username ||
      (typeof user.user_metadata?.username === 'string' ? user.user_metadata.username : '');
    const metaName =
      preferred?.fullName ||
      (typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === 'string'
          ? user.user_metadata.name
          : '');
    const metaPhone =
      preferred?.phone ||
      user.phone ||
      (typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : '');
    const metaAvatar =
      preferred?.avatar_url ||
      (typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '');

    const cleanUsername = metaUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
    const cleanName = metaName.trim();

    if (cleanUsername.length >= 3 && cleanName.length > 0) {
      const payload: Record<string, unknown> = {
        id: user.id,
        username: cleanUsername,
        name: cleanName,
        full_name: cleanName,
        bio: preferred?.about || '',
        about: preferred?.about || '',
        phone: metaPhone || null,
        avatar_url: metaAvatar || '',
        role: 'user',
        last_seen: new Date().toISOString(),
      };

      const { data: created, error: createErr } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .single();

      if (!createErr && created) {
        const normalized = normalizeProfileRow(created as Record<string, unknown>);
        setProfile(normalized);
        setNeedsProfileSetup(false);
        return normalized;
      }
    }

    // Otherwise require the authenticated user to finish onboarding (full name + username + optional photo)
    setProfile(null);
    setNeedsProfileSetup(true);
    return null;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await checkSchema();
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadOrSyncUserProfile(data.session.user);
      }
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setPendingVerificationEmail(null);
        await loadOrSyncUserProfile(newSession.user);
      } else {
        setProfile(null);
        setNeedsProfileSetup(false);
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
      supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
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

  const sendPhoneOtp = async (phone: string) => {
    const missing = await checkSchema();
    if (missing.length > 0) {
      throw new Error(
        `Missing database tables: ${missing.join(', ')}. Open Setup SQL and run it in Supabase first.`
      );
    }
    const normalized = normalizePhoneE164(phone);
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      throw new Error('Enter a valid phone number with country code (e.g. +233241234567).');
    }
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  };

  const verifyPhoneOtp = async (phone: string, token: string): Promise<Profile | null> => {
    const normalized = normalizePhoneE164(phone);
    const cleanToken = token.trim().replace(/\s+/g, '');
    if (cleanToken.length < 4) {
      throw new Error('Enter the verification code sent to your phone.');
    }
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: cleanToken,
      type: 'sms',
    });
    if (error) throw error;
    setSession(data.session ?? null);
    if (data.user) {
      return loadOrSyncUserProfile(data.user, { phone: normalized });
    }
    return null;
  };

  const signUpWithEmail = async ({
    email,
    password,
    username,
    fullName,
    phone,
    avatarFile,
  }: {
    email: string;
    password: string;
    username: string;
    fullName: string;
    phone?: string;
    avatarFile?: File | null;
  }): Promise<{ needsEmailVerification: boolean; profile: Profile | null }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanPhone = phone ? normalizePhoneE164(phone) : '';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      throw new Error('Username must be 3-24 characters (letters, numbers, underscore only).');
    }
    if (!cleanName) {
      throw new Error('Full name is required.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const missing = await checkSchema();
    if (missing.length > 0) {
      throw new Error(
        `Missing database tables: ${missing.join(', ')}. Open Setup SQL and run it in Supabase first.`
      );
    }

    const { data: existingUsername } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', cleanUsername)
      .maybeSingle();
    if (existingUsername) {
      throw new Error('That username is already taken.');
    }

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        data: {
          username: cleanUsername,
          name: cleanName,
          full_name: cleanName,
          phone: cleanPhone || null,
        },
      },
    });
    if (authErr) throw authErr;
    if (!authData.user) {
      throw new Error('Unable to create account. Please try again.');
    }

    // If Supabase requires email confirmation before issuing a session
    if (!authData.session) {
      setPendingVerificationEmail(cleanEmail);
      return { needsEmailVerification: true, profile: null };
    }

    let avatarUrl = '';
    if (avatarFile) {
      try {
        const compressed = await compressImage(avatarFile, true);
        avatarUrl = await uploadWithProgress(
          'letchat-media',
          `avatars/${authData.user.id}_${Date.now()}.jpg`,
          compressed
        );
      } catch {
        // Avatar upload failure shouldn't block account creation
      }
    }

    const loaded = await loadOrSyncUserProfile(authData.user, {
      username: cleanUsername,
      fullName: cleanName,
      phone: cleanPhone || undefined,
      avatar_url: avatarUrl,
    });
    return { needsEmailVerification: false, profile: loaded };
  };

  const signInWithEmail = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<Profile | null> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Enter your account email address.');
    }
    const missing = await checkSchema();
    if (missing.length > 0) {
      throw new Error(
        `Missing database tables: ${missing.join(', ')}. Open Setup SQL and run it in Supabase first.`
      );
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        setPendingVerificationEmail(cleanEmail);
        throw new Error('Please verify your email address before logging in.');
      }
      throw error;
    }
    const loaded = await loadOrSyncUserProfile(data.user);
    return loaded;
  };

  const resendVerificationEmail = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) throw new Error('Email address is required.');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) throw error;
  };

  const completeProfileSetup = async ({
    fullName,
    username,
    phone,
    about,
    avatarFile,
  }: {
    fullName: string;
    username: string;
    phone?: string;
    about?: string;
    avatarFile?: File | null;
  }): Promise<Profile> => {
    if (!session?.user) {
      throw new Error('You must be signed in first.');
    }
    const cleanUsername = username.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanPhone = phone ? normalizePhoneE164(phone) : session.user.phone || '';

    if (!cleanName) throw new Error('Full name is required.');
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      throw new Error('Username must be 3-24 characters (letters, numbers, underscore only).');
    }

    const { data: existingUsername } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', cleanUsername)
      .neq('id', session.user.id)
      .maybeSingle();
    if (existingUsername) {
      throw new Error('Username is already taken.');
    }

    let avatarUrl = profile?.avatar_url || '';
    if (avatarFile) {
      const compressed = await compressImage(avatarFile, true);
      avatarUrl = await uploadWithProgress(
        'letchat-media',
        `avatars/${session.user.id}_${Date.now()}.jpg`,
        compressed
      );
    }

    const payload: Record<string, unknown> = {
      id: session.user.id,
      username: cleanUsername,
      name: cleanName,
      full_name: cleanName,
      phone: cleanPhone || null,
      bio: about?.trim() || '',
      about: about?.trim() || '',
      avatar_url: avatarUrl,
      role: profile?.role || 'user',
      last_seen: new Date().toISOString(),
    };

    const { data: upserted, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();

    if (error || !upserted) {
      throw new Error(error?.message || 'Could not save profile.');
    }

    const normalized = normalizeProfileRow(upserted as Record<string, unknown>);
    setProfile(normalized);
    setNeedsProfileSetup(false);
    return normalized;
  };

  const clearPendingVerification = () => {
    setPendingVerificationEmail(null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setNeedsProfileSetup(false);
    setPendingVerificationEmail(null);
  };

  const deleteAccount = async () => {
    if (!session?.access_token) {
      await signOut();
      return;
    }
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || 'Failed to delete account');
    }
    await signOut();
  };

  const refreshProfile = async () => {
    if (session?.user) return loadOrSyncUserProfile(session.user);
    return null;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        needsProfileSetup,
        pendingVerificationEmail,
        missingTables,
        checkSchema,
        sendPhoneOtp,
        verifyPhoneOtp,
        signUpWithEmail,
        signInWithEmail,
        resendVerificationEmail,
        completeProfileSetup,
        clearPendingVerification,
        signOut,
        deleteAccount,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
