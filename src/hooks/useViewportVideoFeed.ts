import { useCallback, useEffect, useRef, useState } from 'react';

interface ViewportMetrics {
  isIntersecting: boolean;
  ratio: number;
  visibleArea: number;
  distFromCenter: number;
}

export interface ViewportVideoFeedOptions {
  /** Ordered list of currently rendered video IDs */
  videoIds: string[];
  /** Optional scroll container element (null uses browser viewport) */
  root?: HTMLElement | null;
  /** Minimum intersectionRatio (0..1) required to count as majority visible (default 0.5) */
  minRatio?: number;
  /** Temporarily pause and disable observer (e.g. modal open or hidden mode) */
  disabled?: boolean;
  /** Controlled muted state synced onto active <video> elements */
  muted: boolean;
  /** Called if browser autoplay policy rejects unmuted playback and falls back to muted */
  onFallbackMute?: () => void;
  /** Unique key identifying this feed so concurrent feeds pause each other cleanly */
  feedKey: string;
}

const ACTIVE_FEED_EVENT = 'letchat:viewport-video-active';

export function playVideoWithCompatibility(
  videoEl: HTMLVideoElement,
  desiredMuted: boolean,
  onFallbackMute?: () => void
) {
  videoEl.muted = desiredMuted;
  videoEl.playsInline = true;
  const playResult = videoEl.play();
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch(() => {
      // Browser autoplay policy blocks unmuted autoplay before user gesture:
      // switch to muted state and retry play() for compatibility.
      if (!videoEl.muted) {
        videoEl.muted = true;
        onFallbackMute?.();
        videoEl.play().catch(() => {});
      }
    });
  }
}

export function useViewportVideoFeed({
  videoIds,
  root = null,
  minRatio = 0.5,
  disabled = false,
  muted,
  onFallbackMute,
  feedKey,
}: ViewportVideoFeedOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pausedMap, setPausedMap] = useState<Record<string, boolean>>({});

  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const metricsRef = useRef<Map<string, ViewportMetrics>>(new Map());
  const activeIdRef = useRef<string | null>(null);
  const prevActiveIdRef = useRef<string | null>(null);
  const mutedRef = useRef(muted);
  const pausedMapRef = useRef(pausedMap);
  const videoIdsRef = useRef(videoIds);
  const onFallbackMuteRef = useRef(onFallbackMute);

  mutedRef.current = muted;
  pausedMapRef.current = pausedMap;
  videoIdsRef.current = videoIds;
  onFallbackMuteRef.current = onFallbackMute;

  const setAndSyncActiveId = useCallback(
    (nextId: string | null) => {
      if (activeIdRef.current === nextId) return;
      const prevId = activeIdRef.current;
      prevActiveIdRef.current = prevId;
      activeIdRef.current = nextId;
      setActiveId(nextId);

      // Pause previous video explicitly when moving to the next one
      if (prevId) {
        const prevVid = videoRefs.current[prevId];
        if (prevVid && !prevVid.paused) {
          prevVid.pause();
        }
      }

      // Trigger play() for current video if mounted and not manually paused
      if (nextId && !pausedMapRef.current[nextId]) {
        const nextVid = videoRefs.current[nextId];
        if (nextVid) {
          playVideoWithCompatibility(nextVid, mutedRef.current, onFallbackMuteRef.current);
        }
        window.dispatchEvent(
          new CustomEvent(ACTIVE_FEED_EVENT, { detail: { feedKey, videoId: nextId } })
        );
      }
    },
    [feedKey]
  );

  const pickMajorityWinner = useCallback(() => {
    if (disabled) {
      setAndSyncActiveId(null);
      return;
    }

    const ids = videoIdsRef.current;
    let bestId: string | null = null;
    let bestScore = -Infinity;

    for (const id of ids) {
      const m = metricsRef.current.get(id);
      if (!m || !m.isIntersecting || m.ratio < minRatio) continue;

      // Primary: visible ratio (bucketed slightly so near-equal 100% cards tie-break cleanly)
      // Secondary: larger visible pixel area and closer proximity to viewport center
      const score = m.ratio * 10000 + Math.min(m.visibleArea, 500000) * 0.001 - m.distFromCenter * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    setAndSyncActiveId(bestId);
  }, [disabled, minRatio, setAndSyncActiveId]);

  // Listen for another feed taking active playback so only one feed plays on screen
  useEffect(() => {
    const handleOtherFeedActive = (e: Event) => {
      const detail = (e as CustomEvent<{ feedKey: string; videoId: string }>).detail;
      if (!detail || detail.feedKey === feedKey) return;
      const current = activeIdRef.current;
      if (current) {
        const vid = videoRefs.current[current];
        if (vid && !vid.paused) vid.pause();
        activeIdRef.current = null;
        setActiveId(null);
      }
    };
    window.addEventListener(ACTIVE_FEED_EVENT, handleOtherFeedActive);
    return () => window.removeEventListener(ACTIVE_FEED_EVENT, handleOtherFeedActive);
  }, [feedKey]);

  // Pause when browser tab goes to background; resume active video when visible again
  useEffect(() => {
    const handleVisibility = () => {
      const current = activeIdRef.current;
      if (!current) return;
      const vid = videoRefs.current[current];
      if (!vid) return;
      if (document.hidden) {
        vid.pause();
      } else if (!pausedMapRef.current[current] && !disabled) {
        playVideoWithCompatibility(vid, mutedRef.current, onFallbackMuteRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [disabled]);

  // Core IntersectionObserver monitoring all video containers
  const videoIdsKey = videoIds.join(',');
  useEffect(() => {
    if (disabled || videoIds.length === 0) {
      metricsRef.current.clear();
      setAndSyncActiveId(null);
      return;
    }

    // Prune removed IDs from metrics map
    const validSet = new Set(videoIds);
    for (const key of metricsRef.current.keys()) {
      if (!validSet.has(key)) metricsRef.current.delete(key);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const rootCenterY = entries[0]?.rootBounds
          ? entries[0].rootBounds.top + entries[0].rootBounds.height / 2
          : window.innerHeight / 2;

        for (const entry of entries) {
          const id = entry.target.getAttribute('data-vp-video-id');
          if (!id) continue;
          const rect = entry.intersectionRect;
          const elCenterY = entry.boundingClientRect.top + entry.boundingClientRect.height / 2;
          metricsRef.current.set(id, {
            isIntersecting: entry.isIntersecting,
            ratio: entry.intersectionRatio,
            visibleArea: rect.width * rect.height,
            distFromCenter: Math.abs(elCenterY - rootCenterY),
          });
        }

        pickMajorityWinner();
      },
      {
        root: root ?? null,
        threshold: [0, 0.15, 0.35, 0.5, 0.65, 0.85, 1.0],
      }
    );

    for (const id of videoIds) {
      const el = itemRefs.current[id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [videoIdsKey, root, disabled, pickMajorityWinner, setAndSyncActiveId]);

  // Keep native <video> muted property & play/pause state in sync with React state
  useEffect(() => {
    for (const id of videoIds) {
      const vid = videoRefs.current[id];
      if (!vid) continue;
      vid.muted = muted;
      const shouldPlay = !disabled && id === activeId && !pausedMap[id];
      if (shouldPlay) {
        if (vid.paused) {
          playVideoWithCompatibility(vid, muted, onFallbackMuteRef.current);
        }
      } else if (!vid.paused) {
        vid.pause();
      }
    }
  }, [activeId, muted, pausedMap, disabled, videoIdsKey]);

  const registerItemRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      itemRefs.current[id] = el;
    },
    []
  );

  const registerVideoRef = useCallback(
    (id: string) => (el: HTMLVideoElement | null) => {
      videoRefs.current[id] = el;
      if (!el) return;
      el.muted = mutedRef.current;
      el.playsInline = true;
      if (!disabled && activeIdRef.current === id && !pausedMapRef.current[id]) {
        if (el.paused) {
          playVideoWithCompatibility(el, mutedRef.current, onFallbackMuteRef.current);
        }
      } else if (!el.paused) {
        el.pause();
      }
    },
    [disabled]
  );

  const toggleManualPause = useCallback((id: string) => {
    setPausedMap((prev) => {
      const nextPaused = !prev[id];
      const vid = videoRefs.current[id];
      if (vid) {
        if (nextPaused) {
          vid.pause();
        } else {
          playVideoWithCompatibility(vid, mutedRef.current, onFallbackMuteRef.current);
        }
      }
      return { ...prev, [id]: nextPaused };
    });
  }, []);

  const setManualPlay = useCallback(
    (id: string) => {
      setPausedMap((prev) => ({ ...prev, [id]: false }));
      setAndSyncActiveId(id);
    },
    [setAndSyncActiveId]
  );

  return {
    activeId,
    setActiveId: setAndSyncActiveId,
    pausedMap,
    setPausedMap,
    registerItemRef,
    registerVideoRef,
    toggleManualPause,
    setManualPlay,
  };
}
