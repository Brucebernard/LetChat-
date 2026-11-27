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
import { getDisplayName, setCachedProfile } from '../../utils/appCache';
import { ProfileAvatar, VerifiedNameBadge } from '../Common/VerifiedBadge';

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
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const activeCallIdRef = useRef<string | undefined>(callSession.id);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteOfferRef = useRef<RTCSessionDescriptionInit | null>(callSession.offer || null);
  const answerAppliedRef = useRef(false);
  const relayRetriedRef = useRef(false);
  const peerConnectedRef = useRef(false);
  const startedAtRef = useRef<string | null>(null);
  const endedRef = useRef(false);
  const roleRef = useRef<'caller' | 'callee'>(isCaller ? 'caller' : 'callee');

  useEffect(() => {
    peerConnectedRef.current = peerConnected;
  }, [peerConnected]);

  // Load full peer profile (display_name, username, avatar_url, is_verified)
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
            const p: Profile = {
              id: String(raw.id || ''),
              username: String(raw.username || ''),
              display_name: String(raw.display_name || raw.full_name || raw.name || raw.username || ''),
              name: String(raw.name || raw.full_name || raw.username || ''),
              full_name: String(raw.full_name || raw.name || ''),
              bio: String(raw.about || raw.bio || ''),
              avatar_url: String(raw.avatar_url || ''),
              role: String(raw.role || 'user'),
              is_verified: Boolean(raw.is_verified),
            };
            setCachedProfile(p);
            setPeerProfile(p);
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
      localVideoRef.current.play().catch(() => {});
    }
  }, [cameraOff, status]);

  // Sync speaker volume
  useEffect(() => {
    const el = remoteMediaRef.current;
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
        pcRef.current.oniceconnectionstatechange = null;
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
        iceServersRef.current = data.iceServers;
        return data.iceServers;
      }
    } catch {
      // use fallback STUN
    }
    return FALLBACK_ICE_SERVERS;
  }, [session?.access_token]);

  const acquireLocalMedia = useCallback(
    async (wantVideo: boolean): Promise<MediaStream | null> => {
      if (localStreamRef.current) return localStreamRef.current;
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
          localVideoRef.current.play().catch(() => {});
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

  const setupPeerConnection = useCallback(
    (
      callId: string,
      iceServers: RTCIceServer[],
      localStream: MediaStream | null,
      policy: RTCIceTransportPolicy
    ): RTCPeerConnection => {
      if (pcRef.current) {
        try {
          pcRef.current.onicecandidate = null;
          pcRef.current.ontrack = null;
          pcRef.current.onconnectionstatechange = null;
          pcRef.current.oniceconnectionstatechange = null;
          pcRef.current.close();
        } catch {
          // ignore
        }
      }

      const pc = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: policy,
        bundlePolicy: 'max-bundle',
      });
      pcRef.current = pc;

      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      const fallbackStream = new MediaStream();
      remoteStreamRef.current = fallbackStream;

      pc.ontrack = (event) => {
        const incomingStream = event.streams && event.streams.length > 0 ? event.streams[0] : null;
        if (incomingStream) {
          remoteStreamRef.current = incomingStream;
          if (remoteMediaRef.current && remoteMediaRef.current.srcObject !== incomingStream) {
            remoteMediaRef.current.srcObject = incomingStream;
          }
        } else if (event.track) {
          if (!fallbackStream.getTracks().some((t) => t.id === event.track.id)) {
            fallbackStream.addTrack(event.track);
          }
          if (remoteMediaRef.current && remoteMediaRef.current.srcObject !== fallbackStream) {
            remoteMediaRef.current.srcObject = fallbackStream;
          }
        }

        if (remoteMediaRef.current) {
          remoteMediaRef.current.play().catch(() => {});
        }

        const activeStream = incomingStream || fallbackStream;
        const hasAnyVideo =
          event.track?.kind === 'video' ||
          activeStream.getVideoTracks().some((t) => t.readyState !== 'ended' && t.enabled);

        if (hasAnyVideo) {
          setRemoteHasVideo(true);
        }

        event.track?.addEventListener('ended', () => {
          const stillHasVideo = activeStream
            .getVideoTracks()
            .some((t) => t.readyState === 'live' && t.enabled);
          setRemoteHasVideo(stillHasVideo);
        });

        setPeerConnected(true);
        setStatus('accepted');
        setConnectionHint('HD Encrypted');
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && signalChannelRef.current) {
          signalChannelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: { senderId: profile?.id, candidate: event.candidate.toJSON() },
          });
        }
      };

      const handleConnState = () => {
        const cState = pc.connectionState;
        const iState = pc.iceConnectionState;
        if (cState === 'connected' || iState === 'connected' || iState === 'completed') {
          setPeerConnected(true);
          setStatus('accepted');
          setConnectionHint('HD Encrypted');
        } else if (cState === 'connecting' || iState === 'checking') {
          setConnectionHint('Connecting...');
        } else if (cState === 'failed' || iState === 'failed') {
          if (!relayRetriedRef.current) {
            triggerTurnRelayRetry(callId);
          } else {
            setConnectionHint('Reconnecting...');
            pc.restartIce?.();
          }
        }
      };

      pc.onconnectionstatechange = handleConnState;
      pc.oniceconnectionstatechange = handleConnState;

      return pc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id]
  );

  const triggerTurnRelayRetry = useCallback(
    async (callId: string) => {
      if (relayRetriedRef.current || endedRef.current || peerConnectedRef.current) return;
      const hasTurn = iceServersRef.current.some((s) => {
        const urls = Array.isArray(s.urls) ? s.urls.join(',') : s.urls;
        return urls.includes('turn:') || urls.includes('turns:');
      });
      if (!hasTurn) {
        pcRef.current?.restartIce?.();
        return;
      }

      relayRetriedRef.current = true;
      answerAppliedRef.current = false;
      pendingIceRef.current = [];
      setConnectionHint('Retrying via Metered TURN...');

      const pc = setupPeerConnection(
        callId,
        iceServersRef.current,
        localStreamRef.current,
        'relay'
      );

      if (roleRef.current === 'caller') {
        try {
          const offerDesc = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
            iceRestart: true,
          });
          await pc.setLocalDescription(offerDesc);
          const offerPayload = { type: offerDesc.type, sdp: offerDesc.sdp };
          await signalChannelRef.current?.send({
            type: 'broadcast',
            event: 'offer',
            payload: { senderId: profile?.id, offer: offerPayload, relayRetry: true },
          });
        } catch {
          // ignore
        }
      } else {
        await signalChannelRef.current?.send({
          type: 'broadcast',
          event: 'request-relay-offer',
          payload: { senderId: profile?.id },
        });
      }
    },
    [profile?.id, setupPeerConnection]
  );

  const attachSignalAndPeer = useCallback(
    async (callId: string, role: 'caller' | 'callee', wantVideo: boolean) => {
      roleRef.current = role;
      setConnectionHint('Connecting...');
      const [iceServers, localStream] = await Promise.all([
        fetchMeteredIceServers(),
        acquireLocalMedia(wantVideo),
      ]);

      const pc = setupPeerConnection(callId, iceServers, localStream, 'all');

      // Subscribe to Supabase Realtime broadcast channel for instant ICE + SDP exchange
      if (!signalChannelRef.current) {
        const signalChannel = supabase.channel(`call-signal-${callId}`, {
          config: { broadcast: { self: false } },
        });
        signalChannelRef.current = signalChannel;

        signalChannel
          .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
            const data = payload as { senderId?: string; candidate?: RTCIceCandidateInit };
            const activePc = pcRef.current;
            if (!data?.candidate || data.senderId === profile?.id || !activePc) return;
            if (activePc.remoteDescription) {
              try {
                await activePc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch {
                // ignore invalid candidate
              }
            } else {
              pendingIceRef.current.push(data.candidate);
            }
          })
          .on('broadcast', { event: 'offer' }, async ({ payload }) => {
            const data = payload as {
              senderId?: string;
              offer?: RTCSessionDescriptionInit;
              relayRetry?: boolean;
            };
            if (!data?.offer || data.senderId === profile?.id) return;
            remoteOfferRef.current = data.offer;
            const activePc = pcRef.current;
            if (
              roleRef.current === 'callee' &&
              activePc &&
              (data.relayRetry || (activePc.signalingState === 'stable' && !activePc.remoteDescription))
            ) {
              try {
                await activePc.setRemoteDescription(new RTCSessionDescription(data.offer));
                await flushPendingIce(activePc);
                const ans = await activePc.createAnswer();
                await activePc.setLocalDescription(ans);
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
                    started_at: startedAtRef.current || new Date().toISOString(),
                  })
                  .eq('id', callId);
              } catch {
                // ignore
              }
            }
          })
          .on('broadcast', { event: 'request-relay-offer' }, async ({ payload }) => {
            const data = payload as { senderId?: string };
            if (!data?.senderId || data.senderId === profile?.id) return;
            if (roleRef.current === 'caller' && !relayRetriedRef.current) {
              await triggerTurnRelayRetry(callId);
            }
          })
          .on('broadcast', { event: 'answer' }, async ({ payload }) => {
            const data = payload as { senderId?: string; answer?: RTCSessionDescriptionInit };
            const activePc = pcRef.current;
            if (!data?.answer || data.senderId === profile?.id || !activePc || answerAppliedRef.current) {
              return;
            }
            answerAppliedRef.current = true;
            try {
              await activePc.setRemoteDescription(new RTCSessionDescription(data.answer));
              await flushPendingIce(activePc);
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
      }

      if (role === 'caller') {
        const offerDesc = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offerDesc);
        const offerPayload = { type: offerDesc.type, sdp: offerDesc.sdp };

        await supabase.from('calls').update({ offer: offerPayload }).eq('id', callId);

        await signalChannelRef.current?.send({
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
          const startedIso = startedAtRef.current || new Date().toISOString();
          startedAtRef.current = startedIso;

          await supabase
            .from('calls')
            .update({
              status: 'accepted',
              answer: answerPayload,
              started_at: startedIso,
            })
            .eq('id', callId);

          await signalChannelRef.current?.send({
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
      setupPeerConnection,
      showToast,
      triggerTurnRelayRetry,
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
              (row.status === 'ended' ||
                row.status === 'declined' ||
                row.status === 'rejected' ||
                row.status === 'missed') &&
              !endedRef.current
            ) {
              endedRef.current = true;
              showToast(
                row.status === 'missed'
                  ? 'No answer'
                  : row.status === 'ended'
                    ? 'Call ended'
                    : 'Call declined',
                'info'
              );
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
        // Fetch ICE servers before creating call & peer connection
        await fetchMeteredIceServers();
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
        await fetchMeteredIceServers();
      }
    };

    start();

    return () => {
      mounted = false;
      cleanupCallResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 30-second unanswered call timeout: end cleanly with "No answer"
  useEffect(() => {
    if (status !== 'ringing') return;
    const noAnswerTimer = setTimeout(async () => {
      if (endedRef.current || status !== 'ringing') return;
      endedRef.current = true;
      const cid = activeCallIdRef.current || callSession.id;
      if (signalChannelRef.current) {
        signalChannelRef.current
          .send({ type: 'broadcast', event: 'hangup', payload: { senderId: profile?.id } })
          .catch(() => {});
      }
      if (cid && isCaller) {
        await supabase
          .from('calls')
          .update({ status: 'missed', ended_at: new Date().toISOString() })
          .eq('id', cid);
      }
      showToast('No answer', 'info');
      cleanupCallResources();
      onEnd();
    }, 30_000);

    return () => clearTimeout(noAnswerTimer);
  }, [status, isCaller, callSession.id, profile?.id, showToast, cleanupCallResources, onEnd]);

  // Max 10 seconds in "Connecting..." before forcing Metered TURN Relay retry
  useEffect(() => {
    if (status !== 'accepted' || peerConnected) return;
    setConnectionHint('Connecting...');
    const relayTimer = setTimeout(() => {
      const cid = activeCallIdRef.current || callSession.id;
      if (cid && !peerConnectedRef.current && !endedRef.current) {
        triggerTurnRelayRetry(cid);
      }
    }, 10_000);

    return () => clearTimeout(relayTimer);
  }, [status, peerConnected, callSession.id, triggerTurnRelayRetry]);

  const acceptCall = async () => {
    const cid = activeCallIdRef.current || callSession.id;
    if (!cid) return;
    setStatus('accepted');
    setConnectionHint('Connecting...');
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
          localVideoRef.current.play().catch(() => {});
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
        localVideoRef.current.play().catch(() => {});
      }
      setFacingMode(nextMode);
    } catch {
      showToast('Unable to switch camera on this device.', 'error');
    }
  };

  const showPeerAvatarOverlay = status === 'ringing' || !peerConnected || !remoteHasVideo;
  const peerDisplayName = peerProfile ? getDisplayName(peerProfile) : 'Connecting...';

  return (
    <div className="flow-immersive-dark fixed inset-0 z-50 bg-[#0A0A0A] text-white flex flex-col justify-between">
      {/* FULL SCREEN Remote video element (other person's face) */}
      <video
        ref={remoteMediaRef}
        autoPlay
        playsInline
        onLoadedData={(e) => {
          if (e.currentTarget.videoWidth > 0) setRemoteHasVideo(true);
        }}
        onPlaying={(e) => {
          if (e.currentTarget.videoWidth > 0) setRemoteHasVideo(true);
        }}
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
      <div className="relative z-20 p-4 flex items-center justify-between gap-2">
        <div className="px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-xl border border-white/15 text-[11px] font-bold tracking-wide text-[#00E5FF] flex items-center gap-1.5">
          <span>LetChat FLOW · {isVoiceCall ? 'Voice' : 'Video'}</span>
        </div>

        {status === 'accepted' && (
          <div className="px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-xl border border-white/15 text-xs font-bold tabular-nums text-white flex items-center gap-1.5">
            {peerConnected && peerProfile && (
              <span className="max-w-[110px] truncate text-zinc-200">{peerDisplayName}</span>
            )}
            <span className="text-[#00E5FF]">
              {peerConnected ? formatCallDuration(callSeconds) : connectionHint}
            </span>
          </div>
        )}
      </div>

      {/* Avatar & Ringing / Voice Call View */}
      {showPeerAvatarOverlay && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center space-y-4 px-6 text-center">
          <div className="relative">
            <div className="p-[3px] rounded-full bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] shadow-2xl shadow-[#7C3AED]/40">
              <ProfileAvatar
                profile={peerProfile}
                fallbackName={peerDisplayName}
                sizeClass="w-28 h-28 text-3xl"
                badgeSize={20}
              />
            </div>
            {status === 'ringing' && (
              <>
                <span className="absolute -inset-2 rounded-full border-2 border-[#00E5FF]/50 animate-ping pointer-events-none" />
                <span className="absolute -inset-4 rounded-full border border-[#7C3AED]/40 animate-pulse pointer-events-none" />
              </>
            )}
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight flex items-center justify-center gap-1.5">
              <span>{peerDisplayName}</span>
              <VerifiedNameBadge isVerified={peerProfile?.is_verified} size={18} />
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

      {/* Local Camera Preview PIP — Bottom-Right Small Window */}
      {!cameraOff && (
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className={`absolute bottom-28 right-4 z-20 w-28 h-40 rounded-2xl object-cover border-2 border-white/30 bg-[#12121A] shadow-2xl ${
            facingMode === 'user' ? 'scale-x-[-1]' : ''
          }`}
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
