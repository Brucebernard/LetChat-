import React, { useEffect, useState } from 'react';
import { Search, UserPlus, Users, X, Check, MessageSquare, QrCode } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ChatRoom from './ChatRoom';
import QrFriendModal from '../Friends/QrFriendModal';
import {
  fetchRecentUserMessages,
  formatMessagePreview,
  getDmChatId,
} from '../../utils/chatMessageCodec';
import { formatLastSeenShort, isUserOnline } from '../../utils/mediaUtils';
import { loadMessageDraft } from '../../utils/draftStorage';
import { addFriendCompatible } from '../../utils/friendService';
import { ChatItem, Message, Profile } from '../../types';

interface ChatsTabProps {
  onStartCall: (peer: Profile, callType: 'video' | 'audio') => void;
  onChatDetailChange?: (isOpen: boolean) => void;
}

export default function ChatsTab({ onStartCall, onChatDetailChange }: ChatsTabProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; is_group: boolean }[]>([]);
  const [lastMsgs, setLastMsgs] = useState<Record<string, Message>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [activeChat, setActiveChat] = useState<ChatItem | null>(null);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | null>(null);

  useEffect(() => {
    onChatDetailChange?.(Boolean(activeChat));
  }, [activeChat]);

  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [foundUsers, setFoundUsers] = useState<Profile[]>([]);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrInitialMode, setQrInitialMode] = useState<'my-qr' | 'scan'>('scan');

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const loadChats = async () => {
    if (!profile) return;

    const [{ data: fRows }, { data: pRows }, { data: memberRows }] = await Promise.all([
      supabase
        .from('friends')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${profile.id},friend_id.eq.${profile.id}`),
      supabase
        .from('profiles')
        .select('*')
        .neq('id', profile.id)
        .order('name', { ascending: true }),
      supabase
        .from('chat_members')
        .select('chat:chats(*)')
        .eq('user_id', profile.id),
    ]);

    const everyoneProfiles = ((pRows || []) as Profile[]).filter((p) => Boolean(p && p.id));
    const profileMap = new Map<string, Profile>();
    for (const p of everyoneProfiles) profileMap.set(p.id, p);

    const friendIds = new Set<string>();
    for (const row of fRows || []) {
      const r = row as { user_id?: string; friend_id?: string; status?: string };
      const otherId = r.user_id === profile.id ? r.friend_id : r.user_id;
      if (otherId && otherId !== profile.id) {
        friendIds.add(otherId);
      }
    }

    const missingFriendIds = Array.from(friendIds).filter((id) => !profileMap.has(id));
    if (missingFriendIds.length > 0) {
      const { data: extraProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', missingFriendIds);
      for (const ep of (extraProfiles || []) as Profile[]) {
        if (ep?.id) profileMap.set(ep.id, ep);
      }
    }

    const friendProfiles = Array.from(friendIds)
      .map((id) => profileMap.get(id))
      .filter((p): p is Profile => Boolean(p));

    const mergedPeers = Array.from(profileMap.values());

    setFriends(friendProfiles);
    setAllUsers(mergedPeers);

    const groupList = (memberRows || [])
      .map((r) => (r as unknown as { chat: { id: string; name: string; is_group: boolean } | null }).chat)
      .filter((c): c is { id: string; name: string; is_group: boolean } => Boolean(c && c.is_group));
    setGroups(groupList);

    const chatIds = [
      ...mergedPeers.map((f) => getDmChatId(profile.id, f.id)),
      ...groupList.map((g) => g.id),
    ];
    const msgs = await fetchRecentUserMessages(supabase, profile.id, chatIds);
    const lastMap: Record<string, Message> = {};
    const unreadMap: Record<string, number> = {};
    for (const m of msgs) {
      if (!m.chat_id) continue;
      if (!lastMap[m.chat_id]) lastMap[m.chat_id] = m;
      if (m.sender_id !== profile.id && !(m.read_by || []).includes(profile.id)) {
        unreadMap[m.chat_id] = (unreadMap[m.chat_id] || 0) + 1;
      }
    }
    setLastMsgs(lastMap);
    setUnreadCounts(unreadMap);
  };

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
  }, [profile]);

  const searchUsers = async (q: string) => {
    setFriendQuery(q);
    if (!profile) {
      setFoundUsers([]);
      return;
    }
    const clean = q.trim();
    if (!clean) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', profile.id)
        .order('last_seen', { ascending: false })
        .limit(40);
      setFoundUsers((data || allUsers) as Profile[]);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', profile.id)
      .or(`username.ilike.%${clean}%,name.ilike.%${clean}%`)
      .limit(40);
    setFoundUsers((data || []) as Profile[]);
  };

  const openDirectChat = (targetUser: Profile) => {
    if (!profile) return;
    if (!targetUser?.id) {
      showToast('Select a chat first', 'error');
      return;
    }
    const cid = getDmChatId(profile.id, targetUser.id);
    const online = Boolean(
      targetUser.last_seen && Date.now() - new Date(targetUser.last_seen).getTime() < 5 * 60 * 1000
    );
    setShowAddFriend(false);
    setFriendQuery('');
    setFoundUsers([]);
    setSelectedReceiverId(targetUser.id);
    onChatDetailChange?.(true);
    setActiveChat({
      id: cid,
      title: targetUser.name,
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
    if (!item.isGroup) {
      const chatUserId = item.peer?.id || item.receiverId || null;
      if (!chatUserId) {
        showToast('Select a chat first', 'error');
        return;
      }
      setSelectedReceiverId(chatUserId);
      onChatDetailChange?.(true);
      setActiveChat({ ...item, receiverId: chatUserId });
      return;
    }
    setSelectedReceiverId(null);
    onChatDetailChange?.(true);
    setActiveChat({ ...item, receiverId: null });
  };

  const addFriend = async (targetUser: Profile) => {
    if (!profile) return;
    const { ok, error } = await addFriendCompatible(supabase, profile, targetUser);
    if (!ok) {
      showToast(error || 'Could not add contact', 'error');
      return;
    }
    setShowAddFriend(false);
    setFriendQuery('');
    setFoundUsers([]);
    showToast(`Added ${targetUser.name}`, 'success');
    loadChats();
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0 || !profile) return;
    const gid = `grp_${crypto.randomUUID()}`;
    await supabase.from('chats').insert({
      id: gid,
      name: groupName.trim(),
      is_group: true,
      created_by: profile.id,
    });
    const rows = [profile.id, ...selectedMembers].map((uid) => ({ chat_id: gid, user_id: uid }));
    await supabase.from('chat_members').insert(rows);
    setShowCreateGroup(false);
    setGroupName('');
    setSelectedMembers([]);
    showToast('Group created', 'success');
    loadChats();
  };

  // Default DM list ONLY shows contacts the user has added (not random platform users)
  const peerListForItems = friends;
  const addedFriendIds = new Set(friends.map((f) => f.id));
  const trimmedSearch = search.trim().toLowerCase();

  const rawItems: ChatItem[] = [
    ...groups.map((g) => ({
      id: g.id,
      title: g.name,
      isGroup: true,
      receiverId: null,
      avatar: null,
      isOnline: true,
      lastMsg: lastMsgs[g.id],
      unread: unreadCounts[g.id] || 0,
    })),
    ...peerListForItems.map((f) => {
      const cid = getDmChatId(profile?.id || '', f.id);
      const online = isUserOnline(f.last_seen);
      return {
        id: cid,
        title: f.name,
        subtitle: `@${f.username}`,
        isGroup: false,
        receiverId: f.id,
        peer: f,
        avatar: f.avatar_url,
        isOnline: online,
        lastMsg: lastMsgs[cid],
        unread: unreadCounts[cid] || 0,
      };
    }),
  ];

  const allItems: ChatItem[] = rawItems
    .sort((a, b) => {
      const aTime = a.lastMsg?.created_at ? new Date(a.lastMsg.created_at).getTime() : 0;
      const bTime = b.lastMsg?.created_at ? new Date(b.lastMsg.created_at).getTime() : 0;
      return bTime - aTime;
    })
    .filter(
      (item) =>
        !trimmedSearch ||
        item.title.toLowerCase().includes(trimmedSearch) ||
        (item.subtitle || '').toLowerCase().includes(trimmedSearch)
    );

  // Only expose non-added platform users when the user explicitly types a search query
  const platformSearchResults: Profile[] = trimmedSearch
    ? allUsers.filter(
        (u) =>
          !addedFriendIds.has(u.id) &&
          (u.name.toLowerCase().includes(trimmedSearch) ||
            u.username.toLowerCase().includes(trimmedSearch))
      )
    : [];

  const listPane = (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-slate-100 dark:bg-zinc-900 rounded-xl px-3 min-h-[42px]">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats or find people..."
            className="bg-transparent text-sm outline-none w-full"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-0.5"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => {
            setQrInitialMode('scan');
            setQrModalOpen(true);
          }}
          className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
          title="QR Friend Code"
        >
          <QrCode size={18} />
        </button>
        <button
          onClick={() => {
            setShowAddFriend(true);
            searchUsers('');
          }}
          className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-[#0A3D62] text-white"
          title="Add Friend"
        >
          <UserPlus size={18} />
        </button>
        <button
          onClick={() => setShowCreateGroup(true)}
          className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-[#1AA7B8] text-white"
          title="New Group Chat"
        >
          <Users size={18} />
        </button>
      </div>

      {allItems.length === 0 && platformSearchResults.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">
            {trimmedSearch ? 'No matching contacts or users found' : 'No added contacts yet'}
          </p>
          <button
            onClick={() => {
              setShowAddFriend(true);
              searchUsers('');
            }}
            className="px-4 min-h-[42px] rounded-xl bg-[#1AA7B8] text-white text-xs font-bold"
          >
            Find People to Add
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {allItems.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-zinc-900">
              {allItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelectChat(item)}
                  className={`w-full flex items-center gap-3 py-3 px-2 rounded-xl text-left transition ${
                    activeChat?.id === item.id
                      ? 'bg-slate-100 dark:bg-zinc-900'
                      : 'hover:bg-slate-50 dark:hover:bg-zinc-950'
                  }`}
                >
                  <div className="relative w-12 h-12 rounded-full bg-[#0A3D62] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden">
                    {item.avatar ? (
                      <img src={item.avatar} alt={item.title} className="w-full h-full object-cover" />
                    ) : item.isGroup ? (
                      <Users size={20} />
                    ) : (
                      (item.title[0] || '?').toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="font-bold text-sm truncate">{item.title}</p>
                        {!item.isGroup && item.isOnline ? (
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                            Online
                          </span>
                        ) : !item.isGroup && (item.peer?.last_seen || item.peer?.created_at) ? (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0 truncate max-w-[110px]">
                            {formatLastSeenShort(item.peer?.last_seen || item.peer?.created_at)}
                          </span>
                        ) : null}
                      </div>
                      {item.lastMsg && (
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                          {new Date(item.lastMsg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      {(() => {
                        const draft = loadMessageDraft(profile?.id, item.id);
                        return draft ? (
                          <p className="text-xs text-slate-600 dark:text-zinc-300 truncate">
                            <span className="text-red-500 font-semibold">[Draft] </span>
                            {draft}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                            {formatMessagePreview(item.lastMsg)}
                          </p>
                        );
                      })()}
                      {item.unread > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[#1AA7B8] text-white text-[10px] font-bold tabular-nums">
                          {item.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {platformSearchResults.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                People on LetChat
              </p>
              <div className="divide-y divide-slate-100 dark:divide-zinc-900">
                {platformSearchResults.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-2 py-2.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-950"
                  >
                    <button
                      type="button"
                      onClick={() => openDirectChat(u)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#0A3D62] text-white flex items-center justify-center font-bold shrink-0 overflow-hidden text-sm">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          (u.name?.[0] || '?').toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{u.name}</p>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                          @{u.username}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openDirectChat(u)}
                        className="px-2.5 min-h-[34px] rounded-lg bg-[#0A3D62] text-white text-xs font-bold"
                      >
                        Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => addFriend(u)}
                        className="px-2.5 min-h-[34px] rounded-lg bg-[#1AA7B8] text-white text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex">
      {/* Mobile: show list OR room; Desktop lg: side-by-side split */}
      <div className={`w-full lg:w-96 lg:border-r lg:border-slate-200 lg:dark:border-zinc-800 ${activeChat ? 'hidden lg:block' : 'block'}`}>
        {listPane}
      </div>

      <div className={`flex-1 h-full ${activeChat ? 'block' : 'hidden lg:flex lg:items-center lg:justify-center'}`}>
        {activeChat ? (
          <ChatRoom
            chat={activeChat}
            receiverId={
              activeChat.isGroup
                ? null
                : activeChat.receiverId || activeChat.peer?.id || selectedReceiverId || null
            }
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
          <div className="text-center space-y-2 p-8 text-slate-400">
            <MessageSquare size={36} className="mx-auto opacity-50" />
            <p className="text-sm font-semibold">Select a chat to start messaging</p>
          </div>
        )}
      </div>

      {/* Add Friend Modal */}
      {showAddFriend && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Add a Friend</h3>
              <button onClick={() => setShowAddFriend(false)} className="p-1">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddFriend(false);
                  setQrInitialMode('my-qr');
                  setQrModalOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold hover:bg-slate-50 dark:hover:bg-zinc-900"
              >
                <QrCode size={15} /> My QR Code
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddFriend(false);
                  setQrInitialMode('scan');
                  setQrModalOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold"
              >
                <QrCode size={15} /> Scan QR
              </button>
            </div>
            <input
              value={friendQuery}
              onChange={(e) => searchUsers(e.target.value)}
              placeholder="Search exact username or name..."
              className="w-full px-3 min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent text-sm outline-none"
            />
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {foundUsers.map((u) => {
                const alreadyAdded = addedFriendIds.has(u.id);
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2 rounded-xl border border-slate-100 dark:border-zinc-900"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-sm truncate">{u.name}</p>
                      <p className="text-xs text-slate-500 truncate">@{u.username}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openDirectChat(u)}
                        className="px-3 min-h-[36px] rounded-lg bg-[#0A3D62] text-white text-xs font-bold"
                      >
                        Chat
                      </button>
                      {alreadyAdded ? (
                        <span className="px-2.5 min-h-[36px] flex items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => addFriend(u)}
                          className="px-3 min-h-[36px] rounded-lg bg-[#1AA7B8] text-white text-xs font-bold"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {foundUsers.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-4">
                  {friendQuery ? 'No matching users found.' : 'No other users on LetChat yet.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Create Group Chat</h3>
              <button onClick={() => setShowCreateGroup(false)} className="p-1">
                <X size={18} />
              </button>
            </div>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full px-3 min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent text-sm outline-none"
            />
            <p className="text-xs font-semibold text-slate-500">Select Members:</p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {friends.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Add friends first to create a group.</p>
              ) : (
                friends.map((f) => {
                  const picked = selectedMembers.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() =>
                        setSelectedMembers((prev) =>
                          picked ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                        )
                      }
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900 text-sm"
                    >
                      <span>
                        {f.name} (@{f.username})
                      </span>
                      {picked && <Check size={16} className="text-[#1AA7B8]" />}
                    </button>
                  );
                })
              )}
            </div>
            <button
              onClick={createGroup}
              className="w-full min-h-[44px] rounded-xl bg-[#0A3D62] text-white font-bold text-sm"
            >
              Create Group
            </button>
          </div>
        </div>
      )}
      <QrFriendModal
        open={qrModalOpen}
        initialMode={qrInitialMode}
        onClose={() => setQrModalOpen(false)}
        onAdded={loadChats}
      />
    </div>
  );
}
