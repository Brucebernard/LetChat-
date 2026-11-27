import React, { useCallback, useEffect, useState } from 'react';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, Wifi, Music, PhoneCall } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import TonePickerModal from '../Modals/TonePickerModal';
import { CallRow, Profile } from '../../types';
import { getDisplayName, setCachedProfiles } from '../../utils/appCache';
import { normalizeProfileRecord } from '../../utils/friendService';
import { ProfileAvatar, VerifiedNameBadge } from '../Common/VerifiedBadge';

interface CallsTabProps {
  onStartCall: (peer: Profile, callType: 'video' | 'voice') => void;
}

function formatDurationLabel(startedAt?: string | null, endedAt?: string | null): string | null {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const totalSec = Math.round((end - start) / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function CallsTab({ onStartCall }: CallsTabProps) {
  const { profile } = useAuth();
  const { lowDataMode, isSlowNetwork, networkSpeedMbps } = useSettings();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTones, setShowTones] = useState(false);

  const loadCalls = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('calls')
      .select(
        '*, caller:profiles!calls_caller_id_fkey(id, username, display_name, name, full_name, avatar_url, is_verified), receiver:profiles!calls_receiver_id_fkey(id, username, display_name, name, full_name, avatar_url, is_verified)'
      )
      .or(`caller_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    let rows = (data || []) as Record<string, unknown>[];
    if (error) {
      const plain = await supabase
        .from('calls')
        .select('*')
        .or(`caller_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
        .order('created_at', { ascending: false })
        .limit(50);
      rows = (plain.data || []) as Record<string, unknown>[];
    }

    const missingPeerIds = new Set<string>();
    for (const raw of rows) {
      const cid = String(raw.caller_id || '');
      const rid = String(raw.receiver_id || '');
      if (!raw.caller && cid) missingPeerIds.add(cid);
      if (!raw.receiver && rid) missingPeerIds.add(rid);
    }

    const fallbackMap = new Map<string, Profile>();
    if (missingPeerIds.size > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(missingPeerIds));
      const normalized = ((profs || []) as Record<string, unknown>[]).map(normalizeProfileRecord);
      setCachedProfiles(normalized);
      normalized.forEach((p) => fallbackMap.set(p.id, p));
    }

    const mapped: CallRow[] = rows.map((raw) => {
      const callerRaw = raw.caller as Record<string, unknown> | undefined;
      const receiverRaw = raw.receiver as Record<string, unknown> | undefined;
      const cid = String(raw.caller_id || '');
      const rid = String(raw.receiver_id || '');
      return {
        id: String(raw.id || ''),
        caller_id: cid,
        receiver_id: rid,
        type: String(raw.type || raw.call_type || 'voice'),
        status: String(raw.status || 'ended'),
        started_at: typeof raw.started_at === 'string' ? raw.started_at : null,
        ended_at: typeof raw.ended_at === 'string' ? raw.ended_at : null,
        created_at: String(raw.created_at || new Date().toISOString()),
        caller: callerRaw ? normalizeProfileRecord(callerRaw) : fallbackMap.get(cid),
        receiver: receiverRaw ? normalizeProfileRecord(receiverRaw) : fallbackMap.get(rid),
      };
    });

    setCalls(mapped);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadCalls();
    if (!profile) return;
    const sub = supabase
      .channel(`flow-calls-history-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => {
        loadCalls();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [loadCalls, profile]);

  const voiceOnlyDefault = lowDataMode || isSlowNetwork;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto bg-[#0A0A0A] text-white">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Calls</h2>
          <p className="text-xs text-zinc-400">Encrypted Voice &amp; Video Calls</p>
        </div>
        <div className="flex items-center gap-2">
          {voiceOnlyDefault && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#00E5FF]">
              <Wifi size={14} />
              <span>Voice-First ({networkSpeedMbps ?? 0} Mbps)</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowTones(true)}
            className="flex items-center gap-1.5 px-3.5 min-h-[38px] rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-bold transition shrink-0"
            title="Choose Voice & Video Call Tones"
          >
            <Music size={14} className="text-[#00E5FF]" /> Ringtone
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-xs text-zinc-400 py-14">Loading calls...</p>
      ) : calls.length === 0 ? (
        <div className="py-16 px-6 text-center space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#7C3AED]/25 to-[#00E5FF]/25 border border-white/10 flex items-center justify-center text-[#00E5FF]">
            <PhoneCall size={24} />
          </div>
          <p className="text-sm font-bold text-white">No calls yet</p>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto">
            Open any chat with an accepted friend and tap Voice or Video to place a real call.
          </p>
        </div>
      ) : (
        <div className="space-y-2 pb-6">
          {calls.map((c) => {
            const outgoing = c.caller_id === profile?.id;
            const peer = outgoing ? c.receiver : c.caller;
            if (!peer) return null;
            const isVoice = c.type === 'voice';
            const duration = formatDurationLabel(c.started_at, c.ended_at);
            const peerName = getDisplayName(peer);
            const statusLabel = c.status === 'missed' ? 'No answer' : c.status;

            return (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-[#12121A]/90 backdrop-blur-xl gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ProfileAvatar profile={peer} sizeClass="w-11 h-11 text-sm" />
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate text-white flex items-center gap-1">
                      <span className="truncate">{peerName}</span>
                      <VerifiedNameBadge isVerified={peer.is_verified} size={14} />
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 flex-wrap">
                      {outgoing ? (
                        <PhoneOutgoing size={12} className="text-[#00E5FF]" />
                      ) : (
                        <PhoneIncoming size={12} className="text-[#7C3AED]" />
                      )}
                      <span>{outgoing ? 'Outgoing' : 'Incoming'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{isVoice ? 'Voice' : 'Video'}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`capitalize ${c.status === 'missed' ? 'text-amber-400' : ''}`}>
                        {statusLabel}
                      </span>
                      {duration && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#00E5FF] tabular-nums">{duration}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartCall(peer, 'voice')}
                    className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 hover:bg-[#00E5FF] hover:text-black transition"
                    title="Voice Call"
                  >
                    <Phone size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartCall(peer, voiceOnlyDefault ? 'voice' : 'video')}
                    className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white hover:opacity-90 transition"
                    title={voiceOnlyDefault ? 'Voice Call (Low Data)' : 'Video Call'}
                  >
                    {voiceOnlyDefault ? <Phone size={17} /> : <Video size={17} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TonePickerModal
        open={showTones}
        initialTab="voice"
        onClose={() => setShowTones(false)}
      />
    </div>
  );
}
