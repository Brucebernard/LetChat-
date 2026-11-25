import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Video,
  Phone,
  MoreHorizontal,
  Plus,
  Smile,
  Sticker,
  Mic,
  Image as ImageIcon,
  Film,
  Camera,
  FileText,
  X,
  Download,
  Reply,
  Forward,
  Trash2,
  Flag,
  Music,
} from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import {
  compressImage,
  compressVideoTo480p,
  detectFlaggedContent,
  formatBytes,
  formatDuration,
  formatLastSeen,
  getVideoMetadata,
  isUserOnline,
} from '../../utils/mediaUtils';
import {
  deleteCompatibleMessage,
  fetchConversationMessages,
  getDmChatId,
  getMessagesSchemaMode,
  insertCompatibleMessage,
  normalizeMediaKind,
} from '../../utils/chatMessageCodec';
import StickerPicker from '../Stickers/StickerPicker';
import ReportModal from '../Modals/ReportModal';
import SetupSqlModal from '../Modals/SetupSqlModal';
import { ChatItem, Message, Profile, ReportTarget } from '../../types';
import {
  playReceiveSound,
  playRecordStartBeep,
  playSendSound,
} from '../../utils/messageSounds';
import {
  clearMessageDraft,
  loadMessageDraft,
  saveMessageDraft,
} from '../../utils/draftStorage';

const QUICK_EMOJIS = ['😀', '😂', '❤️', '🔥', '👍', '🙌', '🇬🇭', '⚽', '🎉', '🙏', '😍', '💯'];

function formatChatTimeSeparator(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMsgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfMsgDay) / 86_400_000);
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Today ${timeStr}`;
  if (dayDiff === 1) return `Yesterday ${timeStr}`;
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} ${timeStr}`;
}

function WeChatSpeakerIcon({ playing, waveStep }: { playing: boolean; waveStep: number }) {
  const showWave2 = !playing || waveStep >= 1;
  const showWave3 = !playing || waveStep >= 2;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-black"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <path
        d="M9.5 8.5a5 5 0 0 1 0 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M13 6a8.5 8.5 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ opacity: showWave2 ? 1 : 0.2 }}
      />
      <path
        d="M16.5 3.5a12 12 0 0 1 0 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ opacity: showWave3 ? 1 : 0.2 }}
      />
    </svg>
  );
}

interface ChatRoomProps {
  chat: ChatItem;
  receiverId?: string | null;
  onBack: () => void;
  onStartCall: (peer: Profile, callType: 'video' | 'audio') => void;
  friendsList: Profile[];
}

export default function ChatRoom({
  chat,
  receiverId: propReceiverId,
  onBack,
  onStartCall,
  friendsList,
}: ChatRoomProps) {
  const { profile, refreshProfile } = useAuth();
  const { lowDataMode } = useSettings();
  const { showToast } = useToast();

  const initialReceiverId = !chat.isGroup
    ? propReceiverId || chat.receiverId || chat.peer?.id || null
    : null;
  const [receiverId, setReceiverId] = useState<string | null>(initialReceiverId);
  const receiverIdRef = useRef<string | null>(initialReceiverId);

  const getActiveReceiverId = (): string | null => {
    if (chat.isGroup) return null;
    return (
      receiverIdRef.current ||
      propReceiverId ||
      chat.receiverId ||
      chat.peer?.id ||
      receiverId ||
      null
    );
  };

  useEffect(() => {
    const nextReceiverId = !chat.isGroup
      ? propReceiverId || chat.receiverId || chat.peer?.id || null
      : null;
    receiverIdRef.current = nextReceiverId;
    setReceiverId(nextReceiverId);
  }, [chat.id, chat.isGroup, chat.peer?.id, chat.receiverId, propReceiverId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [peerProfile, setPeerProfile] = useState<Profile | undefined>(chat.peer);
  const [, setPresenceTick] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [text, setText] = useState<string>(() => loadMessageDraft(profile?.id, chat.id));
  const [showAttach, setShowAttach] = useState(false);

  useEffect(() => {
    setText(loadMessageDraft(profile?.id, chat.id));
  }, [chat.id, profile?.id]);

  const updateDraftText = (nextValOrFn: string | ((prev: string) => string)) => {
    setText((prev) => {
      const nextVal = typeof nextValOrFn === 'function' ? nextValOrFn(prev) : nextValOrFn;
      saveMessageDraft(profile?.id, chat.id, nextVal);
      return nextVal;
    });
  };
  const [showStickers, setShowStickers] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [activeMsgMenu, setActiveMsgMenu] = useState<Message | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [needsSchemaSql, setNeedsSchemaSql] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const [recordingVoice, setRecordingVoice] = useState(false);
  const [slideCancelActive, setSlideCancelActive] = useState(false);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [waveStep, setWaveStep] = useState<number>(2);
  const [playedAudioIds, setPlayedAudioIds] = useState<Record<string, true>>(() => {
    try {
      const saved = localStorage.getItem('letchat_played_audio_ids');
      return saved ? (JSON.parse(saved) as Record<string, true>) : {};
    } catch {
      return {};
    }
  });

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const voiceCancelledRef = useRef(false);
  const slideCancelRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);
  const holdActiveRef = useRef(false);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartTimeRef = useRef<number>(0);
  const holdStartRef = useRef<number>(0);
  const audioStartingRef = useRef<boolean>(false);
  const stopRequestedBeforeReadyRef = useRef<boolean>(false);
  const camPreviewRef = useRef<HTMLVideoElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const longPressTriggeredRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelSubscribedRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingTrackedRef = useRef(false);
  const lastTypingTrackAtRef = useRef(0);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const initialMessagesLoadedRef = useRef(false);

  const uploadToFastBucket = async (
    folder: 'audio' | 'video' | 'chat',
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<string> => {
    const safeName = (file.name || 'media').replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectPath = `${folder}/${Date.now()}_${safeName}`;
    try {
      return await uploadWithProgress('chat-media', objectPath, file, onProgress);
    } catch (chatMediaErr) {
      try {
        return await uploadWithProgress('letchat-media', `chat/${chat.id}/${Date.now()}_${safeName}`, file, onProgress);
      } catch {
        try {
          return await uploadWithProgress('letchat-media', `moments/${profile?.id || 'shared'}/${Date.now()}_${safeName}`, file, onProgress);
        } catch {
          if (file.type.startsWith('audio/') || file.type.startsWith('image/')) {
            return await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === 'string') resolve(reader.result);
                else reject(chatMediaErr);
              };
              reader.onerror = () => reject(chatMediaErr);
              reader.readAsDataURL(file);
            });
          }
          throw chatMediaErr;
        }
      }
    }
  };

  const uploadChatMedia = async (file: File, onProgress?: (pct: number) => void): Promise<string> => {
    const folder = file.type.startsWith('audio/')
      ? 'audio'
      : file.type.startsWith('video/')
        ? 'video'
        : 'chat';
    return uploadToFastBucket(folder, file, onProgress);
  };

  const loadMessages = async () => {
    if (!profile) return;
    try {
      const senderLookup = (senderId: string) =>
        senderId === profile.id
          ? profile
          : !chat.isGroup && chat.peer?.id === senderId
            ? chat.peer
            : friendsList.find((f) => f.id === senderId);

      const targetReceiverId = getActiveReceiverId();
      const { messages: rows, error } = await fetchConversationMessages(supabase, {
        chatId: chat.id,
        isGroup: chat.isGroup,
        myId: profile.id,
        peerId: targetReceiverId || undefined,
        senderLookup,
      });

      if (!error) {
        if (!initialMessagesLoadedRef.current) {
          rows.forEach((r) => knownMessageIdsRef.current.add(r.id));
          initialMessagesLoadedRef.current = true;
        } else {
          for (const r of rows) {
            if (!knownMessageIdsRef.current.has(r.id)) {
              knownMessageIdsRef.current.add(r.id);
              if (r.sender_id !== profile.id) {
                playReceiveSound({ messageId: r.id, vibrate: true });
              }
            }
          }
        }
        setMessages((prev) => {
          const pendingLocal = prev.filter(
            (m) => m.isSending && !rows.some((r) => r.id === m.id)
          );
          return [...rows, ...pendingLocal];
        });
        if (getMessagesSchemaMode() !== 'v1') {
          const unread = rows.filter(
            (m) => m.sender_id !== profile.id && !(m.read_by || []).includes(profile.id)
          );
          for (const m of unread) {
            const nextRead = [...(m.read_by || []), profile.id];
            supabase.from('messages').update({ read_by: nextRead }).eq('id', m.id).then(() => {});
          }
        }
      }
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    setPeerProfile(chat.peer);
  }, [chat.peer]);

  useEffect(() => {
    const peerId = getActiveReceiverId();
    if (chat.isGroup || !peerId) return;

    const refreshPeerProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', peerId)
        .maybeSingle();
      if (data) {
        setPeerProfile(data as Profile);
      }
    };

    refreshPeerProfile();
    const profileChannel = supabase
      .channel(`peer-status-${peerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${peerId}` },
        (payload) => {
          if (payload.new) {
            setPeerProfile(payload.new as Profile);
          }
        }
      )
      .subscribe();

    const statusTimer = setInterval(() => {
      refreshPeerProfile();
      setPresenceTick((t) => t + 1);
    }, 30_000);

    return () => {
      clearInterval(statusTimer);
      supabase.removeChannel(profileChannel);
    };
  }, [chat.id, chat.isGroup, receiverId]);

  useEffect(() => {
    knownMessageIdsRef.current = new Set();
    initialMessagesLoadedRef.current = false;
    setMessages([]);
    setTypingUsers([]);
    setLoadingMessages(true);
    loadMessages();

    channelSubscribedRef.current = false;
    isTypingTrackedRef.current = false;
    lastTypingTrackAtRef.current = 0;

    type TypingPresenceEntry = {
      userId?: string;
      name?: string;
      isTyping?: boolean;
      typingAt?: number;
    };

    const ch = supabase.channel(`room-${chat.id}`, {
      config: {
        presence: {
          key: profile?.id || `anon_${Math.random().toString(36).slice(2, 8)}`,
        },
      },
    });

    const syncPresenceTyping = () => {
      const state = ch.presenceState<TypingPresenceEntry>();
      const now = Date.now();
      const activeNames: string[] = [];
      const seenIds = new Set<string>();

      for (const [key, presences] of Object.entries(state)) {
        for (const entry of presences) {
          const uid = entry.userId || key;
          if (!uid || uid === profile?.id) continue;
          const isRecent = !entry.typingAt || now - entry.typingAt < 10_000;
          if (entry.isTyping && isRecent && !seenIds.has(uid)) {
            seenIds.add(uid);
            const fallbackName =
              (!chat.isGroup && chat.peer?.id === uid ? chat.peer.name : undefined) ||
              friendsList.find((f) => f.id === uid)?.name ||
              'User';
            activeNames.push(entry.name || fallbackName);
          }
        }
      }
      setTypingUsers(activeNames);
    };

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      (payload) => {
        const row = (payload.new || payload.old || {}) as Record<string, unknown>;
        const peerIdForRealtime = getActiveReceiverId();
        const matchesChat =
          row.chat_id === chat.id ||
          (!chat.isGroup &&
            peerIdForRealtime &&
            ((row.sender_id === profile?.id && row.receiver_id === peerIdForRealtime) ||
              (row.sender_id === peerIdForRealtime && row.receiver_id === profile?.id))) ||
          payload.eventType === 'DELETE';
        if (matchesChat) {
          if (payload.eventType === 'INSERT' && row.sender_id && row.sender_id !== profile?.id) {
            playReceiveSound({
              messageId: typeof row.id === 'string' ? row.id : undefined,
              vibrate: true,
            });
          }
          loadMessages();
        }
      }
    )
      .on('presence', { event: 'sync' }, syncPresenceTyping)
      .on('presence', { event: 'join' }, syncPresenceTyping)
      .on('presence', { event: 'leave' }, syncPresenceTyping)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channelSubscribedRef.current = true;
          if (profile?.id) {
            await ch.track({
              userId: profile.id,
              name: profile.name || profile.username || 'User',
              isTyping: false,
              typingAt: 0,
            });
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          channelSubscribedRef.current = false;
        }
      });

    channelRef.current = ch;
    const pollTimer = setInterval(() => {
      loadMessages();
    }, 4000);

    return () => {
      clearInterval(pollTimer);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      channelSubscribedRef.current = false;
      isTypingTrackedRef.current = false;
      ch.untrack().catch(() => {});
      supabase.removeChannel(ch);
    };
  }, [chat.id, chat.peer?.id, profile?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingUsers.length]);

  const setTypingPresence = (isTyping: boolean) => {
    if (!profile?.id || !channelRef.current || !channelSubscribedRef.current) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    const now = Date.now();
    if (isTyping) {
      if (!isTypingTrackedRef.current || now - lastTypingTrackAtRef.current > 1200) {
        isTypingTrackedRef.current = true;
        lastTypingTrackAtRef.current = now;
        channelRef.current
          .track({
            userId: profile.id,
            name: profile.name || profile.username || 'User',
            isTyping: true,
            typingAt: now,
          })
          .catch(() => {});
      }
      typingTimeoutRef.current = setTimeout(() => {
        setTypingPresence(false);
      }, 2500);
    } else if (isTypingTrackedRef.current) {
      isTypingTrackedRef.current = false;
      lastTypingTrackAtRef.current = 0;
      channelRef.current
        .track({
          userId: profile.id,
          name: profile.name || profile.username || 'User',
          isTyping: false,
          typingAt: 0,
        })
        .catch(() => {});
    }
  };

  const sendMessage = async (payload: Partial<Message>) => {
    const targetReceiverId = getActiveReceiverId();
    if (!chat.isGroup && !targetReceiverId) {
      showToast('Select a chat first', 'error');
      return;
    }

    const activeProfile = profile || (await refreshProfile());
    if (!activeProfile) {
      showToast('Creating your profile failed. Please sign in again.', 'error');
      return;
    }
    if (chat.isGroup && activeProfile.is_muted) {
      showToast('Your account is currently muted by an administrator.', 'error');
      return;
    }
    const contentText = payload.text || '';
    const isFlagged = chat.isGroup ? detectFlaggedContent(contentText) : false;

    const { message: inserted, error } = await insertCompatibleMessage(supabase, {
      chatId: chat.id,
      senderId: activeProfile.id,
      receiverId: targetReceiverId,
      payload: {
        ...payload,
        text: contentText,
        reply_to_id: replyTo?.id || null,
        is_flagged: isFlagged,
        read_by: [activeProfile.id],
      },
      senderProfile: activeProfile,
    });

    if (error) {
      if (error.includes('messages_sender_id_fkey') || error.includes('Setup SQL')) {
        setNeedsSchemaSql(true);
      }
      showToast(error || 'Failed to send message', 'error');
      return;
    }

    setNeedsSchemaSql(false);
    if (inserted) {
      setMessages((prev) =>
        prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted]
      );
    }
    setReplyTo(null);
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const targetReceiverId = getActiveReceiverId();
    if (!chat.isGroup && !targetReceiverId) {
      showToast('Select a chat first', 'error');
      return;
    }
    playSendSound();
    const msg = text.trim();
    setText('');
    clearMessageDraft(profile?.id, chat.id);
    setTypingPresence(false);
    await sendMessage({ type: 'text', text: msg });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setShowAttach(false);
    setUploadPct(10);
    try {
      const processed = await compressImage(file, lowDataMode);
      const url = await uploadChatMedia(processed, setUploadPct);
      playSendSound();
      await sendMessage({ type: 'image', image_url: url, file_size: processed.size });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Photo upload failed', 'error');
    } finally {
      setUploadPct(null);
    }
  };

  const sendMessageLocal = (params: {
    type: 'audio' | 'video';
    blob: Blob;
    duration?: number;
    fileName?: string;
  }) => {
    if (!profile) return null;
    const localUrl = URL.createObjectURL(params.blob);
    const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: Message = {
      id: tempId,
      chat_id: chat.id,
      sender_id: profile.id,
      receiver_id: !chat.isGroup ? chat.peer?.id || null : null,
      text: '',
      type: params.type,
      media_type: params.type,
      media_url: localUrl,
      voice_url: params.type === 'audio' ? localUrl : null,
      video_url: params.type === 'video' ? localUrl : null,
      file_name: params.fileName || null,
      file_size: params.blob.size,
      duration: params.duration || 0,
      created_at: new Date().toISOString(),
      sender: profile,
      isSending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    return { tempId, localUrl };
  };

  const replaceOptimisticMessage = (
    tempId: string,
    localUrl: string,
    saved: Message | null
  ) => {
    setMessages((prev) => {
      if (!saved) {
        return prev.map((m) => (m.id === tempId ? { ...m, isSending: false } : m));
      }
      const withoutDup = prev.filter((m) => m.id !== saved.id);
      const replaced = withoutDup.map((m) => (m.id === tempId ? saved : m));
      return replaced.some((m) => m.id === saved.id) ? replaced : [...replaced, saved];
    });
    if (saved) {
      setTimeout(() => URL.revokeObjectURL(localUrl), 1500);
    }
  };

  const sendVideo = async (file?: File) => {
    if (!file) return;
    const targetReceiverId = getActiveReceiverId();
    if (!chat.isGroup && !targetReceiverId) {
      showToast('Select a chat first', 'error');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast('Video too big, max 50MB', 'error');
      return;
    }
    const activeProfile = profile || (await refreshProfile());
    if (!activeProfile) {
      showToast('Creating your profile failed. Please sign in again.', 'error');
      return;
    }
    setShowAttach(false);

    // Show instantly - optimistic UI
    playSendSound();
    const local = sendMessageLocal({
      type: 'video',
      blob: file,
      fileName: file.name,
    });

    try {
      const meta = await getVideoMetadata(file);
      let finalFile = file;
      if (lowDataMode) {
        finalFile = await compressVideoTo480p(file, (p) => setUploadPct(Math.round(p * 0.4)));
      }
      const url = await uploadToFastBucket('video', finalFile, (p) =>
        setUploadPct(lowDataMode ? 40 + Math.round(p * 0.6) : p)
      );
      const { message: inserted, error } = await insertCompatibleMessage(supabase, {
        chatId: chat.id,
        senderId: activeProfile.id,
        receiverId: targetReceiverId,
        payload: {
          type: 'video',
          media_type: 'video',
          media_url: url,
          video_url: url,
          file_size: finalFile.size,
          duration: meta.duration,
          read_by: [activeProfile.id],
        },
        senderProfile: activeProfile,
      });
      if (error) {
        if (error.includes('messages_sender_id_fkey') || error.includes('Setup SQL')) {
          setNeedsSchemaSql(true);
        }
        showToast(error, 'error');
      }
      if (local) replaceOptimisticMessage(local.tempId, local.localUrl, inserted);
    } catch (err) {
      if (local) {
        setMessages((prev) => prev.filter((m) => m.id !== local.tempId));
        URL.revokeObjectURL(local.localUrl);
      }
      showToast(err instanceof Error ? err.message : 'Video upload failed', 'error');
    } finally {
      setUploadPct(null);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (chat.isGroup && file.size > 50 * 1024 * 1024) {
      showToast('Document exceeds 50MB limit.', 'error');
      return;
    }
    setShowAttach(false);
    setUploadPct(5);
    try {
      const url = await uploadChatMedia(file, setUploadPct);
      playSendSound();
      await sendMessage({
        type: 'document',
        file_url: url,
        file_name: file.name,
        file_size: file.size,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Document upload failed', 'error');
    } finally {
      setUploadPct(null);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const targetReceiverId = getActiveReceiverId();
    if (!chat.isGroup && !targetReceiverId) {
      showToast('Select a chat first', 'error');
      return;
    }
    if (chat.isGroup && file.size > 30 * 1024 * 1024) {
      showToast('Audio file exceeds 30MB limit.', 'error');
      return;
    }
    setShowAttach(false);
    playSendSound();
    const local = sendMessageLocal({
      type: 'audio',
      blob: file,
      fileName: file.name,
    });
    try {
      const duration = await new Promise<number>((resolve) => {
        const audioEl = document.createElement('audio');
        audioEl.preload = 'metadata';
        const objectUrl = URL.createObjectURL(file);
        audioEl.src = objectUrl;
        audioEl.onloadedmetadata = () => {
          const secs = Number.isFinite(audioEl.duration) ? Math.round(audioEl.duration) : 0;
          URL.revokeObjectURL(objectUrl);
          resolve(secs);
        };
        audioEl.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(0);
        };
      });

      const url = await uploadToFastBucket('audio', file, setUploadPct);
      const activeProfile = profile || (await refreshProfile());
      if (activeProfile) {
        const { message: inserted, error } = await insertCompatibleMessage(supabase, {
          chatId: chat.id,
          senderId: activeProfile.id,
          receiverId: targetReceiverId,
          payload: {
            type: 'audio',
            media_type: 'audio',
            media_url: url,
            voice_url: url,
            file_name: file.name,
            file_size: file.size,
            duration,
            read_by: [activeProfile.id],
          },
          senderProfile: activeProfile,
        });
        if (error) showToast(error, 'error');
        if (local) replaceOptimisticMessage(local.tempId, local.localUrl, inserted);
      }
    } catch (err) {
      if (local) {
        setMessages((prev) => prev.filter((m) => m.id !== local.tempId));
        URL.revokeObjectURL(local.localUrl);
      }
      showToast(err instanceof Error ? err.message : 'Audio upload failed', 'error');
    } finally {
      setUploadPct(null);
    }
  };

  // 1. FAST AUDIO RECORDER (under 1 sec) — Clear + Optimistic UI + Background Upload
  const startAudio = async () => {
    const initialTargetReceiverId = getActiveReceiverId();
    if (!chat.isGroup && !initialTargetReceiverId) {
      showToast('Select a chat first', 'error');
      return;
    }
    if (audioStartingRef.current || recordingVoice) return;
    audioStartingRef.current = true;
    stopRequestedBeforeReadyRef.current = false;
    holdStartRef.current = Date.now();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });
      if (stopRequestedBeforeReadyRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        audioStartingRef.current = false;
        stopRequestedBeforeReadyRef.current = false;
        return;
      }

      const preferredMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
      );
      const rec =
        preferredMime === 'audio/webm;codecs=opus'
          ? new MediaRecorder(stream, {
              mimeType: 'audio/webm;codecs=opus',
              audioBitsPerSecond: 64000,
            })
          : preferredMime
            ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 64000 })
            : new MediaRecorder(stream);

      const chunks: Blob[] = [];
      voiceCancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recStartTimeRef.current = Date.now();

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        if (voiceCancelledRef.current || chunks.length === 0) {
          voiceCancelledRef.current = false;
          return;
        }
        const targetReceiverId = getActiveReceiverId();
        if (!chat.isGroup && !targetReceiverId) {
          showToast('Select a chat first', 'error');
          return;
        }
        const dur = Math.max(1, Math.round((Date.now() - recStartTimeRef.current) / 1000));
        const mimeType = rec.mimeType || preferredMime || 'audio/webm';
        const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: mimeType });

        // Show instantly - optimistic UI
        playSendSound();
        const local = sendMessageLocal({
          type: 'audio',
          blob,
          duration: dur,
        });

        // Upload + insert in background
        try {
          const url = await uploadToFastBucket('audio', file);
          const activeProfile = profile || (await refreshProfile());
          if (!activeProfile) {
            showToast('Creating your profile failed. Please sign in again.', 'error');
            return;
          }
          const { message: inserted, error } = await insertCompatibleMessage(supabase, {
            chatId: chat.id,
            senderId: activeProfile.id,
            receiverId: targetReceiverId,
            payload: {
              type: 'audio',
              media_type: 'audio',
              media_url: url,
              voice_url: url,
              duration: dur,
              file_size: blob.size,
              read_by: [activeProfile.id],
            },
            senderProfile: activeProfile,
          });
          if (error) {
            if (error.includes('messages_sender_id_fkey') || error.includes('Setup SQL')) {
              setNeedsSchemaSql(true);
            }
            showToast(error, 'error');
          }
          if (local) replaceOptimisticMessage(local.tempId, local.localUrl, inserted);
        } catch (err) {
          if (local) {
            setMessages((prev) => prev.filter((m) => m.id !== local.tempId));
            URL.revokeObjectURL(local.localUrl);
          }
          showToast(err instanceof Error ? err.message : 'Audio upload failed', 'error');
        }
      };

      rec.start(100); // 100ms chunks = fast
      playRecordStartBeep();
      mediaRecRef.current = rec;
      audioStartingRef.current = false;
      setRecordingVoice(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => {
        setRecSeconds((s) => {
          if (chat.isGroup && s >= 119) {
            stopAudio(false);
            return 120;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      audioStartingRef.current = false;
      showToast('Microphone permission denied.', 'error');
    }
  };

  useEffect(() => {
    if (!playingAudioId) {
      setWaveStep(2);
      return;
    }
    setWaveStep(0);
    const waveTimer = setInterval(() => {
      setWaveStep((s) => (s + 1) % 3);
    }, 280);
    return () => clearInterval(waveTimer);
  }, [playingAudioId]);

  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, [chat.id]);

  const markAudioAsPlayed = (msgId: string) => {
    setPlayedAudioIds((prev) => {
      if (prev[msgId]) return prev;
      const next: Record<string, true> = { ...prev, [msgId]: true };
      try {
        localStorage.setItem('letchat_played_audio_ids', JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const toggleVoicePlay = (msg: Message, audioSrc: string) => {
    if (!audioSrc) return;
    if (playingAudioId === msg.id && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setPlayingAudioId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }

    markAudioAsPlayed(msg.id);

    const audio = new Audio(audioSrc);
    audio.onended = () => {
      setPlayingAudioId((cur) => (cur === msg.id ? null : cur));
    };
    audio.onerror = () => {
      setPlayingAudioId((cur) => (cur === msg.id ? null : cur));
      showToast('Could not play voice message', 'error');
    };
    audioPlayerRef.current = audio;
    setPlayingAudioId(msg.id);
    audio.play().catch(() => {
      setPlayingAudioId((cur) => (cur === msg.id ? null : cur));
    });
  };

  const stopAudio = (cancel = false) => {
    voiceCancelledRef.current = cancel;
    holdActiveRef.current = false;
    touchStartYRef.current = null;
    slideCancelRef.current = false;
    setSlideCancelActive(false);
    if (audioStartingRef.current) {
      stopRequestedBeforeReadyRef.current = true;
    }
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop();
    }
    setRecordingVoice(false);
  };

  const beginHoldAudio = (clientY: number) => {
    touchStartYRef.current = clientY;
    slideCancelRef.current = false;
    setSlideCancelActive(false);
    holdActiveRef.current = true;
    startAudio();
  };

  useEffect(() => {
    const onMove = (clientY: number) => {
      if (!holdActiveRef.current || touchStartYRef.current === null) return;
      const deltaY = touchStartYRef.current - clientY;
      const shouldCancel = deltaY > 50;
      if (shouldCancel !== slideCancelRef.current) {
        slideCancelRef.current = shouldCancel;
        setSlideCancelActive(shouldCancel);
      }
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientY);
    };
    const handleRelease = () => {
      if (!holdActiveRef.current) return;
      stopAudio(slideCancelRef.current);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleRelease);
    window.addEventListener('touchcancel', handleRelease);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleRelease);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleRelease);
      window.removeEventListener('touchcancel', handleRelease);
    };
  }, []);

  const startCameraVideo = async () => {
    const initialTargetReceiverId = getActiveReceiverId();
    if (!chat.isGroup && !initialTargetReceiverId) {
      showToast('Select a chat first', 'error');
      return;
    }
    setShowAttach(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: lowDataMode ? 640 : 1280 },
          height: { ideal: lowDataMode ? 480 : 720 },
        },
      });
      setRecordingVideo(true);
      setRecSeconds(0);

      setTimeout(() => {
        if (camPreviewRef.current) camPreviewRef.current.srcObject = stream;
      }, 100);

      const rec = new MediaRecorder(stream, {
        videoBitsPerSecond: lowDataMode ? 450_000 : 1_200_000,
      });
      const chunks: Blob[] = [];
      const startTime = Date.now();
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        setRecordingVideo(false);
        const targetReceiverId = getActiveReceiverId();
        if (!chat.isGroup && !targetReceiverId) {
          showToast('Select a chat first', 'error');
          return;
        }
        const dur = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        const blob = new Blob(chunks, { type: 'video/webm' });
        const file = new File([blob], `cam_${Date.now()}.webm`, { type: 'video/webm' });
        const local = sendMessageLocal({ type: 'video', blob, duration: dur });
        try {
          const url = await uploadToFastBucket('video', file, setUploadPct);
          const activeProfile = profile || (await refreshProfile());
          if (activeProfile) {
            const { message: inserted, error } = await insertCompatibleMessage(supabase, {
              chatId: chat.id,
              senderId: activeProfile.id,
              receiverId: targetReceiverId,
              payload: {
                type: 'video',
                media_type: 'video',
                media_url: url,
                video_url: url,
                duration: dur,
                file_size: file.size,
                read_by: [activeProfile.id],
              },
              senderProfile: activeProfile,
            });
            if (error) showToast(error, 'error');
            if (local) replaceOptimisticMessage(local.tempId, local.localUrl, inserted);
          }
        } catch (err) {
          if (local) {
            setMessages((prev) => prev.filter((m) => m.id !== local.tempId));
            URL.revokeObjectURL(local.localUrl);
          }
          showToast(err instanceof Error ? err.message : 'Camera video upload failed', 'error');
        } finally {
          setUploadPct(null);
        }
      };
      rec.start(100);
      mediaRecRef.current = rec;
      recTimerRef.current = setInterval(() => {
        setRecSeconds((s) => {
          if (chat.isGroup && s >= 119) {
            mediaRecRef.current?.stop();
            return 120;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      showToast('Camera/Microphone access denied.', 'error');
    }
  };

  const deleteForEveryone = async (msg: Message) => {
    const { error } = await deleteCompatibleMessage(supabase, msg.id);
    if (error) {
      showToast(error, 'error');
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                deleted_for_everyone: true,
                text: 'This message was deleted',
                image_url: null,
                video_url: null,
                sticker_url: null,
                voice_url: null,
                file_url: null,
              }
            : m
        )
      );
    }
    setActiveMsgMenu(null);
  };

  const saveMediaFile = async (url: string, filename = 'letchat_media') => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      showToast('Saved media file', 'success');
    } catch {
      showToast('Download started', 'info');
    }
    setActiveMsgMenu(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#EDEDED] text-black">
      {/* WeChat Top Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E5E5] bg-[#FFFFFF] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] min-w-[36px] flex items-center justify-center rounded-lg text-black hover:bg-[#F2F2F2]"
            aria-label="Back"
          >
            <ArrowLeft size={21} strokeWidth={2.2} />
          </button>
          <div className="w-9 h-9 rounded-[8px] bg-[#07C160] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
            {(!chat.isGroup && (peerProfile?.avatar_url || chat.avatar)) || chat.avatar ? (
              <img
                src={(!chat.isGroup ? peerProfile?.avatar_url || chat.avatar : chat.avatar) || ''}
                alt={chat.title}
                className="w-full h-full object-cover"
              />
            ) : (
              (chat.title?.[0] || '?').toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[17px] leading-tight text-black truncate">{chat.title}</p>
            {(() => {
              const peerOnline = !chat.isGroup && isUserOnline(peerProfile?.last_seen);
              const isSomeoneTyping = typingUsers.length > 0;
              const typingLabel =
                typingUsers.length === 1
                  ? `${typingUsers[0]} is typing...`
                  : typingUsers.length > 1
                    ? `${typingUsers[0]} and ${typingUsers.length - 1} more are typing...`
                    : '';
              const statusText = isSomeoneTyping
                ? typingLabel
                : chat.isGroup
                  ? 'Group Chat'
                  : formatLastSeen(peerProfile?.last_seen, peerProfile?.created_at);
              return (
                <p
                  className={`text-[11px] leading-tight truncate mt-0.5 ${
                    isSomeoneTyping
                      ? 'text-[#07C160] font-semibold'
                      : peerOnline
                        ? 'text-[#07C160] font-medium'
                        : 'text-[#888888]'
                  }`}
                >
                  {statusText}
                </p>
              );
            })()}
          </div>
        </div>

        <div className="flex items-center relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-black hover:bg-[#F2F2F2]"
            aria-label="Chat options"
          >
            <MoreHorizontal size={22} />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-11 z-40 w-44 rounded-xl border border-[#E5E5E5] bg-[#FFFFFF] text-black shadow-lg py-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  loadMessages();
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-[#F5F5F5]"
              >
                Refresh Messages
              </button>
              {!chat.isGroup && chat.peer && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onStartCall(chat.peer!, 'audio');
                    }}
                    className="w-full flex items-center gap-2 text-left px-3.5 py-2.5 hover:bg-[#F5F5F5]"
                  >
                    <Phone size={14} className="text-[#07C160]" /> Voice Call
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onStartCall(chat.peer!, 'video');
                    }}
                    className="w-full flex items-center gap-2 text-left px-3.5 py-2.5 hover:bg-[#F5F5F5]"
                  >
                    <Video size={14} className="text-[#07C160]" /> Video Call
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-[#EDEDED]">
        {loadingMessages ? (
          <div className="h-full flex items-center justify-center text-center text-xs text-[#888888]">
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-xs text-[#888888]">
            No messages yet. Say hello!
          </div>
        ) : null}

        {messages.map((msg, idx) => {
          const isMine = msg.sender_id === profile?.id;
          const hiddenByReports = chat.isGroup && (msg.report_count || 0) >= 3;
          const parentMsg = msg.reply_to_id ? messages.find((m) => m.id === msg.reply_to_id) : null;

          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const showTimePill =
            !prevMsg ||
            new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() >=
              5 * 60 * 1000;

          const detectedMediaType =
            normalizeMediaKind(msg.media_type) || normalizeMediaKind(msg.type) || msg.type;
          const isAudioDoc =
            detectedMediaType === 'document' &&
            Boolean(msg.file_name && /\.(mp3|wav|m4a|ogg|aac|webm|flac|opus)$/i.test(msg.file_name));

          const mediaSrc =
            msg.media_url || msg.voice_url || msg.video_url || msg.image_url || msg.file_url || '';
          const audioSrc = msg.media_url || msg.voice_url || msg.file_url || '';
          const videoSrc = msg.media_url || msg.video_url || msg.file_url || '';
          const imageSrc = msg.media_url || msg.image_url || '';
          const captionText =
            msg.text &&
            msg.text.trim() &&
            msg.text.trim() !== mediaSrc.trim() &&
            !['[Voice message]', '[Video]', '[Photo]', '[Audio]'].includes(msg.text.trim())
              ? msg.text
              : '';

          const isAudioMsg =
            (detectedMediaType === 'audio' || detectedMediaType === 'voice' || isAudioDoc) &&
            Boolean(audioSrc);
          const isVideoMsg = detectedMediaType === 'video' && Boolean(videoSrc);
          const isImageMsg = detectedMediaType === 'image' && Boolean(imageSrc);
          const isStickerMsg =
            detectedMediaType === 'sticker' && Boolean(msg.sticker_url || msg.media_url);
          const voiceDuration = Math.max(0, Math.round(msg.duration || 0));
          const voiceBubbleWidth = Math.min(260, 80 + voiceDuration * 5);
          const isPlayingThisVoice = playingAudioId === msg.id;
          const hasUnreadDot =
            !isMine && isAudioMsg && !msg.deleted_for_everyone && !playedAudioIds[msg.id];

          const senderAvatar = isMine
            ? profile?.avatar_url
            : msg.sender?.avatar_url ||
              (!chat.isGroup ? peerProfile?.avatar_url || chat.avatar : undefined);
          const senderName = isMine
            ? profile?.name || 'Me'
            : msg.sender?.name || chat.title || '?';

          const avatarEl = (
            <div className="w-10 h-10 rounded-[6px] bg-[#07C160] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden select-none">
              {senderAvatar ? (
                <img src={senderAvatar} alt={senderName} className="w-full h-full object-cover" />
              ) : (
                (senderName?.[0] || '?').toUpperCase()
              )}
            </div>
          );

          const isMediaOnlyBubble =
            !hiddenByReports &&
            !msg.deleted_for_everyone &&
            ((isImageMsg && !captionText) || (isVideoMsg && !captionText) || isStickerMsg);

          return (
            <React.Fragment key={msg.id}>
              {showTimePill && (
                <div className="flex justify-center py-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#D3D3D3] text-white text-[11px] font-medium tabular-nums">
                    {formatChatTimeSeparator(msg.created_at)}
                  </span>
                </div>
              )}

              <div
                className={`flex items-start gap-2.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                onMouseDown={() => {
                  longPressTriggeredRef.current = false;
                  longPressRef.current = setTimeout(() => {
                    longPressTriggeredRef.current = true;
                    setActiveMsgMenu(msg);
                  }, 500);
                }}
                onMouseUp={() => longPressRef.current && clearTimeout(longPressRef.current)}
                onTouchStart={() => {
                  longPressTriggeredRef.current = false;
                  longPressRef.current = setTimeout(() => {
                    longPressTriggeredRef.current = true;
                    setActiveMsgMenu(msg);
                  }, 500);
                }}
                onTouchEnd={() => longPressRef.current && clearTimeout(longPressRef.current)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActiveMsgMenu(msg);
                }}
              >
                {!isMine && avatarEl}

                <div
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[74%]`}
                >
                  {!isMine && chat.isGroup && (
                    <p className="text-[11px] font-medium text-[#666666] mb-1 px-0.5">
                      {msg.sender?.name}
                    </p>
                  )}

                  {isAudioMsg && !hiddenByReports && !msg.deleted_for_everyone ? (
                    <>
                      {msg.forwarded && (
                        <p className="text-[10px] italic text-[#888888] mb-0.5 px-0.5">
                          Forwarded
                        </p>
                      )}
                      {parentMsg && (
                        <div className="text-[11px] rounded-[6px] bg-black/5 text-[#555555] px-2 py-1 mb-1 truncate max-w-[220px]">
                          Replying to: {parentMsg.text || parentMsg.media_type || parentMsg.type}
                        </div>
                      )}
                      <div className="relative inline-block">
                        {hasUnreadDot && (
                          <span
                            className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#FA5151] ring-2 ring-[#EDEDED] z-10"
                            aria-label="Unplayed voice message"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (longPressTriggeredRef.current) {
                              longPressTriggeredRef.current = false;
                              return;
                            }
                            toggleVoicePlay(msg, audioSrc);
                          }}
                          style={{ width: `${voiceBubbleWidth}px` }}
                          className={`relative flex items-center justify-between px-3 py-2.5 rounded-[6px] text-black transition active:scale-[0.98] ${
                            isMine ? 'bg-[#95EC69]' : 'bg-[#FFFFFF]'
                          }`}
                          aria-label={isPlayingThisVoice ? 'Stop voice message' : 'Play voice message'}
                        >
                          {!isMine && (
                            <span
                              aria-hidden="true"
                              className="absolute top-3 -left-[6px] w-0 h-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-[#FFFFFF]"
                            />
                          )}
                          {isMine && (
                            <span
                              aria-hidden="true"
                              className="absolute top-3 -right-[6px] w-0 h-0 border-y-[6px] border-y-transparent border-l-[7px] border-l-[#95EC69]"
                            />
                          )}
                          <WeChatSpeakerIcon playing={isPlayingThisVoice} waveStep={waveStep} />
                          <span className="text-[13px] font-medium text-black tabular-nums ml-2">
                            {formatDuration(voiceDuration)}
                          </span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div
                      className={`relative text-[16px] leading-snug text-black ${
                        isMediaOnlyBubble
                          ? 'bg-transparent p-0'
                          : isMine
                            ? 'bg-[#95EC69] rounded-[6px] px-3 py-2'
                            : 'bg-[#FFFFFF] rounded-[6px] px-3 py-2'
                      }`}
                    >
                      {!isMediaOnlyBubble && !isMine && (
                        <span
                          aria-hidden="true"
                          className="absolute top-3 -left-[6px] w-0 h-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-[#FFFFFF]"
                        />
                      )}
                      {!isMediaOnlyBubble && isMine && (
                        <span
                          aria-hidden="true"
                          className="absolute top-3 -right-[6px] w-0 h-0 border-y-[6px] border-y-transparent border-l-[7px] border-l-[#95EC69]"
                        />
                      )}

                      {msg.forwarded && !msg.deleted_for_everyone && (
                        <p className="text-[11px] italic text-[#666666] mb-1">Forwarded</p>
                      )}

                      {parentMsg && !msg.deleted_for_everyone && (
                        <div className="text-[12px] rounded-[4px] bg-black/5 text-[#555555] px-2 py-1 mb-1.5 truncate max-w-[220px]">
                          Replying to: {parentMsg.text || parentMsg.media_type || parentMsg.type}
                        </div>
                      )}

                      {hiddenByReports ? (
                        <p className="text-xs italic text-[#666666]">
                          Hidden due to multiple reports (pending admin review)
                        </p>
                      ) : msg.deleted_for_everyone ? (
                        <p className="text-xs italic text-[#666666]">This message was deleted</p>
                      ) : isStickerMsg ? (
                        <img
                          src={msg.sticker_url || msg.media_url || ''}
                          alt="Sticker"
                          referrerPolicy="no-referrer"
                          style={{ width: 140, height: 140 }}
                          className="object-contain select-none"
                        />
                      ) : isVideoMsg ? (
                        <div className="space-y-1.5">
                          <WeChatVideoBubble
                            url={videoSrc}
                            duration={msg.duration}
                            onOpen={() => {
                              if (longPressTriggeredRef.current) {
                                longPressTriggeredRef.current = false;
                                return;
                              }
                              setActiveVideoUrl(videoSrc);
                            }}
                          />
                          {captionText && (
                            <p className="whitespace-pre-wrap break-words text-[16px] text-black">
                              {captionText}
                            </p>
                          )}
                        </div>
                      ) : isImageMsg ? (
                        <div className="space-y-1.5">
                          <ChatImageBubble
                            url={imageSrc}
                            size={msg.file_size}
                            lowDataMode={lowDataMode}
                          />
                          {captionText && (
                            <p className="whitespace-pre-wrap break-words text-[16px] text-black">
                              {captionText}
                            </p>
                          )}
                        </div>
                      ) : detectedMediaType === 'document' && (msg.file_url || msg.media_url) ? (
                        <a
                          href={msg.file_url || msg.media_url || ''}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 underline text-[14px] text-black"
                        >
                          <FileText size={16} />
                          <span>{msg.file_name || 'Document'}</span>
                          <span className="text-[#666666] text-xs tabular-nums">
                            ({formatBytes(msg.file_size)})
                          </span>
                        </a>
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-[16px] text-black">
                          {msg.text}
                        </p>
                      )}
                    </div>
                  )}

                  {/* External 11px Grey Time Under Bubble */}
                  <div
                    className={`flex items-center gap-1.5 mt-1 px-0.5 text-[11px] text-[#888888] ${
                      isMine ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {msg.isSending && <span className="italic">Sending...</span>}
                    <span className="tabular-nums">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {isMine && avatarEl}
              </div>
            </React.Fragment>
          );
        })}

        {typingUsers.length > 0 && (
          <div className="flex items-start gap-2.5">
            <div className="w-10 h-10 rounded-[6px] bg-[#07C160] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
              {peerProfile?.avatar_url || chat.avatar ? (
                <img
                  src={(peerProfile?.avatar_url || chat.avatar) || ''}
                  alt={chat.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                (typingUsers[0]?.[0] || '?').toUpperCase()
              )}
            </div>
            <div className="relative inline-flex items-center gap-2 rounded-[6px] bg-[#FFFFFF] px-3 py-2 text-xs text-[#555555]">
              <span
                aria-hidden="true"
                className="absolute top-3 -left-[6px] w-0 h-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-[#FFFFFF]"
              />
              <span className="flex items-center gap-1" aria-hidden="true">
                <span className="w-1.5 h-1.5 rounded-full bg-[#07C160] animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#07C160] animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#07C160] animate-bounce [animation-delay:300ms]" />
              </span>
              <span className="font-medium">
                {typingUsers.length === 1
                  ? `${typingUsers[0]} is typing...`
                  : `${typingUsers.join(', ')} are typing...`}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Schema Migration Notice if Supabase still enforces legacy messages_sender_id_fkey */}
      {needsSchemaSql && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-amber-800 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold">
            Run the updated Setup SQL in Supabase SQL Editor to fix messages_sender_id_fkey.
          </span>
          <button
            type="button"
            onClick={() => setShowSqlModal(true)}
            className="px-3 py-1 rounded-lg bg-[#07C160] text-white font-bold shrink-0"
          >
            Setup SQL
          </button>
        </div>
      )}

      {/* Upload % Progress */}
      {uploadPct !== null && (
        <div className="px-4 py-1.5 bg-[#FFFFFF] border-t border-[#E5E5E5]">
          <div className="flex justify-between text-xs font-medium text-[#555555] mb-1 tabular-nums">
            <span>Uploading media...</span>
            <span>{uploadPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
            <div className="h-full bg-[#07C160] transition-all" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      )}

      {/* Reply Banner */}
      {replyTo && (
        <div className="px-3 py-1.5 bg-[#F7F7F7] border-t border-[#E5E5E5] flex items-center justify-between text-xs text-black">
          <div className="truncate">
            <span className="font-semibold text-[#07C160]">Replying to: </span>
            <span>{replyTo.text || replyTo.media_type || replyTo.type}</span>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} className="p-1 text-[#666666]">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Attachment Sheet (+) */}
      {showAttach && (
        <div className="grid grid-cols-6 gap-1.5 p-3 border-t border-[#E5E5E5] bg-[#F7F7F7] text-[11px] font-medium text-[#333333]">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-[#EDEDED]"
          >
            <div className="p-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] text-black">
              <ImageIcon size={18} />
            </div>
            Photo
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-[#EDEDED]"
          >
            <div className="p-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] text-black">
              <Film size={18} />
            </div>
            Video
          </button>
          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-[#EDEDED]"
          >
            <div className="p-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] text-black">
              <Music size={18} />
            </div>
            Audio
          </button>
          <button
            type="button"
            onClick={startCameraVideo}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-[#EDEDED]"
          >
            <div className="p-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] text-black">
              <Camera size={18} />
            </div>
            Camera
          </button>
          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-[#EDEDED]"
          >
            <div className="p-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] text-black">
              <FileText size={18} />
            </div>
            File
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAttach(false);
              setShowEmoji(false);
              setShowStickers(true);
            }}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl hover:bg-[#EDEDED]"
          >
            <div className="p-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] text-black">
              <Sticker size={18} />
            </div>
            Stickers
          </button>
        </div>
      )}

      {/* Quick Emoji Row */}
      {showEmoji && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#E5E5E5] bg-[#FFFFFF] overflow-x-auto no-scrollbar">
          {QUICK_EMOJIS.map((em) => (
            <button
              type="button"
              key={em}
              onClick={() => updateDraftText((t) => t + em)}
              className="text-xl min-w-[36px] min-h-[36px] hover:scale-125 transition"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* Sticker Picker */}
      {showStickers && (
        <StickerPicker
          onClose={() => setShowStickers(false)}
          onSelectSticker={(url) => {
            setShowStickers(false);
            playSendSound();
            sendMessage({ type: 'sticker', sticker_url: url });
          }}
        />
      )}

      {/* Hidden File Inputs */}
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
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          sendVideo(f);
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleAudioUpload}
      />
      <input ref={docInputRef} type="file" className="hidden" onChange={handleDocUpload} />

      {/* WeChat Bottom Input Bar */}
      <form
        onSubmit={handleSendText}
        className="px-2.5 py-2 border-t border-[#E5E5E5] bg-[#FFFFFF] flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onMouseDown={(e) => beginHoldAudio(e.clientY)}
          onTouchStart={(e) => {
            e.preventDefault();
            beginHoldAudio(e.touches[0]?.clientY ?? 0);
          }}
          className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full select-none shrink-0 transition ${
            recordingVoice
              ? 'bg-[#95EC69] text-black scale-105'
              : 'text-black hover:bg-[#F2F2F2]'
          }`}
          title="Hold to record voice"
          aria-label="Hold to record voice"
        >
          <Mic size={21} />
        </button>

        {recordingVoice ? (
          <div
            className={`flex-1 flex items-center justify-between gap-2 px-3.5 min-h-[40px] rounded-[6px] text-xs font-semibold select-none border transition ${
              slideCancelActive
                ? 'bg-[#FFF0F0] border-[#FA5151] text-[#FA5151]'
                : 'bg-[#F3FBE9] border-[#95EC69] text-black'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  slideCancelActive ? 'bg-[#FA5151]' : 'bg-[#07C160]'
                }`}
              />
              <span className="tabular-nums">{formatDuration(recSeconds)}</span>
              <span className="truncate">
                {slideCancelActive ? 'Release to cancel' : 'Slide up to cancel'}
              </span>
            </span>
            <span className="text-[11px] text-[#666666] shrink-0">Release to send</span>
          </div>
        ) : (
          <input
            value={text}
            onChange={(e) => {
              const nextVal = e.target.value;
              updateDraftText(nextVal);
              setTypingPresence(nextVal.trim().length > 0);
            }}
            onBlur={() => setTypingPresence(false)}
            placeholder="Type message..."
            className="flex-1 min-w-0 px-3 min-h-[40px] rounded-[6px] bg-[#FFFFFF] border border-[#DCDCDC] text-[15px] text-black placeholder:text-[#999999] outline-none focus:border-[#07C160]"
          />
        )}

        <button
          type="button"
          onClick={() => {
            setShowEmoji(!showEmoji);
            setShowStickers(false);
          }}
          className="min-h-[40px] min-w-[38px] flex items-center justify-center rounded-full text-black hover:bg-[#F2F2F2] shrink-0"
          title="Emoji"
          aria-label="Emoji"
        >
          <Smile size={22} />
        </button>

        {text.trim() ? (
          <button
            type="submit"
            className="min-h-[38px] px-3.5 flex items-center justify-center rounded-[6px] bg-[#07C160] hover:bg-[#06AD56] text-white text-sm font-semibold shrink-0 transition"
            aria-label="Send"
          >
            Send
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowAttach(!showAttach);
              setShowStickers(false);
              setShowEmoji(false);
            }}
            className="min-h-[40px] min-w-[38px] flex items-center justify-center rounded-full text-black hover:bg-[#F2F2F2] shrink-0"
            title="More"
            aria-label="Attachments"
          >
            <Plus size={22} />
          </button>
        )}
      </form>

      {/* WeChat-style Hold Recording HUD */}
      {recordingVoice && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center pointer-events-none px-4">
          <div
            className={`w-48 rounded-2xl px-5 py-4 shadow-xl border flex flex-col items-center gap-2 text-center transition ${
              slideCancelActive
                ? 'bg-[#FA5151] border-[#FA5151] text-white'
                : 'bg-[#FFFFFF] border-[#E5E5E5] text-black'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                slideCancelActive ? 'bg-white/25 text-white' : 'bg-[#95EC69] text-black animate-pulse'
              }`}
            >
              <Mic size={22} />
            </div>
            <span className="text-base font-bold tabular-nums">{formatDuration(recSeconds)}</span>
            <span className="text-xs font-medium">
              {slideCancelActive ? 'Release to cancel' : 'Slide up to cancel'}
            </span>
          </div>
        </div>
      )}

      {/* Video Lightbox Player Modal */}
      {activeVideoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setActiveVideoUrl(null)}
        >
          <button
            type="button"
            onClick={() => setActiveVideoUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25"
            aria-label="Close video"
          >
            <X size={20} />
          </button>
          <video
            controls
            autoPlay
            playsInline
            src={activeVideoUrl}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[82vh] rounded-[8px] bg-black"
          />
        </div>
      )}

      {/* Camera Video Recorder Modal */}
      {recordingVideo && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between">
          <video ref={camPreviewRef} autoPlay muted playsInline className="w-full flex-1 object-cover" />
          <div className="p-6 flex items-center justify-between bg-black/80 text-white">
            <span className="font-mono font-bold text-red-500 tabular-nums">
              REC {formatDuration(recSeconds)}
              {chat.isGroup ? ' / 2:00' : ''}
            </span>
            <button
              type="button"
              onClick={() => mediaRecRef.current?.stop()}
              className="px-6 min-h-[44px] rounded-full bg-red-600 font-bold text-sm"
            >
              Stop & Send
            </button>
          </div>
        </div>
      )}

      {/* Message Long-Press / Options Action Sheet */}
      {activeMsgMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center p-4"
          onClick={() => setActiveMsgMenu(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#FFFFFF] text-black border border-[#E5E5E5] overflow-hidden text-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setReplyTo(activeMsgMenu);
                setActiveMsgMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 min-h-[48px] hover:bg-[#F5F5F5]"
            >
              <Reply size={16} /> Reply
            </button>
            <button
              type="button"
              onClick={() => {
                setForwardMsg(activeMsgMenu);
                setActiveMsgMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 min-h-[48px] hover:bg-[#F5F5F5]"
            >
              <Forward size={16} /> Forward
            </button>
            {(activeMsgMenu.media_url ||
              activeMsgMenu.image_url ||
              activeMsgMenu.video_url ||
              activeMsgMenu.voice_url ||
              activeMsgMenu.file_url) && (
              <button
                type="button"
                onClick={() =>
                  saveMediaFile(
                    activeMsgMenu.media_url ||
                      activeMsgMenu.video_url ||
                      activeMsgMenu.image_url ||
                      activeMsgMenu.voice_url ||
                      activeMsgMenu.file_url ||
                      '',
                    activeMsgMenu.file_name || 'letchat_media'
                  )
                }
                className="w-full flex items-center gap-3 px-4 min-h-[48px] hover:bg-[#F5F5F5]"
              >
                <Download size={16} /> Save
              </button>
            )}
            {activeMsgMenu.sender_id === profile?.id && !activeMsgMenu.deleted_for_everyone && (
              <button
                type="button"
                onClick={() => deleteForEveryone(activeMsgMenu)}
                className="w-full flex items-center gap-3 px-4 min-h-[48px] text-red-600 hover:bg-[#F5F5F5]"
              >
                <Trash2 size={16} /> Delete for Everyone
              </button>
            )}
            {chat.isGroup && (
              <button
                type="button"
                onClick={() => {
                  setReportTarget({
                    contentType: 'message',
                    contentId: activeMsgMenu.id,
                    reportedUserId: activeMsgMenu.sender_id,
                    contentText: activeMsgMenu.text || activeMsgMenu.type,
                  });
                  setActiveMsgMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 min-h-[48px] text-red-600 hover:bg-[#F5F5F5]"
              >
                <Flag size={16} /> Report Message
              </button>
            )}
          </div>
        </div>
      )}

      {/* Forward Picker Modal */}
      {forwardMsg && profile && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#FFFFFF] text-black border border-[#E5E5E5] p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Forward Message</h3>
              <button type="button" onClick={() => setForwardMsg(null)} className="p-1">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {friendsList.length === 0 ? (
                <p className="text-xs text-[#888888] text-center py-4">No users available.</p>
              ) : (
                friendsList.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    onClick={async () => {
                      const targetChatId = getDmChatId(profile.id, f.id);
                      const { error } = await insertCompatibleMessage(supabase, {
                        chatId: targetChatId,
                        senderId: profile.id,
                        receiverId: f.id,
                        payload: {
                          type: forwardMsg.type,
                          media_type: forwardMsg.media_type,
                          media_url: forwardMsg.media_url,
                          text: forwardMsg.text,
                          image_url: forwardMsg.image_url,
                          video_url: forwardMsg.video_url,
                          sticker_url: forwardMsg.sticker_url,
                          voice_url: forwardMsg.voice_url,
                          file_url: forwardMsg.file_url,
                          file_name: forwardMsg.file_name,
                          file_size: forwardMsg.file_size,
                          duration: forwardMsg.duration,
                          forwarded: true,
                        },
                        senderProfile: profile,
                      });
                      if (error) {
                        showToast(error, 'error');
                      } else {
                        showToast(`Forwarded to ${f.name}`, 'success');
                      }
                      setForwardMsg(null);
                    }}
                    className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-[#F5F5F5] text-left text-sm"
                  >
                    <div className="w-8 h-8 rounded-[6px] bg-[#07C160] text-white flex items-center justify-center font-bold text-xs">
                      {f.name?.[0]}
                    </div>
                    <span>
                      {f.name} (@{f.username})
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
      <SetupSqlModal open={showSqlModal} onClose={() => setShowSqlModal(false)} />
    </div>
  );
}

function WeChatVideoBubble({
  url,
  duration,
  onOpen,
}: {
  url: string;
  duration?: number | null;
  onOpen: () => void;
}) {
  const [detectedDur, setDetectedDur] = useState<number>(duration || 0);
  useEffect(() => {
    if (duration && duration > 0) setDetectedDur(duration);
  }, [duration]);

  const previewSrc = url && !url.startsWith('data:') && !url.startsWith('blob:') ? `${url}#t=0.1` : url;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block overflow-hidden rounded-[8px] bg-[#1F1F1F] group focus:outline-none"
      aria-label="Play video"
    >
      <video
        src={previewSrc}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if ((!duration || duration <= 0) && Number.isFinite(d) && d > 0) {
            setDetectedDur(Math.round(d));
          }
        }}
        className="w-52 max-h-64 object-cover block pointer-events-none"
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition">
        <span className="w-11 h-11 rounded-full bg-black/45 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <polygon points="8,5 19,12 8,19" />
          </svg>
        </span>
      </span>
      <span className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded bg-black/55 text-white text-[11px] font-medium tabular-nums">
        {formatDuration(detectedDur)}
      </span>
    </button>
  );
}

function ChatImageBubble({
  url,
  size,
  lowDataMode,
}: {
  url: string;
  size?: number;
  lowDataMode: boolean;
}) {
  const [loaded, setLoaded] = useState(!lowDataMode);
  if (!loaded) {
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-[#FFFFFF] border border-[#E5E5E5] text-xs font-semibold text-black"
      >
        <Download size={14} /> Tap to Download Photo ({formatBytes(size)})
      </button>
    );
  }
  return (
    <img
      src={url}
      alt="Attachment"
      className="rounded-[8px] max-w-[220px] max-h-64 object-cover block"
    />
  );
}
