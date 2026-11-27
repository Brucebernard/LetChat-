import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Plus,
  UserPlus,
  Check,
  Music2,
  Play,
  Volume2,
  VolumeX,
  Film,
  Send,
  X,
  Copy,
  Users,
  UserCheck,
  Flag,
  Trash2,
  Sticker,
  Keyboard,
} from 'lucide-react';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFlowKeyboard } from '../../context/KeyboardContext';
import { useViewportVideoFeed } from '../../hooks/useViewportVideoFeed';
import { loadFriendshipsAndRequests, normalizeProfileRecord } from '../../utils/friendService';
import { copyToClipboard, formatDuration } from '../../utils/mediaUtils';
import {
  getCachedProfile,
  getDisplayName,
  getUsernameHandle,
  isProfileComplete,
  setCachedProfiles,
} from '../../utils/appCache';
import { ProfileAvatar, VerifiedNameBadge } from '../Common/VerifiedBadge';
import { WeChatHoldToRecordButton, VoiceNotePlayer } from '../Voice/WeChatVoiceBar';
import { getDmChatId, insertCompatibleMessage } from '../../utils/chatMessageCodec';
import StickerPicker from '../Stickers/StickerPicker';
import ReportModal from '../Modals/ReportModal';
import SearchMomentsView from './SearchMomentsView';
import NewsMomentsView from './NewsMomentsView';
import MyMomentsView, { CreateMomentModal } from './MyMomentsView';
import {
  GroupItem,
  MomentComment,
  MomentDraft,
  MomentItem,
  Profile,
  ReportTarget,
} from '../../types';

type MomentsSubTab = 'forYou' | 'search' | 'news';

interface MomentsTabProps {
  onDetailViewChange?: (isDetail: boolean) => void;
}

interface HeartBurst {
  id: number;
  x: number;
  y: number;
}

function formatCompactCount(num = 0): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export default function MomentsTab({ onDetailViewChange }: MomentsTabProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { openKeyboard } = useFlowKeyboard();

  const [subTab, setSubTab] = useState<MomentsSubTab>('forYou');
  const [searchSeed, setSearchSeed] = useState('');
  const [moments, setMoments] = useState<MomentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [acceptedFriendIds, setAcceptedFriendIds] = useState<Set<string>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  // Fullscreen modals / subviews
  const [showMyMoments, setShowMyMoments] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDraft, setEditingDraft] = useState<MomentDraft | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  // Comments Drawer
  const [commentMoment, setCommentMoment] = useState<MomentItem | null>(null);
  const [comments, setComments] = useState<MomentComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  // Share Sheet
  const [shareMoment, setShareMoment] = useState<MomentItem | null>(null);
  const [shareFriends, setShareFriends] = useState<Profile[]>([]);
  const [shareGroups, setShareGroups] = useState<GroupItem[]>([]);
  const [sendingShareTo, setSendingShareTo] = useState<string | null>(null);

  // TikTok feed playback & tap gestures
  const [feedContainerEl, setFeedContainerEl] = useState<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState<boolean>(true);
  const [heartBursts, setHeartBursts] = useState<Record<string, HeartBurst[]>>({});

  const tapTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTapTimeRef = useRef<Record<string, number>>({});
  const slideRefs = useRef<Record<string, HTMLElement | null>>({});
  const viewedIdsRef = useRef<Set<string>>(new Set());

  const loadAllMomentsData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [momentsRes, likesRes, savesRes, followsRes, commentsRes, friendRes] =
        await Promise.all([
          supabase
            .from('moments')
            .select('*, author:profiles(*)')
            .order('created_at', { ascending: false })
            .limit(80),
          supabase.from('moment_likes').select('moment_id').eq('user_id', profile.id),
          supabase.from('moment_saves').select('moment_id').eq('user_id', profile.id),
          supabase.from('follows').select('following_id').eq('follower_id', profile.id),
          supabase.from('moment_comments').select('moment_id'),
          loadFriendshipsAndRequests(supabase, profile.id),
        ]);

      if (momentsRes.data) {
        const rawList = momentsRes.data as unknown as Array<
          MomentItem & { author?: Record<string, unknown> | null }
        >;
        const missingIds = new Set<string>();
        const preNormalized = rawList.map((row) => {
          const author = row.author
            ? normalizeProfileRecord(row.author)
            : getCachedProfile(row.user_id) || undefined;
          if (!author && row.user_id) {
            missingIds.add(row.user_id);
          }
          return {
            ...row,
            author,
          };
        });

        if (missingIds.size > 0) {
          const { data: missingProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', Array.from(missingIds));
          if (missingProfiles && missingProfiles.length > 0) {
            const profMap = new Map<string, Profile>();
            const normalizedMissing = (missingProfiles as Record<string, unknown>[]).map((p) => {
              const np = normalizeProfileRecord(p);
              profMap.set(np.id, np);
              return np;
            });
            setCachedProfiles(normalizedMissing);
            for (const m of preNormalized) {
              if (!m.author && profMap.has(m.user_id)) {
                m.author = profMap.get(m.user_id);
              }
            }
          }
        } else {
          setCachedProfiles(
            preNormalized.map((m) => m.author).filter((a): a is Profile => Boolean(a))
          );
        }

        setMoments(preNormalized);
      }
      if (likesRes.data) {
        setLikedIds(
          new Set(
            (likesRes.data as Array<{ moment_id: string }>).map((r) => r.moment_id)
          )
        );
      }
      if (savesRes.data) {
        setSavedIds(
          new Set(
            (savesRes.data as Array<{ moment_id: string }>).map((r) => r.moment_id)
          )
        );
      }
      if (followsRes.data) {
        setFollowingIds(
          new Set(
            (followsRes.data as Array<{ following_id: string }>).map((r) => r.following_id)
          )
        );
      }
      if (commentsRes.data) {
        const counts: Record<string, number> = {};
        for (const row of commentsRes.data as Array<{ moment_id: string }>) {
          counts[row.moment_id] = (counts[row.moment_id] || 0) + 1;
        }
        setCommentCounts(counts);
      }
      setAcceptedFriendIds(friendRes.acceptedIds);
      setShareFriends(friendRes.acceptedFriends);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadAllMomentsData();
  }, [loadAllMomentsData]);

  useEffect(() => {
    onDetailViewChange?.(showMyMoments || showCreateModal || Boolean(reportTarget));
  }, [showMyMoments, showCreateModal, reportTarget, onDetailViewChange]);

  // Realtime updates for Moments, Likes, Comments, Follows
  useEffect(() => {
    if (!profile?.id) return;
    const sub = supabase
      .channel(`moments-realtime-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moments' }, loadAllMomentsData)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moment_comments' },
        loadAllMomentsData
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [profile?.id, loadAllMomentsData]);

  // Filter Moments by visibility ('everyone' | 'friends' | 'only_me')
  const visibleMoments = useMemo(() => {
    if (!profile?.id) return [];
    return moments.filter((m) => {
      const vis = m.visibility || 'everyone';
      if (m.user_id === profile.id) return true;
      if (vis === 'only_me') return false;
      if (vis === 'friends') return acceptedFriendIds.has(m.user_id);
      return true;
    });
  }, [moments, profile?.id, acceptedFriendIds]);

  const myMoments = useMemo(() => {
    if (!profile?.id) return [];
    return moments.filter((m) => m.user_id === profile.id);
  }, [moments, profile?.id]);

  const videoMomentIds = useMemo(
    () => visibleMoments.filter((m) => Boolean(m.video_url)).map((m) => m.id),
    [visibleMoments]
  );

  const feedDisabled =
    subTab !== 'forYou' ||
    showMyMoments ||
    showCreateModal ||
    Boolean(commentMoment) ||
    Boolean(shareMoment) ||
    Boolean(reportTarget);

  const {
    activeId: activeVideoId,
    pausedMap,
    registerItemRef,
    registerVideoRef,
    toggleManualPause,
    setManualPlay,
  } = useViewportVideoFeed({
    videoIds: videoMomentIds,
    root: feedContainerEl,
    minRatio: 0.6,
    disabled: feedDisabled,
    muted,
    onFallbackMute: () => setMuted(true),
    feedKey: 'moments-for-you',
  });

  const activeSlideIndex = useMemo(() => {
    if (!visibleMoments.length) return 0;
    if (activeVideoId) {
      const idx = visibleMoments.findIndex((m) => m.id === activeVideoId);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [activeVideoId, visibleMoments]);

  const handleOpenCreateModal = (draft?: MomentDraft | null) => {
    if (!isProfileComplete(profile)) {
      showToast('Please set your Full Name and @username in Profile before posting Moments.', 'error');
      return;
    }
    setEditingDraft(draft || null);
    setShowCreateModal(true);
  };

  // Track views_count when a video becomes active
  useEffect(() => {
    if (!activeVideoId || viewedIdsRef.current.has(activeVideoId)) return;
    viewedIdsRef.current.add(activeVideoId);
    const current = moments.find((m) => m.id === activeVideoId);
    if (!current) return;
    const nextViews = (current.views_count || 0) + 1;
    setMoments((prev) =>
      prev.map((m) => (m.id === activeVideoId ? { ...m, views_count: nextViews } : m))
    );
    supabase
      .from('moments')
      .update({ views_count: nextViews })
      .eq('id', activeVideoId)
      .then(() => {});
  }, [activeVideoId, moments]);

  // Keyboard ArrowUp / ArrowDown navigation for For You feed
  useEffect(() => {
    if (subTab !== 'forYou' || feedDisabled || visibleMoments.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const container = feedContainerEl;
      if (!container) return;
      const idx = Math.round(container.scrollTop / Math.max(container.clientHeight, 1));
      const nextIdx =
        e.key === 'ArrowDown'
          ? Math.min(visibleMoments.length - 1, idx + 1)
          : Math.max(0, idx - 1);
      const targetId = visibleMoments[nextIdx]?.id;
      if (targetId && slideRefs.current[targetId]) {
        e.preventDefault();
        slideRefs.current[targetId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [subTab, feedDisabled, visibleMoments, feedContainerEl]);

  const toggleLike = async (momentId: string, forceLikeOnly = false) => {
    if (!profile?.id) return;
    const alreadyLiked = likedIds.has(momentId);
    if (forceLikeOnly && alreadyLiked) return;

    const target = moments.find((m) => m.id === momentId);
    const nextLiked = forceLikeOnly ? true : !alreadyLiked;
    const delta = nextLiked ? 1 : -1;
    const nextCount = Math.max(0, (target?.likes_count || 0) + delta);

    setLikedIds((prev) => {
      const next = new Set(prev);
      if (nextLiked) next.add(momentId);
      else next.delete(momentId);
      return next;
    });
    setMoments((prev) =>
      prev.map((m) => (m.id === momentId ? { ...m, likes_count: nextCount } : m))
    );

    if (nextLiked) {
      await supabase
        .from('moment_likes')
        .upsert({ moment_id: momentId, user_id: profile.id }, { onConflict: 'moment_id,user_id' });
    } else {
      await supabase
        .from('moment_likes')
        .delete()
        .eq('moment_id', momentId)
        .eq('user_id', profile.id);
    }

    await supabase.from('moments').update({ likes_count: nextCount }).eq('id', momentId);
  };

  const toggleSave = async (momentId: string) => {
    if (!profile?.id) return;
    const isSaved = savedIds.has(momentId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(momentId);
      else next.add(momentId);
      return next;
    });

    if (isSaved) {
      const { error } = await supabase
        .from('moment_saves')
        .delete()
        .eq('moment_id', momentId)
        .eq('user_id', profile.id);
      if (!error) showToast('Removed from saved', 'info');
    } else {
      const { error } = await supabase
        .from('moment_saves')
        .upsert({ moment_id: momentId, user_id: profile.id }, { onConflict: 'moment_id,user_id' });
      if (!error) showToast('Saved Moment', 'success');
    }
  };

  const toggleFollow = async (creatorId: string) => {
    if (!profile?.id || creatorId === profile.id) return;
    const isFollowing = followingIds.has(creatorId);

    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(creatorId);
      else next.add(creatorId);
      return next;
    });

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', profile.id)
        .eq('following_id', creatorId);
    } else {
      const { error } = await supabase
        .from('follows')
        .upsert(
          { follower_id: profile.id, following_id: creatorId },
          { onConflict: 'follower_id,following_id' }
        );
      if (!error) showToast('Following creator', 'success');
    }
  };

  const triggerHeartBurst = (momentId: string, clientX: number, clientY: number, rect: DOMRect) => {
    const burst: HeartBurst = {
      id: Date.now() + Math.random(),
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
    setHeartBursts((prev) => ({
      ...prev,
      [momentId]: [...(prev[momentId] || []), burst],
    }));
    setTimeout(() => {
      setHeartBursts((prev) => ({
        ...prev,
        [momentId]: (prev[momentId] || []).filter((b) => b.id !== burst.id),
      }));
    }, 750);
  };

  const handleStageTap = (moment: MomentItem, e: React.MouseEvent<HTMLElement>) => {
    const now = Date.now();
    const lastTap = lastTapTimeRef.current[moment.id] || 0;
    const rect = e.currentTarget.getBoundingClientRect();

    if (now - lastTap < 270) {
      // Double tap -> Like + Heart burst
      if (tapTimersRef.current[moment.id]) {
        clearTimeout(tapTimersRef.current[moment.id]);
        delete tapTimersRef.current[moment.id];
      }
      lastTapTimeRef.current[moment.id] = 0;
      triggerHeartBurst(moment.id, e.clientX, e.clientY, rect);
      toggleLike(moment.id, true);
      return;
    }

    lastTapTimeRef.current[moment.id] = now;
    if (moment.video_url) {
      tapTimersRef.current[moment.id] = setTimeout(() => {
        toggleManualPause(moment.id);
        delete tapTimersRef.current[moment.id];
      }, 240);
    }
  };

  const openCommentsDrawer = async (m: MomentItem) => {
    setCommentMoment(m);
    setComments([]);
    setCommentsLoading(true);
    setShowStickerPicker(false);
    try {
      const { data } = await supabase
        .from('moment_comments')
        .select('*, user:profiles(*)')
        .eq('moment_id', m.id)
        .order('created_at', { ascending: true });
      if (data) {
        const rawComments = data as unknown as Array<
          MomentComment & { user?: Record<string, unknown> | null }
        >;
        const missingIds = new Set<string>();
        const mapped = rawComments.map((c) => {
          const user = c.user
            ? normalizeProfileRecord(c.user)
            : getCachedProfile(c.user_id) || undefined;
          if (!user && c.user_id) missingIds.add(c.user_id);
          return { ...c, user };
        });

        if (missingIds.size > 0) {
          const { data: missingUsers } = await supabase
            .from('profiles')
            .select('*')
            .in('id', Array.from(missingIds));
          if (missingUsers && missingUsers.length > 0) {
            const uMap = new Map<string, Profile>();
            const normUsers = (missingUsers as Record<string, unknown>[]).map((u) => {
              const nu = normalizeProfileRecord(u);
              uMap.set(nu.id, nu);
              return nu;
            });
            setCachedProfiles(normUsers);
            for (const c of mapped) {
              if (!c.user && uMap.has(c.user_id)) c.user = uMap.get(c.user_id);
            }
          }
        }
        setComments(mapped);
      }
    } finally {
      setCommentsLoading(false);
    }
  };

  const submitMomentComment = async (
    textVal: string,
    stickerUrl?: string,
    voiceData?: { url: string; duration: number }
  ) => {
    if (!profile?.id || !commentMoment) return;
    const clean = textVal.trim();
    if (!clean && !stickerUrl && !voiceData) return;

    const payload: Record<string, unknown> = {
      moment_id: commentMoment.id,
      user_id: profile.id,
      text: clean || (voiceData ? '[Voice comment]' : ''),
      sticker_url: stickerUrl || null,
    };
    if (voiceData) {
      payload.voice_url = voiceData.url;
      payload.duration = voiceData.duration;
    }

    let { data, error } = await supabase
      .from('moment_comments')
      .insert(payload)
      .select('*, user:profiles(*)')
      .single();

    if (error && voiceData && (error.code === '42703' || error.code === 'PGRST204')) {
      const retry = await supabase
        .from('moment_comments')
        .insert({
          moment_id: commentMoment.id,
          user_id: profile.id,
          text: `${clean ? `${clean} ` : ''}🎙️ Voice Note (${formatDuration(voiceData.duration)}): ${voiceData.url}`,
        })
        .select('*, user:profiles(*)')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      showToast(error.message || 'Could not post comment', 'error');
      return;
    }
    if (data) {
      const r = data as unknown as MomentComment & { user?: Record<string, unknown> };
      const normalizedComment: MomentComment = {
        ...r,
        user: r.user ? normalizeProfileRecord(r.user) : profile,
      };
      setComments((prev) => [...prev, normalizedComment]);
      setCommentCounts((prev) => ({
        ...prev,
        [commentMoment.id]: (prev[commentMoment.id] || 0) + 1,
      }));
    }
    setCommentText('');
    setShowStickerPicker(false);
  };

  const handleVoiceCommentSend = async (file: File, durSec: number) => {
    if (!profile?.id || !commentMoment) return;
    try {
      const path = `voice-comments/${profile.id}/${Date.now()}.webm`;
      const url = await uploadWithProgress('letchat-media', path, file);
      await submitMomentComment('', undefined, { url, duration: durSec });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Voice comment upload failed', 'error');
    }
  };

  const deleteOwnComment = async (commentId: string) => {
    if (!commentMoment) return;
    await supabase.from('moment_comments').delete().eq('id', commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setCommentCounts((prev) => ({
      ...prev,
      [commentMoment.id]: Math.max(0, (prev[commentMoment.id] || 1) - 1),
    }));
  };

  const openShareDrawer = async (m: MomentItem) => {
    setShareMoment(m);
    if (!profile?.id) return;
    const { data } = await supabase
      .from('group_members')
      .select('groups(*)')
      .eq('user_id', profile.id);
    const groups = ((data || []) as unknown as Array<{ groups: GroupItem | null }>)
      .map((r) => r.groups)
      .filter((g): g is GroupItem => Boolean(g));
    setShareGroups(groups);
  };

  const shareMomentToFriend = async (friend: Profile) => {
    if (!profile?.id || !shareMoment) return;
    setSendingShareTo(`dm_${friend.id}`);
    try {
      const mediaUrl = shareMoment.video_url || shareMoment.media_url || shareMoment.image_url;
      const authorTag = getUsernameHandle(shareMoment.author) || getDisplayName(shareMoment.author);
      const shareText = `✨ Moment by ${authorTag}: ${
        shareMoment.caption || shareMoment.text || 'Watch on LetChat FLOW'
      }`;
      const { error } = await insertCompatibleMessage(supabase, {
        chatId: getDmChatId(profile.id, friend.id),
        senderId: profile.id,
        receiverId: friend.id,
        payload: shareMoment.video_url
          ? {
              type: 'video',
              text: shareText,
              video_url: shareMoment.video_url,
              media_url: shareMoment.video_url,
              forwarded: true,
            }
          : mediaUrl
            ? {
                type: 'image',
                text: shareText,
                image_url: mediaUrl,
                media_url: mediaUrl,
                forwarded: true,
              }
            : { type: 'text', text: shareText, forwarded: true },
        senderProfile: profile,
      });
      if (error) showToast(error, 'error');
      else {
        showToast(`Sent to ${getDisplayName(friend)}`, 'success');
        setShareMoment(null);
      }
    } finally {
      setSendingShareTo(null);
    }
  };

  const shareMomentToGroup = async (group: GroupItem) => {
    if (!profile?.id || !shareMoment) return;
    setSendingShareTo(`grp_${group.id}`);
    try {
      const mediaUrl = shareMoment.video_url || shareMoment.media_url || shareMoment.image_url;
      const authorTag = getUsernameHandle(shareMoment.author) || getDisplayName(shareMoment.author);
      const shareText = `✨ Moment by ${authorTag}: ${
        shareMoment.caption || shareMoment.text || ''
      }`;
      const msgType = shareMoment.video_url ? 'video' : mediaUrl ? 'image' : 'text';
      const { error } = await supabase.from('group_messages').insert({
        group_id: group.id,
        sender_id: profile.id,
        content: shareText.trim() || 'Shared a Moment',
        type: msgType,
        media_url: mediaUrl || null,
      });
      if (error) showToast(error.message || 'Could not share to group', 'error');
      else {
        showToast(`Shared to ${group.name}`, 'success');
        setShareMoment(null);
      }
    } finally {
      setSendingShareTo(null);
    }
  };

  const jumpToMomentInFeed = (momentId: string) => {
    setSubTab('forYou');
    setTimeout(() => {
      const el = slideRefs.current[momentId];
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
      setManualPlay(momentId);
    }, 60);
  };

  return (
    <div className="relative h-full w-full bg-[#0A0A0A] text-white overflow-hidden">
      {/* Top Overlay Header: [ For You ] [ Search ] [ News ] + My Moments + (+) */}
      <div className="absolute top-0 inset-x-0 z-30 px-3 pt-2.5 pb-2 flex items-center justify-between gap-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent pointer-events-none">
        <div className="flex items-center gap-1 bg-black/45 backdrop-blur-md border border-white/10 rounded-full p-1 pointer-events-auto">
          {(
            [
              { id: 'forYou', label: 'For You' },
              { id: 'search', label: 'Search' },
              { id: 'news', label: 'News' },
            ] as { id: MomentsSubTab; label: string }[]
          ).map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold transition ${
                  active
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white shadow'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowMyMoments(true)}
            className="px-2.5 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 hover:border-[#00E5FF]/50 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Film size={13} className="text-[#00E5FF]" />
            <span className="hidden xs:inline">My Moments</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenCreateModal(null)}
            className="w-8 h-8 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white flex items-center justify-center shadow-lg shadow-[#7C3AED]/30 hover:opacity-95"
            aria-label="Create Moment"
          >
            <Plus size={17} />
          </button>
        </div>
      </div>

      {/* Main Subview Content */}
      {subTab === 'forYou' && (
        <div
          ref={setFeedContainerEl}
          className="flow-immersive-dark h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar overscroll-y-contain bg-black"
        >
          {loading ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-[#00E5FF] border-t-transparent animate-spin" />
              <p className="text-xs text-zinc-400 font-semibold">Loading Moments...</p>
            </div>
          ) : visibleMoments.length === 0 ? (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center space-y-4 bg-[#0A0A0A]">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#7C3AED]/25 to-[#00E5FF]/20 border border-white/10 flex items-center justify-center text-[#00E5FF]">
                <Film size={28} />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-lg">No Moments yet - Be the first to post</h3>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  Record up to a 15-minute video or upload a photo to start the FLOW feed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenCreateModal(null)}
                className="px-5 min-h-[44px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-extrabold text-sm flex items-center gap-2 shadow-lg shadow-[#7C3AED]/30"
              >
                <Plus size={18} />
                Create Moment
              </button>
            </div>
          ) : (
            visibleMoments.map((m, idx) => {
              const isVideo = Boolean(m.video_url);
              const mediaUrl = m.video_url || m.media_url || m.image_url;
              const isNearViewport = Math.abs(idx - activeSlideIndex) <= 1;
              const isLiked = likedIds.has(m.id);
              const isSaved = savedIds.has(m.id);
              const isOwn = m.user_id === profile?.id;
              const isFollowing = followingIds.has(m.user_id);
              const isPaused = Boolean(pausedMap[m.id]);
              const cCount = commentCounts[m.id] || 0;
              const bursts = heartBursts[m.id] || [];
              const creatorName = getDisplayName(m.author);
              const creatorHandle = getUsernameHandle(m.author);
              const parsedTags =
                Array.isArray(m.hashtags) && m.hashtags.length > 0
                  ? m.hashtags
                  : (`${m.caption || ''} ${m.text || ''}`.match(/#([a-zA-Z0-9_]+)/g) || []).map(
                      (t) => t.slice(1)
                    );

              return (
                <section
                  key={m.id}
                  data-vp-video-id={isVideo ? m.id : undefined}
                  ref={(el) => {
                    slideRefs.current[m.id] = el;
                    if (isVideo) registerItemRef(m.id)(el);
                  }}
                  onClick={(e) => handleStageTap(m, e)}
                  className="snap-start snap-always h-full w-full relative overflow-hidden bg-black select-none cursor-pointer"
                >
                  {/* Video / Photo / Text Background — Lazy load video only for active +/- 1 slide */}
                  {isVideo && mediaUrl ? (
                    isNearViewport ? (
                      <video
                        ref={registerVideoRef(m.id)}
                        src={mediaUrl}
                        loop
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#0A0A0A] flex items-center justify-center">
                        <Film size={40} className="text-[#7C3AED]/40" />
                      </div>
                    )
                  ) : mediaUrl ? (
                    <img
                      src={mediaUrl}
                      alt={m.caption || 'Moment'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#7C3AED]/45 via-[#0A0A0A] to-[#00E5FF]/30 flex items-center justify-center p-8 text-center">
                      <p className="text-2xl font-extrabold leading-snug max-w-md">
                        {m.caption || m.text}
                      </p>
                    </div>
                  )}

                  {/* Readability gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/35 pointer-events-none" />

                  {/* Double-tap heart burst animations */}
                  {bursts.map((b) => (
                    <div
                      key={b.id}
                      style={{ left: b.x - 42, top: b.y - 42 }}
                      className="absolute z-30 pointer-events-none animate-ping"
                    >
                      <Heart
                        size={84}
                        className="text-pink-500 fill-pink-500 drop-shadow-[0_0_20px_rgba(236,72,153,0.9)]"
                      />
                    </div>
                  ))}

                  {/* Center Pause indicator when user paused video */}
                  {isVideo && isPaused && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                      <div className="w-16 h-16 rounded-full bg-black/55 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                        <Play size={30} fill="white" />
                      </div>
                    </div>
                  )}

                  {/* Right Action Rail (TikTok Style) */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-3 bottom-6 z-20 flex flex-col items-center gap-4"
                  >
                    {/* Creator Avatar + Verified Badge + Follow badge */}
                    <div className="relative mb-1">
                      <ProfileAvatar
                        profile={m.author}
                        fallbackName={creatorName}
                        sizeClass="w-12 h-12 text-sm"
                        roundedClass="rounded-full"
                        ringClass="ring-2 ring-[#7C3AED]"
                        badgeSize={14}
                      />
                      {!isOwn && (
                        <button
                          type="button"
                          onClick={() => toggleFollow(m.user_id)}
                          className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center border border-[#0A0A0A] shadow ${
                            isFollowing
                              ? 'bg-[#00E5FF] text-black'
                              : 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
                          }`}
                          aria-label={isFollowing ? 'Following' : 'Follow creator'}
                        >
                          {isFollowing ? <Check size={11} /> : <Plus size={11} />}
                        </button>
                      )}
                    </div>

                    {/* Like */}
                    <button
                      type="button"
                      onClick={() => toggleLike(m.id)}
                      className="flex flex-col items-center gap-0.5 text-white"
                    >
                      <div
                        className={`w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center transition ${
                          isLiked ? 'text-pink-500 scale-110' : 'text-white hover:bg-black/65'
                        }`}
                      >
                        <Heart size={24} className={isLiked ? 'fill-pink-500' : ''} />
                      </div>
                      <span className="text-[11px] font-bold drop-shadow">
                        {formatCompactCount(m.likes_count || 0)}
                      </span>
                    </button>

                    {/* Comment */}
                    <button
                      type="button"
                      onClick={() => openCommentsDrawer(m)}
                      className="flex flex-col items-center gap-0.5 text-white"
                    >
                      <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md hover:bg-black/65 flex items-center justify-center">
                        <MessageCircle size={23} />
                      </div>
                      <span className="text-[11px] font-bold drop-shadow">
                        {formatCompactCount(cCount)}
                      </span>
                    </button>

                    {/* Save */}
                    <button
                      type="button"
                      onClick={() => toggleSave(m.id)}
                      className="flex flex-col items-center gap-0.5 text-white"
                    >
                      <div
                        className={`w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center ${
                          isSaved ? 'text-[#00E5FF]' : 'text-white hover:bg-black/65'
                        }`}
                      >
                        <Bookmark size={22} className={isSaved ? 'fill-[#00E5FF]' : ''} />
                      </div>
                      <span className="text-[10px] font-bold drop-shadow">
                        {isSaved ? 'Saved' : 'Save'}
                      </span>
                    </button>

                    {/* Share */}
                    <button
                      type="button"
                      onClick={() => openShareDrawer(m)}
                      className="flex flex-col items-center gap-0.5 text-white"
                    >
                      <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md hover:bg-black/65 flex items-center justify-center">
                        <Share2 size={22} />
                      </div>
                      <span className="text-[10px] font-bold drop-shadow">Share</span>
                    </button>

                    {/* Sound Mute / Unmute */}
                    {isVideo && (
                      <button
                        type="button"
                        onClick={() => setMuted((prev) => !prev)}
                        className="w-10 h-10 rounded-full bg-black/55 border border-white/15 flex items-center justify-center text-white"
                        aria-label={muted ? 'Unmute video' : 'Mute video'}
                      >
                        {muted ? <VolumeX size={18} /> : <Volume2 size={18} className="text-[#00E5FF]" />}
                      </button>
                    )}
                  </div>

                  {/* Bottom Left Overlay: Creator + Caption + Hashtags + Music */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-4 right-20 bottom-5 z-20 space-y-2"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-sm text-white drop-shadow">
                        {creatorName}
                      </span>
                      <VerifiedNameBadge isVerified={m.author?.is_verified} size={14} />
                      {creatorHandle && (
                        <span className="text-xs font-semibold text-[#00E5FF] drop-shadow">
                          {creatorHandle}
                        </span>
                      )}
                      {isVideo && (m.duration || 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-black/55 border border-white/15 text-[10px] font-bold text-white tabular-nums">
                          {formatDuration(m.duration)}
                        </span>
                      )}
                      {!isOwn && !isFollowing && (
                        <button
                          type="button"
                          onClick={() => toggleFollow(m.user_id)}
                          className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-[10px] font-extrabold flex items-center gap-1"
                        >
                          <UserPlus size={10} /> Follow
                        </button>
                      )}
                    </div>

                    {(m.caption || m.text) && (
                      <p className="text-xs sm:text-sm text-zinc-100 leading-snug line-clamp-3 drop-shadow">
                        {m.caption || m.text}
                      </p>
                    )}

                    {parsedTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {parsedTags.slice(0, 6).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSearchSeed(`#${tag}`);
                              setSubTab('search');
                            }}
                            className="text-xs font-bold text-[#00E5FF] hover:underline"
                          >
                            #{tag.replace(/^#/, '')}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#7C3AED] to-[#00E5FF] flex items-center justify-center animate-spin shrink-0">
                          <Music2 size={12} className="text-white" />
                        </div>
                        <span className="text-xs font-semibold text-white/95 truncate drop-shadow">
                          {m.music_name || 'Original Sound'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setReportTarget({
                            contentType: 'moment',
                            contentId: m.id,
                            reportedUserId: m.user_id,
                            contentText: m.caption || m.text,
                          })
                        }
                        className="text-[11px] text-zinc-300/80 hover:text-white flex items-center gap-1 shrink-0"
                      >
                        <Flag size={11} />
                      </button>
                    </div>
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {subTab === 'search' && (
        <SearchMomentsView
          moments={visibleMoments}
          initialQuery={searchSeed}
          followingIds={followingIds}
          onToggleFollow={toggleFollow}
          onSelectMoment={jumpToMomentInFeed}
        />
      )}

      {subTab === 'news' && <NewsMomentsView />}

      {/* My Moments Space */}
      {showMyMoments && (
        <MyMomentsView
          myMoments={myMoments}
          commentCounts={commentCounts}
          onBack={() => setShowMyMoments(false)}
          onOpenCreate={(draft) => handleOpenCreateModal(draft)}
          onDeleted={(id) => setMoments((prev) => prev.filter((m) => m.id !== id))}
          onPinnedToggled={(id, nextPinned) =>
            setMoments((prev) =>
              prev.map((m) => (m.id === id ? { ...m, is_pinned: nextPinned } : m))
            )
          }
        />
      )}

      {/* Create / Record Moment Modal */}
      {showCreateModal && (
        <CreateMomentModal
          initialDraft={editingDraft}
          onClose={() => {
            setShowCreateModal(false);
            setEditingDraft(null);
          }}
          onPublished={(newMoment) => {
            setMoments((prev) => [newMoment, ...prev.filter((m) => m.id !== newMoment.id)]);
            setSubTab('forYou');
          }}
          onDraftSaved={() => {
            loadAllMomentsData();
          }}
        />
      )}

      {/* Moment Comments Drawer */}
      {commentMoment && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setCommentMoment(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[80vh] bg-[#12121A] border border-white/10 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <p className="font-extrabold text-sm">
                Comments ({commentCounts[commentMoment.id] || comments.length})
              </p>
              <button
                type="button"
                onClick={() => setCommentMoment(null)}
                className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {commentsLoading ? (
                <p className="text-xs text-zinc-400 text-center py-6">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-8">
                  No comments yet. Say something nice!
                </p>
              ) : (
                comments.map((c) => {
                  const commentUserName = getDisplayName(c.user);
                  return (
                    <div key={c.id} className="flex items-start gap-2.5">
                      <ProfileAvatar
                        profile={c.user}
                        fallbackName={commentUserName}
                        sizeClass="w-8 h-8 text-xs"
                        roundedClass="rounded-full"
                        badgeSize={11}
                      />
                      <div className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#00E5FF] inline-flex items-center gap-1">
                            <span>{commentUserName}</span>
                            <VerifiedNameBadge isVerified={c.user?.is_verified} size={11} />
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-500">
                              {new Date(c.created_at).toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                            {c.user_id === profile?.id && (
                              <button
                                type="button"
                                onClick={() => deleteOwnComment(c.id)}
                                className="text-zinc-500 hover:text-red-400"
                                aria-label="Delete comment"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        {c.sticker_url && (
                          <img
                            src={c.sticker_url}
                            alt="Sticker"
                            className="w-20 h-20 object-contain mt-1 rounded-xl"
                          />
                        )}
                        {c.voice_url ? (
                          <div className="mt-1.5">
                            <VoiceNotePlayer
                              url={c.voice_url}
                              duration={c.duration}
                              isMine={c.user_id === profile?.id}
                              compact
                            />
                          </div>
                        ) : (
                          c.text && (
                            <p className="text-xs text-zinc-200 mt-1 break-words">{c.text}</p>
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {showStickerPicker && (
              <div className="border-t border-white/10 max-h-60 overflow-y-auto">
                <StickerPicker
                  onClose={() => setShowStickerPicker(false)}
                  onSelectSticker={(url) => submitMomentComment('', url)}
                />
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitMomentComment(commentText);
              }}
              className="p-3 border-t border-white/10 bg-[#0A0A0A] flex items-center gap-1.5"
            >
              <WeChatHoldToRecordButton
                compact
                iconColor="#00E5FF"
                onSendVoice={handleVoiceCommentSend}
              />
              <button
                type="button"
                onClick={() => setShowStickerPicker((s) => !s)}
                className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-[#00E5FF] shrink-0"
                aria-label="Sticker"
              >
                <Sticker size={17} />
              </button>
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 min-w-0 px-3 min-h-[40px] rounded-2xl bg-white/[0.06] border border-white/10 text-xs text-white outline-none focus:border-[#00E5FF]"
              />
              <button
                type="button"
                onClick={() =>
                  openKeyboard({
                    id: 'moment-comment',
                    label: 'Moment Comment',
                    placeholder: 'Write a comment...',
                    text: commentText,
                    sendLabel: 'Post',
                    allowEmptySubmit: false,
                    onChange: setCommentText,
                    onSubmit: (finalText) => submitMomentComment(finalText),
                  })
                }
                className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-zinc-300 shrink-0"
                title="FLOW Keyboard"
                aria-label="FLOW Keyboard"
              >
                <Keyboard size={16} />
              </button>
              <button
                type="submit"
                disabled={!commentText.trim()}
                className="w-10 h-10 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white flex items-center justify-center disabled:opacity-50 shrink-0"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Share Moment Sheet */}
      {shareMoment && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setShareMoment(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[75vh] bg-[#12121A] border border-white/10 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <p className="font-bold text-sm">Share Moment</p>
              <button
                type="button"
                onClick={() => setShareMoment(null)}
                className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              <button
                type="button"
                onClick={async () => {
                  const link =
                    shareMoment.video_url ||
                    shareMoment.media_url ||
                    shareMoment.image_url ||
                    window.location.href;
                  const ok = await copyToClipboard(link);
                  if (ok) showToast('Moment link copied!', 'success');
                  setShareMoment(null);
                }}
                className="w-full p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 flex items-center gap-3 text-xs font-bold"
              >
                <Copy size={16} className="text-[#00E5FF]" />
                <span>Copy Link</span>
              </button>

              {shareGroups.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Users size={12} /> Send to Chatroom
                  </p>
                  <div className="space-y-1.5">
                    {shareGroups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        disabled={sendingShareTo === `grp_${g.id}`}
                        onClick={() => shareMomentToGroup(g)}
                        className="w-full p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between text-xs font-semibold"
                      >
                        <span className="truncate">{g.name}</span>
                        <span className="text-[#00E5FF]">Send</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {shareFriends.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <UserCheck size={12} /> Send to Friend
                  </p>
                  <div className="space-y-1.5">
                    {shareFriends.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        disabled={sendingShareTo === `dm_${f.id}`}
                        onClick={() => shareMomentToFriend(f)}
                        className="w-full p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between text-xs font-semibold"
                      >
                        <span className="truncate">
                          {f.full_name || f.name} (@{f.username})
                        </span>
                        <span className="text-[#00E5FF]">Send</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
