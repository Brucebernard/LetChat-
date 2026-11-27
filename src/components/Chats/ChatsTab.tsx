import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  UserPlus,
  Users,
  X,
  MessageSquare,
  QrCode,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ChatRoom from './ChatRoom';
import FriendsModal, { FriendsModalView } from '../Friends/FriendsModal';
import {
  fetchRecentUserMessages,
  formatMessagePreview,
  getDmChatId,
} from '../../utils/chatMessageCodec';
import { formatLastSeenShort, isUserOnline } from '../../utils/mediaUtils';
import { loadMessageDraft } from '../../utils/draftStorage';
import { loadFriendshipsAndRequests, normalizeProfileRecord } from '../../utils/friendService';
import { ChatItem, Message, Profile } from '../../types';

interface ChatsTabProps {
  onStartCall: (peer: Profile, callType: 'video' | 'voice') => void;
  onChatDetailChange?: (isOpen: boolean) => void;
}

export default function ChatsTab({ onStartCall, onChatDetailChange }: ChatsTabProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [friends, setFriends] = useState<Profile[]>([]);
  const [incomingReqCount, setIncomingReqCount] = useState(0);
  const [chatPeers, setChatPeers] = useState<Profile[]>([]);
  const [lastMsgs, setLastMsgs] = useState<Record<string, Message>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [activeChat, setActiveChat] = useState<ChatItem | null>(null);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | null>(null);

  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [friendsModalView, setFriendsModalView] = useState<FriendsModalView>('friends');

  useEffect(() => {
    onChatDetailChange?.(Boolean(activeChat));
  }, [activeChat, onChatDetailChange]);

  const loadChats = useCallback(async () => {
    if (!profile?.id) return;

    const friendData = await loadFriendshipsAndRequests(supabase, profile.id);
    setFriends(friendData.acceptedFriends);
    setIncomingReqCount(friendData.incomingRequests.length);

    // STRICT REAL ONLY RULE:
    // Populate 1-to-1 DM chats ONLY from real messages where sender_id = my_id OR receiver_id = my_id
    const msgs = await fetchRecentUserMessages(supabase, profile.id, []);

    const lastMap: Record<string, Message> = {};
    const unreadMap: Record<string, number> = {};
    const messagePeerIds = new Set<string>();

    for (const m of msgs) {
      if (!m.chat_id || m.chat_id.startsWith('grp_')) continue;
      if (!lastMap[m.chat_id]) {
        lastMap[m.chat_id] = m;
      }
      const peerId = m.sender_id === profile.id ? m.receiver_id : m.sender_id;
      if (peerId && peerId !== profile.id) {
        messagePeerIds.add(peerId);
      }
      const alreadyRead =
        Boolean(m.is_read) || Boolean(m.read_at) || (m.read_by || []).includes(profile.id);
      if (m.sender_id !== profile.id && !alreadyRead) {
        unreadMap[m.chat_id] = (unreadMap[m.chat_id] || 0) + 1;
      }
    }

    setLastMsgs(lastMap);
    setUnreadCounts(unreadMap);

    if (messagePeerIds.size === 0) {
      setChatPeers([]);
      return;
    }

    const peerIdArray = Array.from(messagePeerIds);
    const { data: peerRows } = await supabase
      .from('profiles')
      .select('*')
      .in('id', peerIdArray);

    const normalizedPeers = ((peerRows || []) as Record<string, unknown>[]).map(
      normalizeProfileRecord
    );
    setChatPeers(normalizedPeers);
  }, [profile?.id]);

  useEffect(() => {
    loadChats();
    const ch = supabase
      .channel('chats-list-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadChats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, loadChats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadChats)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadChats]);

  const openDirectChat = (targetUser: Profile) => {
    if (!profile) return;
    if (!targetUser?.id) {
      showToast('Select a chat first', 'error');
      return;
    }
    const cid = getDmChatId(profile.id, targetUser.id);
    const online = isUserOnline(targetUser.last_seen);
    setSelectedReceiverId(targetUser.id);
    onChatDetailChange?.(true);
    setActiveChat({
      id: cid,
      title: targetUser.full_name || targetUser.name || targetUser.username,
      subtitle: `@${targetUser.username}`,
      isGroup: false,
      receiverId: targetUser.id,
      peer: targetUser,
      avatar: targetUser.avatar_url,
      isOnline: online,
      lastMsg: lastMsgs[cid],
      unread: unreadCounts[cid] || 0,
    });
  };

  const handleSelectChat = (item: ChatItem) => {
    const chatUserId = item.peer?.id || item.receiverId || null;
    if (!chatUserId) {
      showToast('Select a chat first', 'error');
      return;
    }
    setSelectedReceiverId(chatUserId);
    onChatDetailChange?.(true);
    setActiveChat({ ...item, receiverId: chatUserId });
  };

  const trimmedSearch = search.trim().toLowerCase();

  const rawItems: ChatItem[] = chatPeers
    .filter((peer) => {
      const cid = getDmChatId(profile?.id || '', peer.id);
      return Boolean(lastMsgs[cid]);
    })
    .map((peer) => {
      const cid = getDmChatId(profile?.id || '', peer.id);
      const online = isUserOnline(peer.last_seen);
      return {
        id: cid,
        title: peer.full_name || peer.name || peer.username,
        subtitle: `@${peer.username}`,
        isGroup: false,
        receiverId: peer.id,
        peer,
        avatar: peer.avatar_url,
        isOnline: online,
        lastMsg: lastMsgs[cid],
        unread: unreadCounts[cid] || 0,
      };
    });

  const allItems: ChatItem[] = rawItems
    .sort((a, b) => {
      const aTime = a.lastMsg?.created_at ? new Date(a.lastMsg.created_at).getTime() : 0;
      const bTime = b.lastMsg?.created_at ? new Date(b.lastMsg.created_at).getTime() : 0;
      return bTime - aTime;
    })
    .filter((item) => {
      if (!trimmedSearch) return true;
      const msgText = (item.lastMsg?.text || item.lastMsg?.content || '').toLowerCase();
      return (
        item.title.toLowerCase().includes(trimmedSearch) ||
        (item.subtitle || '').toLowerCase().includes(trimmedSearch) ||
        msgText.includes(trimmedSearch)
      );
    });

  const listPane = (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-[#0A0A0A] text-white">
      {/* Search + Friends / QR Toolbar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-2xl px-3 min-h-[42px] focus-within:border-[#00E5FF]">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats or messages..."
            className="bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none w-full"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-zinc-400 hover:text-white p-0.5"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setFriendsModalView('scan');
            setFriendsModalOpen(true);
          }}
          className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] hover:bg-white/10 text-[#00E5FF]"
          title="Scan QR Code"
        >
          <QrCode size={18} />
        </button>

        <button
          type="button"
          onClick={() => {
            setFriendsModalView(incomingReqCount > 0 ? 'requests' : 'friends');
            setFriendsModalOpen(true);
          }}
          className="relative min-h-[42px] px-3 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] text-white text-xs font-bold hover:opacity-95"
          title="Friends & Requests"
        >
          <UserPlus size={16} />
          <span className="hidden sm:inline">Friends</span>
          {incomingReqCount > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#00E5FF] text-[#0A0A0A] text-[10px] font-extrabold flex items-center justify-center shadow">
              {incomingReqCount}
            </span>
          )}
        </button>
      </div>

      {allItems.length === 0 ? (
        <div className="py-16 px-4 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-[#7C3AED]/20 to-[#00E5FF]/20 border border-white/10 flex items-center justify-center text-[#00E5FF]">
            <Sparkles size={28} />
          </div>
          <div className="space-y-1">
            <p className="text-base font-bold text-white">
              {trimmedSearch ? 'No matching chats' : 'No chats yet - Scan QR to add friend'}
            </p>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              {trimmedSearch
                ? 'Try another name, @username, or message keyword.'
                : 'Add friends by username, phone number, or QR code, then start a real conversation.'}
            </p>
          </div>
          {!trimmedSearch && (
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setFriendsModalView('scan');
                  setFriendsModalOpen(true);
                }}
                className="px-4 min-h-[42px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-extrabold flex items-center gap-1.5"
              >
                <QrCode size={15} /> Scan QR
              </button>
              <button
                type="button"
                onClick={() => {
                  setFriendsModalView('friends');
                  setFriendsModalOpen(true);
                }}
                className="px-4 min-h-[42px] rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Users size={15} /> Friends ({friends.length})
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {allItems.map((item) => {
            const draft = loadMessageDraft(profile?.id, item.id);
            const active = activeChat?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectChat(item)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition ${
                  active
                    ? 'bg-[#7C3AED]/15 border-[#7C3AED]/50'
                    : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'
                }`}
              >
                <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden">
                  {item.avatar ? (
                    <img src={item.avatar} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    (item.title?.[0] || '?').toUpperCase()
                  )}
                  {item.isOnline && (
                    <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-[#00E5FF] border-2 border-[#0A0A0A]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="font-bold text-sm text-white truncate">{item.title}</p>
                      {item.isOnline ? (
                        <span className="text-[10px] font-semibold text-[#00E5FF] shrink-0">
                          Online
                        </span>
                      ) : item.peer?.last_seen || item.peer?.created_at ? (
                        <span className="text-[10px] text-zinc-500 shrink-0 truncate max-w-[100px]">
                          {formatLastSeenShort(item.peer?.last_seen || item.peer?.created_at)}
                        </span>
                      ) : null}
                    </div>
                    {item.lastMsg && (
                      <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
                        {new Date(item.lastMsg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-0.5">
                    {draft ? (
                      <p className="text-xs text-zinc-300 truncate">
                        <span className="text-rose-400 font-semibold">[Draft] </span>
                        {draft}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-400 truncate">
                        {formatMessagePreview(item.lastMsg)}
                      </p>
                    )}
                    {item.unread > 0 && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-[10px] font-extrabold tabular-nums">
                        {item.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex bg-[#0A0A0A]">
      <div
        className={`w-full lg:w-96 lg:border-r lg:border-white/10 ${
          activeChat ? 'hidden lg:block' : 'block'
        }`}
      >
        {listPane}
      </div>

      <div
        className={`flex-1 h-full ${
          activeChat ? 'block' : 'hidden lg:flex lg:items-center lg:justify-center'
        }`}
      >
        {activeChat ? (
          <ChatRoom
            chat={activeChat}
            receiverId={activeChat.receiverId || activeChat.peer?.id || selectedReceiverId || null}
            friendsList={friends}
            onBack={() => {
              setActiveChat(null);
              setSelectedReceiverId(null);
              onChatDetailChange?.(false);
              loadChats();
            }}
            onStartCall={onStartCall}
          />
        ) : (
          <div className="text-center space-y-2 p-8 text-zinc-500">
            <MessageSquare size={36} className="mx-auto text-[#7C3AED]/60" />
            <p className="text-sm font-semibold text-zinc-400">
              Select a conversation or open Friends to start messaging
            </p>
          </div>
        )}
      </div>

      {/* Friends & Requests & Search & QR Modal */}
      <FriendsModal
        open={friendsModalOpen}
        initialMode={friendsModalView}
        onClose={() => setFriendsModalOpen(false)}
        onAdded={loadChats}
        onOpenChat={(peer) => openDirectChat(peer)}
        onStartCall={onStartCall}
      />
    </div>
  );
}
