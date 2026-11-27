import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Compass, Users, Phone, User } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { supabase } from './supabaseClient';
import LetChatLogo from './components/LetChatLogo';
import AuthScreen from './components/Auth/AuthScreen';
import ChatsTab from './components/Chats/ChatsTab';
import MomentsTab from './components/Moments/MomentsTab';
import ChatroomTab from './components/Chatroom/ChatroomTab';
import GroupCallOverlay from './components/Chatroom/GroupCallOverlay';
import CallsTab from './components/Calls/CallsTab';
import ProfileTab from './components/Profile/ProfileTab';
import AdminDashboard from './components/Admin/AdminDashboard';
import VideoCallOverlay from './components/Calls/VideoCallOverlay';
import { CallRow, CallSession, GroupCallSession, GroupMessage, Message, Profile } from './types';
import { notifyBackgroundIncomingMessage, preloadMessageSounds } from './utils/messageSounds';
import { formatMessagePreview } from './utils/chatMessageCodec';
import { normalizeProfileRecord, sendFriendRequest } from './utils/friendService';
import { KeyboardProvider } from './context/KeyboardContext';

type BottomTab = 'Chats' | 'Moments' | 'Chatroom' | 'Calls' | 'Profile';

interface IncomingGroupCallState {
  session: GroupCallSession;
  callerName: string;
  memberIds: string[];
}

export default function App() {
  const { session, profile, loading, needsProfileSetup } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<BottomTab>('Chats');
  const [showBottomTabs, setShowBottomTabs] = useState<boolean>(true);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(
    () => window.location.pathname === '/admin'
  );
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState<IncomingGroupCallState | null>(null);

  const groupIdsRef = useRef<Set<string>>(new Set());
  const senderNameCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    preloadMessageSounds();
    const timer = setTimeout(() => setShowSplash(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onPop = () => setIsAdminRoute(window.location.pathname === '/admin');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Listen globally for incoming 1-to-1 and Chatroom group messages
  useEffect(() => {
    if (!profile?.id) return;

    const loadGroupMembership = async () => {
      const { data } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', profile.id);
      if (data) {
        groupIdsRef.current = new Set(
          data
            .map((r) => (r as { group_id?: string }).group_id)
            .filter((id): id is string => Boolean(id))
        );
      }
    };

    loadGroupMembership();

    const msgSub = supabase
      .channel(`global-incoming-messages-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async ({ new: rawRow }) => {
          const row = rawRow as Partial<Message> & {
            id?: string;
            sender_id?: string;
            receiver_id?: string | null;
            chat_id?: string | null;
          };
          if (!row || !row.sender_id || row.sender_id === profile.id) return;

          const chatId = typeof row.chat_id === 'string' ? row.chat_id : '';
          const isForMe =
            row.receiver_id === profile.id ||
            (chatId.startsWith('dm_') && chatId.includes(profile.id));

          if (!isForMe) return;

          let senderName = senderNameCacheRef.current[row.sender_id];
          if (!senderName && typeof document !== 'undefined' && document.hidden) {
            const { data: senderProf } = await supabase
              .from('profiles')
              .select('full_name, name, username')
              .eq('id', row.sender_id)
              .maybeSingle();
            if (senderProf) {
              const rec = senderProf as { full_name?: string; name?: string; username?: string };
              senderName = rec.full_name || rec.name || rec.username || 'New message';
              senderNameCacheRef.current[row.sender_id] = senderName;
            }
          }

          notifyBackgroundIncomingMessage({
            messageId: row.id,
            senderName: senderName || 'New message',
            preview: formatMessagePreview(row as Message),
            chatId: chatId || undefined,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },
        async ({ new: rawRow }) => {
          const row = rawRow as Partial<GroupMessage>;
          if (!row || !row.sender_id || row.sender_id === profile.id || !row.group_id) return;
          if (!groupIdsRef.current.has(row.group_id)) return;

          let senderName = senderNameCacheRef.current[row.sender_id];
          if (!senderName && typeof document !== 'undefined' && document.hidden) {
            const { data: senderProf } = await supabase
              .from('profiles')
              .select('full_name, name, username')
              .eq('id', row.sender_id)
              .maybeSingle();
            if (senderProf) {
              const rec = senderProf as { full_name?: string; name?: string; username?: string };
              senderName = rec.full_name || rec.name || rec.username || 'Group message';
              senderNameCacheRef.current[row.sender_id] = senderName;
            }
          }

          notifyBackgroundIncomingMessage({
            messageId: row.id,
            senderName: senderName || 'Chatroom message',
            preview: row.content || (row.type ? `[${row.type}]` : 'New group message'),
            chatId: row.group_id,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${profile.id}` },
        loadGroupMembership
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
    };
  }, [profile?.id]);

  // Listen for incoming 1-to-1 WebRTC calls via Supabase Realtime `calls` table
  useEffect(() => {
    if (!profile?.id) return;
    const sub = supabase
      .channel(`incoming-calls-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'calls',
          filter: `receiver_id=eq.${profile.id}`,
        },
        ({ new: row }) => {
          const callRow = row as CallRow;
          if (callRow.status === 'ringing') {
            setActiveCall({
              id: callRow.id,
              callerId: callRow.caller_id,
              receiverId: callRow.receiver_id,
              status: 'ringing',
              callType: callRow.type === 'voice' ? 'voice' : 'video',
              offer: callRow.offer || null,
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [profile?.id]);

  // Listen for incoming Group Voice / Video calls via Realtime broadcast
  useEffect(() => {
    if (!profile?.id) return;
    const ringChannel = supabase.channel(`group-ring-${profile.id}`);
    ringChannel
      .on('broadcast', { event: 'incoming_group_call' }, ({ payload }) => {
        const p = payload as {
          groupId?: string;
          groupName?: string;
          groupPhoto?: string;
          callType?: 'voice' | 'video';
          callerId?: string;
          callerName?: string;
          memberIds?: string[];
        };
        if (!p?.groupId || !p?.callerId || p.callerId === profile.id) return;

        setIncomingGroupCall((prev) => {
          if (prev) return prev;
          return {
            callerName: p.callerName || 'Group Member',
            memberIds: Array.isArray(p.memberIds) ? p.memberIds : [],
            session: {
              group: {
                id: p.groupId!,
                name: p.groupName || 'Chatroom Call',
                description: '',
                photo_url: p.groupPhoto || '',
                is_public: false,
                created_by: p.callerId || null,
                created_at: new Date().toISOString(),
              },
              callType: p.callType === 'voice' ? 'voice' : 'video',
              initiatorId: p.callerId!,
            },
          };
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ringChannel);
    };
  }, [profile?.id]);

  // Handle shared invite links /?ref=username or /?add=username
  useEffect(() => {
    if (!profile) return;
    const params = new URLSearchParams(window.location.search);
    const addUsername = (params.get('ref') || params.get('add'))?.trim().toLowerCase();
    if (!addUsername || addUsername === profile.username?.toLowerCase()) return;

    (async () => {
      const { data: target } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', addUsername)
        .maybeSingle();
      if (target) {
        const normalizedTarget = normalizeProfileRecord(target as Record<string, unknown>);
        const res = await sendFriendRequest(supabase, profile, normalizedTarget);
        if (res.ok) {
          showToast(
            res.status === 'accepted'
              ? `You and @${normalizedTarget.username} are now friends!`
              : `Friend request sent to @${normalizedTarget.username}`,
            'success'
          );
        }
      }
      window.history.replaceState({}, '', window.location.pathname);
    })();
  }, [profile, showToast]);

  if (showSplash || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A0A0A] text-white gap-4 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(124, 58, 237, 0.25), transparent 55%), radial-gradient(circle at 50% 60%, rgba(0, 229, 255, 0.14), transparent 60%)',
          }}
        />
        <div className="relative animate-pulse">
          <LetChatLogo size={72} />
        </div>
        <div className="relative text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <span className="font-extrabold text-2xl tracking-tight">LetChat</span>
            <span className="text-[11px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white">
              FLOW
            </span>
          </div>
          <p className="text-xs text-zinc-400">Encrypted Messaging · Moments · Chatrooms · HD Calls</p>
        </div>
      </div>
    );
  }

  if (!session || !profile || needsProfileSetup) {
    return <AuthScreen />;
  }

  if (isAdminRoute) {
    return (
      <AdminDashboard
        onBack={() => {
          window.history.pushState({}, '', '/');
          setIsAdminRoute(false);
        }}
      />
    );
  }

  const startCall = (peer: Profile, callType: 'video' | 'voice' = 'video') => {
    setActiveCall({
      callerId: profile.id,
      receiverId: peer.id,
      peer,
      status: 'ringing',
      callType,
    });
  };

  const openAdmin = () => {
    window.history.pushState({}, '', '/admin');
    setIsAdminRoute(true);
  };

  const navItems: { id: BottomTab; label: string; icon: typeof MessageCircle }[] = [
    { id: 'Chats', label: 'Chats', icon: MessageCircle },
    { id: 'Moments', label: 'Moments', icon: Compass },
    { id: 'Chatroom', label: 'Chatroom', icon: Users },
    { id: 'Calls', label: 'Calls', icon: Phone },
    { id: 'Profile', label: 'Profile', icon: User },
  ];

  const hideTopHeader = isDetailOpen || activeTab === 'Moments';

  return (
    <KeyboardProvider>
      <div className="flow-theme-shell h-screen w-full flex flex-col bg-[#0A0A0A] text-white overflow-hidden">
        {/* Top Bar — hidden inside open chats/groups and full-bleed Moments */}
        {!hideTopHeader && (
          <header className="h-14 px-4 border-b border-white/10 flex items-center justify-between gap-4 bg-[#0A0A0A]/90 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-2.5">
              <LetChatLogo size={32} />
              <span className="font-extrabold text-lg tracking-tight text-white whitespace-nowrap">
                LetChat
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/[0.06] border border-[#00E5FF]/30 text-[#00E5FF]">
                FLOW
              </span>
            </div>
          </header>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {activeTab === 'Chats' && (
            <ChatsTab
              onStartCall={startCall}
              onChatDetailChange={(isOpen) => {
                setIsDetailOpen(isOpen);
                setShowBottomTabs(!isOpen);
              }}
            />
          )}
          {activeTab === 'Moments' && (
            <MomentsTab onDetailViewChange={(isDetail) => setShowBottomTabs(!isDetail)} />
          )}
          {activeTab === 'Chatroom' && (
            <ChatroomTab
              onDetailViewChange={(isDetail) => {
                setIsDetailOpen(isDetail);
                setShowBottomTabs(!isDetail);
              }}
            />
          )}
          {activeTab === 'Calls' && <CallsTab onStartCall={startCall} />}
          {activeTab === 'Profile' && (
            <ProfileTab
              onOpenAdmin={openAdmin}
              onDetailViewChange={(isDetail) => setShowBottomTabs(!isDetail)}
            />
          )}
        </main>

        {/* Bottom Navigation — Exact 5 FLOW tabs */}
        {showBottomTabs && !activeCall && !incomingGroupCall && (
          <nav className="h-16 border-t border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl grid grid-cols-5 shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsDetailOpen(false);
                    setShowBottomTabs(true);
                  }}
                  className={`flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-bold transition relative ${
                    active ? 'text-[#00E5FF]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {active && (
                    <span className="absolute top-0 w-7 h-0.5 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF]" />
                  )}
                  <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {activeCall && (
          <VideoCallOverlay callSession={activeCall} onEnd={() => setActiveCall(null)} />
        )}

        {!activeCall && incomingGroupCall && (
          <GroupCallOverlay
            callSession={incomingGroupCall.session}
            incomingFromName={incomingGroupCall.callerName}
            isIncoming
            memberIds={incomingGroupCall.memberIds}
            onEnd={() => setIncomingGroupCall(null)}
          />
        )}
      </div>
    </KeyboardProvider>
  );
}
