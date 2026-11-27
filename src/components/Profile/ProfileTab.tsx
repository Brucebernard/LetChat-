import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Shield,
  Wifi,
  Bell,
  Globe,
  BookOpen,
  LogOut,
  RefreshCw,
  Check,
  Database,
  QrCode,
  ScanLine,
  Users,
  Share2,
  Copy,
  Volume2,
  VolumeX,
  Keyboard,
  Palette,
  Music,
  Trash2,
  Phone,
  AlertTriangle,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { KeyboardTheme, useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useFlowKeyboard } from '../../context/KeyboardContext';
import { useToast } from '../../context/ToastContext';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { compressImage, copyToClipboard } from '../../utils/mediaUtils';
import { getChatThemeById, getChatWallpaperById } from '../../utils/chatThemes';
import { CALL_TONE_OPTIONS, CHAT_TONE_OPTIONS } from '../../utils/messageSounds';
import { getDisplayName, getUsernameHandle } from '../../utils/appCache';
import { ProfileAvatar, VerifiedNameBadge } from '../Common/VerifiedBadge';
import RulesModal from '../Modals/RulesModal';
import SetupSqlModal from '../Modals/SetupSqlModal';
import ShareAppModal from '../Modals/ShareAppModal';
import ChatAppearanceModal from '../Modals/ChatAppearanceModal';
import TonePickerModal, { ToneTab } from '../Modals/TonePickerModal';
import FriendsModal, { FriendsModalView } from '../Friends/FriendsModal';

interface ProfileTabProps {
  onOpenAdmin: () => void;
  onDetailViewChange?: (isDetail: boolean) => void;
}

export default function ProfileTab({
  onOpenAdmin,
  onDetailViewChange,
}: ProfileTabProps) {
  const { profile, refreshProfile, signOut, deleteAccount } = useAuth();
  const { themeMode, setThemeMode } = useTheme();
  const { openKeyboard, syncFieldText } = useFlowKeyboard();
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

  const [fullName, setFullName] = useState(profile?.full_name || profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [about, setAbout] = useState(profile?.about || profile?.bio || 'On LetChat FLOW');
  const [saving, setSaving] = useState(false);
  const [testingSpeed, setTestingSpeed] = useState(false);

  const [showRules, setShowRules] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [showToneModal, setShowToneModal] = useState(false);
  const [toneModalTab, setToneModalTab] = useState<ToneTab>('chat');
  const [copiedAppLink, setCopiedAppLink] = useState(false);
  const referralInputRef = useRef<HTMLInputElement | null>(null);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsModalMode, setFriendsModalMode] = useState<FriendsModalView>('my-qr');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name || profile?.name || '');
    setPhone(profile?.phone || '');
    setAbout(profile?.about || profile?.bio || 'On LetChat FLOW');
  }, [profile]);

  useEffect(() => {
    onDetailViewChange?.(
      Boolean(
        showRules ||
          showSql ||
          showShareApp ||
          showFriendsModal ||
          showAppearanceModal ||
          showToneModal ||
          showDeleteConfirm
      )
    );
  }, [
    showRules,
    showSql,
    showShareApp,
    showFriendsModal,
    showAppearanceModal,
    showToneModal,
    showDeleteConfirm,
    onDetailViewChange,
  ]);

  const openFriendsModal = (mode: FriendsModalView) => {
    setFriendsModalMode(mode);
    setShowFriendsModal(true);
  };

  if (!profile) return null;

  const isAdmin = profile.role === 'admin';
  const displayName = getDisplayName(profile);

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
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', profile.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
      showToast('Profile photo updated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to upload photo', 'error');
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fullName.trim() || displayName;
    const cleanAbout = about.trim();
    const cleanPhone = phone.trim();
    setSaving(true);
    try {
      const basePayload = {
        full_name: cleanName,
        name: cleanName,
        phone: cleanPhone || null,
        about: cleanAbout,
        bio: cleanAbout,
        status_text: cleanAbout,
      };
      let { error } = await supabase
        .from('profiles')
        .update({
          ...basePayload,
          display_name: cleanName,
        })
        .eq('id', profile.id);
      if (error && error.message?.toLowerCase().includes('display_name')) {
        const retry = await supabase
          .from('profiles')
          .update(basePayload)
          .eq('id', profile.id);
        error = retry.error;
      }
      if (error) throw new Error(error.message);
      await refreshProfile();
      showToast('Profile saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteAccount();
      showToast('Account deleted', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to delete account', 'error');
      setDeleting(false);
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
      showToast('App invite link copied!', 'success');
      setTimeout(() => setCopiedAppLink(false), 2000);
    } else {
      referralInputRef.current?.focus();
      referralInputRef.current?.select();
      showToast('Link selected — press Ctrl+C to copy.', 'info');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5 max-w-2xl mx-auto pb-8 bg-[#0A0A0A] text-white">
      {/* Profile Card */}
      <form
        onSubmit={saveProfile}
        className="rounded-3xl border border-white/10 p-5 space-y-4 bg-[#12121A]/90 backdrop-blur-xl shadow-xl"
      >
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer shrink-0">
            <ProfileAvatar
              profile={profile}
              sizeClass="w-18 h-18 text-xl"
              roundedClass="rounded-full"
              badgeSize={16}
              ringClass="ring-2 ring-[#7C3AED]/50 shadow-lg shadow-[#7C3AED]/25"
            />
            <div className="absolute -bottom-0.5 -left-0.5 w-7 h-7 rounded-full bg-[#7C3AED] border-2 border-[#12121A] flex items-center justify-center text-white shadow">
              <Camera size={13} />
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </label>
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-base text-white flex items-center gap-1.5">
              <span className="truncate">{displayName}</span>
              <VerifiedNameBadge isVerified={profile.is_verified} size={16} />
            </h2>
            <p className="text-xs text-[#00E5FF] font-semibold">
              {getUsernameHandle(profile) || '@member'}
            </p>
            <p className="text-[11px] text-zinc-400">
              {profile.is_verified
                ? 'Verified Owner Account'
                : isAdmin
                  ? 'Admin'
                  : 'LetChat Member'}
              {profile.phone ? ` · ${profile.phone}` : ''}
            </p>
          </div>
        </div>

        {/* QR & Friends Quick Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openFriendsModal('my-qr')}
            className="min-h-[42px] px-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <QrCode size={16} className="text-[#00E5FF]" /> My QR Code
          </button>
          <button
            type="button"
            onClick={() => openFriendsModal('scan')}
            className="min-h-[42px] px-3 rounded-xl bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-[#00E5FF] hover:bg-[#7C3AED]/30 text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <ScanLine size={16} /> Scan Friend QR
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1">Full Name</label>
            <div className="flex items-center gap-2 px-3.5 min-h-[42px] rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-[#00E5FF]">
              <input
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  syncFieldText('profile-fullname', e.target.value);
                }}
                placeholder="Your name"
                className="w-full bg-transparent text-white outline-none text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  openKeyboard({
                    id: 'profile-fullname',
                    label: 'Full Name',
                    placeholder: 'Your name',
                    text: fullName,
                    onChange: setFullName,
                  })
                }
                className="text-zinc-400 hover:text-[#00E5FF] shrink-0"
                aria-label="Open FLOW Keyboard for Full Name"
              >
                <Keyboard size={15} />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1">Phone Number</label>
            <div className="flex items-center gap-2 px-3.5 min-h-[42px] rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-[#00E5FF]">
              <Phone size={15} className="text-zinc-500 shrink-0" />
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  syncFieldText('profile-phone', e.target.value);
                }}
                placeholder="+233241234567"
                className="w-full bg-transparent text-white outline-none text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  openKeyboard({
                    id: 'profile-phone',
                    label: 'Phone Number',
                    placeholder: '+233241234567',
                    text: phone,
                    onChange: setPhone,
                  })
                }
                className="text-zinc-400 hover:text-[#00E5FF] shrink-0"
                aria-label="Open FLOW Keyboard for Phone Number"
              >
                <Keyboard size={15} />
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-zinc-400">About</label>
              <button
                type="button"
                onClick={() =>
                  openKeyboard({
                    id: 'profile-about',
                    label: 'About',
                    placeholder: 'Tell friends about yourself...',
                    text: about,
                    onChange: setAbout,
                  })
                }
                className="text-[11px] font-semibold text-[#00E5FF] flex items-center gap-1"
              >
                <Keyboard size={13} /> FLOW Keyboard
              </button>
            </div>
            <textarea
              rows={2}
              value={about}
              onChange={(e) => {
                setAbout(e.target.value);
                syncFieldText('profile-about', e.target.value);
              }}
              placeholder="Tell friends about yourself..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-white outline-none focus:border-[#00E5FF]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-[#7C3AED]/25 disabled:opacity-60"
        >
          <Check size={16} /> {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Settings List */}
      <div className="rounded-3xl border border-white/10 divide-y divide-white/10 bg-[#12121A]/90 backdrop-blur-xl text-sm overflow-hidden">
        {/* App Appearance: Dark Mode / Light Mode / System */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {themeMode === 'light' ? (
                <Sun size={18} className="text-amber-400" />
              ) : themeMode === 'system' ? (
                <Monitor size={18} className="text-[#00E5FF]" />
              ) : (
                <Moon size={18} className="text-[#7C3AED]" />
              )}
              <div>
                <p className="font-bold">Appearance</p>
                <p className="text-[11px] text-zinc-400">
                  Switch between Dark Mode, Light Mode, or System
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pl-7">
            {(
              [
                { id: 'dark', label: 'Dark Mode', Icon: Moon },
                { id: 'light', label: 'Light Mode', Icon: Sun },
                { id: 'system', label: 'System', Icon: Monitor },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = themeMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setThemeMode(id)}
                  className={`min-h-[38px] px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    active
                      ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] border-transparent text-white shadow-md shadow-[#7C3AED]/25'
                      : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08]'
                  }`}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Friends Directory */}
        <button
          type="button"
          onClick={() => openFriendsModal('friends')}
          className="w-full p-4 flex items-center justify-between hover:bg-white/[0.04] text-left transition"
        >
          <div className="flex items-center gap-3">
            <Users size={18} className="text-[#00E5FF]" />
            <div>
              <p className="font-bold">Friends & Requests</p>
              <p className="text-[11px] text-zinc-400">
                Manage contacts, accept requests, or search by username/phone
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#00E5FF] shrink-0">Open →</span>
        </button>

        {/* Chat Themes & Wallpapers */}
        <button
          type="button"
          onClick={() => setShowAppearanceModal(true)}
          className="w-full p-4 flex items-center justify-between hover:bg-white/[0.04] text-left transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Palette size={18} className="text-[#7C3AED] shrink-0" />
            <div className="min-w-0">
              <p className="font-bold">Chat Themes & Wallpapers</p>
              <p className="text-[11px] text-zinc-400 truncate">
                {getChatThemeById(chatTheme).name} ·{' '}
                {chatWallpaper === 'custom'
                  ? 'Custom Photo'
                  : getChatWallpaperById(chatWallpaper).name}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#00E5FF] shrink-0">Customize →</span>
        </button>

        {/* Chat, Voice Call & Video Call Tones */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Music size={18} className="text-[#00E5FF]" />
              <div>
                <p className="font-bold">Chat & Call Tones</p>
                <p className="text-[11px] text-zinc-400">
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
              className="text-xs font-bold text-[#00E5FF] shrink-0"
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
              className="p-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-left"
            >
              <p className="text-[10px] text-zinc-400 font-bold uppercase">Chat</p>
              <p className="text-[11px] font-bold truncate text-white">
                {CHAT_TONE_OPTIONS.find((t) => t.id === chatTone)?.name || 'LetChat Ding'}
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setToneModalTab('voice');
                setShowToneModal(true);
              }}
              className="p-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-left"
            >
              <p className="text-[10px] text-zinc-400 font-bold uppercase">Voice Call</p>
              <p className="text-[11px] font-bold truncate text-white">
                {CALL_TONE_OPTIONS.find((t) => t.id === voiceCallTone)?.name || 'Kalimba Breeze'}
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setToneModalTab('video');
                setShowToneModal(true);
              }}
              className="p-2.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-left"
            >
              <p className="text-[10px] text-zinc-400 font-bold uppercase">Video Call</p>
              <p className="text-[11px] font-bold truncate text-white">
                {CALL_TONE_OPTIONS.find((t) => t.id === videoCallTone)?.name || 'Horizon Uplift'}
              </p>
            </button>
          </div>
        </div>

        {/* Low Data Mode + Internet Speed */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Wifi size={18} className="text-[#00E5FF]" />
              <div>
                <p className="font-bold">Low Data Mode</p>
                <p className="text-[11px] text-zinc-400">
                  Compress media & prefer voice-only calls on mobile data
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLowDataMode(!lowDataMode)}
              className={`w-12 h-7 rounded-full transition p-1 shrink-0 ${
                lowDataMode ? 'bg-[#7C3AED]' : 'bg-zinc-700'
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
          <div className="flex items-center justify-between text-xs pl-7 text-zinc-400">
            <span className="tabular-nums">
              Network Speed:{' '}
              <strong className="text-white">
                {networkSpeedMbps !== null ? `${networkSpeedMbps} Mbps` : 'Measuring...'}
              </strong>
            </span>
            <button
              type="button"
              onClick={retestSpeed}
              className="flex items-center gap-1 text-[#00E5FF] font-bold"
            >
              <RefreshCw size={12} className={testingSpeed ? 'animate-spin' : ''} /> Test Speed
            </button>
          </div>
        </div>

        {/* Privacy */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={18} className="text-[#00E5FF]" />
            <div>
              <p className="font-bold">Privacy</p>
              <p className="text-[11px] text-zinc-400">Show Online Status</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPrivacyOnlineVisible(!privacyOnlineVisible)}
            className={`w-12 h-7 rounded-full transition p-1 shrink-0 ${
              privacyOnlineVisible ? 'bg-[#7C3AED]' : 'bg-zinc-700'
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
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell size={18} className="text-zinc-300" />
            <div>
              <p className="font-bold">Notifications</p>
              <p className="text-[11px] text-zinc-400">Incoming calls & new messages</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !notificationsEnabled;
              setNotificationsEnabled(next);
              if (
                next &&
                typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'default'
              ) {
                Notification.requestPermission().catch(() => {});
              }
            }}
            className={`w-12 h-7 rounded-full transition p-1 shrink-0 ${
              notificationsEnabled ? 'bg-[#7C3AED]' : 'bg-zinc-700'
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
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {messageSoundsEnabled ? (
              <Volume2 size={18} className="text-[#00E5FF]" />
            ) : (
              <VolumeX size={18} className="text-zinc-500" />
            )}
            <div>
              <p className="font-bold">Message Sounds</p>
              <p className="text-[11px] text-zinc-400">
                {messageSoundsEnabled ? 'ON · Tone & vibration alerts' : 'OFF · Muted'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMessageSoundsEnabled(!messageSoundsEnabled)}
            className={`w-12 h-7 rounded-full transition p-1 shrink-0 ${
              messageSoundsEnabled ? 'bg-[#7C3AED]' : 'bg-zinc-700'
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

        {/* LetChat Keyboard */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Keyboard size={18} className="text-[#7C3AED]" />
              <div>
                <p className="font-bold">In-App Keyboard</p>
                <p className="text-[11px] text-zinc-400">Theme & keypress feedback</p>
              </div>
            </div>
            <span className="text-xs font-bold text-[#00E5FF] capitalize">{keyboardTheme}</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 pl-7">
            {(
              [
                { id: 'aurora', label: 'Aurora', swatch: 'from-[#1A0033] via-[#7C3AED] to-[#00E5FF] text-white' },
                { id: 'dark', label: 'Dark', swatch: 'from-zinc-900 to-zinc-700 text-white' },
                { id: 'light', label: 'Light', swatch: 'from-slate-100 to-white text-slate-900' },
                { id: 'ghana', label: 'Ghana', swatch: 'from-[#CE1126] via-[#FCD116] to-[#006B3F] text-black' },
              ] as { id: KeyboardTheme; label: string; swatch: string }[]
            ).map((opt) => {
              const active = keyboardTheme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setKeyboardTheme(opt.id)}
                  className={`min-h-[36px] px-2 rounded-xl text-[11px] font-bold bg-gradient-to-br ${opt.swatch} transition ${
                    active
                      ? 'ring-2 ring-[#00E5FF] ring-offset-1 ring-offset-[#12121A] scale-[1.02]'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pl-7 pt-1">
            <span className="text-xs font-semibold text-zinc-300">Sound on keypress</span>
            <button
              type="button"
              onClick={() => setKeyboardSoundEnabled(!keyboardSoundEnabled)}
              className={`w-11 h-6 rounded-full transition p-0.5 shrink-0 ${
                keyboardSoundEnabled ? 'bg-[#7C3AED]' : 'bg-zinc-700'
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
            <span className="text-xs font-semibold text-zinc-300">Vibration on keypress</span>
            <button
              type="button"
              onClick={() => setKeyboardVibrateEnabled(!keyboardVibrateEnabled)}
              className={`w-11 h-6 rounded-full transition p-0.5 shrink-0 ${
                keyboardVibrateEnabled ? 'bg-[#7C3AED]' : 'bg-zinc-700'
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
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe size={18} className="text-zinc-300" />
            <p className="font-bold">Language</p>
          </div>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3 min-h-[36px] rounded-xl border border-white/10 bg-[#0A0A0A] text-white text-xs font-bold outline-none"
          >
            <option value="English">English</option>
            <option value="Twi">Twi</option>
            <option value="French">French</option>
            <option value="Pidgin">Pidgin</option>
          </select>
        </div>

        {/* Share App Invite Link */}
        <div className="p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <Share2 size={18} className="text-[#00E5FF] shrink-0" />
              <div className="min-w-0">
                <p className="font-bold">Share LetChat FLOW Invite</p>
                <p className="text-[11px] text-zinc-400">
                  Invite friends with your personal link or QR
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyAppLink}
                className="px-3 min-h-[38px] rounded-xl bg-[#7C3AED] text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90 whitespace-nowrap"
              >
                {copiedAppLink ? <Check size={14} /> : <Copy size={14} />}
                {copiedAppLink ? 'Copied!' : 'Copy Link'}
              </button>
              <button
                type="button"
                onClick={() => setShowShareApp(true)}
                className="px-3 min-h-[38px] rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-bold text-[#00E5FF] whitespace-nowrap"
              >
                QR / Share
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10">
            <input
              ref={referralInputRef}
              type="text"
              readOnly
              value={referralUrl}
              onClick={(e) => e.currentTarget.select()}
              aria-label="Referral app link"
              className="text-[11px] font-mono bg-transparent flex-1 min-w-0 outline-none select-all text-zinc-300"
            />
          </div>
        </div>

        {/* Community Rules & Setup SQL */}
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="w-full p-4 flex items-center justify-between hover:bg-white/[0.04] text-left transition"
        >
          <div className="flex items-center gap-3">
            <BookOpen size={18} className="text-zinc-300" />
            <p className="font-bold">Community Rules</p>
          </div>
          <span className="text-xs text-zinc-400">View →</span>
        </button>

        <button
          type="button"
          onClick={() => setShowSql(true)}
          className="w-full p-4 flex items-center justify-between hover:bg-white/[0.04] text-left transition"
        >
          <div className="flex items-center gap-3">
            <Database size={18} className="text-zinc-300" />
            <p className="font-bold">Database Setup SQL</p>
          </div>
          <span className="text-xs text-zinc-400">View →</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="w-full p-4 flex items-center justify-between hover:bg-white/[0.04] text-left text-[#00E5FF] transition"
          >
            <div className="flex items-center gap-3">
              <Shield size={18} />
              <p className="font-bold">Admin Moderation Dashboard</p>
            </div>
            <span className="text-xs font-bold">Open →</span>
          </button>
        )}
      </div>

      {/* Account Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={signOut}
          className="w-full min-h-[46px] rounded-2xl border border-white/15 bg-white/[0.04] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/[0.08] transition"
        >
          <LogOut size={16} /> Log Out
        </button>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full min-h-[46px] rounded-2xl border border-red-500/40 bg-red-500/10 text-red-400 font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-500/20 transition"
        >
          <Trash2 size={16} /> Delete Account
        </button>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#12121A] border border-red-500/30 p-5 space-y-4 shadow-2xl text-white">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Delete Account?</h3>
                <p className="text-xs text-zinc-400">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Your profile, messages, friends, moments, and call history will be permanently removed from LetChat FLOW.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="min-h-[42px] rounded-xl border border-white/15 bg-white/[0.04] text-xs font-bold hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="min-h-[42px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        onAdded={() => showToast('Friend request updated!', 'success')}
      />
    </div>
  );
}
