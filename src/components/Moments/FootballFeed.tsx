import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  ExternalLink,
  Heart,
  MessageSquare,
  Share2,
  Bookmark,
  Play,
  Volume2,
  VolumeX,
  Maximize,
  Plug,
  RefreshCw,
  Flag,
  X,
} from 'lucide-react';
import { fetchAllFootballFeeds } from '../../utils/footballFetcher';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import { getDmChatId, insertCompatibleMessage } from '../../utils/chatMessageCodec';
import { isSafeHttpUrl } from '../../utils/mediaUtils';
import ReportModal from '../Modals/ReportModal';
import { FootballPost, MomentItem, Profile, ReportTarget } from '../../types';

const FILTERS = ['All', 'News', 'Videos', 'Transfers', 'Scores', 'Highlights', 'Videos Only'];
const QUICK_TEAMS = [
  'Real Madrid',
  'Man City',
  'Ronaldo',
  'Messi',
  'Arsenal',
  'Chelsea',
  'Barcelona',
  'Ghana Black Stars',
];

function PlatformBadge({ platform }: { platform: FootballPost['platform'] }) {
  const styles: Record<FootballPost['platform'], string> = {
    YouTube: 'text-red-600 dark:text-red-400',
    Facebook: 'text-blue-600 dark:text-blue-400',
    Instagram: 'text-pink-600 dark:text-pink-400',
    X: 'text-black dark:text-white',
    RSS: 'text-[#0A3D62] dark:text-[#1AA7B8]',
    LetChat: 'text-[#1AA7B8]',
  };
  return <span className={`text-[11px] font-extrabold ${styles[platform]}`}>{platform}</span>;
}

interface FootballFeedProps {
  onOpenConnectSources: () => void;
  onShareToMoment: (post: FootballPost) => void;
}

export default function FootballFeed({
  onOpenConnectSources,
  onShareToMoment,
}: FootballFeedProps) {
  const { profile } = useAuth();
  const { footballSources, lowDataMode } = useSettings();
  const { showToast } = useToast();

  const [posts, setPosts] = useState<FootballPost[]>([]);
  const [userFootballMoments, setUserFootballMoments] = useState<FootballPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  const [followedTeams, setFollowedTeams] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('letchat_followed_teams') || '[]');
    } catch {
      return [];
    }
  });
  const [likedIds, setLikedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('letchat_fb_likes') || '[]');
    } catch {
      return [];
    }
  });
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('letchat_fb_saved') || '[]');
    } catch {
      return [];
    }
  });
  const [commentsMap, setCommentsMap] = useState<
    Record<string, { user: string; text: string }[]>
  >(() => {
    try {
      return JSON.parse(localStorage.getItem('letchat_fb_comments') || '{}');
    } catch {
      return {};
    }
  });

  const [playingPostId, setPlayingPostId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const [shareChatPost, setShareChatPost] = useState<FootballPost | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);

  const loadAll = async () => {
    setLoading(true);
    const [rssPosts, { data: dbFootball }] = await Promise.all([
      fetchAllFootballFeeds(footballSources),
      supabase
        .from('moments')
        .select('*, author:profiles!moments_user_id_fkey(id, username, name, avatar_url)')
        .eq('category', 'Football')
        .order('created_at', { ascending: false }),
    ]);

    const mappedDb: FootballPost[] = ((dbFootball || []) as MomentItem[]).map((m) => ({
      id: `moment-${m.id}`,
      platform: 'LetChat',
      pageName: m.author?.name || 'User',
      userId: m.user_id,
      time: m.created_at,
      title: m.text?.slice(0, 120) || 'Football Moment',
      description: m.text || '',
      thumbnail: m.image_url || '',
      originalUrl: '',
      videoUrl: m.video_url || null,
      isYoutube: false,
      category: m.video_url ? 'Videos' : 'News',
      likes: m.likes_count || 0,
    }));

    setUserFootballMoments(mappedDb);
    setPosts(rssPosts);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [footballSources]);

  const openShareToChat = async (post: FootballPost) => {
    setShareChatPost(post);
    if (!profile) return;
    const { data } = await supabase
      .from('friends')
      .select('friend:profiles!friends_friend_id_fkey(*)')
      .eq('user_id', profile.id)
      .eq('status', 'accepted');
    const list = (data || [])
      .map((r) => (r as unknown as { friend: Profile | null }).friend)
      .filter((f): f is Profile => Boolean(f));
    setFriends(list);
  };

  const sendPostToFriend = async (friend: Profile) => {
    if (!profile || !shareChatPost) return;
    const chatId = getDmChatId(profile.id, friend.id);
    const { error } = await insertCompatibleMessage(supabase, {
      chatId,
      senderId: profile.id,
      receiverId: friend.id,
      payload: {
        type: 'text',
        text: `${shareChatPost.title}${shareChatPost.originalUrl ? `\n${shareChatPost.originalUrl}` : ''}`,
      },
      senderProfile: profile,
    });
    if (error) {
      showToast(error, 'error');
    } else {
      showToast(`Shared to ${friend.name}`, 'success');
    }
    setShareChatPost(null);
  };

  const toggleFollowTeam = (team: string) => {
    const next = followedTeams.includes(team)
      ? followedTeams.filter((t) => t !== team)
      : [...followedTeams, team];
    setFollowedTeams(next);
    localStorage.setItem('letchat_followed_teams', JSON.stringify(next));
  };

  const toggleLike = (id: string) => {
    const next = likedIds.includes(id) ? likedIds.filter((x) => x !== id) : [...likedIds, id];
    setLikedIds(next);
    localStorage.setItem('letchat_fb_likes', JSON.stringify(next));
  };

  const toggleSave = (id: string) => {
    const next = savedIds.includes(id) ? savedIds.filter((x) => x !== id) : [...savedIds, id];
    setSavedIds(next);
    localStorage.setItem('letchat_fb_saved', JSON.stringify(next));
    showToast(savedIds.includes(id) ? 'Removed from saved' : 'Saved for later', 'success');
  };

  const addComment = (id: string) => {
    const txt = (commentInput[id] || '').trim();
    if (!txt) return;
    const next = {
      ...commentsMap,
      [id]: [...(commentsMap[id] || []), { user: profile?.name || 'You', text: txt }],
    };
    setCommentsMap(next);
    localStorage.setItem('letchat_fb_comments', JSON.stringify(next));
    setCommentInput((p) => ({ ...p, [id]: '' }));
  };

  const combined = [...userFootballMoments, ...posts].filter((p) => {
    const q = query.trim().toLowerCase();
    const matchesSearch =
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.pageName.toLowerCase().includes(q);

    const matchesFilter =
      filter === 'All'
        ? true
        : filter === 'Videos Only' || filter === 'Videos'
        ? Boolean(p.videoUrl)
        : filter === 'Saved'
        ? savedIds.includes(p.id)
        : p.category === filter;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-3 pb-6">
      {/* Search & Connect Sources */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-slate-100 dark:bg-zinc-900 rounded-xl px-3 min-h-[42px]">
          <Search size={15} className="text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams/players (Real Madrid, Ghana Black Stars...)"
            className="bg-transparent text-xs outline-none w-full"
          />
        </div>
        <button
          onClick={onOpenConnectSources}
          className="px-3 min-h-[42px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap"
        >
          <Plug size={14} /> Connect Your Accounts
        </button>
        <button
          onClick={loadAll}
          className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800"
          aria-label="Refresh football feeds"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Quick Team / Player Chips + Follow */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {QUICK_TEAMS.map((team) => {
          const isFollowing = followedTeams.includes(team);
          return (
            <div
              key={team}
              className="flex items-center shrink-0 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden text-xs"
            >
              <button
                onClick={() => setQuery(query === team ? '' : team)}
                className={`px-3 min-h-[34px] font-semibold whitespace-nowrap ${
                  query === team ? 'bg-[#1AA7B8] text-white' : ''
                }`}
              >
                {team}
              </button>
              <button
                onClick={() => toggleFollowTeam(team)}
                className={`px-2.5 min-h-[34px] border-l border-slate-200 dark:border-zinc-800 font-bold ${
                  isFollowing ? 'text-[#1AA7B8]' : 'text-slate-400'
                }`}
                title="Follow team/player"
              >
                {isFollowing ? 'Following' : '+ Follow'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Category Filters */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {[...FILTERS, 'Saved'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 min-h-[36px] rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap ${
              filter === f
                ? 'bg-[#0A3D62] text-white'
                : 'bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-center text-xs text-slate-400 py-8">
          Loading live BBC Sport, ESPN, Sky Sports & YouTube football feeds...
        </p>
      )}

      {!loading && combined.length === 0 && (
        <p className="text-center text-xs text-slate-400 py-8">
          No football updates match your filter right now.
        </p>
      )}

      {/* Feed Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {combined.map((post) => {
          const isLiked = likedIds.includes(post.id);
          const isSaved = savedIds.includes(post.id);
          const isPlaying = playingPostId === post.id;
          const postComments = commentsMap[post.id] || [];

          return (
            <div
              key={post.id}
              className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden flex flex-col"
            >
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 text-xs">
                  <PlatformBadge platform={post.platform} />
                  <span aria-hidden="true">·</span>
                  <span className="font-bold truncate">{post.pageName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                    {new Date(post.time).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() =>
                    setReportTarget({
                      contentType: 'football_post',
                      contentId: post.id,
                      reportedUserId: post.userId || null,
                      contentText: post.title,
                    })
                  }
                  className="p-1.5 text-slate-400 hover:text-red-500"
                  title="Report Post"
                >
                  <Flag size={14} />
                </button>
              </div>

              <div className="px-3 pb-2.5 space-y-1">
                <h4 className="font-bold text-sm leading-snug">{post.title}</h4>
                {post.description && post.description !== post.title && (
                  <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2">
                    {post.description}
                  </p>
                )}
              </div>

              {/* Media / Video Player */}
              {post.videoUrl ? (
                isPlaying ? (
                  post.isYoutube ? (
                    <div className="aspect-video w-full bg-black">
                      <iframe
                        src={`${post.videoUrl}?autoplay=1`}
                        title={post.title}
                        allow="autoplay; fullscreen"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    <InlineMp4Player url={post.videoUrl} />
                  )
                ) : (
                  <button
                    onClick={() => setPlayingPostId(post.id)}
                    className="relative w-full aspect-video bg-zinc-900 flex items-center justify-center overflow-hidden"
                  >
                    {post.thumbnail && (
                      <img
                        src={post.thumbnail}
                        alt={post.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-85"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 text-white gap-1">
                      <div className="p-3 rounded-full bg-[#1AA7B8]">
                        <Play size={22} fill="white" />
                      </div>
                      {lowDataMode && <span className="text-[11px] font-bold">Tap to Load Video</span>}
                    </div>
                  </button>
                )
              ) : post.thumbnail ? (
                <img
                  src={post.thumbnail}
                  alt={post.title}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-56 object-cover"
                  loading="lazy"
                />
              ) : null}

              {/* Actions Bar */}
              <div className="px-3 py-2.5 mt-auto flex items-center justify-between border-t border-slate-100 dark:border-zinc-900 text-xs">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`flex items-center gap-1 tabular-nums ${
                      isLiked ? 'text-red-500 font-bold' : ''
                    }`}
                  >
                    <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />{' '}
                    {(post.likes || 0) + (isLiked ? 1 : 0)}
                  </button>
                  <span className="flex items-center gap-1 text-slate-500 tabular-nums">
                    <MessageSquare size={15} /> {postComments.length}
                  </span>
                  <button
                    onClick={() => onShareToMoment(post)}
                    className="hover:text-[#1AA7B8]"
                    title="Share to Moments"
                  >
                    <Share2 size={15} />
                  </button>
                  <button
                    onClick={() => openShareToChat(post)}
                    className="text-[11px] font-semibold text-[#1AA7B8]"
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => toggleSave(post.id)}
                    className={isSaved ? 'text-[#1AA7B8]' : ''}
                    title="Save for later"
                  >
                    <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
                  </button>
                </div>

                {isSafeHttpUrl(post.originalUrl) && (
                  <a
                    href={post.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-bold text-[#0A3D62] dark:text-[#1AA7B8] whitespace-nowrap"
                  >
                    View on Original <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {/* Inline Comments */}
              <div className="px-3 pb-3 space-y-1.5">
                {postComments.slice(-2).map((c, idx) => (
                  <p key={idx} className="text-[11px]">
                    <span className="font-bold">{c.user}: </span>
                    {c.text}
                  </p>
                ))}
                <div className="flex gap-1.5">
                  <input
                    value={commentInput[post.id] || ''}
                    onChange={(e) =>
                      setCommentInput((p) => ({ ...p, [post.id]: e.target.value }))
                    }
                    placeholder="Comment on this post..."
                    className="flex-1 text-xs px-2.5 min-h-[34px] rounded-lg bg-slate-100 dark:bg-zinc-900 outline-none"
                  />
                  <button
                    onClick={() => addComment(post.id)}
                    className="px-3 min-h-[34px] rounded-lg bg-[#0A3D62] text-white text-xs font-bold"
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Share Football Post to Chat Friend Picker */}
      {shareChatPost && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Share to Friend</h3>
              <button onClick={() => setShareChatPost(null)} className="p-1">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {friends.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  Add a friend in Chats first to share directly.
                </p>
              ) : (
                friends.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => sendPostToFriend(f)}
                    className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900 text-left text-sm"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#0A3D62] text-white flex items-center justify-center font-bold text-xs">
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
    </div>
  );
}

function InlineMp4Player({ url }: { url: string }) {
  const [muted, setMuted] = useState(false);
  const vRef = useRef<HTMLVideoElement | null>(null);
  return (
    <div className="relative bg-black">
      <video ref={vRef} src={url} controls autoPlay muted={muted} playsInline className="w-full max-h-64" />
      <div className="absolute top-2 right-2 flex gap-1.5">
        <button
          onClick={() => setMuted(!muted)}
          className="p-1.5 rounded-full bg-black/70 text-white"
          aria-label="Mute toggle"
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <button
          onClick={() => vRef.current?.requestFullscreen?.()}
          className="p-1.5 rounded-full bg-black/70 text-white"
          aria-label="Fullscreen"
        >
          <Maximize size={14} />
        </button>
      </div>
    </div>
  );
}
