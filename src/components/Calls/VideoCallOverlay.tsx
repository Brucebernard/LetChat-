import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  PhoneIncoming,
  Users,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { MeteredPeer, RemotePeer } from '@metered-ca/realtime';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { CallSession, Profile } from '../../types';
import { playCallRingtoneCycle } from '../../utils/messageSounds';

const FALLBACK_METERED_ROOM_URL = 'letchat_gnana-123.metered.live/azttjqrujl';
const METERED_SDK_URL = 'https://cdn.metered.ca/sdk/frame/1.4.3/sdk-frame.min.js';

declare global {
  interface Window {
    MeteredFrame?: new () => {
      init: (config: { roomURL: string }, container: HTMLElement) => void;
    };
  }
}

function loadMeteredFrameSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.MeteredFrame) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${METERED_SDK_URL}"]`
    );
    if (existing) {
      if (window.MeteredFrame) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Metered SDK')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = METERED_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Metered SDK'));
    document.head.appendChild(script);
  });
}

function formatCallDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface VideoCallOverlayProps {
  callSession: CallSession;
  onEnd: () => void;
}

export default function VideoCallOverlay({ callSession, onEnd }: VideoCallOverlayProps) {
  const { profile, session } = useAuth();
  const { lowDataMode, voiceCallTone, videoCallTone } = useSettings();
  const { showToast } = useToast();

  const [status, setStatus] = useState<string>(callSession.status || 'ringing');
  const [peerConnected, setPeerConnected] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(lowDataMode || callSession.callType === 'audio');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [callSeconds, setCallSeconds] = useState(0);
  const [peerProfile, setPeerProfile] = useState<Profile | null>(callSession.peer || null);
  const [meteredMode, setMeteredMode] = useState<boolean>(Boolean(callSession.useMeteredRoom));
  const [loadingMetered, setLoadingMetered] = useState<boolean>(Boolean(callSession.useMeteredRoom));
  const [configuredRoomUrl, setConfiguredRoomUrl] = useState<string>(
    callSession.roomUrl || FALLBACK_METERED_ROOM_URL
  );

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const meteredContainerRef = useRef<HTMLDivElement | null>(null);
  const meteredPeerRef = useRef<MeteredPeer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | undefined>(callSession.id);
  const endedRef = useRef(false);

  const isCaller = callSession.callerId === profile?.id;
  const peerId = isCaller ? callSession.receiverId : callSession.callerId;
  const isAudioCall = lowDataMode || callSession.callType === 'audio';
  const roomUrl = callSession.roomUrl || configuredRoomUrl;

  // Fetch Metered HD Room config from server when needed
  useEffect(() => {
    if (!session?.access_token) return;
    fetch('/api/metered/config', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { defaultRoomUrl?: string } | null) => {
        if (data?.defaultRoomUrl && !callSession.roomUrl) {
          setConfiguredRoomUrl(data.defaultRoomUrl);
        }
      })
      .catch(() => {});
  }, [session?.access_token, callSession.roomUrl]);

  // Load peer profile if incoming call didn't carry full profile object
  useEffect(() => {
    if (!peerProfile && peerId && !callSession.useMeteredRoom) {
      supabase
        .from('profiles')
        .select('*')
        .eq('id', peerId)
        .single()
        .then(({ data }) => {
          if (data) setPeerProfile(data as Profile);
        });
    }
  }, [peerId, peerProfile, callSession.useMeteredRoom]);

  // Play selected voice/video ringtone while status === 'ringing' (respecting autoplay rules)
  useEffect(() => {
    if (meteredMode || status !== 'ringing') return;
    const selectedTone = isAudioCall ? voiceCallTone : videoCallTone;
    if (selectedTone === 'silent') return;

    let ctx: AudioContext | null = null;
    const playTone = () => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!ctx) ctx = new AudioCtx();
        playCallRingtoneCycle(selectedTone, isCaller ? 'caller' : 'receiver', ctx);
      } catch {
        // Ignore if AudioContext is blocked prior to gesture
      }
    };

    playTone();
    const interval = setInterval(playTone, isCaller ? 3200 : 2400);
    return () => {
      clearInterval(interval);
      if (ctx) {
        ctx.close().catch(() => {});
      }
    };
  }, [meteredMode, status, isCaller, isAudioCall, voiceCallTone, videoCallTone]);

  // Live call duration timer once connected
  useEffect(() => {
    if (meteredMode || !peerConnected) return;
    const timer = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [meteredMode, peerConnected]);

  // Sync local video element when stream or camera toggle changes
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current && !cameraOff) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [cameraOff, status]);

  const cleanupMediaAndPeer = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (meteredPeerRef.current) {
      meteredPeerRef.current.close('Call ended').catch(() => {});
      meteredPeerRef.current = null;
    }
  }, []);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    remoteStreamRef.current = stream;
    const evaluateVideo = () => {
      const hasLiveVideo = stream
        .getVideoTracks()
        .some((t) => t.readyState === 'live' && !t.muted && t.enabled);
      setRemoteHasVideo(hasLiveVideo);
    };

    evaluateVideo();
    stream.getTracks().forEach((track) => {
      track.addEventListener('mute', evaluateVideo);
      track.addEventListener('unmute', evaluateVideo);
      track.addEventListener('ended', evaluateVideo);
    });
    stream.addEventListener('addtrack', evaluateVideo);
    stream.addEventListener('removetrack', evaluateVideo);

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, []);

  const acquireLocalMedia = useCallback(
    async (wantVideo: boolean): Promise<MediaStream | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: wantVideo
            ? { facingMode, width: { ideal: 640 }, height: { ideal: 480 } }
            : false,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current && wantVideo) {
          localVideoRef.current.srcObject = stream;
        }
        return stream;
      } catch {
        if (wantVideo) {
          // Camera blocked or missing — fall back cleanly to microphone audio so voice works
          try {
            const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
            localStreamRef.current = audioOnlyStream;
            setCameraOff(true);
            showToast('Camera unavailable — connected with voice audio.', 'info');
            return audioOnlyStream;
          } catch {
            showToast('Microphone access denied. Please allow microphone permission.', 'error');
            return null;
          }
        }
        showToast('Microphone access denied. Please allow microphone permission.', 'error');
        return null;
      }
    },
    [facingMode, showToast]
  );

  const connectMeteredPeer = useCallback(
    async (callId: string, wantVideo: boolean) => {
      if (!session?.access_token) {
        showToast('Please sign in to place calls.', 'error');
        return;
      }

      if (meteredPeerRef.current) {
        await meteredPeerRef.current.close('Restarting session').catch(() => {});
        meteredPeerRef.current = null;
      }

      const peer = new MeteredPeer({
        tokenProvider: async () => {
          const res = await fetch('/api/metered/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              callId,
              displayName: profile?.name || profile?.username || 'LetChat User',
            }),
          });
          if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(errData.error || 'Could not authorize call');
          }
          const data = (await res.json()) as { token?: string };
          if (!data.token) throw new Error('Missing Metered token');
          return data.token;
        },
      });
      meteredPeerRef.current = peer;

      const handleRemote = (remote: RemotePeer) => {
        setPeerConnected(true);
        setStatus('accepted');
        remote.on('stream-added', ({ stream }) => {
          attachRemoteStream(stream);
        });
        remote.on('stream-removed', () => {
          setRemoteHasVideo(false);
        });
      };

      peer.on('peer-joined', ({ peer: remote }) => {
        handleRemote(remote);
      });

      peer.on('peer-left', () => {
        if (!endedRef.current) {
          endedRef.current = true;
          showToast('Call ended.', 'info');
          cleanupMediaAndPeer();
          onEnd();
        }
      });

      peer.on('error', ({ err }) => {
        if (!endedRef.current) {
          showToast(err?.message || 'Call connection interrupted.', 'error');
        }
      });

      try {
        const localStream = await acquireLocalMedia(wantVideo);
        await peer.join(`letchat-call-${callId}`, { includeSenderMetadata: true });
        if (localStream) {
          peer.addStream(localStream, { role: 'camera' });
        }
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Unable to connect voice/video call.',
          'error'
        );
      }
    },
    [
      acquireLocalMedia,
      attachRemoteStream,
      cleanupMediaAndPeer,
      onEnd,
      profile?.name,
      profile?.username,
      session?.access_token,
      showToast,
    ]
  );

  // Mount MeteredFrame video room when HD Room mode is active
  useEffect(() => {
    if (!meteredMode) return;
    let cancelled = false;
    setLoadingMetered(true);

    loadMeteredFrameSdk()
      .then(() => {
        if (cancelled || !meteredContainerRef.current || !window.MeteredFrame) return;
        meteredContainerRef.current.innerHTML = '';
        const frame = new window.MeteredFrame();
        frame.init({ roomURL: roomUrl }, meteredContainerRef.current);
        setLoadingMetered(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingMetered(false);
          showToast('Could not connect to Metered video room.', 'error');
        }
      });

    return () => {
      cancelled = true;
      if (meteredContainerRef.current) {
        meteredContainerRef.current.innerHTML = '';
      }
    };
  }, [meteredMode, roomUrl, showToast]);

  // Initialize Supabase call row + MeteredPeer session
  useEffect(() => {
    if (callSession.useMeteredRoom) return;
    let callRowSub: RealtimeChannel | null = null;
    let mounted = true;

    const initCall = async () => {
      if (!profile) return;

      if (isCaller) {
        const { data: created, error } = await supabase
          .from('video_calls')
          .insert({
            caller_id: profile.id,
            receiver_id: peerId,
            status: 'ringing',
            call_type: isAudioCall ? 'audio' : 'video',
          })
          .select()
          .single();

        if (!mounted || error || !created) {
          if (mounted) {
            showToast('Unable to place call right now.', 'error');
            onEnd();
          }
          return;
        }

        activeCallIdRef.current = created.id;

        callRowSub = supabase
          .channel(`call-row-${created.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'video_calls', filter: `id=eq.${created.id}` },
            ({ new: row }) => {
              const r = row as { status: string };
              setStatus(r.status);
              if ((r.status === 'ended' || r.status === 'rejected') && !endedRef.current) {
                endedRef.current = true;
                showToast(r.status === 'rejected' ? 'Call declined' : 'Call ended', 'info');
                cleanupMediaAndPeer();
                onEnd();
              }
            }
          )
          .subscribe();

        await connectMeteredPeer(created.id, !isAudioCall);
      } else if (callSession.id) {
        callRowSub = supabase
          .channel(`call-row-${callSession.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'video_calls',
              filter: `id=eq.${callSession.id}`,
            },
            ({ new: row }) => {
              const r = row as { status: string };
              setStatus(r.status);
              if ((r.status === 'ended' || r.status === 'rejected') && !endedRef.current) {
                endedRef.current = true;
                cleanupMediaAndPeer();
                onEnd();
              }
            }
          )
          .subscribe();
      }
    };

    initCall();

    return () => {
      mounted = false;
      if (callRowSub) supabase.removeChannel(callRowSub);
      cleanupMediaAndPeer();
    };
  }, []);

  const acceptCall = async () => {
    if (!callSession.id) return;
    setStatus('accepted');
    await supabase.from('video_calls').update({ status: 'accepted' }).eq('id', callSession.id);
    await connectMeteredPeer(callSession.id, !isAudioCall);
  };

  const endCall = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    const cid = activeCallIdRef.current || callSession.id;
    if (cid && !callSession.useMeteredRoom) {
      await supabase
        .from('video_calls')
        .update({ status: !isCaller && status === 'ringing' ? 'rejected' : 'ended' })
        .eq('id', cid);
    }
    cleanupMediaAndPeer();
    onEnd();
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  };

  const toggleCamera = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const existingVideoTracks = stream.getVideoTracks();
    if (existingVideoTracks.length > 0) {
      const nextOff = !cameraOff;
      existingVideoTracks.forEach((t) => {
        t.enabled = !nextOff;
      });
      setCameraOff(nextOff);
      return;
    }

    // Started as audio-only and user taps Video icon to turn on camera mid-call
    if (cameraOff) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        });
        const newVideoTrack = camStream.getVideoTracks()[0];
        if (!newVideoTrack) return;
        stream.addTrack(newVideoTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        meteredPeerRef.current?.addTrack(newVideoTrack, stream, { role: 'camera' });
        setCameraOff(false);
      } catch {
        showToast('Could not access camera.', 'error');
      }
    }
  };

  const flipCamera = async () => {
    const stream = localStreamRef.current;
    const peer = meteredPeerRef.current;
    if (!stream || cameraOff) return;
    const oldTrack = stream.getVideoTracks()[0];
    if (!oldTrack) return;

    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const nextCam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      const newTrack = nextCam.getVideoTracks()[0];
      if (!newTrack) return;

      if (peer) {
        await peer.replaceTrack(oldTrack, newTrack);
      }
      stream.removeTrack(oldTrack);
      oldTrack.stop();
      stream.addTrack(newTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setFacingMode(nextMode);
    } catch {
      showToast('Unable to switch camera on this device.', 'error');
    }
  };

  if (meteredMode) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
        <div className="h-14 px-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Users size={18} className="text-[#1AA7B8] shrink-0" />
            <span className="font-bold text-sm truncate">
              {peerProfile ? `LetChat Room · ${peerProfile.name}` : 'LetChat Live Video Room'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!callSession.useMeteredRoom && (
              <button
                type="button"
                onClick={() => setMeteredMode(false)}
                className="px-3 min-h-[34px] rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold"
              >
                Direct Call
              </button>
            )}
            <button
              type="button"
              onClick={endCall}
              className="flex items-center gap-1.5 px-3.5 min-h-[34px] rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold"
            >
              <PhoneOff size={14} /> Leave
            </button>
          </div>
        </div>

        <div className="relative flex-1 bg-black">
          {loadingMetered && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 z-10">
              <Loader2 size={28} className="animate-spin text-[#1AA7B8]" />
              <span className="text-xs text-slate-300">Connecting to LetChat Video Room...</span>
            </div>
          )}
          <div
            id="metered-frame"
            ref={meteredContainerRef}
            className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
          />
        </div>
      </div>
    );
  }

  const showPeerAvatarOverlay = status === 'ringing' || !peerConnected || !remoteHasVideo;

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col justify-between">
      {/* Always keep remote <video> mounted so incoming audio & video tracks play reliably */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${
          remoteHasVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Top Bar with HD Room Switcher & Live Timer */}
      <div className="relative z-20 p-4 flex items-center justify-between pointer-events-none">
        <button
          type="button"
          onClick={() => {
            cleanupMediaAndPeer();
            setMeteredMode(true);
          }}
          className="pointer-events-auto flex items-center gap-1.5 px-3 min-h-[36px] rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-xs font-semibold hover:bg-black/75 transition"
        >
          <Users size={14} className="text-[#1AA7B8]" /> Switch to HD Room
        </button>

        {status === 'accepted' && (
          <div className="px-3 py-1 rounded-full bg-black/55 backdrop-blur-md text-xs font-bold tabular-nums text-emerald-400">
            {peerConnected ? `Live · ${formatCallDuration(callSeconds)}` : 'Connecting...'}
          </div>
        )}
      </div>

      {/* Avatar & Call State Overlay when Ringing or Voice-Only */}
      {showPeerAvatarOverlay && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm space-y-3 px-6 text-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-[#0A3D62] flex items-center justify-center text-3xl font-bold border-2 border-[#1AA7B8] overflow-hidden shadow-xl">
              {peerProfile?.avatar_url ? (
                <img
                  src={peerProfile.avatar_url}
                  alt={peerProfile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                (peerProfile?.name?.[0] || '?').toUpperCase()
              )}
            </div>
            {status === 'ringing' && (
              <span className="absolute -inset-2 rounded-full border-2 border-[#1AA7B8]/50 animate-ping" />
            )}
          </div>
          <h2 className="text-xl font-bold">{peerProfile?.name || 'Connecting...'}</h2>
          <p className="text-sm text-[#1AA7B8] font-medium">
            {status === 'ringing'
              ? isCaller
                ? isAudioCall
                  ? 'Calling (Voice)...'
                  : 'Calling (Video)...'
                : isAudioCall
                  ? 'Incoming Voice Call...'
                  : 'Incoming Video Call...'
              : peerConnected
                ? isAudioCall
                  ? `Voice Call · ${formatCallDuration(callSeconds)}`
                  : `Connected · ${formatCallDuration(callSeconds)}`
                : 'Connecting audio & video...'}
          </p>
        </div>
      )}

      {/* Local Camera Preview PIP */}
      {!cameraOff && (
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="absolute top-16 right-4 z-20 w-28 h-40 rounded-2xl object-cover border-2 border-white/40 bg-zinc-900 shadow-lg"
        />
      )}

      {/* Bottom Controls */}
      <div className="relative z-20 pb-10 pt-6 flex items-center justify-center gap-4 bg-gradient-to-t from-black/90 to-transparent">
        {!isCaller && status === 'ringing' ? (
          <>
            <button
              type="button"
              onClick={endCall}
              className="min-h-[58px] min-w-[58px] flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 shadow-lg"
              aria-label="Decline Call"
            >
              <PhoneOff size={24} />
            </button>
            <button
              type="button"
              onClick={acceptCall}
              className="min-h-[58px] min-w-[58px] flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 animate-pulse shadow-lg"
              aria-label="Accept Call"
            >
              <PhoneIncoming size={24} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full transition ${
                muted ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            <button
              type="button"
              onClick={toggleCamera}
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full transition ${
                cameraOff ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              title={cameraOff ? 'Camera On' : 'Camera Off'}
            >
              {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>

            {!cameraOff && (
              <button
                type="button"
                onClick={flipCamera}
                className="min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition"
                aria-label="Switch Camera"
                title="Switch Camera"
              >
                <RefreshCw size={20} />
              </button>
            )}

            <button
              type="button"
              onClick={endCall}
              className="min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 transition shadow-lg"
              aria-label="End Call"
              title="End Call"
            >
              <PhoneOff size={22} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
