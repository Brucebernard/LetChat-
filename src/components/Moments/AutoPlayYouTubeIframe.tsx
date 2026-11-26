import React, { useEffect, useMemo, useRef } from 'react';

interface AutoPlayYouTubeIframeProps {
  embedUrl: string;
  title: string;
  muted: boolean;
  paused?: boolean;
  className?: string;
}

function extractYtIdFromEmbed(url: string): string | null {
  const m = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function AutoPlayYouTubeIframe({
  embedUrl,
  title,
  muted,
  paused = false,
  className = 'w-full h-full border-0',
}: AutoPlayYouTubeIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Capture initial muted value at mount so toggling mute uses postMessage instead of reloading the iframe
  const initialMutedRef = useRef(muted);

  const src = useMemo(() => {
    const ytId = extractYtIdFromEmbed(embedUrl);
    const sep = embedUrl.includes('?') ? '&' : '?';
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? `&origin=${encodeURIComponent(window.location.origin)}`
        : '';
    const loopParams = ytId ? `&loop=1&playlist=${ytId}` : '';
    return `${embedUrl}${sep}autoplay=1&mute=${
      initialMutedRef.current ? 1 : 0
    }&playsinline=1&enablejsapi=1${origin}&rel=0&modestbranding=1${loopParams}`;
  }, [embedUrl]);

  const sendCommand = (func: string) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
  };

  useEffect(() => {
    sendCommand(muted ? 'mute' : 'unMute');
    if (!paused) {
      sendCommand('playVideo');
    }
  }, [muted]);

  useEffect(() => {
    sendCommand(paused ? 'pauseVideo' : 'playVideo');
  }, [paused]);

  const handleLoad = () => {
    sendCommand(muted ? 'mute' : 'unMute');
    sendCommand(paused ? 'pauseVideo' : 'playVideo');
  };

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      onLoad={handleLoad}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      className={className}
    />
  );
}
