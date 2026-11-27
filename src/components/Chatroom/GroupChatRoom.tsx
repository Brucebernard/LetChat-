import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Phone,
  Video,
  Users,
  Plus,
  Send,
  Mic,
  Square,
  Image as ImageIcon,
  Film,
  FileText,
  Sticker,
  X,
  Reply,
  Trash2,
  ShieldCheck,
  UserPlus,
  UserMinus,
  LogOut,
  Globe,
  Lock,
  Play,
  Pause,
  Download,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import {
  compressImage,
  compressVideoTo480p,
  formatBytes,
  formatDuration,
} from '../../utils/mediaUtils';
import {
  playReceiveSound,
  playRecordStartBeep,
  playSendSound,
} from '../../utils/messageSounds';
import { normalizeProfileRecord } from '../../utils/friendService';
import StickerPicker from '../Stickers/StickerPicker';
import GroupCallOverlay from './GroupCallOverlay';
import {
  GroupCallSession,
  GroupItem,
  GroupMember,
  GroupMessage,
  Profile,
} from '../../types';

const REACTION_EMOJIS = ['❤️', '😂', '🔥', '👍', '👏', '🙏'];
const WAVE_BARS = [9, 16, 22, 12, 19, 24, 11, 17, 21, 13, 15, 10];

interface GroupChatRoomProps {
  group: GroupItem;
  friends: Profile[];
  onBack: () => void;
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
}

export default function GroupChatRoom({
  group: initialGroup,
  friends,
  onBack,
  onGroupUpdated,
  onGroupDeleted,
}: GroupChatRoomProps) {
  const { profile } = useAuth();
  const { lowDataMode } = useSettings();
  const { showToast } = useToast();

  const [group, setGroup] = useState<GroupItem>(initialGroup);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showMembersSheet, setShowMembersSheet] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [activeMsgMenu, setActiveMsgMenu] = useState<GroupMessage | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [groupCall, setGroupCall] = useState<GroupCallSession | null>(null);

  // Voice recording state
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [waveTick, setWaveTick] = useState(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const voiceCancelledRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setGroup(initialGroup);
  }, [initialGroup]);

  const markGroupRead = useCallback(async () => {
    if (!profile?.id) return;
    await supabase
      .from('group_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('group_id', group.id)
      .eq('user_id', profile.id);
  }, [group.id, profile?.id]);

  const loadGroupDetails = useCallback(async () => {
    const [{ data: gRow }, { data: mRows }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', group.id).maybeSingle(),
      supabase
        .from('group_members')
        .select('*, profile:profiles(*)')
        .eq('group_id', group.id)
        .order('joined_at', { ascending: true }),
    ]);

    if (gRow) {
      setGroup((prev) => ({
        ...prev,
        ...(gRow as GroupItem),
      }));
    }

    if (mRows) {
      const normalizedMembers: GroupMember[] = (mRows as Record<string, unknown>[]).map((r) => ({
        group_id: String(r.group_id || group.id),
        user_id: String(r.user_id || ''),
        role: r.role === 'admin' ? 'admin' : 'member',
        last_read_at: typeof r.last_read_at === 'string' ? r.last_read_at : null,
        joined_at: typeof r.joined_at === 'string' ? r.joined_at : undefined,
        profile: r.profile
          ? normalizeProfileRecord(r.profile as Record<string, unknown>)
          : undefined,
      }));
      setMembers(normalizedMembers);
    }
  }, [group.id]);

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*, sender:profiles(*)')
      .eq('group_id', group.id)
      .order('created_at', { ascending: true })
      .limit(250);

    if (!error && data) {
      const mapped: GroupMessage[] = (data as Record<string, unknown>[]).map((r) => ({
        id: String(r.id || ''),
        group_id: String(r.group_id || group.id),
        sender_id: String(r.sender_id || ''),
        content: String(r.content || ''),
        type: (String(r.type || 'text') as GroupMessage['type']) || 'text',
        media_url: typeof r.media_url === 'string' ? r.media_url : null,
        file_name: typeof r.file_name === 'string' ? r.file_name : null,
        file_size: typeof r.file_size === 'number' ? r.file_size : 0,
        duration: typeof r.duration === 'number' ? r.duration : 0,
        reply_to_id: typeof r.reply_to_id === 'string' ? r.reply_to_id : null,
        reactions:
          r.reactions && typeof r.reactions === 'object'
            ? (r.reactions as Record<string, string[]>)
            : {},
        deleted_for_everyone: Boolean(r.deleted_for_everyone),
        created_at: String(r.created_at || new Date().toISOString()),
        sender: r.sender
          ? normalizeProfileRecord(r.sender as Record<string, unknown>)
          : undefined,
      }));
      setMessages(mapped);
      markGroupRead();
    }
    setLoading(false);
  }, [group.id, markGroupRead]);

  useEffect(() => {
    setLoading(true);
    loadGroupDetails();
    loadMessages();

    const ch = supabase.channel(`group-room-${group.id}`, {
      config: {
        presence: { key: profile?.id || 'anon' },
      },
    });

    const syncTyping = () => {
      const st = ch.presenceState<{ userId?: string; name?: string; isTyping?: boolean }>();
      const names: string[] = [];
      for (const entries of Object.values(st)) {
        for (const e of entries) {
          if (e.userId && e.userId !== profile?.id && e.isTyping && e.name) {
            if (!names.includes(e.name)) names.push(e.name);
          }
        }
      }
      setTypingNames(names);
    };

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` },
      (payload) => {
        const row = payload.new as { id?: string; sender_id?: string } | null;
        if (payload.eventType === 'INSERT' && row?.sender_id && row.sender_id !== profile?.id) {
          playReceiveSound({ messageId: row.id, vibrate: true });
        }
        loadMessages();
      }
    )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${group.id}` },
        () => {
          loadGroupDetails();
          onGroupUpdated();
        }
      )
      .on('presence', { event: 'sync' }, syncTyping)
      .on('presence', { event: 'join' }, syncTyping)
      .on('presence', { event: 'leave' }, syncTyping)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && profile?.id) {
          await ch.track({
            userId: profile.id,
            name: profile.full_name || profile.name || profile.username,
            isTyping: false,
          });
        }
      });

    channelRef.current = ch;

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      if (audioElRef.current) audioElRef.current.pause();
      ch.untrack().catch(() => {});
      supabase.removeChannel(ch);
    };
  }, [group.id, loadGroupDetails, loadMessages, onGroupUpdated, profile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingNames.length]);

  useEffect(() => {
    if (!playingAudioId) return;
    const t = setInterval(() => setWaveTick((n) => (n + 1) % 3), 260);
    return () => clearInterval(t);
  }, [playingAudioId]);

  const myRole = useMemo(() => {
    const me = members.find((m) => m.user_id === profile?.id);
    if (me) return me.role;
    if (group.created_by === profile?.id) return 'admin';
    return 'member';
  }, [group.created_by, members, profile?.id]);

  const isAdmin = myRole === 'admin';

  const setTyping = (active: boolean) => {
    if (!channelRef.current || !profile?.id) return;
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    channelRef.current
      .track({
        userId: profile.id,
        name: profile.full_name || profile.name || profile.username,
        isTyping: active,
      })
      .catch(() => {});
    if (active) {
      typingTimerRef.current = setTimeout(() => setTyping(false), 2500);
    }
  };

  const uploadMedia = async (file: File, folder: string): Promise<string> => {
    const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `groups/${group.id}/${folder}/${Date.now()}_${safeName}`;
    return uploadWithProgress('letchat-media', path, file, setUploadPct);
  };

  const insertGroupMessage = async (payload: {
    type: GroupMessage['type'];
    content: string;
    media_url?: string | null;
    file_name?: string | null;
    file_size?: number;
    duration?: number;
  }) => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: group.id,
        sender_id: profile.id,
        type: payload.type,
        content: payload.content,
        media_url: payload.media_url || null,
        file_name: payload.file_name || null,
        file_size: payload.file_size || 0,
        duration: payload.duration || 0,
        reply_to_id: replyTo?.id || null,
      })
      .select('*, sender:profiles(*)')
      .single();

    if (error) {
      showToast(error.message || 'Could not send message', 'error');
      return;
    }
    setReplyTo(null);
    if (data) {
      const r = data as Record<string, unknown>;
      const mapped: GroupMessage = {
        id: String(r.id || ''),
        group_id: group.id,
        sender_id: profile.id,
        content: String(r.content || ''),
        type: (String(r.type || 'text') as GroupMessage['type']) || 'text',
        media_url: typeof r.media_url === 'string' ? r.media_url : null,
        file_name: typeof r.file_name === 'string' ? r.file_name : null,
        file_size: typeof r.file_size === 'number' ? r.file_size : 0,
        duration: typeof r.duration === 'number' ? r.duration : 0,
        reply_to_id: typeof r.reply_to_id === 'string' ? r.reply_to_id : null,
        reactions: {},
        deleted_for_everyone: false,
        created_at: String(r.created_at || new Date().toISOString()),
        sender: profile,
      };
      setMessages((prev) => (prev.some((m) => m.id === mapped.id) ? prev : [...prev, mapped]));
    }
    markGroupRead();
    onGroupUpdated();
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    setTyping(false);
    playSendSound();
    await insertGroupMessage({ type: 'text', content: trimmed });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setShowAttach(false);
    setUploadPct(10);
    try {
      const compressed = await compressImage(file, lowDataMode);
      const url = await uploadMedia(compressed, 'images');
      playSendSound();
      await insertGroupMessage({
        type: 'image',
        content: '',
        media_url: url,
        file_name: compressed.name,
        file_size: compressed.size,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Image upload failed', 'error');
    } finally {
      setUploadPct(null);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      showToast('Video exceeds 50MB limit.', 'error');
      return;
    }
    setShowAttach(false);
    setUploadPct(10);
    try {
      const finalFile = lowDataMode ? await compressVideoTo480p(file) : file;
      const url = await uploadMedia(finalFile, 'videos');
      playSendSound();
      await insertGroupMessage({
        type: 'video',
        content: '',
        media_url: url,
        file_name: finalFile.name,
        file_size: finalFile.size,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Video upload failed', 'error');
    } finally {
      setUploadPct(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      showToast('File exceeds 50MB limit.', 'error');
      return;
    }
    setShowAttach(false);
    setUploadPct(10);
    try {
      const url = await uploadMedia(file, 'files');
      playSendSound();
      await insertGroupMessage({
        type: 'document',
        content: '',
        media_url: url,
        file_name: file.name,
        file_size: file.size,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'File upload failed', 'error');
    } finally {
      setUploadPct(null);
    }
  };

  const startVoiceRecord = async () => {
    if (recordingVoice) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
      );
      const rec = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      voiceCancelledRef.current = false;
      recStartRef.current = Date.now();
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        setRecordingVoice(false);
        if (voiceCancelledRef.current || chunks.length === 0) return;
        const dur = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        const mime = rec.mimeType || preferredMime || 'audio/webm';
        const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([new Blob(chunks, { type: mime })], `voice_${Date.now()}.${ext}`, {
          type: mime,
        });
        setUploadPct(20);
        try {
          const url = await uploadMedia(file, 'voice');
          playSendSound();
          await insertGroupMessage({
            type: 'voice',
            content: '',
            media_url: url,
            duration: dur,
            file_size: file.size,
          });
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Voice note failed', 'error');
        } finally {
          setUploadPct(null);
        }
      };

      rec.start(150);
      playRecordStartBeep();
      mediaRecRef.current = rec;
      setRecordingVoice(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      showToast('Microphone permission denied.', 'error');
    }
  };

  const stopVoiceRecord = (cancel = false) => {
    voiceCancelledRef.current = cancel;
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop();
    }
    setRecordingVoice(false);
  };

  const togglePlayVoice = (msg: GroupMessage) => {
    const src = msg.media_url;
    if (!src) return;
    if (playingAudioId === msg.id && audioElRef.current) {
      audioElRef.current.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
    }
    const audio = new Audio(src);
    audioElRef.current = audio;
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => setPlayingAudioId(null);
    audio.play().catch(() => {});
    setPlayingAudioId(msg.id);
  };

  const toggleReaction = async (msg: GroupMessage, emoji: string) => {
    if (!profile) return;
    const current = { ...(msg.reactions || {}) };
    const list = current[emoji] || [];
    const nextList = list.includes(profile.id)
      ? list.filter((u) => u !== profile.id)
      : [...list, profile.id];
    if (nextList.length > 0) current[emoji] = nextList;
    else delete current[emoji];

    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: current } : m)));
    setActiveMsgMenu(null);
    await supabase.from('group_messages').update({ reactions: current }).eq('id', msg.id);
  };

  const deleteMessage = async (msg: GroupMessage) => {
    setActiveMsgMenu(null);
    await supabase
      .from('group_messages')
      .update({ deleted_for_everyone: true, content: 'This message was deleted', media_url: null })
      .eq('id', msg.id);
    loadMessages();
  };

  // Admin & Member Management
  const addMemberToGroup = async (userId: string) => {
    const { error } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: userId,
      role: 'member',
    });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast('Member added to group', 'success');
    loadGroupDetails();
  };

  const removeMemberFromGroup = async (userId: string) => {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', userId);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    if (userId === profile?.id) {
      showToast('You left the group', 'info');
      onGroupDeleted();
      return;
    }
    showToast('Member removed', 'info');
    loadGroupDetails();
  };

  const toggleAdminRole = async (member: GroupMember) => {
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    const { error } = await supabase
      .from('group_members')
      .update({ role: nextRole })
      .eq('group_id', group.id)
      .eq('user_id', member.user_id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast(
      nextRole === 'admin'
        ? `${member.profile?.name || 'Member'} is now an Admin`
        : 'Admin role removed',
      'success'
    );
    loadGroupDetails();
  };

  const handleDeleteGroup = async () => {
    const { error } = await supabase.from('groups').delete().eq('id', group.id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast('Group deleted', 'info');
    onGroupDeleted();
  };

  const existingMemberIds = new Set(members.map((m) => m.user_id));
  const addableFriends = friends.filter(
    (f) =>
      !existingMemberIds.has(f.id) &&
      (!memberSearch.trim() ||
        f.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
        f.username.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A] text-white relative">
      {/* Header */}
      <header className="h-14 px-2.5 border-b border-white/10 bg-[#12121A]/95 backdrop-blur-xl flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10 shrink-0"
            aria-label="Back to Chatroom"
          >
            <ArrowLeft size={20} />
          </button>

          <button
            type="button"
            onClick={() => setShowMembersSheet(true)}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-xl py-1 px-1 hover:bg-white/5 transition"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
              {group.photo_url ? (
                <img src={group.photo_url} alt={group.name} className="w-full h-full object-cover" />
              ) : (
                <Users size={18} />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate flex items-center gap-1">
                <span className="truncate">{group.name}</span>
                {group.is_public ? (
                  <Globe size={11} className="text-[#00E5FF] shrink-0" />
                ) : (
                  <Lock size={11} className="text-zinc-400 shrink-0" />
                )}
              </p>
              <p className="text-[11px] text-zinc-400 truncate">
                {members.length} {members.length === 1 ? 'member' : 'members'} · Tap for info
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() =>
              profile &&
              setGroupCall({ group, callType: 'voice', initiatorId: profile.id })
            }
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white/[0.06] hover:bg-[#00E5FF] hover:text-black transition"
            title="Group Voice Call"
          >
            <Phone size={18} />
          </button>
          <button
            type="button"
            onClick={() =>
              profile &&
              setGroupCall({ group, callType: lowDataMode ? 'voice' : 'video', initiatorId: profile.id })
            }
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white hover:opacity-90 transition"
            title="Group Video Call"
          >
            <Video size={18} />
          </button>
        </div>
      </header>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {loading ? (
          <p className="text-center text-xs text-zinc-500 py-12">Loading group messages...</p>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Users size={30} className="mx-auto text-[#7C3AED]/60" />
            <p className="text-sm font-bold text-zinc-300">Welcome to {group.name}</p>
            <p className="text-xs text-zinc-500">Say hello or start a group call!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === profile?.id;
            const senderName =
              msg.sender?.full_name ||
              msg.sender?.name ||
              members.find((m) => m.user_id === msg.sender_id)?.profile?.name ||
              'Member';
            const senderAvatar =
              msg.sender?.avatar_url ||
              members.find((m) => m.user_id === msg.sender_id)?.profile?.avatar_url ||
              '';
            const parentMsg = msg.reply_to_id
              ? messages.find((m) => m.id === msg.reply_to_id)
              : null;
            const reactionEntries = Object.entries(msg.reactions || {}).filter(
              ([, users]) => Array.isArray(users) && users.length > 0
            );

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                {/* Sender Name + Avatar Above Each Message */}
                <div
                  className={`flex items-center gap-1.5 mb-1 px-0.5 ${
                    isMine ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
                    {senderAvatar ? (
                      <img src={senderAvatar} alt={senderName} className="w-full h-full object-cover" />
                    ) : (
                      (senderName?.[0] || '?').toUpperCase()
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-zinc-300">
                    {isMine ? 'You' : senderName}
                  </span>
                </div>

                {/* Message Bubble */}
                <div
                  onClick={() => setActiveMsgMenu(activeMsgMenu?.id === msg.id ? null : msg)}
                  className={`max-w-[80%] sm:max-w-[68%] rounded-2xl px-3.5 py-2.5 text-sm border cursor-pointer transition ${
                    isMine
                      ? 'bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] text-white border-[#7C3AED]/40 rounded-tr-sm'
                      : 'bg-[#12121A] text-white border-white/10 rounded-tl-sm'
                  }`}
                >
                  {parentMsg && !msg.deleted_for_everyone && (
                    <div className="mb-1.5 px-2.5 py-1 rounded-lg bg-black/30 border-l-2 border-[#00E5FF] text-xs opacity-90 truncate max-w-[220px]">
                      {parentMsg.content || parentMsg.type}
                    </div>
                  )}

                  {msg.deleted_for_everyone ? (
                    <p className="text-xs italic opacity-75">This message was deleted</p>
                  ) : msg.type === 'image' && msg.media_url ? (
                    <img
                      src={msg.media_url}
                      alt="Group attachment"
                      className="rounded-xl max-h-72 object-cover"
                    />
                  ) : msg.type === 'video' && msg.media_url ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveVideoUrl(msg.media_url || null);
                      }}
                      className="relative rounded-xl overflow-hidden bg-black block"
                    >
                      <video
                        src={msg.media_url}
                        className="max-h-64 rounded-xl"
                        preload="metadata"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="w-11 h-11 rounded-full bg-white/90 text-black flex items-center justify-center">
                          <Play size={20} fill="currentColor" />
                        </span>
                      </span>
                    </button>
                  ) : msg.type === 'voice' || msg.type === 'audio' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlayVoice(msg);
                      }}
                      className="flex items-center gap-2.5 min-w-[180px]"
                    >
                      <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                        {playingAudioId === msg.id ? <Pause size={15} /> : <Play size={15} />}
                      </span>
                      <div className="flex items-center gap-[3px] h-5 flex-1">
                        {WAVE_BARS.map((h, idx) => (
                          <span
                            key={idx}
                            className="w-[2.5px] rounded-full bg-white transition-all"
                            style={{
                              height: `${
                                playingAudioId === msg.id
                                  ? Math.max(5, ((h + waveTick * 4) % 18) + 4)
                                  : h * 0.75
                              }px`,
                              opacity: playingAudioId === msg.id ? 0.95 : 0.65,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums">
                        {formatDuration(msg.duration || 0)}
                      </span>
                    </button>
                  ) : msg.type === 'document' && msg.media_url ? (
                    <a
                      href={msg.media_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 underline"
                    >
                      <FileText size={16} />
                      <span className="truncate max-w-[180px]">
                        {msg.file_name || 'Document'}
                      </span>
                      <Download size={14} />
                      <span className="text-[11px] opacity-75">
                        ({formatBytes(msg.file_size)})
                      </span>
                    </a>
                  ) : msg.type === 'sticker' && msg.media_url ? (
                    <img
                      src={msg.media_url}
                      alt="Sticker"
                      className="w-28 h-28 object-contain"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                </div>

                {/* Reaction Pills */}
                {reactionEntries.length > 0 && !msg.deleted_for_everyone && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reactionEntries.map(([emoji, users]) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => toggleReaction(msg, emoji)}
                        className={`px-1.5 py-0.5 rounded-full text-[11px] border ${
                          profile && users.includes(profile.id)
                            ? 'bg-[#7C3AED]/30 border-[#00E5FF] text-white'
                            : 'bg-white/10 border-white/15 text-zinc-200'
                        }`}
                      >
                        {emoji} {users.length}
                      </button>
                    ))}
                  </div>
                )}

                <span className="text-[10px] text-zinc-500 mt-0.5 px-1 tabular-nums">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>

                {/* Message Action Popup */}
                {activeMsgMenu?.id === msg.id && !msg.deleted_for_everyone && (
                  <div className="mt-1 p-1.5 rounded-2xl bg-[#1A1A26] border border-white/15 flex items-center gap-1 shadow-xl z-10">
                    {REACTION_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => toggleReaction(msg, em)}
                        className="p-1 text-base hover:scale-125 transition"
                      >
                        {em}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(msg);
                        setActiveMsgMenu(null);
                      }}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-[#00E5FF]"
                      title="Reply"
                    >
                      <Reply size={14} />
                    </button>
                    {(isMine || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => deleteMessage(msg)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {typingNames.length > 0 && (
          <p className="text-xs text-[#00E5FF] font-semibold px-1">
            {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Upload Bar */}
      {uploadPct !== null && (
        <div className="px-4 py-1.5 bg-[#12121A] border-t border-white/10">
          <div className="flex justify-between text-xs text-zinc-300 mb-1">
            <span>Uploading...</span>
            <span>{uploadPct}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF]"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Reply Preview */}
      {replyTo && (
        <div className="px-3 py-1.5 bg-[#12121A] border-t border-white/10 flex items-center justify-between text-xs">
          <span className="truncate text-zinc-300">
            <strong className="text-[#00E5FF]">Replying to: </strong>
            {replyTo.content || replyTo.type}
          </span>
          <button type="button" onClick={() => setReplyTo(null)} className="p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attach Sheet */}
      {showAttach && (
        <div className="grid grid-cols-4 gap-2 p-3 bg-[#12121A] border-t border-white/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10"
          >
            <ImageIcon size={18} className="text-[#00E5FF]" /> Photo
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10"
          >
            <Film size={18} className="text-[#7C3AED]" /> Video
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10"
          >
            <FileText size={18} className="text-emerald-400" /> File
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAttach(false);
              setShowStickers(true);
            }}
            className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10"
          >
            <Sticker size={18} className="text-amber-400" /> Sticker
          </button>
        </div>
      )}

      {showStickers && (
        <StickerPicker
          onClose={() => setShowStickers(false)}
          onSelectSticker={(url) => {
            setShowStickers(false);
            playSendSound();
            insertGroupMessage({ type: 'sticker', content: '', media_url: url });
          }}
        />
      )}

      {/* Hidden Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoUpload}
      />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />

      {/* Composer */}
      <form
        onSubmit={handleSendText}
        className="px-2.5 py-2 border-t border-white/10 bg-[#12121A] flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={() => {
            setShowStickers(false);
            setShowAttach((s) => !s);
          }}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white/[0.06] text-zinc-300 hover:text-white"
          aria-label="Attach media"
        >
          <Plus size={19} />
        </button>

        {recordingVoice ? (
          <div className="flex-1 flex items-center justify-between gap-2 px-3 min-h-[40px] rounded-xl bg-[#7C3AED]/20 border border-[#00E5FF]/40 text-xs">
            <span className="flex items-center gap-2 font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="tabular-nums">{formatDuration(recSeconds)}</span>
              <span className="text-zinc-300">Recording voice...</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stopVoiceRecord(true)}
                className="px-2.5 py-1 rounded-lg bg-white/10 text-zinc-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => stopVoiceRecord(false)}
                className="px-2.5 py-1 rounded-lg bg-[#00E5FF] text-black font-bold flex items-center gap-1"
              >
                <Square size={11} fill="currentColor" /> Send
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setTyping(e.target.value.trim().length > 0);
              }}
              placeholder={`Message ${group.name}...`}
              className="flex-1 min-w-0 px-3.5 min-h-[40px] rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-[#00E5FF]"
            />
            {text.trim().length > 0 ? (
              <button
                type="submit"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white"
                aria-label="Send message"
              >
                <Send size={17} />
              </button>
            ) : (
              <button
                type="button"
                onClick={startVoiceRecord}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white/[0.06] text-[#00E5FF] hover:bg-white/10"
                title="Record voice note"
                aria-label="Record voice note"
              >
                <Mic size={19} />
              </button>
            )}
          </>
        )}
      </form>

      {/* Group Members & Admin Info Sheet */}
      {showMembersSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowMembersSheet(false)}
        >
          <div
            className="w-full sm:max-w-md max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#12121A] border border-white/10 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] flex items-center justify-center overflow-hidden shrink-0">
                  {group.photo_url ? (
                    <img
                      src={group.photo_url}
                      alt={group.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Users size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-base truncate">{group.name}</h3>
                  <p className="text-xs text-zinc-400">
                    {group.is_public ? 'Public Group' : 'Private Group'} · {members.length} members
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMembersSheet(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {group.description && (
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-zinc-300">
                  {group.description}
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Members ({members.length})
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAddMember((v) => !v)}
                    className="px-3 py-1.5 rounded-xl bg-[#7C3AED] text-white text-xs font-bold flex items-center gap-1"
                  >
                    <UserPlus size={13} /> Add Member
                  </button>
                )}
              </div>

              {isAdmin && showAddMember && (
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-[#7C3AED]/40 space-y-2">
                  <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-2.5 min-h-[36px]">
                    <Search size={14} className="text-zinc-400" />
                    <input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Filter contacts..."
                      className="bg-transparent text-xs text-white outline-none w-full"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {addableFriends.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-1">
                        No more accepted friends to add.
                      </p>
                    ) : (
                      addableFriends.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 text-xs"
                        >
                          <span className="truncate font-semibold">
                            {f.full_name || f.name} (@{f.username})
                          </span>
                          <button
                            type="button"
                            onClick={() => addMemberToGroup(f.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#00E5FF] text-black font-bold shrink-0"
                          >
                            Add
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {members.map((m) => {
                  const mName = m.profile?.full_name || m.profile?.name || 'Member';
                  const isMe = m.user_id === profile?.id;
                  return (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/[0.03] border border-white/10"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
                          {m.profile?.avatar_url ? (
                            <img
                              src={m.profile.avatar_url}
                              alt={mName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            (mName?.[0] || '?').toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">
                            {mName} {isMe ? '(You)' : ''}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            @{m.profile?.username || 'user'}
                            {m.role === 'admin' && (
                              <span className="ml-1.5 text-[#00E5FF] font-bold">· Admin</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {isAdmin && !isMe && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleAdminRole(m)}
                            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-[#7C3AED]/40 text-[11px] font-bold flex items-center gap-1"
                            title={m.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                          >
                            <ShieldCheck size={12} className="text-[#00E5FF]" />
                            {m.role === 'admin' ? 'Demote' : 'Make Admin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMemberFromGroup(m.user_id)}
                            className="p-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25"
                            title="Remove Member"
                          >
                            <UserMinus size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Leave / Delete Group */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                {profile && (
                  <button
                    type="button"
                    onClick={() => removeMemberFromGroup(profile.id)}
                    className="w-full min-h-[42px] rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <LogOut size={14} /> Leave Group
                  </button>
                )}

                {isAdmin &&
                  (!confirmDeleteGroup ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteGroup(true)}
                      className="w-full min-h-[42px] rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-red-500/20"
                    >
                      <Trash2 size={14} /> Delete Group
                    </button>
                  ) : (
                    <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/40 space-y-2">
                      <p className="text-xs font-bold text-red-200 flex items-center gap-1.5">
                        <AlertTriangle size={14} /> Permanently delete this group &amp; messages?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteGroup(false)}
                          className="min-h-[36px] rounded-xl bg-white/10 text-xs font-bold"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteGroup}
                          className="min-h-[36px] rounded-xl bg-red-600 text-white text-xs font-bold"
                        >
                          Delete Group
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Video Modal */}
      {activeVideoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setActiveVideoUrl(null)}
        >
          <button
            type="button"
            onClick={() => setActiveVideoUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white"
          >
            <X size={20} />
          </button>
          <video
            src={activeVideoUrl}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Active Group Voice / Video Call */}
      {groupCall && (
        <GroupCallOverlay
          callSession={groupCall}
          memberIds={members.map((m) => m.user_id)}
          onEnd={() => setGroupCall(null)}
        />
      )}
    </div>
  );
}
