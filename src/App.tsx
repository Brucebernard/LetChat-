import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Compass, Phone, User, Sun, Moon, Sparkles } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { useToast } from './context/ToastContext';
import { supabase } from './supabaseClient';
import LetChatLogo from './components/LetChatLogo';
import AuthScreen from './components/Auth/AuthScreen';
import ChatsTab from './components/Chats/ChatsTab';
import MomentsTab from './components/Moments/MomentsTab';
import CallsTab from './components/Calls/CallsTab';
import ProfileTab from './components/Profile/ProfileTab';
import AdminDashboard from './components/Admin/AdminDashboard';
import VideoCallOverlay from './components/Calls/VideoCallOverlay';
import ConnectFootballModal from './components/Modals/ConnectFootballModal';
import AiAssistantPanel from './components/Assistant/AiAssistantPanel';
import { CallSession, Message, Profile, VideoCallRow } from './types';
import { notifyBackgroundIncomingMessage, preloadMessageSounds } from './utils/messageSounds';
import { formatMessagePreview } from './utils/chatMessageCodec';
import { addFriendCompatible } from './utils/friendService';

type BottomTab = 'Chats' | 'Moments' | 'Calls' | 'Profile';

export default function App() {
  const { session, profile, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<BottomTab>('Chats');
  const [showBottomTabs, setShowBottomTabs] = useState<boolean>(true);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(
    () => window.location.pathname === '/admin'
  );
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [showConnectFootball, setShowConnectFootball] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);

  const groupIdsRef = useRef<Set<string>>(new Set());
  const senderNameCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    preloadMessageSounds();
  }, []);

  useEffect(() => {
    const onPop = () => setIsAdminRoute(window.location.pathname === '/admin');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Listen globally for incoming messages (works on Chat List, other tabs, and background)
  useEffect(() => {
    if (!profile?.id) return;

    const loadGroupMembership = async () => {
      const { data } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', profile.id);
      if (data) {
        groupIdsRef.current = new Set(
          data.map((r) => (r as { chat_id?: string }).chat_id).filter((id): id is string => Boolean(id))
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
            (chatId.startsWith('dm_') && chatId.includes(profile.id)) ||
            (chatId.length > 0 && groupIdsRef.current.has(chatId));

          if (!isForMe) return;

          let senderName = senderNameCacheRef.current[row.sender_id];
          if (!senderName && typeof document !== 'undefined' && document.hidden) {
            const { data: senderProf } = await supabase
              .from('profiles')
              .select('name, username')
              .eq('id', row.sender_id)
              .maybeSingle();
            if (senderProf) {
              senderName = senderProf.name || senderProf.username || 'New message';
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
        { event: '*', schema: 'public', table: 'chat_members', filter: `user_id=eq.${profile.id}` },
        loadGroupMembership
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
    };
  }, [profile?.id]);

  // Listen for incoming WebRTC calls via Supabase Realtime
  useEffect(() => {
    if (!profile) return;
    const sub = supabase
      .channel(`incoming-calls-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_calls',
          filter: `receiver_id=eq.${profile.id}`,
        },
        ({ new: row }) => {
          const callRow = row as VideoCallRow;
          if (callRow.status === 'ringing') {
            setActiveCall({
              id: callRow.id,
              callerId: callRow.caller_id,
              receiverId: callRow.receiver_id,
              status: 'ringing',
              callType: callRow.call_type === 'audio' ? 'audio' : 'video',
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [profile]);

  // Handle shared invite / referral links like /?ref=username or /?add=username
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
        const { ok } = await addFriendCompatible(supabase, profile, target as Profile);
        if (ok) {
          showToast(`Added ${target.name} (@${target.username}) from invite link!`, 'success');
        }
      }
      window.history.replaceState({}, '', window.location.pathname);
    })();
  }, [profile]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-black text-black dark:text-white gap-3">
        <LetChatLogo size={56} />
        <p className="text-xs font-semibold text-[#1AA7B8]">Loading LetChat...</p>
      </div>
    );
  }

  if (!session || !profile) {
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

  const startCall = (peer: Profile, callType: 'video' | 'audio' = 'video') => {
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
    { id: 'Calls', label: 'Calls', icon: Phone },
    { id: 'Profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="h-screen w-full flex flex-col bg-white dark:bg-black text-black dark:text-white overflow-hidden">
      {/* Top Bar — removed when inside an open chat */}
      {!isChatOpen && (
        <header className="h-14 px-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-white dark:bg-zinc-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <LetChatLogo size={34} />
            <span className="font-extrabold text-lg tracking-tight text-[#0A3D62] dark:text-white whitespace-nowrap">
              LetChat
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAiAssistant(true)}
              className="h-9 w-9 flex items-center justify-center rounded-full bg-[#0A3D62] text-white hover:opacity-90 active:scale-95 transition"
              aria-label="Open AI Assistant"
              title="AI Assistant"
            >
              <Sparkles size={16} className="text-[#1AA7B8]" />
            </button>
            <button
              onClick={toggleTheme}
              className="h-9 w-9 flex items-center justify-center rounded-full border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
              aria-label="Toggle Light/Dark Mode"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'Chats' && (
          <ChatsTab
            onStartCall={startCall}
            onChatDetailChange={(isOpen) => {
              setIsChatOpen(isOpen);
              setShowBottomTabs(!isOpen);
              if (isOpen) setShowAiAssistant(false);
            }}
          />
        )}
        {activeTab === 'Moments' && (
          <MomentsTab
            onOpenConnectSources={() => setShowConnectFootball(true)}
            onDetailViewChange={(isDetail) => setShowBottomTabs(!isDetail)}
          />
        )}
        {activeTab === 'Calls' && (
          <CallsTab
            onStartCall={startCall}
            onJoinVideoRoom={() =>
              setActiveCall({
                callerId: profile.id,
                receiverId: profile.id,
                status: 'accepted',
                callType: 'video',
                useMeteredRoom: true,
              })
            }
          />
        )}
        {activeTab === 'Profile' && (
          <ProfileTab
            onOpenConnectSources={() => setShowConnectFootball(true)}
            onOpenAdmin={openAdmin}
            onDetailViewChange={(isDetail) => setShowBottomTabs(!isDetail)}
          />
        )}
      </main>

      {/* Bottom Navigation — ONLY 4 TABS on main screens, completely removed in chat/detail views */}
      {showBottomTabs && !activeCall && !showAiAssistant && !showConnectFootball && (
        <nav className="h-16 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 grid grid-cols-4 shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsChatOpen(false);
                  setShowBottomTabs(true);
                }}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${
                  active
                    ? 'text-[#1AA7B8]'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {activeCall && (
        <VideoCallOverlay callSession={activeCall} onEnd={() => setActiveCall(null)} />
      )}

      <ConnectFootballModal
        open={showConnectFootball}
        onClose={() => setShowConnectFootball(false)}
      />

      {showAiAssistant && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-0 sm:p-4 animate-ai-backdrop"
          onClick={() => setShowAiAssistant(false)}
        >
          <div
            className="w-full h-full sm:h-[85vh] sm:max-w-lg sm:rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 shadow-2xl animate-ai-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <AiAssistantPanel isModal onBack={() => setShowAiAssistant(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
