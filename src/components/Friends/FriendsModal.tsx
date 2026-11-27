import React, { useCallback, useEffect, useState } from 'react';
import {
  QrCode,
  ScanLine,
  Search,
  UserCheck,
  UserPlus,
  Users,
  X,
  MessageCircle,
  Check,
  Clock,
  Loader2,
  Phone,
  Video,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { MyQRCode, ScanQR } from './QrFriendModal';
import {
  acceptFriendRequest,
  declineFriendRequest,
  loadFriendshipsAndRequests,
  searchRealProfiles,
  sendFriendRequest,
} from '../../utils/friendService';
import { FriendRecord, Profile } from '../../types';

export type FriendsModalView = 'friends' | 'requests' | 'find' | 'my-qr' | 'scan';

interface FriendsModalProps {
  open: boolean;
  initialMode?: FriendsModalView;
  onClose: () => void;
  onAdded?: () => void;
  onOpenChat?: (peer: Profile) => void;
  onStartCall?: (peer: Profile, callType: 'voice' | 'video') => void;
}

export default function FriendsModal({
  open,
  initialMode = 'friends',
  onClose,
  onAdded,
  onOpenChat,
  onStartCall,
}: FriendsModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [activeView, setActiveView] = useState<FriendsModalView>(initialMode);

  const [acceptedFriends, setAcceptedFriends] = useState<Profile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRecord[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRecord[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [outgoingIds, setOutgoingIds] = useState<Set<string>>(new Set());
  const [incomingIds, setIncomingIds] = useState<Set<string>>(new Set());
  const [loadingList, setLoadingList] = useState(false);

  // Search by username or phone
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setActiveView(initialMode);
    }
  }, [open, initialMode]);

  const refreshData = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingList(true);
    try {
      const data = await loadFriendshipsAndRequests(supabase, profile.id);
      setAcceptedFriends(data.acceptedFriends);
      setIncomingRequests(data.incomingRequests);
      setOutgoingRequests(data.outgoingRequests);
      setAcceptedIds(data.acceptedIds);
      setOutgoingIds(data.outgoingIds);
      setIncomingIds(data.incomingIds);
    } finally {
      setLoadingList(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!open || !profile?.id) return;
    refreshData();

    const channel = supabase
      .channel(`friends-modal-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, () => {
        refreshData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, profile?.id, refreshData]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const matches = await searchRealProfiles(supabase, profile.id, searchQuery);
      setSearchResults(matches);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (target: Profile) => {
    if (!profile) return;
    setBusyUserId(target.id);
    try {
      const res = await sendFriendRequest(supabase, profile, target);
      if (!res.ok) {
        showToast(res.error || 'Could not send request', 'error');
        return;
      }
      if (res.status === 'accepted') {
        showToast(`You are now friends with @${target.username}!`, 'success');
      } else {
        showToast(`Friend request sent to @${target.username}`, 'success');
      }
      await refreshData();
      onAdded?.();
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAccept = async (requesterId: string, username?: string) => {
    if (!profile) return;
    setBusyUserId(requesterId);
    try {
      const res = await acceptFriendRequest(supabase, profile.id, requesterId);
      if (!res.ok) {
        showToast(res.error || 'Failed to accept request', 'error');
        return;
      }
      showToast(`Accepted @${username || 'friend'}! You can now chat.`, 'success');
      await refreshData();
      onAdded?.();
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDecline = async (requesterId: string) => {
    if (!profile) return;
    setBusyUserId(requesterId);
    try {
      const res = await declineFriendRequest(supabase, profile.id, requesterId);
      if (!res.ok) {
        showToast(res.error || 'Failed to decline request', 'error');
        return;
      }
      showToast('Request declined', 'info');
      await refreshData();
      onAdded?.();
    } finally {
      setBusyUserId(null);
    }
  };

  if (!open || !profile) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl bg-[#111118] text-white border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="font-extrabold text-base text-white">Friends &amp; Connections</h2>
            <p className="text-[11px] text-zinc-400">
              Add real friends via username, phone, or QR code
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
            aria-label="Close Friends Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Pills */}
        <div className="px-3 pt-3 pb-2 grid grid-cols-5 gap-1 border-b border-white/10 bg-black/20">
          {[
            { id: 'friends' as const, label: 'Friends', icon: Users, badge: acceptedFriends.length },
            { id: 'requests' as const, label: 'Requests', icon: UserCheck, badge: incomingRequests.length },
            { id: 'find' as const, label: 'Find', icon: Search, badge: 0 },
            { id: 'my-qr' as const, label: 'My QR', icon: QrCode, badge: 0 },
            { id: 'scan' as const, label: 'Scan', icon: ScanLine, badge: 0 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`relative min-h-[42px] px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition ${
                  active
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.badge > 0 && tab.id === 'requests' && (
                  <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#00E5FF] text-[#0A0A0A] text-[9px] font-extrabold flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeView === 'friends' && (
            <>
              {loadingList ? (
                <div className="py-12 flex flex-col items-center gap-2 text-zinc-400">
                  <Loader2 size={22} className="animate-spin text-[#00E5FF]" />
                  <span className="text-xs">Loading friends...</span>
                </div>
              ) : acceptedFriends.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[#7C3AED]/15 border border-[#7C3AED]/30 flex items-center justify-center text-[#00E5FF]">
                    <Users size={22} />
                  </div>
                  <p className="text-sm font-bold text-white">No accepted friends yet</p>
                  <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                    Search by username or phone number, or scan a friend&apos;s QR code to connect.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveView('find')}
                      className="px-4 min-h-[38px] rounded-xl bg-[#7C3AED] text-white text-xs font-bold"
                    >
                      Search Users
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView('scan')}
                      className="px-4 min-h-[38px] rounded-xl bg-[#00E5FF] text-[#0A0A0A] text-xs font-extrabold"
                    >
                      Scan QR
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {acceptedFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3"
                    >
                      {friend.avatar_url ? (
                        <img
                          src={friend.avatar_url}
                          alt={friend.full_name || friend.name}
                          className="w-11 h-11 rounded-2xl object-cover border border-white/15 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] text-white flex items-center justify-center font-bold shrink-0">
                          {(friend.full_name || friend.name)?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-white truncate">
                          {friend.full_name || friend.name}
                        </p>
                        <p className="text-xs text-[#00E5FF] truncate">@{friend.username}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onStartCall && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onStartCall(friend, 'voice');
                              }}
                              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-200 flex items-center justify-center"
                              title="Voice Call"
                            >
                              <Phone size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onStartCall(friend, 'video');
                              }}
                              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/15 text-[#00E5FF] flex items-center justify-center"
                              title="Video Call"
                            >
                              <Video size={15} />
                            </button>
                          </>
                        )}
                        {onOpenChat && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenChat(friend);
                            }}
                            className="px-3 min-h-[36px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-bold flex items-center gap-1"
                          >
                            <MessageCircle size={14} />
                            <span>Chat</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeView === 'requests' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Incoming Requests ({incomingRequests.length})
                </h3>
                {incomingRequests.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-3">No incoming friend requests.</p>
                ) : (
                  incomingRequests.map((req) => {
                    const u = req.user;
                    return (
                      <div
                        key={req.id}
                        className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3"
                      >
                        {u?.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt={u.full_name || u.name}
                            className="w-10 h-10 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-[#7C3AED] text-white flex items-center justify-center font-bold shrink-0">
                            {(u?.full_name || u?.name || 'U')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-white truncate">
                            {u?.full_name || u?.name || 'User'}
                          </p>
                          <p className="text-xs text-[#00E5FF] truncate">
                            @{u?.username || req.user_id.slice(0, 8)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyUserId === req.user_id}
                            onClick={() => handleAccept(req.user_id, u?.username)}
                            className="px-3 min-h-[34px] rounded-xl bg-[#00E5FF] text-[#0A0A0A] text-xs font-extrabold disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={busyUserId === req.user_id}
                            onClick={() => handleDecline(req.user_id)}
                            className="px-2.5 min-h-[34px] rounded-xl bg-white/10 hover:bg-red-500/20 text-zinc-300 hover:text-red-300 text-xs font-semibold disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {outgoingRequests.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Sent Requests ({outgoingRequests.length})
                  </h3>
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-white truncate">
                          {req.friend?.full_name || req.friend?.name || 'User'}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          @{req.friend?.username || req.friend_id.slice(0, 8)}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-amber-300 font-semibold">
                        <Clock size={12} /> Pending
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeView === 'find' && (
            <div className="space-y-3">
              <form onSubmit={handleSearch} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search @username, name, or +phone..."
                    className="w-full pl-9 pr-3 min-h-[42px] rounded-2xl border border-white/15 bg-white/5 text-xs text-white outline-none focus:border-[#00E5FF]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 min-h-[42px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-bold disabled:opacity-50"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </form>

              {searchResults.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">
                  Enter a username (e.g. kofi) or phone number (+233...) to find real users.
                </p>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((user) => {
                    const isFriend = acceptedIds.has(user.id);
                    const isPendingOut = outgoingIds.has(user.id);
                    const isPendingIn = incomingIds.has(user.id);

                    return (
                      <div
                        key={user.id}
                        className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center gap-3"
                      >
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.full_name || user.name}
                            className="w-10 h-10 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] text-white flex items-center justify-center font-bold shrink-0">
                            {(user.full_name || user.name)?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-white truncate">
                            {user.full_name || user.name}
                          </p>
                          <p className="text-xs text-[#00E5FF] truncate">
                            @{user.username}
                            {user.phone ? ` · ${user.phone}` : ''}
                          </p>
                        </div>

                        {isFriend ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenChat) {
                                onClose();
                                onOpenChat(user);
                              }
                            }}
                            className="px-3 min-h-[34px] rounded-xl bg-white/10 text-[#00E5FF] text-xs font-bold flex items-center gap-1"
                          >
                            <Check size={13} /> Friends
                          </button>
                        ) : isPendingIn ? (
                          <button
                            type="button"
                            disabled={busyUserId === user.id}
                            onClick={() => handleAccept(user.id, user.username)}
                            className="px-3 min-h-[34px] rounded-xl bg-[#00E5FF] text-[#0A0A0A] text-xs font-extrabold"
                          >
                            Accept
                          </button>
                        ) : isPendingOut ? (
                          <span className="px-3 min-h-[34px] rounded-xl bg-white/5 border border-white/10 text-amber-300 text-xs font-semibold flex items-center gap-1">
                            <Clock size={12} /> Requested
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busyUserId === user.id}
                            onClick={() => handleSendRequest(user)}
                            className="px-3 min-h-[34px] rounded-xl bg-[#7C3AED] text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                          >
                            <UserPlus size={13} /> Add
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeView === 'my-qr' && <MyQRCode username={profile.username} />}

          {activeView === 'scan' && (
            <ScanQR
              myUsername={profile.username}
              onAdded={() => {
                refreshData();
                onAdded?.();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
