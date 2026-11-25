import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, Database, AlertTriangle, Sun, Moon, Share2, Download } from 'lucide-react';
import LetChatLogo from '../LetChatLogo';
import { SUPABASE_URL, pingSupabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { downloadAppSourceZip } from '../../utils/mediaUtils';
import SetupSqlModal from '../Modals/SetupSqlModal';
import RulesModal from '../Modals/RulesModal';
import ShareAppModal from '../Modals/ShareAppModal';

export default function AuthScreen() {
  const { signIn, signUp, signInAsGuest, missingTables, checkSchema } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedRules, setAcceptedRules] = useState(false);

  const [connStatus, setConnStatus] = useState<{
    checking: boolean;
    ok: boolean;
    error: string | null;
    latency: number | null;
  }>({ checking: true, ok: false, error: null, latency: null });
  const [showSql, setShowSql] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const verifyConnection = async () => {
    setConnStatus((s) => ({ ...s, checking: true }));
    const res = await pingSupabase();
    setConnStatus({ checking: false, ok: res.ok, error: res.error, latency: res.latency });
    if (res.ok) await checkSchema();
  };

  useEffect(() => {
    verifyConnection();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (mode === 'signup' && !acceptedRules) {
      setErrorMsg('You must accept the LetChat Community Rules to create an account.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signIn({ username, password });
      } else {
        await signUp({ username, name, password });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-white dark:bg-black text-black dark:text-white">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowShareApp(true)}
            className="min-h-[44px] px-3.5 flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-xs font-bold"
            aria-label="Share App Link"
          >
            <Share2 size={15} className="text-[#1AA7B8]" />
            <span>Share App</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* Branding */}
        <div className="text-center space-y-2">
          <LetChatLogo size={64} className="mx-auto" />
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0A3D62] dark:text-white">
            LetChat
          </h1>
          <p className="text-xs font-semibold text-[#1AA7B8]">Chat. Share. Discover Everything.</p>
        </div>

        {/* Connection Status Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-3.5 text-xs space-y-2.5 bg-slate-50 dark:bg-zinc-950">
          <div className="flex items-start gap-2">
            {connStatus.ok ? (
              <Wifi size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <WifiOff size={16} className="text-red-500 shrink-0 mt-0.5" />
            )}
            <span className="font-semibold break-words">
              {connStatus.checking
                ? `Connection Status: Checking ${SUPABASE_URL}...`
                : connStatus.ok
                ? `Connection Status: Connected (${connStatus.latency}ms) — ${SUPABASE_URL}`
                : `Connection Status: Failed - Trying to reach ${SUPABASE_URL} - Error: ${connStatus.error}`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={verifyConnection}
              className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-[#0A3D62] text-white font-semibold hover:opacity-90 whitespace-nowrap"
            >
              <RefreshCw size={13} className={connStatus.checking ? 'animate-spin' : ''} />
              Verify Connection
            </button>
            <button
              type="button"
              onClick={() => setShowSql(true)}
              className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl border border-slate-300 dark:border-zinc-700 font-semibold hover:bg-slate-100 dark:hover:bg-zinc-900 whitespace-nowrap"
            >
              <Database size={13} />
              Setup SQL
            </button>
            <button
              type="button"
              disabled={downloadingZip}
              onClick={async () => {
                setDownloadingZip(true);
                try {
                  await downloadAppSourceZip();
                  showToast('Downloading letchat-v2.zip...', 'success');
                } catch (err) {
                  showToast(
                    err instanceof Error ? err.message : 'Unable to download zip',
                    'error'
                  );
                } finally {
                  setDownloadingZip(false);
                }
              }}
              className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl border border-slate-300 dark:border-zinc-700 font-semibold hover:bg-slate-100 dark:hover:bg-zinc-900 whitespace-nowrap disabled:opacity-60"
            >
              <Download size={13} className="text-[#1AA7B8]" />
              {downloadingZip ? 'Preparing...' : 'Download .zip'}
            </button>
          </div>

          {missingTables.length > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Database tables missing: {missingTables.join(', ')}</p>
                <button
                  type="button"
                  onClick={() => setShowSql(true)}
                  className="underline font-bold mt-1"
                >
                  Open exact Setup SQL
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Auth Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-950 shadow-sm space-y-4">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
              }}
              className={`min-h-[40px] rounded-lg text-sm font-semibold transition ${
                mode === 'login'
                  ? 'bg-white dark:bg-black shadow text-[#0A3D62] dark:text-[#1AA7B8]'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg('');
              }}
              className={`min-h-[40px] rounded-lg text-sm font-semibold transition ${
                mode === 'signup'
                  ? 'bg-white dark:bg-black shadow text-[#0A3D62] dark:text-[#1AA7B8]'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full px-3.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent text-sm outline-none focus:border-[#1AA7B8]"
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full px-3.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent text-sm outline-none focus:border-[#1AA7B8]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent text-sm outline-none focus:border-[#1AA7B8]"
              />
            </div>

            {mode === 'signup' && (
              <label className="flex items-start gap-2.5 text-xs cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={acceptedRules}
                  onChange={(e) => setAcceptedRules(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#1AA7B8]"
                />
                <span>
                  I accept the{' '}
                  <button
                    type="button"
                    onClick={() => setShowRules(true)}
                    className="text-[#1AA7B8] font-bold underline"
                  >
                    LetChat Community Rules
                  </button>
                </span>
              </label>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-[#0A3D62] to-[#1AA7B8] text-white font-bold text-sm hover:opacity-95 disabled:opacity-50"
            >
              {submitting ? 'Please wait...' : mode === 'login' ? 'Login to LetChat' : 'Create Account'}
            </button>
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200 dark:border-zinc-800" />
            <span className="px-3 text-[11px] font-semibold text-slate-400 uppercase">or</span>
            <div className="flex-grow border-t border-slate-200 dark:border-zinc-800" />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setErrorMsg('');
              setSubmitting(true);
              try {
                await signInAsGuest();
              } catch (err) {
                setErrorMsg(err instanceof Error ? err.message : 'Guest sign-in failed');
              } finally {
                setSubmitting(false);
              }
            }}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900 font-bold text-xs text-[#0A3D62] dark:text-[#1AA7B8] disabled:opacity-50"
          >
            Continue as Guest (Anonymous)
          </button>
        </div>
      </div>

      <SetupSqlModal open={showSql} onClose={() => setShowSql(false)} />
      <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      <ShareAppModal open={showShareApp} onClose={() => setShowShareApp(false)} />
    </div>
  );
}
