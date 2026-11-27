import React, { useEffect, useRef, useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  AlertTriangle,
  Phone,
  Mail,
  Camera,
  CheckCircle2,
  ArrowRight,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import LetChatLogo from '../LetChatLogo';
import { SUPABASE_URL, pingSupabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import SetupSqlModal from '../Modals/SetupSqlModal';
import RulesModal from '../Modals/RulesModal';

export default function AuthScreen() {
  const {
    session,
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
  } = useAuth();
  const { showToast } = useToast();

  const [authTab, setAuthTab] = useState<'phone' | 'email'>('phone');
  const [emailMode, setEmailMode] = useState<'login' | 'signup'>('login');

  // Phone OTP state
  const [phoneInput, setPhoneInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // Email Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupAvatar, setSignupAvatar] = useState<File | null>(null);
  const [signupAvatarPreview, setSignupAvatarPreview] = useState<string>('');
  const [acceptedRules, setAcceptedRules] = useState(false);

  // Onboarding Profile Setup state (for authenticated users missing profile details)
  const [setupName, setSetupName] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPhone, setSetupPhone] = useState(session?.user?.phone || '');
  const [setupAbout, setSetupAbout] = useState('');
  const [setupAvatar, setSetupAvatar] = useState<File | null>(null);
  const [setupAvatarPreview, setSetupAvatarPreview] = useState<string>('');

  const [connStatus, setConnStatus] = useState<{
    checking: boolean;
    ok: boolean;
    error: string | null;
    latency: number | null;
  }>({ checking: true, ok: false, error: null, latency: null });
  const [showSql, setShowSql] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const signupAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const setupAvatarInputRef = useRef<HTMLInputElement | null>(null);

  const verifyConnection = async () => {
    setConnStatus((s) => ({ ...s, checking: true }));
    const res = await pingSupabase();
    setConnStatus({ checking: false, ok: res.ok, error: res.error, latency: res.latency });
    if (res.ok) await checkSchema();
  };

  useEffect(() => {
    verifyConnection();
  }, []);

  useEffect(() => {
    if (session?.user?.phone && !setupPhone) {
      setSetupPhone(session.user.phone);
    }
  }, [session?.user?.phone]);

  useEffect(() => {
    return () => {
      if (signupAvatarPreview) URL.revokeObjectURL(signupAvatarPreview);
    };
  }, [signupAvatarPreview]);

  useEffect(() => {
    return () => {
      if (setupAvatarPreview) URL.revokeObjectURL(setupAvatarPreview);
    };
  }, [setupAvatarPreview]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      await sendPhoneOtp(phoneInput);
      setOtpSent(true);
      showToast('Verification code sent via SMS.', 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send SMS code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      await verifyPhoneOtp(phoneInput, otpCode);
      showToast('Phone verified!', 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (emailMode === 'signup' && !acceptedRules) {
      setErrorMsg('Please accept the LetChat FLOW Community Rules to continue.');
      return;
    }
    setSubmitting(true);
    try {
      if (emailMode === 'login') {
        await signInWithEmail({ email, password });
      } else {
        const res = await signUpWithEmail({
          email,
          password,
          username: signupUsername,
          fullName: signupName,
          phone: signupPhone,
          avatarFile: signupAvatar,
        });
        if (res.needsEmailVerification) {
          showToast('Verification email sent! Check your inbox.', 'success');
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      await completeProfileSetup({
        fullName: setupName,
        username: setupUsername,
        phone: setupPhone,
        about: setupAbout,
        avatarFile: setupAvatar,
      });
      showToast('Welcome to LetChat FLOW!', 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingVerificationEmail) return;
    setResending(true);
    try {
      await resendVerificationEmail(pendingVerificationEmail);
      showToast(`Verification link resent to ${pendingVerificationEmail}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to resend email.', 'error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0A0A0A] text-white relative overflow-hidden">
      {/* Ambient FLOW backdrop glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-[#7C3AED]/20 blur-[110px]" />
        <div className="absolute -bottom-36 -right-24 w-80 h-80 rounded-full bg-[#00E5FF]/15 blur-[110px]" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-4">
        {/* Branding */}
        <div className="text-center space-y-2 pt-2">
          <LetChatLogo size={68} className="mx-auto" />
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">LetChat</h1>
            <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-[#0A0A0A] text-xs font-extrabold tracking-widest">
              FLOW
            </span>
          </div>
          <p className="text-xs font-medium text-zinc-400">
            Encrypted real-time messaging, moments &amp; crystal calls
          </p>
        </div>

        {/* Supabase Status Bar */}
        {(!connStatus.ok || missingTables.length > 0) && (
          <div className="flow-card p-3.5 text-xs space-y-2.5">
            <div className="flex items-start gap-2">
              {connStatus.ok ? (
                <Wifi size={15} className="text-[#00E5FF] shrink-0 mt-0.5" />
              ) : (
                <WifiOff size={15} className="text-red-400 shrink-0 mt-0.5" />
              )}
              <span className="font-medium text-zinc-300 break-words">
                {connStatus.checking
                  ? `Checking Supabase connection...`
                  : connStatus.ok
                    ? `Supabase connected (${connStatus.latency}ms)`
                    : `Supabase unreachable (${SUPABASE_URL}): ${connStatus.error}`}
              </span>
            </div>

            {missingTables.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">
                    Missing Supabase tables: {missingTables.join(', ')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSql(true)}
                    className="underline font-bold text-[#00E5FF] mt-1"
                  >
                    Open Setup SQL
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={verifyConnection}
                className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold"
              >
                <RefreshCw size={13} className={connStatus.checking ? 'animate-spin' : ''} />
                Retry Connection
              </button>
              <button
                type="button"
                onClick={() => setShowSql(true)}
                className="flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl border border-white/15 hover:bg-white/10 text-xs font-semibold"
              >
                <Database size={13} className="text-[#00E5FF]" />
                Setup SQL
              </button>
            </div>
          </div>
        )}

        {/* 1. Email Verification Pending Screen */}
        {pendingVerificationEmail ? (
          <div className="flow-glass rounded-3xl p-6 space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#00E5FF]/15 border border-[#00E5FF]/30 flex items-center justify-center text-[#00E5FF]">
              <Mail size={26} />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-extrabold text-white">Verify Your Email</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                We sent a verification link to{' '}
                <span className="text-[#00E5FF] font-semibold">{pendingVerificationEmail}</span>.
                Open the email and verify your account, then return here to sign in.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resending}
                className="w-full min-h-[44px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-sm hover:opacity-95 disabled:opacity-50"
              >
                {resending ? 'Resending...' : 'Resend Verification Email'}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearPendingVerification();
                  setAuthTab('email');
                  setEmailMode('login');
                }}
                className="w-full min-h-[42px] rounded-2xl border border-white/15 hover:bg-white/5 text-xs font-semibold text-zinc-300"
              >
                Back to Email Login
              </button>
            </div>
          </div>
        ) : session && needsProfileSetup ? (
          /* 2. Complete Profile Onboarding (after Phone OTP or uninitialized user) */
          <div className="flow-glass rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-white">Create Your Profile</h2>
                <p className="text-xs text-zinc-400">Add your name, handle, and photo to start</p>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>

            <form onSubmit={handleCompleteProfile} className="space-y-3.5">
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setupAvatarInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-3xl bg-white/5 border border-white/15 flex items-center justify-center overflow-hidden hover:border-[#00E5FF]/60 transition"
                >
                  {setupAvatarPreview ? (
                    <img
                      src={setupAvatarPreview}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera size={24} className="text-[#00E5FF]" />
                  )}
                </button>
                <input
                  ref={setupAvatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSetupAvatar(f);
                      setSetupAvatarPreview(URL.createObjectURL(f));
                    }
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3.5 min-h-[44px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="e.g. kofi_flow"
                  className="w-full px-3.5 min-h-[44px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Phone Number (optional)
                </label>
                <input
                  type="tel"
                  value={setupPhone}
                  onChange={(e) => setSetupPhone(e.target.value)}
                  placeholder="+233241234567"
                  className="w-full px-3.5 min-h-[44px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">About</label>
                <input
                  type="text"
                  value={setupAbout}
                  onChange={(e) => setSetupAbout(e.target.value)}
                  placeholder="Hey there, I'm on LetChat FLOW"
                  className="w-full px-3.5 min-h-[44px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                {submitting ? 'Saving Profile...' : 'Enter LetChat FLOW'}
              </button>
            </form>
          </div>
        ) : (
          /* 3. Main Auth Card: Real Phone OTP + Email Verification Auth */
          <div className="flow-glass rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="grid grid-cols-2 p-1 rounded-2xl bg-white/5 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('phone');
                  setErrorMsg('');
                }}
                className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  authTab === 'phone'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Phone size={14} /> Phone Auth
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('email');
                  setErrorMsg('');
                }}
                className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  authTab === 'email'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Mail size={14} /> Email
              </button>
            </div>

            {authTab === 'phone' ? (
              <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Phone Number (with country code)
                  </label>
                  <input
                    type="tel"
                    required
                    disabled={otpSent}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+233241234567"
                    className="w-full px-3.5 min-h-[46px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF] disabled:opacity-60"
                  />
                </div>

                {otpSent && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-zinc-300">SMS OTP Code</label>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setOtpCode('');
                          setErrorMsg('');
                        }}
                        className="text-[11px] font-semibold text-[#00E5FF]"
                      >
                        Change number
                      </button>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="6-digit verification code"
                      className="w-full px-3.5 min-h-[46px] rounded-2xl border border-white/15 bg-white/5 text-sm tracking-widest text-white outline-none focus:border-[#00E5FF]"
                    />
                  </div>
                )}

                {errorMsg && (
                  <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[46px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
                >
                  <span>
                    {submitting
                      ? 'Please wait...'
                      : otpSent
                        ? 'Verify & Sign In'
                        : 'Send Verification Code'}
                  </span>
                  <ArrowRight size={16} />
                </button>
              </form>
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-center gap-3 text-xs font-bold border-b border-white/10 pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('login');
                      setErrorMsg('');
                    }}
                    className={`pb-1 transition ${
                      emailMode === 'login'
                        ? 'text-[#00E5FF] border-b-2 border-[#00E5FF]'
                        : 'text-zinc-400'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('signup');
                      setErrorMsg('');
                    }}
                    className={`pb-1 transition ${
                      emailMode === 'signup'
                        ? 'text-[#00E5FF] border-b-2 border-[#00E5FF]'
                        : 'text-zinc-400'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  {emailMode === 'signup' && (
                    <>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => signupAvatarInputRef.current?.click()}
                          className="w-14 h-14 rounded-2xl bg-white/5 border border-white/15 flex items-center justify-center overflow-hidden shrink-0 hover:border-[#00E5FF]"
                          title="Upload profile photo"
                        >
                          {signupAvatarPreview ? (
                            <img
                              src={signupAvatarPreview}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Camera size={20} className="text-[#00E5FF]" />
                          )}
                        </button>
                        <input
                          ref={signupAvatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setSignupAvatar(f);
                              setSignupAvatarPreview(URL.createObjectURL(f));
                            }
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs font-semibold text-zinc-300 mb-1">
                            Full Name
                          </label>
                          <input
                            type="text"
                            required
                            value={signupName}
                            onChange={(e) => setSignupName(e.target.value)}
                            placeholder="Your full name"
                            className="w-full px-3 min-h-[42px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-300 mb-1">
                            Username
                          </label>
                          <input
                            type="text"
                            required
                            value={signupUsername}
                            onChange={(e) =>
                              setSignupUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))
                            }
                            placeholder="username"
                            className="w-full px-3 min-h-[42px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-300 mb-1">
                            Phone (optional)
                          </label>
                          <input
                            type="tel"
                            value={signupPhone}
                            onChange={(e) => setSignupPhone(e.target.value)}
                            placeholder="+233..."
                            className="w-full px-3 min-h-[42px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 min-h-[44px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full px-3.5 min-h-[44px] rounded-2xl border border-white/15 bg-white/5 text-sm text-white outline-none focus:border-[#00E5FF]"
                    />
                  </div>

                  {emailMode === 'signup' && (
                    <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={acceptedRules}
                        onChange={(e) => setAcceptedRules(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[#7C3AED]"
                      />
                      <span>
                        I accept the{' '}
                        <button
                          type="button"
                          onClick={() => setShowRules(true)}
                          className="text-[#00E5FF] font-bold underline"
                        >
                          Community Rules
                        </button>
                      </span>
                    </label>
                  )}

                  {errorMsg && (
                    <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium">
                      {errorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[46px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-sm hover:opacity-95 disabled:opacity-50"
                  >
                    {submitting
                      ? 'Please wait...'
                      : emailMode === 'login'
                        ? 'Sign In to FLOW'
                        : 'Create Account & Verify Email'}
                  </button>
                </form>
              </div>
            )}

            <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-500 border-t border-white/10">
              <span className="flex items-center gap-1">
                <ShieldCheck size={13} className="text-[#7C3AED]" />
                Real accounts only · Supabase Auth
              </span>
              <button
                type="button"
                onClick={() => setShowSql(true)}
                className="text-zinc-400 hover:text-[#00E5FF] font-semibold"
              >
                DB Setup SQL
              </button>
            </div>
          </div>
        )}
      </div>

      <SetupSqlModal open={showSql} onClose={() => setShowSql(false)} />
      <RulesModal open={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
