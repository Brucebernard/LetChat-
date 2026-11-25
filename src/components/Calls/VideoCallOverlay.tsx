import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, PhoneIncoming } from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { CallSession, Profile } from '../../types';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface VideoCallOverlayProps {
  callSession: CallSession;
  onEnd: () => void;
}

export default function VideoCallOverlay({ callSession, onEnd }: VideoCallOverlayProps) {
  const { profile } = useAuth();
  const { lowDataMode } = useSettings();
  const { showToast } = useToast();
  const [status, setStatus] = useState(callSession.status || 'ringing');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(lowDataMode || callSession.callType === 'audio');
  const [peerProfile, setPeerProfile] = useState<Profile | null>(callSession.peer || null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const activeCallIdRef = useRef<string | undefined>(callSession.id);

  const isCaller = callSession.callerId === profile?.id;
  const peerId = isCaller ? callSession.receiverId : callSession.callerId;
  const isAudioOnly = lowDataMode || callSession.callType === 'audio';

  useEffect(() => {
    if (!peerProfile && peerId) {
      supabase
        .from('profiles')
        .select('*')
        .eq('id', peerId)
        .single()
        .then(({ data }) => {
          if (data) setPeerProfile(data as Profile);
        });
    }
  }, [peerId]);

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (channelRef.current) supabase.removeChannel(channelRef.current);
  };

  const setupPeerConnection = async (callId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isAudioOnly ? false : { width: { ideal: 640 }, height: { ideal: 480 } },
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } catch {
      showToast('Camera/Microphone access denied.', 'error');
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    const sigChannel = supabase.channel(`webrtc-${callId}`);
    channelRef.current = sigChannel;

    pc.onicecandidate = (event) => {
      if (event.candidate && profile) {
        sigChannel.send({
          type: 'broadcast',
          event: 'ice',
          payload: { sender: profile.id, candidate: event.candidate },
        });
      }
    };

    sigChannel
      .on('broadcast', { event: 'ice' }, async ({ payload }) => {
        if (payload.sender !== profile?.id && payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            // ignore duplicate/stale ICE candidate
          }
        }
      })
      .subscribe();

    return pc;
  };

  useEffect(() => {
    let callRowSub: RealtimeChannel | null = null;
    const init = async () => {
      if (!profile) return;
      if (isCaller) {
        const { data: created } = await supabase
          .from('video_calls')
          .insert({
            caller_id: profile.id,
            receiver_id: peerId,
            status: 'ringing',
            call_type: isAudioOnly ? 'audio' : 'video',
          })
          .select()
          .single();

        if (!created) return;
        activeCallIdRef.current = created.id;

        const pc = await setupPeerConnection(created.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await supabase.from('video_calls').update({ offer }).eq('id', created.id);

        callRowSub = supabase
          .channel(`call-row-${created.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'video_calls', filter: `id=eq.${created.id}` },
            async ({ new: row }) => {
              const r = row as { status: string; answer?: RTCSessionDescriptionInit };
              setStatus(r.status);
              if (r.answer && pc.signalingState !== 'stable') {
                await pc.setRemoteDescription(new RTCSessionDescription(r.answer));
              }
              if (r.status === 'ended' || r.status === 'rejected') {
                cleanup();
                onEnd();
              }
            }
          )
          .subscribe();
      } else if (callSession.id) {
        callRowSub = supabase
          .channel(`call-row-${callSession.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'video_calls', filter: `id=eq.${callSession.id}` },
            ({ new: row }) => {
              const r = row as { status: string };
              if (r.status === 'ended' || r.status === 'rejected') {
                cleanup();
                onEnd();
              }
            }
          )
          .subscribe();
      }
    };

    init();
    return () => {
      if (callRowSub) supabase.removeChannel(callRowSub);
      cleanup();
    };
  }, []);

  const acceptCall = async () => {
    if (!callSession.id) return;
    setStatus('accepted');
    const pc = await setupPeerConnection(callSession.id);
    const { data: latest } = await supabase
      .from('video_calls')
      .select('*')
      .eq('id', callSession.id)
      .single();
    if (latest?.offer) {
      await pc.setRemoteDescription(new RTCSessionDescription(latest.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await supabase
        .from('video_calls')
        .update({ answer, status: 'accepted' })
        .eq('id', callSession.id);
    }
  };

  const endCall = async () => {
    const cid = activeCallIdRef.current || callSession.id;
    if (cid) {
      await supabase
        .from('video_calls')
        .update({ status: !isCaller && status === 'ringing' ? 'rejected' : 'ended' })
        .eq('id', cid);
    }
    cleanup();
    onEnd();
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = muted;
    });
    setMuted(!muted);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = cameraOff;
    });
    setCameraOff(!cameraOff);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col justify-between">
      <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />

      {(isAudioOnly || status === 'ringing') && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm space-y-3">
          <div className="w-24 h-24 rounded-full bg-[#0A3D62] flex items-center justify-center text-3xl font-bold border-2 border-[#1AA7B8] overflow-hidden">
            {peerProfile?.avatar_url ? (
              <img src={peerProfile.avatar_url} alt={peerProfile.name} className="w-full h-full object-cover" />
            ) : (
              (peerProfile?.name?.[0] || '?').toUpperCase()
            )}
          </div>
          <h2 className="text-xl font-bold">{peerProfile?.name || 'Connecting...'}</h2>
          <p className="text-sm text-[#1AA7B8]">
            {status === 'ringing'
              ? isCaller
                ? 'Ringing...'
                : 'Incoming Call...'
              : isAudioOnly
              ? 'Audio Only (Low Data Mode)'
              : 'Connected'}
          </p>
        </div>
      )}

      {!isAudioOnly && (
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="absolute top-5 right-4 z-20 w-28 h-40 rounded-2xl object-cover border-2 border-white/40 bg-zinc-900 shadow-lg"
        />
      )}

      <div className="relative z-20 pb-10 pt-6 flex items-center justify-center gap-5 bg-gradient-to-t from-black/90 to-transparent">
        {!isCaller && status === 'ringing' ? (
          <>
            <button
              onClick={endCall}
              className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700"
              aria-label="Decline Call"
            >
              <PhoneOff size={24} />
            </button>
            <button
              onClick={acceptCall}
              className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 animate-pulse"
              aria-label="Accept Call"
            >
              <PhoneIncoming size={24} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full ${
                muted ? 'bg-white text-black' : 'bg-white/20 text-white'
              }`}
              aria-label="Mute"
            >
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            {!isAudioOnly && (
              <button
                onClick={toggleCamera}
                className={`min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full ${
                  cameraOff ? 'bg-white text-black' : 'bg-white/20 text-white'
                }`}
                aria-label="Camera Off"
              >
                {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            )}
            <button
              onClick={endCall}
              className="min-h-[54px] min-w-[54px] flex items-center justify-center rounded-full bg-red-600 hover:bg-red-700"
              aria-label="End Call"
            >
              <PhoneOff size={22} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
