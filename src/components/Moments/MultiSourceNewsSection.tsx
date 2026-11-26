import React, { useEffect, useMemo, useState } from 'react';
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
  Volume2,
  VolumeX,
  Maximize2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useViewportVideoFeed } from '../../hooks/useViewportVideoFeed';
import { supabase } from '../../supabaseClient';
import { getDmChatId, insertCompatibleMessage } from '../../utils/chatMessageCodec';
import { copyToClipboard, isSafeHttpUrl } from '../../utils/mediaUtils';
import {
  fetchLiveMomentsNews,
  getCachedMomentsNews,
  searchLiveYouTubeVideos,
} from '../../utils/momentsNewsFetcher';
import AutoPlayYouTubeIframe from './AutoPlayYouTubeIframe';
import TikTokVideoFeed, { TikTokVideoItem } from './TikTokVideoFeed';
import { GeneratedMomentNews, Profile, SocialPlatform } from '../../types';

const PLATFORM_FILTERS: ('All Sources' | 'Videos' | SocialPlatform)[] = [
  'All Sources',
  'Videos',
  'TMDB',
  'News',
  'YouTube',
  'TikTok',
  'Instagram',
  'X',
  'Facebook',
];

function SocialPlatformBadge({ platform }: { platform: SocialPlatform }) {
  const styles: Record<SocialPlatform, string> = {
    TikTok: 'bg-zinc-900 text-cyan-300 dark:bg-zinc-800 dark:text-cyan-300',
    Instagram: 'bg-pink-600/15 text-pink-600 dark:text-pink-400',
    X: 'bg-slate-900 text-white dark:bg-white dark:text-black',
    Facebook: 'bg-blue-600/15 text-blue-600 dark:text-blue-400',
    YouTube: 'bg-red-600/15 text-red-600 dark:text-red-400',
    TMDB: 'bg-sky-600/15 text-sky-600 dark:text-sky-400',
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
  const [liveSearchItems, setLiveSearchItems] = useState<GeneratedMomentNews[]>([]);
  const [platformFilter, setPlatformFilter] = useState<'All Sources' | 'Videos' | SocialPlatform>(
    'All Sources'
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(
    () => getCachedMomentsNews()?.fetchedAt || ''
  );
  const [videoMuted, setVideoMuted] = useState<boolean>(true);
  const [reelsViewMode, setReelsViewMode] = useState<'reels' | 'grid'>('reels');
  const [fullScreenReelId, setFullScreenReelId] = useState<string | null>(null);
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
      setLastUpdatedAt(res.fetchedAt || new Date().toISOString());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load live feeds.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.access_token) return;
    const cached = getCachedMomentsNews();
    const isStale =
      !cached ||
      !cached.fetchedAt ||
      Date.now() - new Date(cached.fetchedAt).getTime() > 2 * 60 * 1000;

    if (newsItems.length === 0 || isStale) {
      loadFeeds(false);
    }

    // Keep news automatically updated every 2 minutes & when returning to tab
    const timer = setInterval(() => {
      if (!document.hidden) loadFeeds(true);
    }, 2 * 60 * 1000);

    const onVisibility = () => {
      if (document.hidden) return;
      const latest = getCachedMomentsNews();
      const age = latest?.fetchedAt ? Date.now() - new Date(latest.fetchedAt).getTime() : Infinity;
      if (age > 90 * 1000) loadFeeds(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session?.access_token, footballSources]);

  // Live TMDB + YouTube search when user searches in Moments
  useEffect(() => {
    const q = searchQuery.trim();
    if (!session?.access_token || q.length < 2) {
      setLiveSearchItems([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const searchResults = await searchLiveYouTubeVideos({
        accessToken: session.access_token,
        query: q,
        category:
          activeCategory === 'Music' || activeCategory === 'Funny' || activeCategory === 'News'
            ? activeCategory
            : 'Entertainment',
      });
      if (!cancelled) {
        setLiveSearchItems(searchResults);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, activeCategory, session?.access_token]);

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

  const mergedNewsPool = (() => {
    if (liveSearchItems.length === 0) return newsItems;
    const seen = new Set<string>();
    const combined: GeneratedMomentNews[] = [];
    for (const item of [...liveSearchItems, ...newsItems]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      combined.push(item);
    }
    return combined;
  })();

  const visibleItems = mergedNewsPool.filter((item) => {
    const matchesPlatform =
      platformFilter === 'All Sources'
        ? true
        : platformFilter === 'Videos'
          ? Boolean(item.isYoutube || item.videoUrl)
          : item.platform === platformFilter;
    const matchesCategory =
      activeCategory === 'All' ||
      activeCategory === 'Friends'
        ? true
        : activeCategory === 'Videos'
          ? Boolean(item.isYoutube || item.videoUrl)
          : item.category.toLowerCase() === activeCategory.toLowerCase();
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.handle.toLowerCase().includes(q) ||
      item.platform.toLowerCase().includes(q) ||
      liveSearchItems.some((s) => s.id === item.id);
    return matchesPlatform && matchesCategory && matchesSearch;
  });

  const isVideoFeedActive =
    (activeCategory === 'Videos' || platformFilter === 'Videos') &&
    !fullScreenReelId;

  const videoItemsForReels: TikTokVideoItem[] = visibleItems
    .filter((item): item is GeneratedMomentNews & { videoUrl: string } =>
      Boolean(item.videoUrl && (item.isYoutube || isSafeHttpUrl(item.videoUrl)))
    )
    .map((item) => ({
      id: item.id,
      platform: item.platform,
      handle: item.handle,
      title: item.title,
      summary: item.summary,
      category: item.category,
      sourceUrl: item.sourceUrl,
      thumbnail: item.thumbnail,
      videoUrl: item.videoUrl,
      isYoutube: Boolean(item.isYoutube),
    }));

  const gridVideoIds = useMemo(
    () => visibleItems.filter((i) => Boolean(i.videoUrl)).map((i) => i.id),
    [visibleItems]
  );

  const {
    activeId: activeVideoId,
    pausedMap: videoPausedMap,
    registerItemRef,
    registerVideoRef,
    toggleManualPause,
    setManualPlay,
  } = useViewportVideoFeed({
    videoIds: gridVideoIds,
    minRatio: 0.5,
    disabled: Boolean((isVideoFeedActive && reelsViewMode === 'reels') || fullScreenReelId),
    muted: videoMuted,
    onFallbackMute: () => setVideoMuted(true),
    feedKey: 'multi-source-news-grid',
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
          className="min-h-[34px] px-2 flex items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-800 shrink-0 hover:bg-slate-100 dark:hover:bg-zinc-900 text-[10px] font-bold text-slate-500 dark:text-zinc-400"
          aria-label="Refresh live news feeds"
          title={lastUpdatedAt ? `Last updated ${new Date(lastUpdatedAt).toLocaleTimeString()}` : 'Refresh live news'}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin text-[#1AA7B8]' : ''} />
          {lastUpdatedAt && (
            <span className="hidden sm:inline tabular-nums">
              {new Date(lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
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
            Loading live global news from TMDB, BBC, Al Jazeera, Sky News, Google News, TechCrunch & YouTube...
          </p>
        </div>
      )}

      {/* Empty Filter State */}
      {!loading && visibleItems.length === 0 && !errorMsg && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 p-5 text-center space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
            No {platformFilter === 'All Sources' ? '' : `${platformFilter} `}posts matched {activeCategory} right now.
          </p>
          {platformFilter !== 'All Sources' && platformFilter !== 'Videos' && (
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

      {/* Video Reels Mode Toggle when browsing Videos */}
      {(activeCategory === 'Videos' || platformFilter === 'Videos') && videoItemsForReels.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setReelsViewMode('reels')}
              className={`px-3 min-h-[30px] rounded-lg text-[11px] font-bold transition ${
                reelsViewMode === 'reels'
                  ? 'bg-[#0A3D62] text-white'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              TikTok Reels
            </button>
            <button
              type="button"
              onClick={() => setReelsViewMode('grid')}
              className={`px-3 min-h-[30px] rounded-lg text-[11px] font-bold transition ${
                reelsViewMode === 'grid'
                  ? 'bg-[#0A3D62] text-white'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              Cards
            </button>
          </div>
          <button
            type="button"
            onClick={() => setVideoMuted((m) => !m)}
            className="flex items-center gap-1 px-2.5 min-h-[30px] rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] font-bold"
          >
            {videoMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            <span>{videoMuted ? 'Muted' : 'Sound ON'}</span>
          </button>
        </div>
      )}

      {/* TikTok Vertical Swipe Auto-Play Feed on Videos tab */}
      {isVideoFeedActive && reelsViewMode === 'reels' && videoItemsForReels.length > 0 && (
        <TikTokVideoFeed
          items={videoItemsForReels}
          muted={videoMuted}
          onToggleMute={() => setVideoMuted((m) => !m)}
          onForceMute={() => setVideoMuted(true)}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          onRepost={(reel) => {
            const matched = mergedNewsPool.find((n) => n.id === reel.id);
            if (matched) repostToMoments(matched);
          }}
          onShareChat={(reel) => {
            const matched = mergedNewsPool.find((n) => n.id === reel.id);
            if (matched) openShareToChat(matched);
          }}
        />
      )}

      {/* Live Multi-Source Cards (with automatic scroll-to-play videos) */}
      {visibleItems.length > 0 && !(isVideoFeedActive && reelsViewMode === 'reels') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleItems.map((item) => {
            const isSaved = savedIds.includes(item.id);
            const hasVideo = Boolean(item.videoUrl && (item.isYoutube || isSafeHttpUrl(item.videoUrl)));
            const isPlaying = activeVideoId === item.id && !videoPausedMap[item.id];
            const safeUrl = isSafeHttpUrl(item.sourceUrl);

            return (
              <article
                key={item.id}
                data-vp-video-id={hasVideo ? item.id : undefined}
                ref={hasVideo ? registerItemRef(item.id) : undefined}
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

                {hasVideo && item.videoUrl ? (
                  item.isYoutube ? (
                    isPlaying ? (
                      <div className="relative aspect-video w-full bg-black">
                        <AutoPlayYouTubeIframe
                          embedUrl={item.videoUrl}
                          title={item.title}
                          muted={videoMuted}
                          paused={Boolean(videoPausedMap[item.id])}
                        />
                        <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                          <button
                            type="button"
                            onClick={() => setVideoMuted((m) => !m)}
                            className="p-1.5 rounded-full bg-black/70 text-white hover:bg-black"
                            aria-label={videoMuted ? 'Unmute video' : 'Mute video'}
                            title={videoMuted ? 'Unmute' : 'Mute'}
                          >
                            {videoMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFullScreenReelId(item.id)}
                            className="p-1.5 rounded-full bg-black/70 text-white hover:bg-black"
                            aria-label="Open TikTok Reels mode"
                            title="Full-screen Reels"
                          >
                            <Maximize2 size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setManualPlay(item.id)}
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
                  ) : (
                    <div
                      className="relative aspect-video w-full bg-black cursor-pointer"
                      onClick={() => toggleManualPause(item.id)}
                    >
                      <video
                        ref={registerVideoRef(item.id)}
                        src={item.videoUrl}
                        poster={item.thumbnail || undefined}
                        loop
                        muted={videoMuted}
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-contain bg-black"
                      />
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVideoMuted((m) => !m);
                          }}
                          className="p-1.5 rounded-full bg-black/70 text-white hover:bg-black"
                          aria-label={videoMuted ? 'Unmute video' : 'Mute video'}
                        >
                          {videoMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFullScreenReelId(item.id);
                          }}
                          className="p-1.5 rounded-full bg-black/70 text-white hover:bg-black"
                          aria-label="Open TikTok Reels mode"
                        >
                          <Maximize2 size={14} />
                        </button>
                      </div>
                    </div>
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
      {fullScreenReelId && videoItemsForReels.length > 0 && (
        <TikTokVideoFeed
          items={videoItemsForReels}
          muted={videoMuted}
          onToggleMute={() => setVideoMuted((m) => !m)}
          onForceMute={() => setVideoMuted(true)}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          initialVideoId={fullScreenReelId}
          fullScreen
          onClose={() => setFullScreenReelId(null)}
          onRepost={(reel) => {
            const matched = mergedNewsPool.find((n) => n.id === reel.id);
            if (matched) repostToMoments(matched);
          }}
          onShareChat={(reel) => {
            const matched = mergedNewsPool.find((n) => n.id === reel.id);
            if (matched) openShareToChat(matched);
          }}
        />
      )}
    </section>
  );
}
