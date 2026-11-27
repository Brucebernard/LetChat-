import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  RefreshCw,
  Play,
  X,
  Send,
  Copy,
  Users,
  UserCheck,
  Newspaper,
  ExternalLink,
  Keyboard,
} from 'lucide-react';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFlowKeyboard } from '../../context/KeyboardContext';
import { copyToClipboard, formatDuration } from '../../utils/mediaUtils';
import { getDisplayName } from '../../utils/appCache';
import { loadFriendshipsAndRequests, normalizeProfileRecord } from '../../utils/friendService';
import { insertCompatibleMessage, getDmChatId } from '../../utils/chatMessageCodec';
import { ProfileAvatar, VerifiedNameBadge } from '../Common/VerifiedBadge';
import { WeChatHoldToRecordButton, VoiceNotePlayer } from '../Voice/WeChatVoiceBar';
import AutoPlayYouTubeIframe from './AutoPlayYouTubeIframe';
import {
  GroupItem,
  NewsArticleItem,
  NewsCategory,
  NewsComment,
  Profile,
} from '../../types';

const NEWS_CATEGORIES: NewsCategory[] = [
  'All',
  'Football',
  'Global',
  'Ghana',
  'Entertainment',
  'Tech',
  'Politics',
];

function timeAgo(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NewsMomentsView() {
  const { session, profile } = useAuth();
  const { showToast } = useToast();
  const { openKeyboard } = useFlowKeyboard();

  const [activeCategory, setActiveCategory] = useState<NewsCategory>('All');
  const [articles, setArticles] = useState<NewsArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Likes & Comments
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  // Full Article / Video Reader Modal
  const [openArticle, setOpenArticle] = useState<NewsArticleItem | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerParagraphs, setReaderParagraphs] = useState<string[]>([]);
  const [readerLeadImage, setReaderLeadImage] = useState<string | null>(null);

  // Comments Drawer
  const [commentTarget, setCommentTarget] = useState<NewsArticleItem | null>(null);
  const [comments, setComments] = useState<NewsComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Share Sheet
  const [shareTarget, setShareTarget] = useState<NewsArticleItem | null>(null);
  const [shareFriends, setShareFriends] = useState<Profile[]>([]);
  const [shareGroups, setShareGroups] = useState<GroupItem[]>([]);
  const [sendingShareTo, setSendingShareTo] = useState<string | null>(null);

  const fetchNewsFeed = useCallback(
    async (isRefresh = false) => {
      if (!session?.access_token) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch('/api/news/feed', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          items?: NewsArticleItem[];
          articles?: NewsArticleItem[];
        };
        const rawList = Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.articles)
            ? data.articles
            : [];
        setArticles(rawList);

        if (rawList.length > 0 && profile?.id) {
          const ids = rawList.slice(0, 60).map((a) => a.id);
          const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
            supabase.from('news_likes').select('news_id, user_id').in('news_id', ids),
            supabase.from('news_comments').select('news_id').in('news_id', ids),
          ]);

          const counts: Record<string, number> = {};
          const mine = new Set<string>();
          for (const r of (likeRows || []) as Array<{ news_id: string; user_id: string }>) {
            counts[r.news_id] = (counts[r.news_id] || 0) + 1;
            if (r.user_id === profile.id) mine.add(r.news_id);
          }
          setLikeCounts(counts);
          setLikedIds(mine);

          const cCounts: Record<string, number> = {};
          for (const r of (commentRows || []) as Array<{ news_id: string }>) {
            cCounts[r.news_id] = (cCounts[r.news_id] || 0) + 1;
          }
          setCommentCounts(cCounts);
        }
      } catch (err) {
        showToast(
          err instanceof Error ? `News error: ${err.message}` : 'Unable to load news feed',
          'error'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session?.access_token, profile?.id, showToast]
  );

  useEffect(() => {
    fetchNewsFeed();
  }, [fetchNewsFeed]);

  const filteredArticles = useMemo(() => {
    if (activeCategory === 'All') return articles;
    return articles.filter((a) => a.category === activeCategory);
  }, [articles, activeCategory]);

  const toggleLike = async (article: NewsArticleItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!profile?.id) return;
    const currentlyLiked = likedIds.has(article.id);

    // Optimistic update
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (currentlyLiked) next.delete(article.id);
      else next.add(article.id);
      return next;
    });
    setLikeCounts((prev) => ({
      ...prev,
      [article.id]: Math.max(0, (prev[article.id] || 0) + (currentlyLiked ? -1 : 1)),
    }));

    if (currentlyLiked) {
      await supabase
        .from('news_likes')
        .delete()
        .eq('news_id', article.id)
        .eq('user_id', profile.id);
    } else {
      await supabase.from('news_likes').insert({
        news_id: article.id,
        user_id: profile.id,
      });
    }
  };

  const openFullArticle = async (article: NewsArticleItem) => {
    setOpenArticle(article);
    setReaderParagraphs([]);
    setReaderLeadImage(article.imageUrl || null);
    if (!article.articleUrl || !session?.access_token) return;

    setReaderLoading(true);
    try {
      const res = await fetch(
        `/api/news/article?url=${encodeURIComponent(article.articleUrl)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          paragraphs?: string[];
          leadImage?: string | null;
          imageUrl?: string | null;
        };
        if (Array.isArray(data.paragraphs) && data.paragraphs.length > 0) {
          setReaderParagraphs(data.paragraphs);
        }
        const img = data.leadImage || data.imageUrl;
        if (img) {
          setReaderLeadImage(img);
        }
      }
    } catch {
      // Keep summary visible inside reader
    } finally {
      setReaderLoading(false);
    }
  };

  const openComments = async (article: NewsArticleItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCommentTarget(article);
    setComments([]);
    setCommentsLoading(true);
    try {
      const { data } = await supabase
        .from('news_comments')
        .select('*, user:profiles(*)')
        .eq('news_id', article.id)
        .order('created_at', { ascending: true });
      if (data) {
        const mapped = (data as unknown as Array<NewsComment & { user?: Record<string, unknown> }>).map(
          (c) => ({
            ...c,
            user: c.user ? normalizeProfileRecord(c.user) : undefined,
          })
        );
        setComments(mapped);
      }
    } finally {
      setCommentsLoading(false);
    }
  };

  const postNewsComment = async (
    textVal: string,
    voiceData?: { url: string; duration: number }
  ) => {
    if (!profile?.id || !commentTarget) return;
    const clean = textVal.trim();
    if (!clean && !voiceData) return;
    setPostingComment(true);
    try {
      const payload: Record<string, unknown> = {
        news_id: commentTarget.id,
        user_id: profile.id,
        text: clean || (voiceData ? '[Voice comment]' : ''),
      };
      if (voiceData) {
        payload.voice_url = voiceData.url;
        payload.duration = voiceData.duration;
      }

      let { data, error } = await supabase
        .from('news_comments')
        .insert(payload)
        .select('*, user:profiles(*)')
        .single();

      if (error && voiceData && (error.code === '42703' || error.code === 'PGRST204')) {
        const retry = await supabase
          .from('news_comments')
          .insert({
            news_id: commentTarget.id,
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
        const r = data as unknown as NewsComment & { user?: Record<string, unknown> };
        setComments((prev) => [
          ...prev,
          { ...r, user: r.user ? normalizeProfileRecord(r.user) : profile },
        ]);
        setCommentCounts((prev) => ({
          ...prev,
          [commentTarget.id]: (prev[commentTarget.id] || 0) + 1,
        }));
      }
      setCommentText('');
    } finally {
      setPostingComment(false);
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    await postNewsComment(commentText);
  };

  const handleNewsVoiceComment = async (file: File, durSec: number) => {
    if (!profile?.id || !commentTarget) return;
    try {
      const path = `voice-comments/${profile.id}/${Date.now()}.webm`;
      const url = await uploadWithProgress('letchat-media', path, file);
      await postNewsComment('', { url, duration: durSec });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Voice comment upload failed', 'error');
    }
  };

  const openShareSheet = async (article: NewsArticleItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShareTarget(article);
    if (!profile?.id) return;
    const [friendRes, groupRes] = await Promise.all([
      loadFriendshipsAndRequests(supabase, profile.id),
      supabase.from('group_members').select('groups(*)').eq('user_id', profile.id),
    ]);
    setShareFriends(friendRes.acceptedFriends);
    const groups = ((groupRes.data || []) as unknown as Array<{ groups: GroupItem | null }>)
      .map((r) => r.groups)
      .filter((g): g is GroupItem => Boolean(g));
    setShareGroups(groups);
  };

  const shareToFriend = async (friend: Profile) => {
    if (!profile?.id || !shareTarget) return;
    setSendingShareTo(`dm_${friend.id}`);
    try {
      const shareText = `📰 ${shareTarget.title}\n${shareTarget.sourceName} · ${shareTarget.articleUrl}`;
      const { error } = await insertCompatibleMessage(supabase, {
        chatId: getDmChatId(profile.id, friend.id),
        senderId: profile.id,
        receiverId: friend.id,
        payload: { type: 'text', text: shareText },
        senderProfile: profile,
      });
      if (error) {
        showToast(error, 'error');
      } else {
        showToast(`Shared with ${friend.full_name || friend.name}`, 'success');
        setShareTarget(null);
      }
    } finally {
      setSendingShareTo(null);
    }
  };

  const shareToGroup = async (group: GroupItem) => {
    if (!profile?.id || !shareTarget) return;
    setSendingShareTo(`grp_${group.id}`);
    try {
      const shareText = `📰 ${shareTarget.title}\n${shareTarget.sourceName} · ${shareTarget.articleUrl}`;
      const { error } = await supabase.from('group_messages').insert({
        group_id: group.id,
        sender_id: profile.id,
        content: shareText,
        type: 'text',
      });
      if (error) {
        showToast(error.message || 'Could not share to group', 'error');
      } else {
        showToast(`Shared to ${group.name}`, 'success');
        setShareTarget(null);
      }
    } finally {
      setSendingShareTo(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A] text-white overflow-hidden">
      {/* Category Pills Row */}
      <div className="px-3 pt-16 pb-2.5 border-b border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {NEWS_CATEGORIES.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition shrink-0 ${
                  active
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white shadow-md shadow-[#7C3AED]/25'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] border border-white/10'
                }`}
              >
                {cat}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => fetchNewsFeed(true)}
            disabled={refreshing}
            className="ml-auto px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-zinc-300 hover:text-white text-xs font-bold flex items-center gap-1 shrink-0"
            title="Refresh News"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* News Cards Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-4 pb-6">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-72 rounded-3xl bg-white/[0.04] border border-white/10 animate-pulse"
                />
              ))}
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#121218] p-8 text-center space-y-2">
              <Newspaper size={28} className="mx-auto text-[#00E5FF]" />
              <p className="font-bold text-sm">No stories available in {activeCategory}</p>
              <p className="text-xs text-zinc-400">
                Try switching categories or tap Refresh to load live headlines.
              </p>
            </div>
          ) : (
            filteredArticles.map((article) => {
              const isLiked = likedIds.has(article.id);
              const likes = likeCounts[article.id] || 0;
              const cCount = commentCounts[article.id] || 0;

              return (
                <article
                  key={article.id}
                  onClick={() => openFullArticle(article)}
                  className="rounded-3xl overflow-hidden bg-[#121218] border border-white/10 hover:border-[#00E5FF]/40 transition cursor-pointer shadow-xl"
                >
                  {/* Thumbnail / Video Preview */}
                  <div className="relative aspect-[16/9] bg-[#0A0A0A] overflow-hidden">
                    {article.imageUrl ? (
                      <img
                        src={article.imageUrl}
                        alt={article.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#7C3AED]/30 via-[#121218] to-[#00E5FF]/20 flex items-center justify-center">
                        <Newspaper size={36} className="text-zinc-500" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                    {/* Top badges */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {article.isBreaking && (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-lg animate-pulse">
                            Breaking
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[#00E5FF] text-[10px] font-bold">
                          {article.category}
                        </span>
                      </div>

                      {article.videoUrl && (
                        <span className="px-2.5 py-1 rounded-full bg-[#7C3AED]/90 text-white text-[10px] font-bold flex items-center gap-1">
                          <Play size={10} fill="currentColor" />
                          Video Highlight
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-zinc-200 font-semibold">
                      <span className="truncate">{article.sourceName}</span>
                      <span className="text-zinc-300 shrink-0">{timeAgo(article.publishedAt)}</span>
                    </div>
                  </div>

                  {/* Body + Moment-style Action Bar */}
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <h3 className="font-extrabold text-[15px] leading-snug text-white">
                        {article.title}
                      </h3>
                      {article.summary && (
                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                          {article.summary}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={(e) => toggleLike(article, e)}
                          className={`flex items-center gap-1.5 text-xs font-bold transition ${
                            isLiked ? 'text-pink-500' : 'text-zinc-300 hover:text-white'
                          }`}
                        >
                          <Heart
                            size={17}
                            className={isLiked ? 'fill-pink-500 text-pink-500' : ''}
                          />
                          <span>{likes}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => openComments(article, e)}
                          className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 hover:text-white transition"
                        >
                          <MessageCircle size={17} />
                          <span>{cCount}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => openShareSheet(article, e)}
                          className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 hover:text-[#00E5FF] transition"
                        >
                          <Share2 size={17} />
                          <span>Share</span>
                        </button>
                      </div>

                      <span className="text-[11px] font-bold text-[#00E5FF]">
                        {article.videoUrl ? 'Watch & Read →' : 'Read Story →'}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      {/* Full In-App Article & Video Reader Modal */}
      {openArticle && (
        <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col">
          <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]/95 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {openArticle.isBreaking && (
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                  Breaking
                </span>
              )}
              <span className="text-xs font-bold text-[#00E5FF] truncate">
                {openArticle.sourceName}
              </span>
              <span className="text-xs text-zinc-500 shrink-0">
                · {timeAgo(openArticle.publishedAt)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenArticle(null)}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white"
              aria-label="Close article"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            <div className="max-w-2xl mx-auto space-y-5">
              {openArticle.videoUrl ? (
                <div className="aspect-video w-full rounded-3xl overflow-hidden border border-white/10 bg-black">
                  <AutoPlayYouTubeIframe
                    embedUrl={openArticle.videoUrl}
                    title={openArticle.title}
                    muted={false}
                  />
                </div>
              ) : readerLeadImage ? (
                <div className="aspect-video w-full rounded-3xl overflow-hidden border border-white/10 bg-[#121218]">
                  <img
                    src={readerLeadImage}
                    alt={openArticle.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : null}

              <h1 className="text-xl font-extrabold leading-snug text-white">
                {openArticle.title}
              </h1>

              {readerLoading ? (
                <div className="space-y-3 py-2">
                  <div className="h-4 rounded bg-white/10 animate-pulse" />
                  <div className="h-4 w-5/6 rounded bg-white/10 animate-pulse" />
                  <div className="h-4 w-4/6 rounded bg-white/10 animate-pulse" />
                </div>
              ) : readerParagraphs.length > 0 ? (
                <div className="space-y-4 text-sm text-zinc-200 leading-relaxed">
                  {readerParagraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 text-sm text-zinc-200 leading-relaxed">
                  <p>{openArticle.summary || 'Full summary unavailable for this source.'}</p>
                </div>
              )}

              <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => toggleLike(openArticle)}
                    className={`px-3.5 min-h-[38px] rounded-2xl border flex items-center gap-1.5 text-xs font-bold ${
                      likedIds.has(openArticle.id)
                        ? 'bg-pink-500/20 border-pink-500/50 text-pink-400'
                        : 'bg-white/5 border-white/10 text-zinc-200'
                    }`}
                  >
                    <Heart
                      size={15}
                      className={likedIds.has(openArticle.id) ? 'fill-pink-400' : ''}
                    />
                    <span>{likeCounts[openArticle.id] || 0}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openComments(openArticle)}
                    className="px-3.5 min-h-[38px] rounded-2xl bg-white/5 border border-white/10 text-xs font-bold text-zinc-200 flex items-center gap-1.5"
                  >
                    <MessageCircle size={15} />
                    <span>{commentCounts[openArticle.id] || 0} Comments</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openShareSheet(openArticle)}
                    className="px-3.5 min-h-[38px] rounded-2xl bg-white/5 border border-white/10 text-xs font-bold text-[#00E5FF] flex items-center gap-1.5"
                  >
                    <Share2 size={15} />
                    <span>Share</span>
                  </button>
                </div>

                {openArticle.articleUrl && (
                  <a
                    href={openArticle.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-zinc-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <span>Source</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* News Comments Drawer */}
      {commentTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setCommentTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[78vh] bg-[#12121A] border border-white/10 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-bold text-sm">Comments</p>
                <p className="text-[11px] text-zinc-400 truncate">{commentTarget.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setCommentTarget(null)}
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
                  No comments yet. Be the first to share your thoughts!
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
                          <span className="text-[10px] text-zinc-500">
                            {timeAgo(c.created_at)}
                          </span>
                        </div>
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
                          <p className="text-xs text-zinc-200 mt-1 break-words">{c.text}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form
              onSubmit={submitComment}
              className="p-3 border-t border-white/10 bg-[#0A0A0A] flex items-center gap-1.5"
            >
              <WeChatHoldToRecordButton
                compact
                iconColor="#00E5FF"
                onSendVoice={handleNewsVoiceComment}
              />
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 min-w-0 px-3 min-h-[40px] rounded-2xl bg-white/[0.06] border border-white/10 text-xs text-white outline-none focus:border-[#00E5FF]"
              />
              <button
                type="button"
                onClick={() =>
                  openKeyboard({
                    id: 'news-comment',
                    label: 'News Comment',
                    placeholder: 'Add a comment...',
                    text: commentText,
                    sendLabel: 'Post',
                    allowEmptySubmit: false,
                    onChange: setCommentText,
                    onSubmit: (finalText) => postNewsComment(finalText),
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
                disabled={postingComment || !commentText.trim()}
                className="w-10 h-10 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white flex items-center justify-center disabled:opacity-50 shrink-0"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* News Share Sheet */}
      {shareTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setShareTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[75vh] bg-[#12121A] border border-white/10 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <p className="font-bold text-sm">Share News Story</p>
              <button
                type="button"
                onClick={() => setShareTarget(null)}
                className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              <button
                type="button"
                onClick={async () => {
                  const ok = await copyToClipboard(
                    `${shareTarget.title} — ${shareTarget.articleUrl}`
                  );
                  if (ok) showToast('Headline & link copied!', 'success');
                  setShareTarget(null);
                }}
                className="w-full p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 flex items-center gap-3 text-xs font-bold"
              >
                <Copy size={16} className="text-[#00E5FF]" />
                <span>Copy Story Link</span>
              </button>

              {shareGroups.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Users size={12} /> Send to Chatroom Group
                  </p>
                  <div className="space-y-1.5">
                    {shareGroups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        disabled={sendingShareTo === `grp_${g.id}`}
                        onClick={() => shareToGroup(g)}
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
                        onClick={() => shareToFriend(f)}
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
    </div>
  );
}
