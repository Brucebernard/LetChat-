import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Play,
  Send,
  Share2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { isSafeHttpUrl } from '../../utils/mediaUtils';
import { useViewportVideoFeed } from '../../hooks/useViewportVideoFeed';
import AutoPlayYouTubeIframe from './AutoPlayYouTubeIframe';

export interface TikTokVideoItem {
  id: string;
  platform: string;
  handle: string;
  title: string;
  summary?: string;
  category: string;
  sourceUrl?: string;
  thumbnail?: string;
  videoUrl: string;
  isYoutube: boolean;
}

interface TikTokVideoFeedProps {
  items: TikTokVideoItem[];
  muted: boolean;
  onToggleMute: () => void;
  onForceMute?: () => void;
  savedIds?: string[];
  onToggleSave?: (id: string) => void;
  onRepost?: (item: TikTokVideoItem) => void;
  onShareChat?: (item: TikTokVideoItem) => void;
  initialVideoId?: string | null;
  fullScreen?: boolean;
  onClose?: () => void;
}

export default function TikTokVideoFeed({
  items,
  muted,
  onToggleMute,
  onForceMute,
  savedIds = [],
  onToggleSave,
  onRepost,
  onShareChat,
  initialVideoId = null,
  fullScreen = false,
  onClose,
}: TikTokVideoFeedProps) {
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [containerVisible, setContainerVisible] = useState(true);
  const outerRef = useRef<HTMLDivElement | null>(null);
  const slideNodesRef = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (fullScreen || !outerRef.current) {
      setContainerVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setContainerVisible(entry.isIntersecting && entry.intersectionRatio >= 0.5);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75] }
    );
    obs.observe(outerRef.current);
    return () => obs.disconnect();
  }, [fullScreen, items.length]);

  const videoIds = useMemo(() => items.map((i) => i.id), [items]);

  const {
    activeId,
    setActiveId,
    pausedMap,
    registerItemRef,
    registerVideoRef,
    toggleManualPause,
    setManualPlay,
  } = useViewportVideoFeed({
    videoIds,
    root: scrollRoot,
    minRatio: 0.51,
    disabled: !containerVisible,
    muted,
    onFallbackMute: onForceMute,
    feedKey: fullScreen ? 'tiktok-reels-fullscreen' : 'tiktok-reels-inline',
  });

  const activeIdx = useMemo(() => {
    if (!activeId) {
      if (initialVideoId) {
        const initIdx = items.findIndex((i) => i.id === initialVideoId);
        return initIdx >= 0 ? initIdx : 0;
      }
      return 0;
    }
    const idx = items.findIndex((i) => i.id === activeId);
    return idx >= 0 ? idx : 0;
  }, [activeId, initialVideoId, items]);

  useEffect(() => {
    if (initialVideoId && scrollRoot) {
      const idx = items.findIndex((i) => i.id === initialVideoId);
      if (idx >= 0) {
        setActiveId(items[idx].id);
        slideNodesRef.current[items[idx].id]?.scrollIntoView({ behavior: 'auto' });
      }
    }
  }, [initialVideoId, scrollRoot]);

  const scrollToSlide = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, nextIdx));
    const target = items[clamped];
    if (!target) return;
    setManualPlay(target.id);
    slideNodesRef.current[target.id]?.scrollIntoView({ behavior: 'smooth' });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-black text-white p-10 text-center text-xs">
        No videos available right now. Tap Refresh to load fresh clips.
      </div>
    );
  }

  return (
    <div
      ref={outerRef}
      className={
        fullScreen
          ? 'fixed inset-0 z-50 bg-black text-white flex flex-col'
          : 'relative w-full h-[68vh] min-h-[420px] max-h-[680px] rounded-2xl overflow-hidden bg-black text-white border border-zinc-800 shadow-xl'
      }
    >
      {/* Top Overlay Controls */}
      <div className="pointer-events-none absolute top-3 inset-x-3 z-30 flex items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1 rounded-full bg-black/55 backdrop-blur-md text-[11px] font-bold">
          <span className="w-2 h-2 rounded-full bg-[#1AA7B8] animate-pulse" />
          <span>Auto-Play Reels</span>
          <span className="opacity-70 tabular-nums">
            {activeIdx + 1}/{items.length}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            className="flex items-center gap-1 px-3 min-h-[34px] rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-bold hover:bg-black/80 transition"
            aria-label={muted ? 'Unmute videos' : 'Mute videos'}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{muted ? 'Muted' : 'Sound ON'}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80"
              aria-label="Close Reels"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Vertical Snap Scroll Container */}
      <div
        ref={setScrollRoot}
        className="w-full h-full overflow-y-auto snap-y snap-mandatory no-scrollbar"
      >
        {items.map((item, idx) => {
          const isActive = activeId === item.id;
          const isSaved = savedIds.includes(item.id);
          const isPaused = Boolean(pausedMap[item.id]);
          const safeUrl = isSafeHttpUrl(item.sourceUrl);
          const registerSlide = registerItemRef(item.id);

          return (
            <div
              key={item.id}
              data-vp-video-id={item.id}
              ref={(el) => {
                slideNodesRef.current[item.id] = el;
                registerSlide(el);
              }}
              className="relative w-full h-full snap-start snap-always bg-black flex items-center justify-center overflow-hidden"
            >
              {/* Video Player */}
              {item.isYoutube ? (
                isActive && !isPaused ? (
                  <AutoPlayYouTubeIframe
                    embedUrl={item.videoUrl}
                    title={item.title}
                    muted={muted}
                    paused={isPaused}
                    className="w-full h-full border-0"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setManualPlay(item.id)}
                    className="relative w-full h-full flex items-center justify-center bg-black"
                  >
                    {item.thumbnail && (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-80"
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <div className="p-4 rounded-full bg-[#1AA7B8] text-white shadow-lg">
                        <Play size={26} fill="white" />
                      </div>
                    </div>
                  </button>
                )
              ) : (
                <div
                  className="relative w-full h-full flex items-center justify-center bg-black cursor-pointer"
                  onClick={() => toggleManualPause(item.id)}
                >
                  <video
                    ref={registerVideoRef(item.id)}
                    src={item.videoUrl}
                    poster={item.thumbnail || undefined}
                    loop
                    muted={muted}
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain bg-black"
                  />
                  {isPaused && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <div className="p-4 rounded-full bg-white/25 backdrop-blur-md">
                        <Play size={28} fill="white" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Gradient & Metadata */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
              <div className="pointer-events-none absolute bottom-4 left-3.5 right-16 z-20 space-y-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-extrabold">
                    {item.platform}
                  </span>
                  <span className="font-extrabold text-white truncate">@{item.handle}</span>
                  <span className="text-[#1AA7B8] font-bold">#{item.category}</span>
                </div>
                <p className="text-sm font-bold text-white line-clamp-2 leading-snug">
                  {item.title}
                </p>
                {item.summary && (
                  <p className="text-[11px] text-white/75 line-clamp-1">{item.summary}</p>
                )}
              </div>

              {/* Right Side TikTok Action Rail */}
              <div className="absolute right-2.5 bottom-5 z-20 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => scrollToSlide(idx - 1)}
                  disabled={idx === 0}
                  className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white disabled:opacity-30 hover:bg-black/80"
                  title="Previous video"
                  aria-label="Previous video"
                >
                  <ChevronUp size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSlide(idx + 1)}
                  disabled={idx === items.length - 1}
                  className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white disabled:opacity-30 hover:bg-black/80"
                  title="Next video"
                  aria-label="Next video"
                >
                  <ChevronDown size={18} />
                </button>

                {onRepost && (
                  <button
                    type="button"
                    onClick={() => onRepost(item)}
                    className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-[#1AA7B8] hover:bg-black/80"
                    title="Repost to Moments"
                    aria-label="Repost"
                  >
                    <Share2 size={17} />
                  </button>
                )}

                {onShareChat && (
                  <button
                    type="button"
                    onClick={() => onShareChat(item)}
                    className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/80"
                    title="Send to Friend"
                    aria-label="Send to Friend"
                  >
                    <Send size={16} />
                  </button>
                )}

                {onToggleSave && (
                  <button
                    type="button"
                    onClick={() => onToggleSave(item.id)}
                    className={`w-10 h-10 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center hover:bg-black/80 ${
                      isSaved ? 'text-[#1AA7B8]' : 'text-white'
                    }`}
                    title="Save video"
                    aria-label="Save video"
                  >
                    <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
                  </button>
                )}

                {safeUrl && item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/80"
                    title="Open original"
                    aria-label="Open original"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
