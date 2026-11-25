import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  ExternalLink,
  Share2,
  Bookmark,
  Copy,
  Play,
  AlertCircle,
  Send,
  Plug,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import { getDmChatId, insertCompatibleMessage } from '../../utils/chatMessageCodec';
import { copyToClipboard, isSafeHttpUrl } from '../../utils/mediaUtils';
import {
  fetchLiveMomentsNews,
  getCachedMomentsNews,
} from '../../utils/momentsNewsFetcher';
import { GeneratedMomentNews, Profile, SocialPlatform } from '../../types';

const PLATFORM_FILTERS: ('All Sources' | SocialPlatform)[] = [
  'All Sources',
  'TikTok',
  'Instagram',
  'X',
  'Facebook',
  'YouTube',
  'News',
];

function SocialPlatformBadge({ platform }: { platform: SocialPlatform }) {
  const styles: Record<SocialPlatform, string> = {
    TikTok: 'bg-zinc-900 text-cyan-300 dark:bg-zinc-800 dark:text-cyan-300',
    Instagram: 'bg-pink-600/15 text-pink-600 dark:text-pink-400',
    X: 'bg-slate-900 text-white dark:bg-white dark:text-black',
    Facebook: 'bg-blue-600/15 text-blue-600 dark:text-blue-400',
    YouTube: 'bg-red-600/15 text-red-600 dark:text-red-400',
    News: 'bg-[#0A3D62]/15 text-[#0A3D62] dark:bg-[#1AA7B8]/20 dark:text-[#1AA7B8]',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold tracking-tight ${styles[platform]}`}
    >
      {platform}
    </span>
  );
}

interface MultiSourceNewsSectionProps {
  activeCategory: string;
  searchQuery: string;
  onOpenConnectSources: () => void;
  onReposted: () => void;
}

export default function MultiSourceNewsSection({
  activeCategory,
  searchQuery,
  onOpenConnectSources,
  onReposted,
}: MultiSourceNewsSectionProps) {
  const { profile, session } = useAuth();
  const { footballSources, lowDataMode } = useSettings();
  const { showToast } = useToast();

  const [newsItems, setNewsItems] = useState<GeneratedMomentNews[]>(
    () => getCachedMomentsNews()?.items || []
  );
  const [platformFilter, setPlatformFilter] = useState<'All Sources' | SocialPlatform>(
    'All Sources'
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('letchat_saved_gen_news') || '[]');
    } catch {
      return [];
    }
  });
  const [repostingId, setRepostingId] = useState<string | null>(null);
  const [shareChatItem, setShareChatItem] = useState<GeneratedMomentNews | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);

  const loadFeeds = async (forceRefresh = false) => {
    if (!session?.access_token) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchLiveMomentsNews({
        accessToken: session.access_token,
        forceRefresh,
        connectedSources: footballSources,
      });
      setNewsItems(res.items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load live feeds.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = getCachedMomentsNews();
    const isStale =
      !cached ||
      !cached.fetchedAt ||
      Date.now() - new Date(cached.fetchedAt).getTime() > 5 * 60 * 1000;

    if (session?.access_token && (newsItems.length === 0 || isStale)) {
      loadFeeds(false);
    }
  }, [session?.access_token, footballSources]);

  const toggleSave = (id: string) => {
    const next = savedIds.includes(id)
      ? savedIds.filter((x) => x !== id)
      : [...savedIds, id];
    setSavedIds(next);
    localStorage.setItem('letchat_saved_gen_news', JSON.stringify(next));
    showToast(savedIds.includes(id) ? 'Removed from saved' : 'Saved news item', 'success');
  };

  const repostToMoments = async (item: GeneratedMomentNews) => {
    if (!profile) return;
    setRepostingId(item.id);
    try {
      const bodyText = `[${item.platform} · ${item.handle}] ${item.title}${
        item.summary ? `\n\n${item.summary}` : ''
      }${item.sourceUrl ? `\n${item.sourceUrl}` : ''}`;
      const cat = ['Music', 'News', 'Entertainment', 'Funny'].includes(item.category)
        ? item.category
        : 'News';
      const { error } = await supabase.from('moments').insert({
        user_id: profile.id,
        text: bodyText,
        image_url: item.thumbnail || null,
        category: cat,
      });
      if (error) throw error;
      showToast(`Reposted ${item.platform} update to Moments!`, 'success');
      onReposted();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not repost item', 'error');
    } finally {
      setRepostingId(null);
    }
  };

  const openShareToChat = async (item: GeneratedMomentNews) => {
    setShareChatItem(item);
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

  const sendToFriend = async (friend: Profile) => {
    if (!profile || !shareChatItem) return;
    const chatId = getDmChatId(profile.id, friend.id);
    const { error } = await insertCompatibleMessage(supabase, {
      chatId,
      senderId: profile.id,
      receiverId: friend.id,
      payload: {
        type: 'text',
        text: `[${shareChatItem.platform}] ${shareChatItem.title}${
          shareChatItem.sourceUrl ? `\n${shareChatItem.sourceUrl}` : ''
        }`,
      },
      senderProfile: profile,
    });
    if (error) {
      showToast(error, 'error');
    } else {
      showToast(`Shared to ${friend.name}`, 'success');
    }
    setShareChatItem(null);
  };

  const visibleItems = newsItems.filter((item) => {
    const matchesPlatform =
      platformFilter === 'All Sources' || item.platform === platformFilter;
    const matchesCategory =
      activeCategory === 'All' ||
      activeCategory === 'Friends' ||
      item.category.toLowerCase() === activeCategory.toLowerCase();
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.handle.toLowerCase().includes(q) ||
      item.platform.toLowerCase().includes(q);
    return matchesPlatform && matchesCategory && matchesSearch;
  });

  return (
    <section className="space-y-3">
      {/* Platform Filters & Connect/Refresh Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
          {PLATFORM_FILTERS.map((plat) => (
            <button
              type="button"
              key={plat}
              onClick={() => setPlatformFilter(plat)}
              className={`px-3 min-h-[34px] rounded-xl text-xs font-bold shrink-0 whitespace-nowrap transition ${
                platformFilter === plat
                  ? 'bg-[#0A3D62] text-white'
                  : 'bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-300'
              }`}
            >
              {plat}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onOpenConnectSources}
          className="px-2.5 min-h-[34px] rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap hover:bg-slate-100 dark:hover:bg-zinc-900"
          title="Connect YouTube, Facebook, Instagram, or X accounts"
        >
          <Plug size={13} className="text-[#1AA7B8]" /> Sources
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => loadFeeds(true)}
          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 shrink-0 hover:bg-slate-100 dark:hover:bg-zinc-900"
          aria-label="Refresh live news feeds"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error State */}
      {errorMsg && (
        <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <p className="font-medium">{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={() => loadFeeds(true)}
            className="px-2.5 py-1 rounded-lg bg-red-500 text-white font-bold shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && visibleItems.length === 0 && (
        <div className="py-10 text-center space-y-2 text-xs text-slate-500 dark:text-zinc-400">
          <RefreshCw size={20} className="mx-auto animate-spin text-[#1AA7B8]" />
          <p className="font-semibold">
            Loading live news from YouTube, BBC, Billboard, Variety, BuzzFeed & social sources...
          </p>
        </div>
      )}

      {/* Empty Filter State */}
      {!loading && visibleItems.length === 0 && !errorMsg && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 p-5 text-center space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
            No {platformFilter === 'All Sources' ? '' : `${platformFilter} `}posts matched {activeCategory} right now.
          </p>
          {platformFilter !== 'All Sources' && (
            <button
              type="button"
              onClick={onOpenConnectSources}
              className="px-3.5 min-h-[36px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plug size={13} /> Connect {platformFilter} Account
            </button>
          )}
        </div>
      )}

      {/* Live Multi-Source Cards */}
      {visibleItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleItems.map((item) => {
            const isSaved = savedIds.includes(item.id);
            const isPlaying = playingId === item.id;
            const safeUrl = isSafeHttpUrl(item.sourceUrl);

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden flex flex-col"
              >
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 text-xs">
                    <SocialPlatformBadge platform={item.platform} />
                    <span className="font-bold truncate">{item.handle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[11px] font-bold text-[#1AA7B8] shrink-0">
                      #{item.category}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                    {new Date(item.publishedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="px-3 pb-2.5 space-y-1.5">
                  <h4 className="font-bold text-sm leading-snug">{item.title}</h4>
                  {item.summary && (
                    <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                </div>

                {item.isYoutube && item.videoUrl ? (
                  isPlaying ? (
                    <div className="aspect-video w-full bg-black">
                      <iframe
                        src={`${item.videoUrl}?autoplay=1`}
                        title={item.title}
                        allow="autoplay; fullscreen"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlayingId(item.id)}
                      className="relative w-full aspect-video bg-zinc-900 flex items-center justify-center overflow-hidden"
                    >
                      {item.thumbnail && (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover opacity-85"
                          loading="lazy"
                        />
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 text-white gap-1">
                        <div className="p-3 rounded-full bg-[#1AA7B8]">
                          <Play size={20} fill="white" />
                        </div>
                        {lowDataMode && (
                          <span className="text-[11px] font-bold">Tap to Load Video</span>
                        )}
                      </div>
                    </button>
                  )
                ) : item.thumbnail && isSafeHttpUrl(item.thumbnail) ? (
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-52 object-cover"
                    loading="lazy"
                  />
                ) : null}

                <div className="px-3 py-2.5 mt-auto flex items-center justify-between gap-2 border-t border-slate-100 dark:border-zinc-900 text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={repostingId === item.id}
                      onClick={() => repostToMoments(item)}
                      className="flex items-center gap-1 font-bold text-[#1AA7B8] hover:opacity-80 disabled:opacity-50"
                      title="Repost to LetChat Moments"
                    >
                      <Share2 size={14} />
                      <span>{repostingId === item.id ? 'Posting...' : 'Repost'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openShareToChat(item)}
                      className="flex items-center gap-1 font-semibold hover:text-[#1AA7B8]"
                      title="Send to friend in Chats"
                    >
                      <Send size={13} />
                      <span>Chat</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const textToCopy = safeUrl ? item.sourceUrl : `${item.title} — ${item.summary}`;
                        const ok = await copyToClipboard(textToCopy);
                        showToast(
                          ok ? 'Link copied to clipboard!' : 'Unable to copy link.',
                          ok ? 'success' : 'error'
                        );
                      }}
                      className="text-slate-500 hover:text-black dark:hover:text-white"
                      title="Copy link"
                      aria-label="Copy link"
                    >
                      <Copy size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleSave(item.id)}
                      className={isSaved ? 'text-[#1AA7B8]' : 'text-slate-500'}
                      title="Save"
                      aria-label="Save news item"
                    >
                      <Bookmark size={14} fill={isSaved ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  {safeUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] font-bold text-[#0A3D62] dark:text-[#1AA7B8] whitespace-nowrap"
                    >
                      Open <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {shareChatItem && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Share {shareChatItem.platform} News to Friend</h3>
              <button
                type="button"
                onClick={() => setShareChatItem(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-900"
              >
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
                    type="button"
                    key={f.id}
                    onClick={() => sendToFriend(f)}
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
    </section>
  );
}
