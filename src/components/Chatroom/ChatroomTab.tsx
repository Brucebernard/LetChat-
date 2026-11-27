import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Users,
  Globe,
  Lock,
  Camera,
  X,
  Check,
  Database,
  MessageSquarePlus,
  Sparkles,
  Keyboard,
} from 'lucide-react';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { useFlowKeyboard } from '../../context/KeyboardContext';
import { compressImage } from '../../utils/mediaUtils';
import { loadFriendshipsAndRequests } from '../../utils/friendService';
import {
  getCachedGroups,
  getDisplayName,
  getUsernameHandle,
  setCachedGroups,
} from '../../utils/appCache';
import { ProfileAvatar, VerifiedNameBadge } from '../Common/VerifiedBadge';
import SetupSqlModal from '../Modals/SetupSqlModal';
import GroupChatRoom from './GroupChatRoom';
import { GroupItem, GroupMember, GroupMessage, Profile } from '../../types';

interface ChatroomTabProps {
  onDetailViewChange?: (isDetail: boolean) => void;
}

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  const msg = (e.message || '').toLowerCase();
  return (
    e.code === '42P01' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table')
  );
}

function formatGroupMsgPreview(msg?: GroupMessage | null): string {
  if (!msg) return 'No messages yet';
  if (msg.deleted_for_everyone) return 'Message deleted';
  if (msg.type === 'image') return 'Photo';
  if (msg.type === 'video') return 'Video';
  if (msg.type === 'voice' || msg.type === 'audio') return 'Voice note';
  if (msg.type === 'document') return msg.file_name || 'Document';
  if (msg.type === 'sticker') return 'Sticker';
  return msg.content || 'Message';
}

function formatTimeShort(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatroomTab({ onDetailViewChange }: ChatroomTabProps) {
  const { profile } = useAuth();
  const { lowDataMode } = useSettings();
  const { showToast } = useToast();
  const { openKeyboard, syncFieldText } = useFlowKeyboard();

  const initialCache = profile?.id ? getCachedGroups(profile.id) : null;
  const [myGroups, setMyGroups] = useState<GroupItem[]>(initialCache?.myGroups || []);
  const [publicGroups, setPublicGroups] = useState<GroupItem[]>(initialCache?.discoverGroups || []);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(!initialCache);
  const [missingTables, setMissingTables] = useState(false);
  const [showSetupSql, setShowSetupSql] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Create group modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const loadChatrooms = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [friendRes, myMemberRes, publicGroupsRes] = await Promise.all([
        loadFriendshipsAndRequests(supabase, profile.id),
        supabase
          .from('group_members')
          .select('group_id, role, last_read_at, groups(*)')
          .eq('user_id', profile.id),
        supabase
          .from('groups')
          .select('*')
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      setFriends(friendRes.acceptedFriends);

      if (myMemberRes.error && isMissingTableError(myMemberRes.error)) {
        setMissingTables(true);
        setLoading(false);
        return;
      }
      if (publicGroupsRes.error && isMissingTableError(publicGroupsRes.error)) {
        setMissingTables(true);
        setLoading(false);
        return;
      }

      setMissingTables(false);

      const memberRows = (myMemberRes.data || []) as unknown as Array<{
        group_id: string;
        role: 'admin' | 'member';
        last_read_at?: string | null;
        groups: GroupItem | null;
      }>;

      const joinedList: GroupItem[] = [];
      const myRoleMap = new Map<string, 'admin' | 'member'>();
      const lastReadMap = new Map<string, string>();
      const joinedIds = new Set<string>();

      for (const row of memberRows) {
        if (!row.groups) continue;
        joinedIds.add(row.groups.id);
        myRoleMap.set(row.groups.id, row.role || 'member');
        if (row.last_read_at) {
          lastReadMap.set(row.groups.id, row.last_read_at);
        }
        joinedList.push({
          ...row.groups,
          my_role: row.role || 'member',
        });
      }

      const publicPool = ((publicGroupsRes.data || []) as GroupItem[]).filter(
        (g) => !joinedIds.has(g.id)
      );

      const allRelevantIds = [
        ...joinedList.map((g) => g.id),
        ...publicPool.map((g) => g.id),
      ];

      const memberCountMap = new Map<string, number>();
      const lastMsgMap = new Map<string, GroupMessage>();
      const unreadCountMap = new Map<string, number>();

      if (allRelevantIds.length > 0) {
        const [{ data: allMembers }, { data: recentMsgs }] = await Promise.all([
          supabase
            .from('group_members')
            .select('group_id, user_id')
            .in('group_id', allRelevantIds),
          supabase
            .from('group_messages')
            .select('*')
            .in('group_id', joinedList.map((g) => g.id))
            .order('created_at', { ascending: false })
            .limit(400),
        ]);

        for (const m of (allMembers || []) as Pick<GroupMember, 'group_id' | 'user_id'>[]) {
          memberCountMap.set(m.group_id, (memberCountMap.get(m.group_id) || 0) + 1);
        }

        for (const msg of (recentMsgs || []) as GroupMessage[]) {
          if (!lastMsgMap.has(msg.group_id)) {
            lastMsgMap.set(msg.group_id, msg);
          }
          if (msg.sender_id !== profile.id) {
            const readCutoff = lastReadMap.get(msg.group_id);
            if (!readCutoff || new Date(msg.created_at).getTime() > new Date(readCutoff).getTime()) {
              unreadCountMap.set(msg.group_id, (unreadCountMap.get(msg.group_id) || 0) + 1);
            }
          }
        }
      }

      const enrichedJoined = joinedList
        .map((g) => ({
          ...g,
          member_count: memberCountMap.get(g.id) || 1,
          my_role: myRoleMap.get(g.id) || 'member',
          last_message: lastMsgMap.get(g.id) || null,
          unread_count: unreadCountMap.get(g.id) || 0,
        }))
        .sort((a, b) => {
          const tA = new Date(a.last_message?.created_at || a.created_at).getTime();
          const tB = new Date(b.last_message?.created_at || b.created_at).getTime();
          return tB - tA;
        });

      const enrichedPublic = publicPool.map((g) => ({
        ...g,
        member_count: memberCountMap.get(g.id) || 1,
      }));

      setMyGroups(enrichedJoined);
      setPublicGroups(enrichedPublic);
      setCachedGroups(profile.id, {
        myGroups: enrichedJoined,
        discoverGroups: enrichedPublic,
      });
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadChatrooms();
  }, [loadChatrooms]);

  useEffect(() => {
    onDetailViewChange?.(Boolean(selectedGroup) || showCreateModal);
  }, [selectedGroup, showCreateModal, onDetailViewChange]);

  useEffect(() => {
    if (!profile?.id) return;
    const sub = supabase
      .channel(`chatroom-tab-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, loadChatrooms)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members' },
        loadChatrooms
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages' },
        loadChatrooms
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [profile?.id, loadChatrooms]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const resetCreateForm = () => {
    setGroupName('');
    setGroupDesc('');
    setIsPublic(false);
    setSelectedMemberIds(new Set());
    setPhotoFile(null);
    setPhotoPreview('');
    setShowCreateModal(false);
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    const cleanName = groupName.trim();
    if (!cleanName) {
      showToast('Enter a group name', 'error');
      return;
    }

    setCreating(true);
    try {
      let photoUrl = '';
      if (photoFile) {
        const compressed = await compressImage(photoFile, lowDataMode);
        const path = `group-photos/${profile.id}/${Date.now()}.jpg`;
        photoUrl = await uploadWithProgress('letchat-media', path, compressed);
      }

      const { data: insertedGroup, error: gErr } = await supabase
        .from('groups')
        .insert({
          name: cleanName,
          description: groupDesc.trim(),
          photo_url: photoUrl,
          is_public: isPublic,
          created_by: profile.id,
        })
        .select('*')
        .single();

      if (gErr || !insertedGroup) {
        if (isMissingTableError(gErr)) {
          setMissingTables(true);
          setShowSetupSql(true);
        }
        showToast(gErr?.message || 'Failed to create group', 'error');
        return;
      }

      const memberInserts = [
        {
          group_id: insertedGroup.id,
          user_id: profile.id,
          role: 'admin',
        },
        ...Array.from(selectedMemberIds).map((uid) => ({
          group_id: insertedGroup.id,
          user_id: uid,
          role: 'member',
        })),
      ];

      const { error: mErr } = await supabase.from('group_members').insert(memberInserts);
      if (mErr) {
        showToast(mErr.message || 'Group created, but failed to add members', 'error');
      } else {
        showToast(`Created "${cleanName}"`, 'success');
      }

      const created: GroupItem = {
        ...(insertedGroup as GroupItem),
        member_count: memberInserts.length,
        my_role: 'admin',
        unread_count: 0,
      };
      resetCreateForm();
      await loadChatrooms();
      setSelectedGroup(created);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinPublicGroup = async (group: GroupItem) => {
    if (!profile?.id) return;
    setJoiningId(group.id);
    try {
      const { error } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: profile.id,
        role: 'member',
      });
      if (error && error.code !== '23505') {
        showToast(error.message || 'Could not join group', 'error');
        return;
      }
      showToast(`Joined ${group.name}`, 'success');
      await loadChatrooms();
      setSelectedGroup({
        ...group,
        my_role: 'member',
        member_count: (group.member_count || 1) + 1,
      });
    } finally {
      setJoiningId(null);
    }
  };

  const filteredMyGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return myGroups;
    return myGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q)
    );
  }, [myGroups, search]);

  const filteredPublicGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return publicGroups;
    return publicGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q)
    );
  }, [publicGroups, search]);

  if (selectedGroup) {
    return (
      <GroupChatRoom
        group={selectedGroup}
        friends={friends}
        onBack={() => {
          setSelectedGroup(null);
          loadChatrooms();
        }}
        onGroupUpdated={loadChatrooms}
        onGroupDeleted={() => {
          setSelectedGroup(null);
          loadChatrooms();
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A] text-white overflow-hidden">
      {/* Top Bar: Search groups + Create Group (+) */}
      <div className="px-4 py-3 border-b border-white/10 bg-[#0A0A0A]/90 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2.5 max-w-2xl mx-auto">
          <div className="flex-1 flex items-center gap-2 px-3 min-h-[42px] rounded-2xl bg-white/[0.06] border border-white/10 focus-within:border-[#00E5FF] transition">
            <Search size={16} className="text-zinc-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                syncFieldText('chatroom-search', e.target.value);
              }}
              placeholder="Search groups..."
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
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
            <button
              type="button"
              onClick={() =>
                openKeyboard({
                  id: 'chatroom-search',
                  label: 'Search Chatrooms',
                  placeholder: 'Search groups...',
                  text: search,
                  sendLabel: 'Search',
                  onChange: setSearch,
                  onSubmit: setSearch,
                })
              }
              className="text-zinc-400 hover:text-[#00E5FF] p-0.5 shrink-0"
              title="Open FLOW Keyboard"
              aria-label="Open FLOW Keyboard"
            >
              <Keyboard size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="min-h-[42px] px-3.5 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-[#7C3AED]/25 hover:opacity-95 transition whitespace-nowrap"
          >
            <Plus size={16} />
            <span>Create</span>
          </button>
        </div>
      </div>

      {/* Group List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-5">
          {missingTables ? (
            <div className="rounded-3xl border border-[#7C3AED]/40 bg-[#12121A] p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl mx-auto bg-gradient-to-br from-[#7C3AED]/25 to-[#00E5FF]/20 border border-[#7C3AED]/40 flex items-center justify-center text-[#00E5FF]">
                <Database size={22} />
              </div>
              <h3 className="font-extrabold text-base">Chatroom Tables Required</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Run the updated LetChat FLOW Database Setup SQL in your Supabase SQL Editor to
                enable <code className="text-[#00E5FF]">groups</code>,{' '}
                <code className="text-[#00E5FF]">group_members</code>, and{' '}
                <code className="text-[#00E5FF]">group_messages</code>.
              </p>
              <button
                type="button"
                onClick={() => setShowSetupSql(true)}
                className="px-5 min-h-[42px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-xs shadow-lg shadow-[#7C3AED]/25"
              >
                Open Setup SQL
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-20 rounded-3xl bg-white/[0.04] border border-white/10 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* Joined Groups */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                    Your Chatrooms ({filteredMyGroups.length})
                  </h2>
                </div>

                {filteredMyGroups.length === 0 ? (
                  <div className="rounded-3xl border border-white/10 bg-[#121218] p-7 text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl mx-auto bg-gradient-to-br from-[#7C3AED]/25 to-[#00E5FF]/20 border border-white/10 flex items-center justify-center text-[#00E5FF]">
                      <MessageSquarePlus size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-sm">
                        {search.trim() ? 'No matching groups' : 'No group chats yet'}
                      </p>
                      <p className="text-xs text-zinc-400">
                        Create a group with your friends or join a public Chatroom below.
                      </p>
                    </div>
                    {!search.trim() && (
                      <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 min-h-[40px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-xs inline-flex items-center gap-1.5"
                      >
                        <Plus size={15} />
                        Create Group
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredMyGroups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setSelectedGroup(group)}
                        className="w-full p-3.5 rounded-3xl bg-[#121218] hover:bg-white/[0.07] border border-white/10 transition flex items-center gap-3.5 text-left"
                      >
                        <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] p-[2px] shrink-0">
                          <div className="w-full h-full rounded-[14px] bg-[#0A0A0A] overflow-hidden flex items-center justify-center font-extrabold text-base">
                            {group.photo_url ? (
                              <img
                                src={group.photo_url}
                                alt={group.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (group.name?.[0] || 'G').toUpperCase()
                            )}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-sm text-white truncate">
                                {group.name}
                              </span>
                              {group.is_public ? (
                                <Globe size={12} className="text-[#00E5FF] shrink-0" />
                              ) : (
                                <Lock size={12} className="text-zinc-500 shrink-0" />
                              )}
                            </div>
                            <span className="text-[11px] text-zinc-500 shrink-0">
                              {formatTimeShort(
                                group.last_message?.created_at || group.created_at
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-1">
                            <p className="text-xs text-zinc-400 truncate">
                              {formatGroupMsgPreview(group.last_message)}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                                <Users size={11} />
                                {group.member_count || 1}
                              </span>
                              {(group.unread_count || 0) > 0 && (
                                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-[10px] font-extrabold flex items-center justify-center">
                                  {group.unread_count}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Public Groups Discovery */}
              {filteredPublicGroups.length > 0 && (
                <section className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-1.5 px-1">
                    <Sparkles size={13} className="text-[#00E5FF]" />
                    <h2 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                      Discover Public Chatrooms
                    </h2>
                  </div>

                  <div className="space-y-2">
                    {filteredPublicGroups.map((group) => (
                      <div
                        key={group.id}
                        className="p-3.5 rounded-3xl bg-[#121218] border border-white/10 flex items-center gap-3.5"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] p-[2px] shrink-0">
                          <div className="w-full h-full rounded-[14px] bg-[#0A0A0A] overflow-hidden flex items-center justify-center font-extrabold text-sm">
                            {group.photo_url ? (
                              <img
                                src={group.photo_url}
                                alt={group.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (group.name?.[0] || 'G').toUpperCase()
                            )}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-sm truncate">{group.name}</p>
                            <Globe size={12} className="text-[#00E5FF] shrink-0" />
                          </div>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">
                            {group.description || 'Public LetChat FLOW Chatroom'}
                          </p>
                          <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
                            <Users size={11} />
                            {group.member_count || 1} members
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={joiningId === group.id}
                          onClick={() => handleJoinPublicGroup(group)}
                          className="px-3.5 min-h-[36px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-bold hover:opacity-95 disabled:opacity-50 shrink-0"
                        >
                          {joiningId === group.id ? 'Joining...' : 'Join'}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4">
          <form
            onSubmit={handleCreateGroup}
            className="w-full sm:max-w-lg max-h-[92vh] bg-[#12121A] border border-white/10 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-extrabold text-base">Create Chatroom</h3>
              <button
                type="button"
                onClick={resetCreateForm}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Group Photo */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-[#7C3AED]/30 to-[#00E5FF]/20 border border-white/15 flex items-center justify-center overflow-hidden shrink-0 group"
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Group" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={24} className="text-[#00E5FF]" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 py-1 bg-black/65 text-[10px] font-bold text-center">
                    Photo
                  </span>
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-bold text-zinc-300 block">Group Name</label>
                  <div className="flex items-center gap-2 px-3.5 min-h-[42px] rounded-2xl bg-white/[0.06] border border-white/10 focus-within:border-[#00E5FF]">
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={groupName}
                      onChange={(e) => {
                        setGroupName(e.target.value);
                        syncFieldText('create-group-name', e.target.value);
                      }}
                      placeholder="e.g. Accra Tech Builders"
                      className="flex-1 bg-transparent text-sm text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        openKeyboard({
                          id: 'create-group-name',
                          label: 'Group Name',
                          placeholder: 'e.g. Accra Tech Builders',
                          text: groupName,
                          onChange: (val) => setGroupName(val.slice(0, 60)),
                        })
                      }
                      className="text-zinc-400 hover:text-[#00E5FF] shrink-0"
                      aria-label="FLOW Keyboard for Group Name"
                    >
                      <Keyboard size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 block">
                    Group Description
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      openKeyboard({
                        id: 'create-group-desc',
                        label: 'Group Description',
                        placeholder: 'What is this group about?',
                        text: groupDesc,
                        onChange: (val) => setGroupDesc(val.slice(0, 240)),
                      })
                    }
                    className="text-[11px] font-semibold text-[#00E5FF] flex items-center gap-1"
                  >
                    <Keyboard size={13} /> FLOW Keyboard
                  </button>
                </div>
                <textarea
                  rows={2}
                  maxLength={240}
                  value={groupDesc}
                  onChange={(e) => {
                    setGroupDesc(e.target.value);
                    syncFieldText('create-group-desc', e.target.value);
                  }}
                  placeholder="What is this group about?"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 text-sm text-white outline-none focus:border-[#00E5FF] resize-none"
                />
              </div>

              {/* Public / Private Toggle */}
              <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {isPublic ? (
                    <Globe size={18} className="text-[#00E5FF]" />
                  ) : (
                    <Lock size={18} className="text-[#7C3AED]" />
                  )}
                  <div>
                    <p className="text-sm font-bold">
                      {isPublic ? 'Public Chatroom' : 'Private Group'}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {isPublic
                        ? 'Anyone on LetChat FLOW can discover and join'
                        : 'Only invited members can join and chat'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic((v) => !v)}
                  className={`w-12 h-7 rounded-full p-1 transition ${
                    isPublic
                      ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF]'
                      : 'bg-white/15'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      isPublic ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Add Members from Contacts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300">
                    Add Members ({selectedMemberIds.size} selected)
                  </label>
                </div>

                {friends.length === 0 ? (
                  <p className="text-xs text-zinc-500 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
                    No accepted friends yet. You can still create the group and add members later.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {friends.map((friend) => {
                      const picked = selectedMemberIds.has(friend.id);
                      return (
                        <button
                          key={friend.id}
                          type="button"
                          onClick={() => toggleMember(friend.id)}
                          className={`w-full p-2.5 rounded-2xl border flex items-center gap-3 text-left transition ${
                            picked
                              ? 'bg-[#7C3AED]/20 border-[#00E5FF]/50'
                              : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07]'
                          }`}
                        >
                          <ProfileAvatar
                            profile={friend}
                            sizeClass="w-9 h-9 text-xs"
                            roundedClass="rounded-full"
                            badgeSize={12}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate flex items-center gap-1">
                              <span className="truncate">{getDisplayName(friend)}</span>
                              <VerifiedNameBadge isVerified={friend.is_verified} size={12} />
                            </p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              {getUsernameHandle(friend)}
                            </p>
                          </div>
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                              picked
                                ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] border-transparent text-white'
                                : 'border-white/25'
                            }`}
                          >
                            {picked && <Check size={13} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-white/10 bg-[#0A0A0A]/80">
              <button
                type="submit"
                disabled={creating || !groupName.trim()}
                className="w-full min-h-[46px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-extrabold text-sm shadow-lg shadow-[#7C3AED]/25 disabled:opacity-50"
              >
                {creating ? 'Creating Group...' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      )}

      <SetupSqlModal open={showSetupSql} onClose={() => setShowSetupSql(false)} />
    </div>
  );
}
