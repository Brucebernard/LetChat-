import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Shield,
  Wifi,
  Bell,
  Sun,
  Moon,
  Globe,
  BookOpen,
  Plug,
  LogOut,
  RefreshCw,
  Check,
  Database,
  QrCode,
  ScanLine,
  Users,
  Share2,
  Copy,
  Download,
  Volume2,
  VolumeX,
  Keyboard,
  Palette,
  Music,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { KeyboardTheme, useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { compressImage, copyToClipboard, downloadAppSourceZip } from '../../utils/mediaUtils';
import { getChatThemeById, getChatWallpaperById } from '../../utils/chatThemes';
import { CALL_TONE_OPTIONS, CHAT_TONE_OPTIONS } from '../../utils/messageSounds';
import RulesModal from '../Modals/RulesModal';
import SetupSqlModal from '../Modals/SetupSqlModal';
import ShareAppModal from '../Modals/ShareAppModal';
import ChatAppearanceModal from '../Modals/ChatAppearanceModal';
import TonePickerModal, { ToneTab } from '../Modals/TonePickerModal';
import FriendsModal, { FriendsModalView } from '../Friends/FriendsModal';

interface ProfileTabProps {
  onOpenConnectSources: () => void;
  onOpenAdmin: () => void;
  onDetailViewChange?: (isDetail: boolean) => void;
}

export default function ProfileTab({
  onOpenConnectSources,
  onOpenAdmin,
  onDetailViewChange,
}: ProfileTabProps) {
  const { profile, refreshProfile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const {
    lowDataMode,
    setLowDataMode,
    notificationsEnabled,
    setNotificationsEnabled,
    messageSoundsEnabled,
    setMessageSoundsEnabled,
    keyboardTheme,
    setKeyboardTheme,
    keyboardSoundEnabled,
    setKeyboardSoundEnabled,
    keyboardVibrateEnabled,
    setKeyboardVibrateEnabled,
    chatTheme,
    chatWallpaper,
    chatTone,
    voiceCallTone,
    videoCallTone,
    privacyOnlineVisible,
    setPrivacyOnlineVisible,
    language,
    setLanguage,
    networkSpeedMbps,
    measureSpeed,
  } = useSettings();

  const [name, setName] = useState(profile?.name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [statusText, setStatusText] = useState(
    profile?.status_text || 'Hey there! I am using LetChat.'
  );
  const [saving, setSaving] = useState(false);
  const [testingSpeed, setTestingSpeed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [showToneModal, setShowToneModal] = useState(false);
  const [toneModalTab, setToneModalTab] = useState<ToneTab>('chat');
  const [copiedAppLink, setCopiedAppLink] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const referralInputRef = useRef<HTMLInputElement | null>(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsModalMode, setFriendsModalMode] = useState<FriendsModalView>('my-qr');

  useEffect(() => {
    onDetailViewChange?.(
      Boolean(
        showRules ||
          showSql ||
          showShareApp ||
          showFriendsModal ||
          showAppearanceModal ||
          showToneModal
      )
    );
  }, [showRules, showSql, showShareApp, showFriendsModal, showAppearanceModal, showToneModal]);

  const openFriendsModal = (mode: FriendsModalView) => {
    setFriendsModalMode(mode);
    setShowFriendsModal(true);
  };

  if (!profile) return null;

  const isAdmin = profile.role === 'admin' || profile.username?.toLowerCase() === 'bruce1';

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImage(file, true);
      const url = await uploadWithProgress(
        'letchat-media',
        `avatars/${profile.id}_${Date.now()}.jpg`,
        compressed
      );
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
      await refreshProfile();
      showToast('Profile photo updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to upload avatar', 'error');
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({
          name: name.trim() || profile.name,
          bio: bio.trim(),
          status_text: statusText.trim(),
        })
        .eq('id', profile.id);
      await refreshProfile();
      showToast('Profile saved', 'success');
    } finally {
      setSaving(false);
    }
  };

  const retestSpeed = async () => {
    setTestingSpeed(true);
    await measureSpeed();
    setTestingSpeed(false);
  };

  const referralUrl = (() => {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    if (profile.username) {
      url.searchParams.set('ref', profile.username);
    }
    return url.toString();
  })();

  const handleCopyAppLink = async () => {
    const ok = await copyToClipboard(referralUrl);
    if (ok) {
      setCopiedAppLink(true);
      showToast('App invite link copied to clipboard!', 'success');
      setTimeout(() => setCopiedAppLink(false), 2000);
    } else {
      referralInputRef.current?.focus();
      referralInputRef.current?.select();
      showToast('Link selected — press Ctrl+C to copy.', 'info');
    }
  };

  const handleDownloadZip = async () => {
    if (downloadingZip) return;
    setDownloadingZip(true);
    try {
      await downloadAppSourceZip();
      showToast('Downloading letchat-v2.zip...', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to download zip', 'error');
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5 max-w-2xl mx-auto pb-8">
      {/* Profile Card */}
      <form
        onSubmit={saveProfile}
        className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-4 bg-white dark:bg-zinc-950"
      >
        <div className="flex items-center gap-4">
          <label className="relative w-16 h-16 rounded-full bg-[#0A3D62] text-white flex items-center justify-center font-bold text-xl cursor-pointer overflow-hidden shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              (profile.name?.[0] || '?').toUpperCase()
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition">
              <Camera size={18} />
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </label>
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-base truncate">{profile.name}</h2>
            <p className="text-xs text-[#1AA7B8] font-semibold">@{profile.username}</p>
            <p className="text-[11px] text-slate-400">
              Role: {isAdmin ? 'Admin' : 'Member'}
            </p>
          </div>
        </div>

        {/* Share Profile QR & Scan Friend QR Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openFriendsModal('my-qr')}
            className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <QrCode size={16} className="text-[#0A3D62] dark:text-[#1AA7B8]" /> Share My QR
          </button>
          <button
            type="button"
            onClick={() => openFriendsModal('scan')}
            className="min-h-[42px] px-3 rounded-xl bg-[#1AA7B8]/15 text-[#0A3D62] dark:text-[#1AA7B8] hover:bg-[#1AA7B8]/25 text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <ScanLine size={16} /> Scan QR to Add
          </button>
        </div>

        <div className="space-y-2.5 text-sm">
          <div>
            <label className="block text-xs font-bold mb-1">Display Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">Status</label>
            <input
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              className="w-full px-3 min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">Bio</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about yourself..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full min-h-[44px] rounded-xl bg-[#0A3D62] text-white font-bold text-sm flex items-center justify-center gap-1.5"
        >
          <Check size={16} /> {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Settings List */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-900 bg-white dark:bg-zinc-950 text-sm">
        {/* Low Data Mode + Internet Speed */}
        <div className="p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Wifi size={18} className="text-[#1AA7B8]" />
              <div>
                <p className="font-bold">Low Data Mode</p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  200KB images, 480p chat media, no autoplay, audio-only calls
                </p>
              </div>
            </div>
            <button
              onClick={() => setLowDataMode(!lowDataMode)}
              className={`w-12 h-7 rounded-full transition p-1 shrink-0 ${
                lowDataMode ? 'bg-[#1AA7B8]' : 'bg-slate-300 dark:bg-zinc-700'
              }`}
              aria-label="Toggle Low Data Mode"
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  lowDataMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between text-xs pl-7 text-slate-500 dark:text-zinc-400">
            <span className="tabular-nums">
              Internet Speed:{' '}
              <strong className="text-black dark:text-white">
                {networkSpeedMbps !== null ? `${networkSpeedMbps} Mbps` : 'Measuring...'}
              </strong>
            </span>
            <button
              onClick={retestSpeed}
              className="flex items-center gap-1 text-[#1AA7B8] font-bold"
            >
              <RefreshCw size={12} className={testingSpeed ? 'animate-spin' : ''} /> Test Speed
            </button>
          </div>
        </div>

        {/* Theme */}
        <div className="p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            <div>
              <p className="font-bold">App Theme</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {theme === 'dark' ? 'True Black Dark Mode' : 'Light Mode'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="px-3 min-h-[36px] rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold"
          >
            Switch to {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Chat Themes & Wallpapers */}
        <button
          type="button"
          onClick={() => setShowAppearanceModal(true)}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-zinc-900 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Palette size={18} className="text-[#1AA7B8] shrink-0" />
            <div className="min-w-0">
              <p className="font-bold">Chat Themes & Wallpapers</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                {getChatThemeById(chatTheme).name} ·{' '}
                {chatWallpaper === 'custom'
                  ? 'Custom Photo'
                  : getChatWallpaperById(chatWallpaper).name}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#1AA7B8] shrink-0">Customize →</span>
        </button>

        {/* Privacy */}
        <div className="p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield size={18} className="text-[#0A3D62] dark:text-[#1AA7B8]" />
            <div>
              <p className="font-bold">Privacy</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Show Online Status
              </p>
            </div>
          </div>
          <button
            onClick={() => setPrivacyOnlineVisible(!privacyOnlineVisible)}
            className={`w-12 h-7 rounded-full transition p-1 shrink-0 ${
              privacyOnlineVisible ? 'bg-[#1AA7B8]' : 'bg-slate-300 dark:bg-zinc-700'
            }`}
            aria-label="Toggle Online Status Privacy"
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                privacyOnlineVisible ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Notifications */}
        <div className="p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bell size={18} />
            <div>
              <p className="font-bold">Notifications</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Incoming calls & new messages
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const next = !notificationsEnabled;
              setNotificationsEnabled(next);
              if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
              }
            }}
            className={`w-12 h-7 rounded-full transition p-1 shrink-0 ${
              notificationsEnabled ? 'bg-[#1AA7B8]' : 'bg-slate-300 dark:bg-zinc-700'
            }`}
            aria-label="Toggle Notifications"
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Message Sounds ON/OFF */}
        <div className="p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {messageSoundsEnabled ? (
              <Volume2 size={18} className="text-[#1AA7B8]" />
            ) : (
              <VolumeX size={18} className="text-slate-400" />
            )}
            <div>
              <p className="font-bold">Message Sounds</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {messageSoundsEnabled ? 'ON · Pop on send, ding & vibrate on receive' : 'OFF · Muted'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !messageSoundsEnabled;
              setMessageSoundsEnabled(next);
              if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
              }
            }}
            className={`w-12 h-7 rounded-full transition p-1 shrink-0 ${
              messageSoundsEnabled ? 'bg-[#1AA7B8]' : 'bg-slate-300 dark:bg-zinc-700'
            }`}
            aria-label="Toggle Message Sounds"
          >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  messageSoundsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Chat, Voice Call & Video Call Tones */}
          <div className="p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Music size={18} className="text-[#1AA7B8]" />
                <div>
                  <p className="font-bold">Chat & Call Tones</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Pick message, voice call & video call tones
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setToneModalTab('chat');
                  setShowToneModal(true);
                }}
                className="text-xs font-bold text-[#1AA7B8] shrink-0"
              >
                Choose →
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 pl-7">
              <button
                type="button"
                onClick={() => {
                  setToneModalTab('chat');
                  setShowToneModal(true);
                }}
                className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900 text-left"
              >
                <p className="text-[10px] text-slate-400 font-bold uppercase">Chat</p>
                <p className="text-[11px] font-bold truncate">
                  {CHAT_TONE_OPTIONS.find((t) => t.id === chatTone)?.name || 'LetChat Ding'}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setToneModalTab('voice');
                  setShowToneModal(true);
                }}
                className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900 text-left"
              >
                <p className="text-[10px] text-slate-400 font-bold uppercase">Voice Call</p>
                <p className="text-[11px] font-bold truncate">
                  {CALL_TONE_OPTIONS.find((t) => t.id === voiceCallTone)?.name || 'Kalimba Breeze'}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setToneModalTab('video');
                  setShowToneModal(true);
                }}
                className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900 text-left"
              >
                <p className="text-[10px] text-slate-400 font-bold uppercase">Video Call</p>
                <p className="text-[11px] font-bold truncate">
                  {CALL_TONE_OPTIONS.find((t) => t.id === videoCallTone)?.name || 'Horizon Uplift'}
                </p>
              </button>
            </div>
          </div>

          {/* Personalized LetChat Keyboard Settings */}
          <div className="p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Keyboard size={18} className="text-purple-500" />
                <div>
                  <p className="font-bold">LetChat Keyboard</p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Choose in-app keyboard theme & feedback
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#1AA7B8] capitalize">{keyboardTheme}</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pl-7">
              {(
                [
                  { id: 'aurora', label: 'Aurora', swatch: 'from-[#1A0033] via-purple-600 to-pink-500 text-white' },
                  { id: 'dark', label: 'Dark', swatch: 'from-zinc-900 to-zinc-700 text-white' },
                  { id: 'light', label: 'Light', swatch: 'from-slate-100 to-white text-slate-900 border border-slate-300' },
                  { id: 'ghana', label: 'Ghana', swatch: 'from-[#CE1126] via-[#FCD116] to-[#006B3F] text-black' },
                ] as { id: KeyboardTheme; label: string; swatch: string }[]
              ).map((opt) => {
                const active = keyboardTheme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setKeyboardTheme(opt.id)}
                    className={`min-h-[38px] px-2 rounded-xl text-[11px] font-bold bg-gradient-to-br ${opt.swatch} transition ${
                      active ? 'ring-2 ring-[#1AA7B8] ring-offset-1 dark:ring-offset-zinc-950 scale-[1.02]' : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pl-7 pt-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Sound on keypress
              </span>
              <button
                type="button"
                onClick={() => setKeyboardSoundEnabled(!keyboardSoundEnabled)}
                className={`w-11 h-6 rounded-full transition p-0.5 shrink-0 ${
                  keyboardSoundEnabled ? 'bg-purple-600' : 'bg-slate-300 dark:bg-zinc-700'
                }`}
                aria-label="Toggle Sound on Keypress"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    keyboardSoundEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between pl-7">
              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Vibration on keypress
              </span>
              <button
                type="button"
                onClick={() => setKeyboardVibrateEnabled(!keyboardVibrateEnabled)}
                className={`w-11 h-6 rounded-full transition p-0.5 shrink-0 ${
                  keyboardVibrateEnabled ? 'bg-purple-600' : 'bg-slate-300 dark:bg-zinc-700'
                }`}
                aria-label="Toggle Keyboard Vibration"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    keyboardVibrateEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

        {/* Language */}
        <div className="p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Globe size={18} />
            <p className="font-bold">Language</p>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3 min-h-[36px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-bold outline-none"
          >
            <option value="English">English</option>
            <option value="Twi">Twi</option>
            <option value="French">French</option>
            <option value="Pidgin">Pidgin</option>
          </select>
        </div>

        {/* Connect Football Sources */}
        <button
          onClick={onOpenConnectSources}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-zinc-900 text-left"
        >
          <div className="flex items-center gap-2.5">
            <Plug size={18} className="text-[#1AA7B8]" />
            <div>
              <p className="font-bold">Connect Football Sources</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Facebook, Instagram, X, YouTube & RSS feeds
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#1AA7B8]">Configure →</span>
        </button>

        {/* Community Rules */}
        <button
          onClick={() => setShowRules(true)}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-zinc-900 text-left"
        >
          <div className="flex items-center gap-2.5">
            <BookOpen size={18} />
            <p className="font-bold">Community Rules</p>
          </div>
          <span className="text-xs text-slate-400">View →</span>
        </button>

        {/* Friendship */}
        <div className="p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Users size={18} className="text-[#1AA7B8]" />
            <div>
              <h3 className="font-bold">Friendship</h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Present your QR code or scan a friend
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openFriendsModal('my-qr')}
            className="px-3.5 min-h-[38px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90 shrink-0 whitespace-nowrap"
          >
            <QrCode size={14} /> Share My Code
          </button>
        </div>

        {/* Copy & Share App Link */}
        <div className="p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Share2 size={18} className="text-[#1AA7B8] shrink-0" />
              <div className="min-w-0">
                <p className="font-bold">Share LetChat App Link</p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Invite friends with your personal referral link
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyAppLink}
                className="px-3 min-h-[40px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap"
              >
                {copiedAppLink ? <Check size={14} /> : <Copy size={14} />}
                {copiedAppLink ? 'Copied!' : 'Copy App Link'}
              </button>
              <button
                type="button"
                onClick={() => setShowShareApp(true)}
                className="px-3 min-h-[40px] rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-xs font-bold text-[#1AA7B8] whitespace-nowrap"
              >
                QR / Share
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <input
              ref={referralInputRef}
              type="text"
              readOnly
              value={referralUrl}
              onClick={(e) => e.currentTarget.select()}
              aria-label="Referral app link"
              className="text-[11px] font-mono bg-transparent flex-1 min-w-0 outline-none select-all text-slate-600 dark:text-zinc-300"
            />
          </div>
        </div>

        {/* Setup SQL */}
        <button
          onClick={() => setShowSql(true)}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-zinc-900 text-left"
        >
          <div className="flex items-center gap-2.5">
            <Database size={18} />
            <p className="font-bold">Database Setup SQL</p>
          </div>
          <span className="text-xs text-slate-400">View →</span>
        </button>

        {/* Download Source Zip */}
        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={downloadingZip}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-zinc-900 text-left disabled:opacity-60"
        >
          <div className="flex items-center gap-2.5">
            <Download size={18} className="text-[#1AA7B8]" />
            <div>
              <p className="font-bold">Download Source Code (.zip)</p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Complete LetChat project archive
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#1AA7B8]">
            {downloadingZip ? 'Preparing...' : 'Download →'}
          </span>
        </button>

        {/* Hidden Admin Link */}
        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-zinc-900 text-left text-[#0A3D62] dark:text-[#1AA7B8]"
          >
            <div className="flex items-center gap-2.5">
              <Shield size={18} />
              <p className="font-bold">Admin Moderation Dashboard (/admin)</p>
            </div>
            <span className="text-xs font-bold">Open →</span>
          </button>
        )}
      </div>

      <button
        onClick={signOut}
        className="w-full min-h-[44px] rounded-xl border border-red-500/40 text-red-500 font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-500/10"
      >
        <LogOut size={16} /> Sign Out
      </button>

      <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      <SetupSqlModal open={showSql} onClose={() => setShowSql(false)} />
      <ShareAppModal open={showShareApp} onClose={() => setShowShareApp(false)} />
      <ChatAppearanceModal
        open={showAppearanceModal}
        onClose={() => setShowAppearanceModal(false)}
      />
      <TonePickerModal
        open={showToneModal}
        initialTab={toneModalTab}
        onClose={() => setShowToneModal(false)}
      />
      <FriendsModal
        open={showFriendsModal}
        initialMode={friendsModalMode}
        onClose={() => setShowFriendsModal(false)}
        onAdded={() => showToast('Friend added via QR!', 'success')}
      />
    </div>
  );
}
