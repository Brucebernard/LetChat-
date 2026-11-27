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
  Users,
} from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { GroupCallSession, Profile } from '../../types';
import { playCallRingtoneCycle } from '../../utils/messageSounds';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.metered.ca:80' },
  { urls: 'stun:stun.l.google.com:19302' },
];

interface RemotePeerTile {
  peerId: string;
  name: string;
  avatarUrl?: string;
  stream: MediaStream | null;
  hasVideo: boolean;
  connected: boolean;
}

interface GroupCallOverlayProps {
  callSession: GroupCallSession;
  incomingFromName?: string;
  isIncoming?: boolean;
  memberIds: string[];
  onEnd: () => void;
}

function formatCallDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function RemotePeerCard({ tile, speakerOn }: { tile: RemotePeerTile; speakerOn: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (tile.stream) {
      el.srcObject = tile.stream;
      el.volume = speakerOn ? 1.0 : 0.45;
      el.play().catch(() => {});
    }
  }, [tile.stream, speakerOn]);

  return (
    <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#12121A] flex flex-col items-center justify-center min-h-[180px] aspect-[4/3]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${
          tile.hasVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      {!tile.hasVideo && (
        <div className="relative z-10 flex flex-col items-center gap-2 p-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] p-[2px]">
            <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center text-xl font-extrabold overflow-hidden">
              {tile.avatarUrl ? (
                <img src={tile.avatarUrl} alt={tile.name} className="w-full h-full object-cover" />
              ) : (
                (tile.name?.[0] || '?').toUpperCase()
              )}
            </div>
          </div>
          <span className="text-xs font-bold text-white truncate max-w-[140px]">{tile.name}</span>
        </div>
      )}
      <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md text-[11px] font-semibold text-white flex items-center gap-1.5 border border-white/10">
        <span
          className={`w-2 h-2 rounded-full ${tile.connected ? 'bg-[#00E5FF]' : 'bg-amber-400 animate-pulse'}`}
        />
        <span className="truncate max-w-[110px]">{tile.name}</span>
      </div>
    </div>
  );
}

export default function GroupCallOverlay({
  callSession,
  incomingFromName,
  isIncoming = false,
  memberIds,
  onEnd,
}: GroupCallOverlayProps) {
  const { profile, session } = useAuth();
  const { lowDataMode, voiceCallTone, videoCallTone } = useSettings();
  const { showToast } = useToast();

  const isVoiceCall = lowDataMode || callSession.callType === 'voice';
  const [joined, setJoined] = useState(!isIncoming);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(!isVoiceCall);
  const [cameraOff, setCameraOff] = useState(isVoiceCall);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [callSeconds, setCallSeconds] = useState(0);
  const [remoteTiles, setRemoteTiles] = useState<RemotePeerTile[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callHistoryIdRef = useRef<string | null>(null);
  const endedRef = useRef(false);

  const fetchMeteredIce = useCallback(async (): Promise<RTCIceServer[]> => {
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
      // fallback STUN
    }
    return FALLBACK_ICE_SERVERS;
  }, [session?.access_token]);

  const cleanupResources = useCallback(() => {
    if (channelRef.current) {
      channelRef.current
        .send({
          type: 'broadcast',
          event: 'leave',
          payload: { senderId: profile?.id },
        })
        .catch(() => {});
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    for (const pc of peersRef.current.values()) {
      try {
        pc.close();
      } catch {
        // ignore
      }
    }
    peersRef.current.clear();
    pendingIceRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }, [profile?.id]);

  // Ringing tone if incoming and not accepted yet
  useEffect(() => {
    if (joined) return;
    const tone = isVoiceCall ? voiceCallTone : videoCallTone;
    if (tone === 'silent') return;
    let ctx: AudioContext | null = null;
    const ring = () => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!ctx) ctx = new AudioCtx();
        playCallRingtoneCycle(tone, 'receiver', ctx);
      } catch {
        // ignore audio policy block
      }
    };
    ring();
    const timer = setInterval(ring, 2400);
    return () => {
      clearInterval(timer);
      if (ctx) ctx.close().catch(() => {});
    };
  }, [joined, isVoiceCall, voiceCallTone, videoCallTone]);

  // Duration ticker
  useEffect(() => {
    if (!joined) return;
    const timer = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [joined]);

  // Sync local PIP
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current && !cameraOff) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [cameraOff, joined]);

  const upsertTile = useCallback(
    (peerId: string, patch: Partial<RemotePeerTile>) => {
      setRemoteTiles((prev) => {
        const idx = prev.findIndex((t) => t.peerId === peerId);
        if (idx === -1) {
          return [
            ...prev,
            {
              peerId,
              name: patch.name || 'Member',
              avatarUrl: patch.avatarUrl,
              stream: patch.stream || null,
              hasVideo: Boolean(patch.hasVideo),
              connected: Boolean(patch.connected),
            },
          ];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      });
    },
    []
  );

  const removeTile = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // ignore
      }
      peersRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    setRemoteTiles((prev) => prev.filter((t) => t.peerId !== peerId));
  }, []);

  const createPeerConnection = useCallback(
    (remoteId: string, remoteInfo?: { name?: string; avatarUrl?: string }) => {
      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
      });
      peersRef.current.set(remoteId, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      const remoteStream = new MediaStream();
      upsertTile(remoteId, {
        name: remoteInfo?.name || 'Member',
        avatarUrl: remoteInfo?.avatarUrl,
        stream: remoteStream,
        hasVideo: false,
        connected: false,
      });

      const syncVideoFlag = () => {
        const hasVid = remoteStream
          .getVideoTracks()
          .some((t) => t.readyState === 'live' && !t.muted && t.enabled);
        upsertTile(remoteId, { stream: remoteStream, hasVideo: hasVid });
      };

      pc.ontrack = (event) => {
        const inc = event.streams?.[0];
        if (inc) {
          inc.getTracks().forEach((t) => {
            if (!remoteStream.getTracks().some((e) => e.id === t.id)) {
              remoteStream.addTrack(t);
            }
            t.addEventListener('mute', syncVideoFlag);
            t.addEventListener('unmute', syncVideoFlag);
            t.addEventListener('ended', syncVideoFlag);
          });
        } else if (event.track) {
          remoteStream.addTrack(event.track);
          event.track.addEventListener('mute', syncVideoFlag);
          event.track.addEventListener('unmute', syncVideoFlag);
          event.track.addEventListener('ended', syncVideoFlag);
        }
        syncVideoFlag();
        upsertTile(remoteId, { connected: true });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          upsertTile(remoteId, { connected: true });
        } else if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          removeTile(remoteId);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current && profile?.id) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: {
              senderId: profile.id,
              targetId: remoteId,
              candidate: event.candidate.toJSON(),
            },
          });
        }
      };

      return pc;
    },
    [profile?.id, removeTile, upsertTile]
  );

  // Join Group WebRTC Mesh
  useEffect(() => {
    if (!joined || !profile?.id) return;
    let active = true;

    const startMesh = async () => {
      const [ice, stream] = await Promise.all([
        fetchMeteredIce(),
        navigator.mediaDevices
          .getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: !isVoiceCall
              ? { facingMode, width: { ideal: 640 }, height: { ideal: 480 } }
              : false,
          })
          .catch(async () => {
            try {
              const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              setCameraOff(true);
              return audioOnly;
            } catch {
              showToast('Microphone permission denied.', 'error');
              return null;
            }
          }),
      ]);

      if (!active) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      iceServersRef.current = ice;
      if (stream) {
        localStreamRef.current = stream;
        if (localVideoRef.current && !isVoiceCall) {
          localVideoRef.current.srcObject = stream;
        }
      }

      // Log group call entry in calls table if initiator
      if (!isIncoming && memberIds.length > 0) {
        const firstTarget = memberIds.find((id) => id !== profile.id);
        if (firstTarget) {
          const { data: logged } = await supabase
            .from('calls')
            .insert({
              caller_id: profile.id,
              receiver_id: firstTarget,
              type: isVoiceCall ? 'voice' : 'video',
              status: 'accepted',
              started_at: new Date().toISOString(),
            })
            .select('id')
            .single();
          if (logged?.id) callHistoryIdRef.current = String(logged.id);
        }

        // Notify group members via Supabase Realtime ring channel
        const ringTargets = memberIds.filter((id) => id !== profile.id);
        for (const uid of ringTargets) {
          const ringCh = supabase.channel(`group-ring-${uid}`);
          ringCh.subscribe(async (st) => {
            if (st === 'SUBSCRIBED') {
              await ringCh.send({
                type: 'broadcast',
                event: 'incoming_group_call',
                payload: {
                  group: callSession.group,
                  callType: isVoiceCall ? 'voice' : 'video',
                  initiatorId: profile.id,
                  initiatorName: profile.full_name || profile.name || profile.username,
                },
              });
              setTimeout(() => supabase.removeChannel(ringCh), 2500);
            }
          });
        }
      }

      const ch = supabase.channel(`group-call-${callSession.group.id}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = ch;

      const flushIce = async (peerId: string, pc: RTCPeerConnection) => {
        const queue = pendingIceRef.current.get(peerId) || [];
        if (queue.length === 0 || !pc.remoteDescription) return;
        pendingIceRef.current.set(peerId, []);
        for (const cand of queue) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
      };

      ch.on('broadcast', { event: 'join' }, async ({ payload }) => {
        const p = payload as { senderId?: string; name?: string; avatarUrl?: string };
        if (!p?.senderId || p.senderId === profile.id) return;
        const pc = createPeerConnection(p.senderId, { name: p.name, avatarUrl: p.avatarUrl });
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        await ch.send({
          type: 'broadcast',
          event: 'offer',
          payload: {
            senderId: profile.id,
            targetId: p.senderId,
            name: profile.full_name || profile.name || profile.username,
            avatarUrl: profile.avatar_url,
            offer: { type: offer.type, sdp: offer.sdp },
          },
        });
      })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          const p = payload as {
            senderId?: string;
            targetId?: string;
            name?: string;
            avatarUrl?: string;
            offer?: RTCSessionDescriptionInit;
          };
          if (!p?.senderId || p.targetId !== profile.id || !p.offer) return;
          const pc = createPeerConnection(p.senderId, { name: p.name, avatarUrl: p.avatarUrl });
          await pc.setRemoteDescription(new RTCSessionDescription(p.offer));
          await flushIce(p.senderId, pc);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          await ch.send({
            type: 'broadcast',
            event: 'answer',
            payload: {
              senderId: profile.id,
              targetId: p.senderId,
              name: profile.full_name || profile.name || profile.username,
              avatarUrl: profile.avatar_url,
              answer: { type: ans.type, sdp: ans.sdp },
            },
          });
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          const p = payload as {
            senderId?: string;
            targetId?: string;
            name?: string;
            avatarUrl?: string;
            answer?: RTCSessionDescriptionInit;
          };
          if (!p?.senderId || p.targetId !== profile.id || !p.answer) return;
          const pc = peersRef.current.get(p.senderId);
          if (!pc) return;
          upsertTile(p.senderId, { name: p.name || 'Member', avatarUrl: p.avatarUrl });
          await pc.setRemoteDescription(new RTCSessionDescription(p.answer)).catch(() => {});
          await flushIce(p.senderId, pc);
        })
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          const p = payload as {
            senderId?: string;
            targetId?: string;
            candidate?: RTCIceCandidateInit;
          };
          if (!p?.senderId || p.targetId !== profile.id || !p.candidate) return;
          const pc = peersRef.current.get(p.senderId);
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
          } else {
            const list = pendingIceRef.current.get(p.senderId) || [];
            list.push(p.candidate);
            pendingIceRef.current.set(p.senderId, list);
          }
        })
        .on('broadcast', { event: 'leave' }, ({ payload }) => {
          const p = payload as { senderId?: string };
          if (p?.senderId) removeTile(p.senderId);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await ch.send({
              type: 'broadcast',
              event: 'join',
              payload: {
                senderId: profile.id,
                name: profile.full_name || profile.name || profile.username,
                avatarUrl: profile.avatar_url,
              },
            });
          }
        });
    };

    startMesh();

    return () => {
      active = false;
      cleanupResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  const handleEndCall = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (callHistoryIdRef.current) {
      await supabase
        .from('calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', callHistoryIdRef.current);
    }
    cleanupResources();
    onEnd();
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  };

  const toggleCamera = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length > 0) {
      const nextOff = !cameraOff;
      tracks.forEach((t) => {
        t.enabled = !nextOff;
      });
      setCameraOff(nextOff);
      return;
    }
    if (cameraOff) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        });
        const newTrack = cam.getVideoTracks()[0];
        if (!newTrack) return;
        stream.addTrack(newTrack);
        for (const pc of peersRef.current.values()) {
          pc.addTrack(newTrack, stream);
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setCameraOff(false);
      } catch {
        showToast('Unable to enable camera.', 'error');
      }
    }
  };

  const flipCamera = async () => {
    const stream = localStreamRef.current;
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
      for (const pc of peersRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }
      stream.removeTrack(oldTrack);
      oldTrack.stop();
      stream.addTrack(newTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setFacingMode(nextMode);
    } catch {
      showToast('Unable to switch camera.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] text-white flex flex-col justify-between">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 20%, rgba(124, 58, 237, 0.25), transparent 55%), radial-gradient(circle at 80% 80%, rgba(0, 229, 255, 0.14), transparent 55%)',
        }}
      />

      {/* Top Header */}
      <div className="relative z-20 p-4 flex items-center justify-between">
        <div className="px-3.5 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/10 text-[11px] font-bold tracking-wide text-[#00E5FF] flex items-center gap-1.5">
          <Users size={13} />
          <span className="truncate max-w-[160px]">{callSession.group.name}</span>
          <span>· {isVoiceCall ? 'Group Voice' : 'Group Video'}</span>
        </div>

        {joined && (
          <div className="px-3.5 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/10 text-xs font-bold tabular-nums">
            {remoteTiles.length > 0
              ? `Live (${remoteTiles.length + 1}) · ${formatCallDuration(callSeconds)}`
              : `Waiting for members · ${formatCallDuration(callSeconds)}`}
          </div>
        )}
      </div>

      {/* Center Content */}
      {!joined ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center space-y-4 px-6 text-center">
          <div className="relative">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] p-[3px] shadow-2xl">
              <div className="w-full h-full rounded-[21px] bg-[#12121A] flex items-center justify-center text-3xl font-extrabold overflow-hidden">
                {callSession.group.photo_url ? (
                  <img
                    src={callSession.group.photo_url}
                    alt={callSession.group.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Users size={36} className="text-[#00E5FF]" />
                )}
              </div>
            </div>
            <span className="absolute -inset-2 rounded-3xl border-2 border-[#00E5FF]/50 animate-ping" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-extrabold">{callSession.group.name}</h2>
            <p className="text-sm text-[#00E5FF] font-semibold">
              {incomingFromName
                ? `${incomingFromName} started a Group ${isVoiceCall ? 'Voice' : 'Video'} Call`
                : `Incoming Group ${isVoiceCall ? 'Voice' : 'Video'} Call`}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-2">
          <div
            className={`grid gap-3 h-full content-center max-w-4xl mx-auto ${
              remoteTiles.length <= 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 md:grid-cols-3'
            }`}
          >
            {/* Local User Tile */}
            <div className="relative rounded-3xl overflow-hidden border border-[#7C3AED]/40 bg-[#12121A] flex flex-col items-center justify-center min-h-[180px] aspect-[4/3]">
              {!cameraOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 p-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] p-[2px]">
                    <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center text-xl font-extrabold overflow-hidden">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        ((profile?.full_name || profile?.name || profile?.username)?.[0] || 'Y').toUpperCase()
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-white">You</span>
                </div>
              )}
              <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md text-[11px] font-semibold text-[#00E5FF] border border-white/10">
                You {muted ? '(Muted)' : ''}
              </div>
            </div>

            {/* Remote Member Tiles */}
            {remoteTiles.map((tile) => (
              <RemotePeerCard key={tile.peerId} tile={tile} speakerOn={speakerOn} />
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="relative z-20 pb-10 pt-5 px-4 flex items-center justify-center gap-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
        {!joined ? (
          <>
            <button
              type="button"
              onClick={handleEndCall}
              className="min-h-[62px] min-w-[62px] flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 shadow-lg"
              aria-label="Decline Group Call"
            >
              <PhoneOff size={24} />
            </button>
            <button
              type="button"
              onClick={() => setJoined(true)}
              className="min-h-[62px] min-w-[62px] flex items-center justify-center rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white animate-pulse shadow-lg"
              aria-label="Join Group Call"
            >
              <PhoneIncoming size={24} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full border transition ${
                muted ? 'bg-white text-black border-white' : 'bg-white/10 text-white border-white/15'
              }`}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button
              type="button"
              onClick={() => setSpeakerOn((s) => !s)}
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full border transition ${
                speakerOn
                  ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                  : 'bg-white/10 text-white border-white/15'
              }`}
              aria-label="Toggle Speaker"
            >
              {speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full border transition ${
                cameraOff
                  ? 'bg-white text-black border-white'
                  : 'bg-white/10 text-white border-white/15'
              }`}
              aria-label="Toggle Camera"
            >
              {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>
            {!cameraOff && (
              <button
                type="button"
                onClick={flipCamera}
                className="min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full bg-white/10 text-white border border-white/15"
                aria-label="Switch Camera"
              >
                <RefreshCw size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={handleEndCall}
              className="min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700 shadow-lg"
              aria-label="Leave Group Call"
            >
              <PhoneOff size={22} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
