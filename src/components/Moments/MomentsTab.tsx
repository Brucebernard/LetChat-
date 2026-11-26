import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  UserPlus,
  UserCheck,
  Sticker,
  MoreVertical,
  X,
  Image as ImageIcon,
  Film,
  Flag,
  ArrowLeft,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useViewportVideoFeed } from '../../hooks/useViewportVideoFeed';
import { compressImage, compressVideoTo480p, copyToClipboard } from '../../utils/mediaUtils';
import FootballFeed from './FootballFeed';
import MultiSourceNewsSection from './MultiSourceNewsSection';
import StickerPicker from '../Stickers/StickerPicker';
import ReportModal from '../Modals/ReportModal';
import { FootballPost, MomentComment, MomentItem, ReportTarget } from '../../types';

const MOMENT_TABS = ['All', 'Videos', 'Entertainment', 'Music', 'News', 'Funny', 'Friends'];
const CREATE_CATEGORIES = ['General', 'Music', 'News', 'Entertainment', 'Funny', 'Football'];

interface MomentsTabProps {
  onOpenConnectSources: () => void;
  onDetailViewChange?: (isDetail: boolean) => void;
}

export default function MomentsTab({ onOpenConnectSources, onDetailViewChange }: MomentsTabProps) {
  const { profile } = useAuth();
  const { lowDataMode } = useSettings();
  const { showToast } = useToast();

  const [mainToggle, setMainToggle] = useState<'Moments' | 'Football'>('Moments');
  const [subTab, setSubTab] = useState('All');
  const [search, setSearch] = useState('');

  const [moments, setMoments] = useState<MomentItem[]>([]);
  const [likedSet, setLikedSet] = useState<Set<string>>(new Set());
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [commentsByMoment, setCommentsByMoment] = useState<Record<string, MomentComment[]>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null);
  const [detailMomentId, setDetailMomentId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showStickerReply, setShowStickerReply] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [momentVideoMuted, setMomentVideoMuted] = useState(true);

  useEffect(() => {
    onDetailViewChange?.(Boolean(detailMomentId || openCommentsId || showCreate || reportTarget));
  }, [detailMomentId, openCommentsId, showCreate, reportTarget]);

  const loadMoments = async () => {
    if (!profile) return;
    const [
      { data: mData },
      { data: likes },
      { data: saves },
      { data: follows },
      { data: friends },
      { data: comms },
    ] = await Promise.all([
      supabase
        .from('moments')
        .select('*, author:profiles!moments_user_id_fkey(id, username, name, avatar_url)')
        .neq('category', 'Football')
        .order('created_at', { ascending: false }),
      supabase.from('moment_likes').select('moment_id').eq('user_id', profile.id),
      supabase.from('moment_saves').select('moment_id').eq('user_id', profile.id),
      supabase.from('follows').select('following_id').eq('follower_id', profile.id),
      supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', profile.id)
        .eq('status', 'accepted'),
      supabase
        .from('moment_comments')
        .select('*, user:profiles!moment_comments_user_id_fkey(id, username, name)')
        .order('created_at', { ascending: true }),
    ]);

    setMoments((mData || []) as MomentItem[]);
    setLikedSet(new Set((likes || []).map((l) => l.moment_id)));
    setSavedSet(new Set((saves || []).map((s) => s.moment_id)));
    setFollowingSet(new Set((follows || []).map((f) => f.following_id)));
    setFriendIds(new Set((friends || []).map((f) => f.friend_id)));

    const cMap: Record<string, MomentComment[]> = {};
    for (const c of (comms || []) as MomentComment[]) {
      if (!cMap[c.moment_id]) cMap[c.moment_id] = [];
      cMap[c.moment_id].push(c);
    }
    setCommentsByMoment(cMap);
  };

  useEffect(() => {
    loadMoments();
  }, [profile]);

  const toggleLike = async (moment: MomentItem) => {
    if (!profile) return;
    const liked = likedSet.has(moment.id);
    if (liked) {
      await supabase
        .from('moment_likes')
        .delete()
        .eq('moment_id', moment.id)
        .eq('user_id', profile.id);
      await supabase
        .from('moments')
        .update({ likes_count: Math.max(0, (moment.likes_count || 1) - 1) })
        .eq('id', moment.id);
    } else {
      await supabase.from('moment_likes').insert({ moment_id: moment.id, user_id: profile.id });
      await supabase
        .from('moments')
        .update({ likes_count: (moment.likes_count || 0) + 1 })
        .eq('id', moment.id);
    }
    loadMoments();
  };

  const toggleSave = async (momentId: string) => {
    if (!profile) return;
    if (savedSet.has(momentId)) {
      await supabase
        .from('moment_saves')
        .delete()
        .eq('moment_id', momentId)
        .eq('user_id', profile.id);
    } else {
      await supabase.from('moment_saves').insert({ moment_id: momentId, user_id: profile.id });
    }
    loadMoments();
  };

  const toggleFollow = async (targetUserId: string) => {
    if (!profile) return;
    if (followingSet.has(targetUserId)) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', profile.id)
        .eq('following_id', targetUserId);
    } else {
      await supabase
        .from('follows')
        .insert({ follower_id: profile.id, following_id: targetUserId });
    }
    loadMoments();
  };

  const postComment = async (momentId: string, stickerUrl: string | null = null) => {
    if (!profile) return;
    if (!stickerUrl && !commentText.trim()) return;
    await supabase.from('moment_comments').insert({
      moment_id: momentId,
      user_id: profile.id,
      text: stickerUrl ? '' : commentText.trim(),
      sticker_url: stickerUrl,
    });
    setCommentText('');
    setShowStickerReply(false);
    loadMoments();
  };

  const shareFootballPostToMoments = async (fbPost: FootballPost) => {
    if (!profile) return;
    await supabase.from('moments').insert({
      user_id: profile.id,
      text: `${fbPost.title}${fbPost.originalUrl ? `\n${fbPost.originalUrl}` : ''}`,
      image_url: fbPost.thumbnail || null,
      category: 'Football',
    });
    showToast('Shared to Football Moments!', 'success');
  };

  const filteredMoments = moments.filter((m) => {
    const q = search.trim().toLowerCase();
    if (q) {
      return (
        m.text?.toLowerCase().includes(q) ||
        m.category?.toLowerCase().includes(q) ||
        m.author?.name?.toLowerCase().includes(q) ||
        m.author?.username?.toLowerCase().includes(q)
      );
    }
    if (subTab === 'All') return true;
    if (subTab === 'Videos') return Boolean(m.video_url);
    if (subTab === 'Friends') return friendIds.has(m.user_id) || m.user_id === profile?.id;
    return m.category === subTab;
  });

  const communityVideoIds = useMemo(
    () => filteredMoments.filter((m) => Boolean(m.video_url)).map((m) => m.id),
    [filteredMoments]
  );

  const { registerItemRef, registerVideoRef } = useViewportVideoFeed({
    videoIds: communityVideoIds,
    minRatio: 0.5,
    disabled: Boolean(mainToggle !== 'Moments' || detailMomentId),
    muted: momentVideoMuted,
    onFallbackMute: () => setMomentVideoMuted(true),
    feedKey: 'community-moments-feed',
  });

  const detailMoment = detailMomentId
    ? moments.find((m) => m.id === detailMomentId) || null
    : null;

  if (detailMoment) {
    const isLiked = likedSet.has(detailMoment.id);
    const isSaved = savedSet.has(detailMoment.id);
    const comms = commentsByMoment[detailMoment.id] || [];
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black text-black dark:text-white">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
          <button
            type="button"
            onClick={() => {
              setDetailMomentId(null);
              setShowStickerReply(false);
            }}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
            aria-label="Back to Moments"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="font-bold text-base truncate">Moment</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl w-full mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-[#0A3D62] text-white flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
              {detailMoment.author?.avatar_url ? (
                <img
                  src={detailMoment.author.avatar_url}
                  alt={detailMoment.author.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                (detailMoment.author?.name?.[0] || '?').toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm">
                <p className="font-bold truncate">{detailMoment.author?.name}</p>
                <span aria-hidden="true">·</span>
                <span className="font-bold text-[#1AA7B8] text-xs">#{detailMoment.category}</span>
              </div>
              <p className="text-[11px] text-slate-400 tabular-nums">
                @{detailMoment.author?.username} ·{' '}
                {new Date(detailMoment.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          {detailMoment.text && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{detailMoment.text}</p>
          )}
          {detailMoment.image_url && (
            <img
              src={detailMoment.image_url}
              alt=""
              className="w-full rounded-2xl max-h-[65vh] object-contain bg-black/5"
            />
          )}
          {detailMoment.video_url && (
            <div className="relative rounded-2xl overflow-hidden bg-black">
              <video
                src={detailMoment.video_url}
                controls
                autoPlay
                loop
                muted={momentVideoMuted}
                playsInline
                className="w-full max-h-[65vh] bg-black"
              />
              <button
                type="button"
                onClick={() => setMomentVideoMuted((v) => !v)}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/65 text-white hover:bg-black transition"
                aria-label={momentVideoMuted ? 'Unmute video' : 'Mute video'}
              >
                {momentVideoMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
          )}

          <div className="py-2.5 flex items-center justify-between border-y border-slate-100 dark:border-zinc-900 text-xs">
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => toggleLike(detailMoment)}
                className={`flex items-center gap-1 tabular-nums ${
                  isLiked ? 'text-red-500 font-bold' : ''
                }`}
              >
                <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />{' '}
                {detailMoment.likes_count || 0}
              </button>
              <span className="flex items-center gap-1 tabular-nums">
                <MessageCircle size={16} /> {comms.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => toggleSave(detailMoment.id)}
              className={isSaved ? 'text-[#1AA7B8]' : ''}
              title="Save"
            >
              <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="space-y-2.5 pb-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Comments ({comms.length})
            </p>
            {comms.length === 0 ? (
              <p className="text-xs text-slate-400">No comments yet. Be the first to reply!</p>
            ) : (
              comms.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950"
                >
                  <div>
                    <span className="font-bold mr-1.5">{c.user?.name}:</span>
                    {c.sticker_url ? (
                      <img
                        src={c.sticker_url}
                        alt="Sticker reply"
                        referrerPolicy="no-referrer"
                        style={{ width: 96, height: 96 }}
                        className="inline-block object-contain mt-1"
                      />
                    ) : (
                      <span>{c.text}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
          {showStickerReply && (
            <StickerPicker
              onClose={() => setShowStickerReply(false)}
              onSelectSticker={(url) => postComment(detailMoment.id, url)}
            />
          )}
          <div className="p-2.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowStickerReply(!showStickerReply)}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-900 text-[#1AA7B8]"
              title="Reply with Sticker"
            >
              <Sticker size={18} />
            </button>
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 px-3 min-h-[40px] rounded-xl bg-slate-100 dark:bg-zinc-900 text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => postComment(detailMoment.id)}
              className="px-4 min-h-[40px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold"
            >
              Reply
            </button>
          </div>
        </div>

        <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4 space-y-3 max-w-5xl mx-auto">
      {/* Top 2 Big Toggles: [Moments] | [Football] */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900">
        <button
          onClick={() => setMainToggle('Moments')}
          className={`min-h-[44px] rounded-xl font-extrabold text-sm transition ${
            mainToggle === 'Moments'
              ? 'bg-[#0A3D62] text-white shadow'
              : 'text-slate-600 dark:text-zinc-400'
          }`}
        >
          Moments
        </button>
        <button
          onClick={() => setMainToggle('Football')}
          className={`min-h-[44px] rounded-xl font-extrabold text-sm transition ${
            mainToggle === 'Football'
              ? 'bg-[#1AA7B8] text-white shadow'
              : 'text-slate-600 dark:text-zinc-400'
          }`}
        >
          Football
        </button>
      </div>

      {mainToggle === 'Football' ? (
        <FootballFeed
          onOpenConnectSources={onOpenConnectSources}
          onShareToMoment={shareFootballPostToMoments}
        />
      ) : (
        <>
          {/* Search + Create Moment */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-slate-100 dark:bg-zinc-900 rounded-xl px-3 min-h-[42px]">
              <Search size={15} className="text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search all moments..."
                className="bg-transparent text-xs outline-none w-full"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-3.5 min-h-[42px] rounded-xl bg-[#1AA7B8] text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap"
            >
              <Plus size={15} /> Create Moment
            </button>
          </div>

          {/* Sub-Tabs */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {MOMENT_TABS.map((t) => (
              <button
                key={t}
                onClick={() => setSubTab(t)}
                className={`px-3.5 min-h-[36px] rounded-xl text-xs font-bold shrink-0 transition whitespace-nowrap ${
                  subTab === t
                    ? 'bg-[#0A3D62] text-white'
                    : 'bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Multi-Source Social News Feed (TikTok, Instagram, X, Facebook, YouTube, News) */}
          {subTab !== 'Friends' && (
            <MultiSourceNewsSection
              activeCategory={subTab}
              searchQuery={search}
              onOpenConnectSources={onOpenConnectSources}
              onReposted={loadMoments}
            />
          )}

          {/* Community Moments Feed */}
          {filteredMoments.length === 0 ? (
            <div className="py-8 text-center space-y-2.5">
              <p className="text-xs font-semibold text-slate-400">
                {subTab === 'Friends'
                  ? 'No moments from friends yet.'
                  : `No community posts in ${subTab} yet — be the first to post or repost!`}
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 min-h-[40px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold"
              >
                Share First Moment
              </button>
            </div>
          ) : (
            <div className="space-y-3 pb-6">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 pt-1">
                Community Moments
              </h3>
              {filteredMoments.map((m) => {
                const isLiked = likedSet.has(m.id);
                const isSaved = savedSet.has(m.id);
                const isFollowing = followingSet.has(m.user_id);
                const comms = commentsByMoment[m.id] || [];

                return (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden"
                  >
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#0A3D62] text-white flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
                          {m.author?.avatar_url ? (
                            <img
                              src={m.author.avatar_url}
                              alt={m.author.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            (m.author?.name?.[0] || '?').toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs">
                            <p className="font-bold truncate">{m.author?.name}</p>
                            <span aria-hidden="true">·</span>
                            <span className="font-bold text-[#1AA7B8]">#{m.category}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            @{m.author?.username} · {new Date(m.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.user_id !== profile?.id && (
                          <button
                            onClick={() => toggleFollow(m.user_id)}
                            className={`px-3 min-h-[34px] rounded-xl text-[11px] font-bold flex items-center gap-1 whitespace-nowrap ${
                              isFollowing
                                ? 'bg-slate-100 dark:bg-zinc-900'
                                : 'bg-[#0A3D62] text-white'
                            }`}
                          >
                            {isFollowing ? <UserCheck size={12} /> : <UserPlus size={12} />}
                            {isFollowing ? 'Following' : 'Follow'}
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setReportTarget({
                              contentType: 'moment',
                              contentId: m.id,
                              reportedUserId: m.user_id,
                              contentText: m.text,
                            })
                          }
                          className="p-1.5 text-slate-400 hover:text-red-500"
                          title="Report Moment"
                        >
                          <MoreVertical size={15} />
                        </button>
                      </div>
                    </div>

                    {m.text && (
                      <button
                        type="button"
                        onClick={() => setDetailMomentId(m.id)}
                        className="block w-full text-left px-3 pb-2.5 text-sm whitespace-pre-wrap"
                      >
                        {m.text}
                      </button>
                    )}

                    {m.image_url && (
                      <button
                        type="button"
                        onClick={() => setDetailMomentId(m.id)}
                        className="block w-full"
                      >
                        <img
                          src={m.image_url}
                          alt=""
                          className="w-full max-h-80 object-cover"
                          loading="lazy"
                        />
                      </button>
                    )}

                    {m.video_url && (
                      <div
                        data-vp-video-id={m.id}
                        ref={registerItemRef(m.id)}
                        className="relative bg-black"
                      >
                        <video
                          ref={registerVideoRef(m.id)}
                          src={m.video_url}
                          controls
                          loop
                          muted={momentVideoMuted}
                          playsInline
                          preload="metadata"
                          className="w-full max-h-96 object-contain bg-black"
                        />
                        <button
                          type="button"
                          onClick={() => setMomentVideoMuted((prev) => !prev)}
                          className="absolute top-2.5 right-2.5 p-2 rounded-full bg-black/65 text-white hover:bg-black transition"
                          aria-label={momentVideoMuted ? 'Unmute video' : 'Mute video'}
                        >
                          {momentVideoMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                        </button>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="px-3 py-2.5 flex items-center justify-between border-t border-slate-100 dark:border-zinc-900 text-xs">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => toggleLike(m)}
                          className={`flex items-center gap-1 tabular-nums ${
                            isLiked ? 'text-red-500 font-bold' : ''
                          }`}
                        >
                          <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />{' '}
                          {m.likes_count || 0}
                        </button>
                        <button
                          onClick={() =>
                            setOpenCommentsId(openCommentsId === m.id ? null : m.id)
                          }
                          className="flex items-center gap-1 tabular-nums"
                        >
                          <MessageCircle size={16} /> {comms.length}
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await copyToClipboard(
                              `${m.text || 'Check out this Moment on LetChat'}`
                            );
                            showToast(
                              ok ? 'Copied Moment text to share!' : 'Unable to copy Moment text.',
                              ok ? 'success' : 'error'
                            );
                          }}
                          title="Share"
                        >
                          <Share2 size={16} />
                        </button>
                      </div>
                      <button
                        onClick={() => toggleSave(m.id)}
                        className={isSaved ? 'text-[#1AA7B8]' : ''}
                        title="Save"
                      >
                        <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
                      </button>
                    </div>

                    {/* Comments & Sticker Replies */}
                    {openCommentsId === m.id && (
                      <div className="border-t border-slate-100 dark:border-zinc-900 p-3 space-y-2 bg-slate-50 dark:bg-black">
                        {comms.map((c) => (
                          <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
                            <div>
                              <span className="font-bold mr-1.5">{c.user?.name}:</span>
                              {c.sticker_url ? (
                                <img
                                  src={c.sticker_url}
                                  alt="Sticker reply"
                                  referrerPolicy="no-referrer"
                                  style={{ width: 96, height: 96 }}
                                  className="inline-block object-contain mt-1"
                                />
                              ) : (
                                <span>{c.text}</span>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                setReportTarget({
                                  contentType: 'comment',
                                  contentId: c.id,
                                  reportedUserId: c.user_id,
                                  contentText: c.text || 'sticker',
                                })
                              }
                              className="text-slate-400 hover:text-red-500 p-1"
                              title="Report Comment"
                            >
                              <Flag size={12} />
                            </button>
                          </div>
                        ))}

                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowStickerReply(!showStickerReply)}
                            className="p-2 rounded-xl bg-slate-200 dark:bg-zinc-900 text-[#1AA7B8]"
                            title="Reply with Sticker"
                          >
                            <Sticker size={16} />
                          </button>
                          <input
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Write a comment..."
                            className="flex-1 px-3 min-h-[38px] rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs outline-none"
                          />
                          <button
                            onClick={() => postComment(m.id)}
                            className="px-3 min-h-[38px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold"
                          >
                            Reply
                          </button>
                        </div>

                        {showStickerReply && (
                          <StickerPicker
                            onClose={() => setShowStickerReply(false)}
                            onSelectSticker={(url) => postComment(m.id, url)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateMomentModal
          onClose={() => setShowCreate(false)}
          onCreated={(pickedCategory) => {
            setShowCreate(false);
            if (pickedCategory === 'Football') {
              setMainToggle('Football');
            } else {
              loadMoments();
            }
          }}
        />
      )}

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}

function CreateMomentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (cat: string) => void;
}) {
  const { profile } = useAuth();
  const { lowDataMode } = useSettings();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [category, setCategory] = useState('General');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [posting, setPosting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!text.trim() && !mediaFile) return;
    setPosting(true);
    try {
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;

      if (mediaFile && mediaType === 'image') {
        const compressed = await compressImage(mediaFile, lowDataMode);
        imageUrl = await uploadWithProgress(
          'letchat-media',
          `moments/${profile.id}/${Date.now()}_${compressed.name}`,
          compressed
        );
      } else if (mediaFile && mediaType === 'video') {
        const finalVid = lowDataMode ? await compressVideoTo480p(mediaFile) : mediaFile;
        videoUrl = await uploadWithProgress(
          'letchat-media',
          `moments/${profile.id}/${Date.now()}_${finalVid.name}`,
          finalVid
        );
      }

      await supabase.from('moments').insert({
        user_id: profile.id,
        text: text.trim(),
        category,
        image_url: imageUrl,
        video_url: videoUrl,
      });

      showToast(
        category === 'Football' ? 'Posted to Football feed!' : 'Moment published!',
        'success'
      );
      onCreated(category);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to post moment', 'error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 p-4 space-y-3 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Create Moment</h3>
          <button type="button" onClick={onClose} className="p-1">
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="text-xs font-bold block mb-1.5">Pick Category (Required)</label>
          <div className="grid grid-cols-3 gap-1.5">
            {CREATE_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setCategory(cat)}
                className={`min-h-[38px] rounded-xl text-xs font-bold border transition ${
                  category === cat
                    ? 'bg-[#0A3D62] text-white border-[#0A3D62]'
                    : 'border-slate-200 dark:border-zinc-800'
                }`}
              >
                #{cat}
              </button>
            ))}
          </div>
          {category === 'Football' && (
            <p className="text-[11px] text-[#1AA7B8] mt-1 font-medium">
              Football moments appear in the Football feed, not Moments All.
            </p>
          )}
        </div>

        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's happening?"
          className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent p-3 text-sm outline-none focus:border-[#1AA7B8]"
        />

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold cursor-pointer">
            <ImageIcon size={15} className="text-emerald-500" /> Photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                setMediaFile(e.target.files?.[0] || null);
                setMediaType('image');
              }}
            />
          </label>
          <label className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold cursor-pointer">
            <Film size={15} className="text-purple-500" /> Video
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                setMediaFile(e.target.files?.[0] || null);
                setMediaType('video');
              }}
            />
          </label>
          {mediaFile && (
            <span className="text-[11px] text-[#1AA7B8] truncate">{mediaFile.name}</span>
          )}
        </div>

        <button
          type="submit"
          disabled={posting}
          className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-[#0A3D62] to-[#1AA7B8] text-white font-bold text-sm disabled:opacity-50"
        >
          {posting ? 'Posting...' : 'Publish Moment'}
        </button>
      </form>
    </div>
  );
}
