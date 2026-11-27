import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  PhoneIncoming,
  Volume2,
  VolumeX,
  RefreshCw,
} from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { CallRow, CallSession, Profile } from '../../types';
import { playCallRingtoneCycle } from '../../utils/messageSounds';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.metered.ca:80' },
  { urls: 'stun:stun.l.google.com:19302' },
];

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

  const isCaller = callSession.callerId === profile?.id;
  const peerId = isCaller ? callSession.receiverId : callSession.callerId;
  const isVoiceCall = lowDataMode || callSession.callType === 'voice';

  const [status, setStatus] = useState<string>(callSession.status || 'ringing');
  const [peerConnected, setPeerConnected] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(!isVoiceCall);
  const [cameraOff, setCameraOff] = useState(isVoiceCall);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [callSeconds, setCallSeconds] = useState(0);
  const [peerProfile, setPeerProfile] = useState<Profile | null>(callSession.peer || null);
  const [connectionHint, setConnectionHint] = useState<string>('Connecting...');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteMediaRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const signalChannelRef = useRef<RealtimeChannel | null>(null);
  const rowChannelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | undefined>(callSession.id);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteOfferRef = useRef<RTCSessionDescriptionInit | null>(callSession.offer || null);
  const answerAppliedRef = useRef(false);
  const startedAtRef = useRef<string | null>(null);
  const endedRef = useRef(false);

  // Load peer profile if incoming call arrived via realtime without full profile
  useEffect(() => {
    if (!peerProfile && peerId) {
      supabase
        .from('profiles')
        .select('*')
        .eq('id', peerId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const raw = data as Record<string, unknown>;
            setPeerProfile({
              id: String(raw.id || ''),
              username: String(raw.username || ''),
              name: String(raw.full_name || raw.name || raw.username || 'Contact'),
              full_name: String(raw.full_name || raw.name || ''),
              bio: String(raw.about || raw.bio || ''),
              avatar_url: String(raw.avatar_url || ''),
              role: String(raw.role || 'user'),
            });
          }
        });
    }
  }, [peerId, peerProfile]);

  // Play selected voice/video ringtone while ringing
  useEffect(() => {
    if (status !== 'ringing') return;
    const selectedTone = isVoiceCall ? voiceCallTone : videoCallTone;
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
        // Ignore if browser blocks AudioContext prior to user gesture
      }
    };

    playTone();
    const interval = setInterval(playTone, isCaller ? 3200 : 2400);
    return () => {
      clearInterval(interval);
      if (ctx) ctx.close().catch(() => {});
    };
  }, [status, isCaller, isVoiceCall, voiceCallTone, videoCallTone]);

  // Live duration counter when peer is connected
  useEffect(() => {
    if (!peerConnected) return;
    const timer = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [peerConnected]);

  // Keep local camera PIP attached
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current && !cameraOff) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [cameraOff, status]);

  // Sync speaker volume & output sink when available
  useEffect(() => {
    const el = remoteMediaRef.current as
      | (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> })
      | null;
    if (!el) return;
    el.volume = speakerOn ? 1.0 : 0.45;
  }, [speakerOn]);

  const cleanupCallResources = useCallback(() => {
    if (rowChannelRef.current) {
      supabase.removeChannel(rowChannelRef.current);
      rowChannelRef.current = null;
    }
    if (signalChannelRef.current) {
      supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    if (remoteMediaRef.current) remoteMediaRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }, []);

  const fetchMeteredIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
    if (!session?.access_token) return FALLBACK_ICE_SERVERS;
    try {
      const res = await fetch('/api/metered/ice', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return FALLBACK_ICE_SERVERS;
      const data = (await res.json()) as { iceServers?: RTCIceServer[] };
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        return data.iceServers;
      }
    } catch {
      // use fallback STUN
    }
    return FALLBACK_ICE_SERVERS;
  }, [session?.access_token]);

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
          try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
            localStreamRef.current = audioOnly;
            setCameraOff(true);
            showToast('Camera unavailable — connected with voice audio.', 'info');
            return audioOnly;
          } catch {
            showToast('Microphone access denied. Enable mic permission.', 'error');
            return null;
          }
        }
        showToast('Microphone access denied. Enable mic permission.', 'error');
        return null;
      }
    },
    [facingMode, showToast]
  );

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription || pendingIceRef.current.length === 0) return;
    const queued = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore stale ICE candidate
      }
    }
  }, []);

  const attachSignalAndPeer = useCallback(
    async (callId: string, role: 'caller' | 'callee', wantVideo: boolean) => {
      const [iceServers, localStream] = await Promise.all([
        fetchMeteredIceServers(),
        acquireLocalMedia(wantVideo),
      ]);

      const pc = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
      });
      pcRef.current = pc;

      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteMediaRef.current) {
        remoteMediaRef.current.srcObject = remoteStream;
      }

      const updateRemoteVideoState = () => {
        const liveVideo = remoteStream
          .getVideoTracks()
          .some((t) => t.readyState === 'live' && !t.muted && t.enabled);
        setRemoteHasVideo(liveVideo);
      };

      pc.ontrack = (event) => {
        const incomingStreams = event.streams && event.streams.length > 0 ? event.streams[0] : null;
        if (incomingStreams) {
          incomingStreams.getTracks().forEach((t) => {
            if (!remoteStream.getTracks().some((existing) => existing.id === t.id)) {
              remoteStream.addTrack(t);
            }
            t.addEventListener('mute', updateRemoteVideoState);
            t.addEventListener('unmute', updateRemoteVideoState);
            t.addEventListener('ended', updateRemoteVideoState);
          });
        } else if (event.track) {
          remoteStream.addTrack(event.track);
          event.track.addEventListener('mute', updateRemoteVideoState);
          event.track.addEventListener('unmute', updateRemoteVideoState);
          event.track.addEventListener('ended', updateRemoteVideoState);
        }

        if (remoteMediaRef.current) {
          remoteMediaRef.current.srcObject = remoteStream;
          remoteMediaRef.current.play().catch(() => {});
        }
        updateRemoteVideoState();
        setPeerConnected(true);
        setStatus('accepted');
        setConnectionHint('Connected');
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          setPeerConnected(true);
          setStatus('accepted');
          setConnectionHint('HD Encrypted');
        } else if (state === 'connecting') {
          setConnectionHint('Connecting via Metered TURN...');
        } else if (state === 'failed') {
          setConnectionHint('Network reconnecting...');
        }
      };

      // Subscribe to Supabase Realtime broadcast channel for instant ICE + SDP exchange
      const signalChannel = supabase.channel(`call-signal-${callId}`, {
        config: { broadcast: { self: false } },
      });
      signalChannelRef.current = signalChannel;

      signalChannel
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          const data = payload as { senderId?: string; candidate?: RTCIceCandidateInit };
          if (!data?.candidate || data.senderId === profile?.id) return;
          if (pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch {
              // ignore invalid candidate
            }
          } else {
            pendingIceRef.current.push(data.candidate);
          }
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          const data = payload as { senderId?: string; offer?: RTCSessionDescriptionInit };
          if (!data?.offer || data.senderId === profile?.id) return;
          remoteOfferRef.current = data.offer;
          if (role === 'callee' && pc.signalingState === 'stable' && !pc.remoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            await flushPendingIce(pc);
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            const answerPayload = { type: ans.type, sdp: ans.sdp };
            await signalChannel.send({
              type: 'broadcast',
              event: 'answer',
              payload: { senderId: profile?.id, answer: answerPayload },
            });
            await supabase
              .from('calls')
              .update({
                status: 'accepted',
                answer: answerPayload,
                started_at: new Date().toISOString(),
              })
              .eq('id', callId);
          }
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          const data = payload as { senderId?: string; answer?: RTCSessionDescriptionInit };
          if (!data?.answer || data.senderId === profile?.id || answerAppliedRef.current) return;
          answerAppliedRef.current = true;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await flushPendingIce(pc);
            setStatus('accepted');
          } catch {
            answerAppliedRef.current = false;
          }
        })
        .on('broadcast', { event: 'hangup' }, () => {
          if (!endedRef.current) {
            endedRef.current = true;
            showToast('Call ended', 'info');
            cleanupCallResources();
            onEnd();
          }
        })
        .subscribe();

      pc.onicecandidate = (event) => {
        if (event.candidate && signalChannelRef.current) {
          signalChannelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: { senderId: profile?.id, candidate: event.candidate.toJSON() },
          });
        }
      };

      if (role === 'caller') {
        const offerDesc = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offerDesc);
        const offerPayload = { type: offerDesc.type, sdp: offerDesc.sdp };

        await supabase
          .from('calls')
          .update({ offer: offerPayload })
          .eq('id', callId);

        await signalChannel.send({
          type: 'broadcast',
          event: 'offer',
          payload: { senderId: profile?.id, offer: offerPayload },
        });
      } else if (role === 'callee') {
        let offer = remoteOfferRef.current;
        if (!offer) {
          const { data: latestRow } = await supabase
            .from('calls')
            .select('offer')
            .eq('id', callId)
            .maybeSingle();
          offer = (latestRow as { offer?: RTCSessionDescriptionInit | null } | null)?.offer || null;
        }
        if (offer) {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          await flushPendingIce(pc);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          const answerPayload = { type: ans.type, sdp: ans.sdp };
          const startedIso = new Date().toISOString();
          startedAtRef.current = startedIso;

          await supabase
            .from('calls')
            .update({
              status: 'accepted',
              answer: answerPayload,
              started_at: startedIso,
            })
            .eq('id', callId);

          await signalChannel.send({
            type: 'broadcast',
            event: 'answer',
            payload: { senderId: profile?.id, answer: answerPayload },
          });
        }
      }
    },
    [
      acquireLocalMedia,
      cleanupCallResources,
      fetchMeteredIceServers,
      flushPendingIce,
      onEnd,
      profile?.id,
      showToast,
    ]
  );

  // Initialize Supabase `calls` row subscription & dial offer
  useEffect(() => {
    let mounted = true;

    const subscribeRow = (callId: string) => {
      const rowSub = supabase
        .channel(`call-row-${callId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
          async ({ new: rawRow }) => {
            const row = rawRow as CallRow;
            if (row.offer && !remoteOfferRef.current) {
              remoteOfferRef.current = row.offer;
            }
            if (row.answer && isCaller && pcRef.current && !answerAppliedRef.current) {
              answerAppliedRef.current = true;
              try {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(row.answer));
                await flushPendingIce(pcRef.current);
              } catch {
                answerAppliedRef.current = false;
              }
            }
            if (row.started_at && !startedAtRef.current) {
              startedAtRef.current = row.started_at;
            }
            setStatus(row.status);
            if (
              (row.status === 'ended' || row.status === 'declined' || row.status === 'rejected') &&
              !endedRef.current
            ) {
              endedRef.current = true;
              showToast(row.status === 'ended' ? 'Call ended' : 'Call declined', 'info');
              cleanupCallResources();
              onEnd();
            }
          }
        )
        .subscribe();
      rowChannelRef.current = rowSub;
    };

    const start = async () => {
      if (!profile) return;

      if (isCaller) {
        const { data: created, error } = await supabase
          .from('calls')
          .insert({
            caller_id: profile.id,
            receiver_id: peerId,
            type: isVoiceCall ? 'voice' : 'video',
            status: 'ringing',
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

        const cid = String((created as CallRow).id);
        activeCallIdRef.current = cid;
        subscribeRow(cid);
        await attachSignalAndPeer(cid, 'caller', !isVoiceCall);
      } else if (callSession.id) {
        activeCallIdRef.current = callSession.id;
        subscribeRow(callSession.id);
      }
    };

    start();

    return () => {
      mounted = false;
      cleanupCallResources();
    };
    // Mount-only call lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptCall = async () => {
    const cid = activeCallIdRef.current || callSession.id;
    if (!cid) return;
    setStatus('accepted');
    const startedIso = new Date().toISOString();
    startedAtRef.current = startedIso;
    await supabase
      .from('calls')
      .update({ status: 'accepted', started_at: startedIso })
      .eq('id', cid);
    await attachSignalAndPeer(cid, 'callee', !isVoiceCall);
  };

  const endCall = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    const cid = activeCallIdRef.current || callSession.id;
    const finalStatus = !isCaller && status === 'ringing' ? 'declined' : 'ended';
    if (signalChannelRef.current) {
      signalChannelRef.current
        .send({ type: 'broadcast', event: 'hangup', payload: { senderId: profile?.id } })
        .catch(() => {});
    }
    if (cid) {
      await supabase
        .from('calls')
        .update({
          status: finalStatus,
          ended_at: new Date().toISOString(),
        })
        .eq('id', cid);
    }
    cleanupCallResources();
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
    const existing = stream.getVideoTracks();
    if (existing.length > 0) {
      const nextOff = !cameraOff;
      existing.forEach((t) => {
        t.enabled = !nextOff;
      });
      setCameraOff(nextOff);
      return;
    }

    if (cameraOff) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        });
        const track = camStream.getVideoTracks()[0];
        if (!track) return;
        stream.addTrack(track);
        pcRef.current?.addTrack(track, stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setCameraOff(false);
      } catch {
        showToast('Could not access camera.', 'error');
      }
    }
  };

  const flipCamera = async () => {
    const stream = localStreamRef.current;
    const pc = pcRef.current;
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

      if (pc) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
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

  const showPeerAvatarOverlay = status === 'ringing' || !peerConnected || !remoteHasVideo;

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] text-white flex flex-col justify-between">
      {/* Remote video/audio element stays mounted so audio tracks always play */}
      <video
        ref={remoteMediaRef}
        autoPlay
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${
          remoteHasVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Ambient gradient glow behind avatar when voice/ringing */}
      {showPeerAvatarOverlay && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 35%, rgba(124, 58, 237, 0.25), transparent 55%), radial-gradient(circle at 20% 80%, rgba(0, 229, 255, 0.14), transparent 50%)',
          }}
        />
      )}

      {/* Top Call Status Pill */}
      <div className="relative z-20 p-4 flex items-center justify-between">
        <div className="px-3.5 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/10 text-[11px] font-bold tracking-wide text-[#00E5FF]">
          LetChat FLOW · {isVoiceCall ? 'Voice' : 'Video'}
        </div>

        {status === 'accepted' && (
          <div className="px-3.5 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/10 text-xs font-bold tabular-nums text-white">
            {peerConnected ? `Live · ${formatCallDuration(callSeconds)}` : connectionHint}
          </div>
        )}
      </div>

      {/* Avatar & Ringing / Voice Call View */}
      {showPeerAvatarOverlay && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center space-y-4 px-6 text-center">
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] p-[3px] shadow-2xl shadow-[#7C3AED]/40">
              <div className="w-full h-full rounded-full bg-[#12121A] flex items-center justify-center text-3xl font-extrabold overflow-hidden">
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
            </div>
            {status === 'ringing' && (
              <>
                <span className="absolute -inset-2 rounded-full border-2 border-[#00E5FF]/50 animate-ping" />
                <span className="absolute -inset-4 rounded-full border border-[#7C3AED]/40 animate-pulse" />
              </>
            )}
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight">
              {peerProfile?.name || 'Connecting...'}
            </h2>
            {peerProfile?.username && (
              <p className="text-xs text-zinc-400">@{peerProfile.username}</p>
            )}
          </div>

          <p className="text-sm font-semibold text-[#00E5FF]">
            {status === 'ringing'
              ? isCaller
                ? isVoiceCall
                  ? 'Calling (Voice)...'
                  : 'Calling (Video)...'
                : isVoiceCall
                  ? 'Incoming Voice Call...'
                  : 'Incoming Video Call...'
              : peerConnected
                ? isVoiceCall
                  ? `Voice Connected · ${formatCallDuration(callSeconds)}`
                  : `Connected · ${formatCallDuration(callSeconds)}`
                : connectionHint}
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
          className="absolute top-16 right-4 z-20 w-28 h-40 rounded-2xl object-cover border border-white/25 bg-[#12121A] shadow-2xl"
        />
      )}

      {/* Bottom Controls */}
      <div className="relative z-20 pb-10 pt-6 px-4 flex items-center justify-center gap-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
        {!isCaller && status === 'ringing' ? (
          <>
            <button
              type="button"
              onClick={endCall}
              className="min-h-[62px] min-w-[62px] flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30 transition"
              aria-label="Decline Call"
            >
              <PhoneOff size={24} />
            </button>
            <button
              type="button"
              onClick={acceptCall}
              className="min-h-[62px] min-w-[62px] flex items-center justify-center rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white animate-pulse shadow-lg shadow-[#00E5FF]/30 transition"
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
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full transition border ${
                muted
                  ? 'bg-white text-black border-white'
                  : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
              }`}
              aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            <button
              type="button"
              onClick={() => setSpeakerOn((s) => !s)}
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full transition border ${
                speakerOn
                  ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                  : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
              }`}
              aria-label={speakerOn ? 'Speaker On' : 'Earpiece'}
              title={speakerOn ? 'Speaker On' : 'Earpiece Mode'}
            >
              {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
            </button>

            <button
              type="button"
              onClick={toggleCamera}
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full transition border ${
                cameraOff
                  ? 'bg-white text-black border-white'
                  : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
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
                className="min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full bg-white/10 text-white border border-white/15 hover:bg-white/20 transition"
                aria-label="Switch Camera"
                title="Switch Camera"
              >
                <RefreshCw size={20} />
              </button>
            )}

            <button
              type="button"
              onClick={endCall}
              className="min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 transition shadow-lg shadow-red-600/30"
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
