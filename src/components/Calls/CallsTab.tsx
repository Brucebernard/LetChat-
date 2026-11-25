import React, { useEffect, useState } from 'react';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, Wifi } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { Profile, VideoCallRow } from '../../types';

interface CallsTabProps {
  onStartCall: (peer: Profile, callType: 'video' | 'audio') => void;
}

export default function CallsTab({ onStartCall }: CallsTabProps) {
  const { profile } = useAuth();
  const { lowDataMode, isSlowNetwork, networkSpeedMbps } = useSettings();
  const [calls, setCalls] = useState<VideoCallRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCalls = async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('video_calls')
      .select(
        '*, caller:profiles!video_calls_caller_id_fkey(id, username, name, avatar_url), receiver:profiles!video_calls_receiver_id_fkey(id, username, name, avatar_url)'
      )
      .or(`caller_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(40);
    setCalls((data || []) as VideoCallRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadCalls();
  }, [profile]);

  const audioDefault = lowDataMode || isSlowNetwork;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold">Call History</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Voice & WebRTC Video Calls
          </p>
        </div>
        {audioDefault && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1AA7B8]">
            <Wifi size={14} />
            <span>Audio-First ({networkSpeedMbps ?? 0} Mbps)</span>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-center text-xs text-slate-400 py-12">Loading calls...</p>
      ) : calls.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">
            No calls yet
          </p>
          <p className="text-xs text-slate-400">
            Open any 1-to-1 chat and tap the Video or Phone icon to start a call.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-zinc-900">
          {calls.map((c) => {
            const outgoing = c.caller_id === profile?.id;
            const peer = outgoing ? c.receiver : c.caller;
            if (!peer) return null;
            const callMode: 'audio' | 'video' = audioDefault
              ? 'audio'
              : c.call_type === 'audio'
              ? 'audio'
              : 'video';

            return (
              <div key={c.id} className="flex items-center justify-between py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-[#0A3D62] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden">
                    {peer.avatar_url ? (
                      <img src={peer.avatar_url} alt={peer.name} className="w-full h-full object-cover" />
                    ) : (
                      (peer.name?.[0] || '?').toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{peer.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                      {outgoing ? (
                        <PhoneOutgoing size={12} className="text-[#1AA7B8]" />
                      ) : (
                        <PhoneIncoming size={12} className="text-emerald-500" />
                      )}
                      <span>{outgoing ? 'Outgoing' : 'Incoming'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.call_type === 'audio' ? 'Voice' : 'Video'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.status}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onStartCall(peer, 'audio')}
                    className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-zinc-900 hover:bg-[#1AA7B8] hover:text-white transition"
                    title="Voice Call"
                  >
                    <Phone size={17} />
                  </button>
                  <button
                    onClick={() => onStartCall(peer, callMode)}
                    className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-[#0A3D62] text-white hover:opacity-90 transition"
                    title={audioDefault ? 'Audio Call (Slow Net)' : 'Video Call'}
                  >
                    {audioDefault ? <Phone size={17} /> : <Video size={17} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
