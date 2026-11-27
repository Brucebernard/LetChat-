import React, { useEffect, useState } from 'react';
import { ArrowLeft, Search, ShieldAlert, Trash2, Ban, CheckCircle2, UserCheck, VolumeX } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
  deleteCompatibleMessage,
  getDmChatId,
  insertCompatibleMessage,
} from '../../utils/chatMessageCodec';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AdminLogRow, Message, Profile, ReportRow } from '../../types';

const ADMIN_TABS = ['Reports', 'Flagged Messages', 'All Users', 'Blocked Users'] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

interface AdminDashboardProps {
  onBack: () => void;
}

export default function AdminDashboard({ onBack }: AdminDashboardProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<AdminTab>('Reports');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [flaggedMessages, setFlaggedMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<AdminLogRow[]>([]);
  const [msgCounts, setMsgCounts] = useState<Record<string, number>>({});
  const [repCounts, setRepCounts] = useState<Record<string, number>>({});
  const [userSearch, setUserSearch] = useState('');

  const isAdmin = profile?.role === 'admin';

  const loadAdminData = async () => {
    if (!isAdmin) return;
    const [{ data: rData }, { data: fData }, { data: uData }, { data: mAll }, { data: lData }] =
      await Promise.all([
        supabase
          .from('reports')
          .select(
            '*, reporter:profiles!reports_reporter_id_fkey(id, username, name), reported_user:profiles!reports_reported_user_id_fkey(id, username, name)'
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('messages')
          .select('*, sender:profiles!messages_sender_id_fkey(id, username, name)')
          .or('is_flagged.eq.true,report_count.gte.3')
          .eq('deleted_for_everyone', false)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('messages').select('sender_id'),
        supabase
          .from('admin_logs')
          .select('*, admin:profiles!admin_logs_admin_id_fkey(username)')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

    setReports((rData || []) as ReportRow[]);
    setFlaggedMessages((fData || []) as Message[]);
    setUsers((uData || []) as Profile[]);
    setLogs((lData || []) as AdminLogRow[]);

    const mc: Record<string, number> = {};
    for (const m of mAll || []) {
      mc[m.sender_id] = (mc[m.sender_id] || 0) + 1;
    }
    setMsgCounts(mc);

    const rc: Record<string, number> = {};
    for (const r of rData || []) {
      if (r.reported_user_id) rc[r.reported_user_id] = (rc[r.reported_user_id] || 0) + 1;
    }
    setRepCounts(rc);
  };

  useEffect(() => {
    loadAdminData();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0A0A0A] text-white space-y-4">
        <ShieldAlert size={48} className="text-red-500" />
        <h1 className="text-2xl font-extrabold">Access Denied</h1>
        <p className="text-sm text-zinc-400 text-center max-w-sm">
          This area is restricted to authorized LetChat administrators only.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="px-5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-sm font-bold"
        >
          Return to LetChat FLOW
        </button>
      </div>
    );
  }

  const logAction = async (action: string, targetUserId: string | null | undefined, reason: string) => {
    if (!profile) return;
    await supabase.from('admin_logs').insert({
      admin_id: profile.id,
      action,
      target_user_id: targetUserId || null,
      reason,
    });
  };

  const warnUser = async (r: ReportRow) => {
    if (r.reported_user_id && profile) {
      const dmId = getDmChatId(profile.id, r.reported_user_id);
      await insertCompatibleMessage(supabase, {
        chatId: dmId,
        senderId: profile.id,
        receiverId: r.reported_user_id,
        payload: {
          type: 'text',
          text: `Official LetChat Warning: Your ${r.content_type} was reported for ${r.reason}. Please follow community rules.`,
        },
        senderProfile: profile,
      });
    }
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', r.id);
    await logAction('warn_user', r.reported_user_id, r.reason);
    showToast('User warned and action logged', 'success');
    loadAdminData();
  };

  const deleteReportedContent = async (r: ReportRow) => {
    if (r.content_type === 'message') {
      await deleteCompatibleMessage(supabase, r.content_id);
    } else if (r.content_type === 'moment') {
      await supabase.from('moments').delete().eq('id', r.content_id);
    } else if (r.content_type === 'comment') {
      await supabase.from('moment_comments').delete().eq('id', r.content_id);
    }
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', r.id);
    await logAction(`delete_${r.content_type}`, r.reported_user_id, r.reason);
    showToast('Content removed and logged', 'success');
    loadAdminData();
  };

  const banUser = async (userId?: string | null, reason = 'Violation of rules', reportId?: string) => {
    if (!userId) return;
    await supabase.from('profiles').update({ is_banned: true }).eq('id', userId);
    if (reportId) {
      await supabase.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    }
    await logAction('ban_user', userId, reason);
    showToast('User banned', 'success');
    loadAdminData();
  };

  const dismissReport = async (r: ReportRow) => {
    await supabase.from('reports').update({ status: 'dismissed' }).eq('id', r.id);
    if (r.content_type === 'message') {
      await supabase.from('messages').update({ report_count: 0 }).eq('id', r.content_id);
    }
    await logAction('dismiss_report', r.reported_user_id, r.reason);
    showToast('Report dismissed', 'info');
    loadAdminData();
  };

  const toggleMuteUser = async (u: Profile) => {
    await supabase.from('profiles').update({ is_muted: !u.is_muted }).eq('id', u.id);
    await logAction(u.is_muted ? 'unmute_user' : 'mute_user', u.id, 'Admin moderation');
    loadAdminData();
  };

  const makeAdmin = async (u: Profile) => {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', u.id);
    await logAction('make_admin', u.id, 'Promoted to administrator');
    showToast(`@${u.username} is now an Admin`, 'success');
    loadAdminData();
  };

  const unbanUser = async (u: Profile) => {
    await supabase.from('profiles').update({ is_banned: false }).eq('id', u.id);
    await logAction('unban_user', u.id, 'Unbanned by admin');
    showToast(`@${u.username} unbanned`, 'success');
    loadAdminData();
  };

  const deleteFlaggedMessage = async (m: Message) => {
    await supabase
      .from('messages')
      .update({
        deleted_for_everyone: true,
        text: '[Removed by Moderator]',
        is_flagged: false,
      })
      .eq('id', m.id);
    await logAction('delete_flagged_message', m.sender_id, m.text);
    loadAdminData();
  };

  const clearFlaggedMessage = async (m: Message) => {
    await supabase
      .from('messages')
      .update({ is_flagged: false, report_count: 0 })
      .eq('id', m.id);
    await logAction('clear_flagged_message', m.sender_id, 'Approved after review');
    loadAdminData();
  };

  const filteredUsers = users.filter(
    (u) =>
      !u.is_banned &&
      (u.username?.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.name?.toLowerCase().includes(userSearch.toLowerCase()))
  );
  const blockedUsers = users.filter((u) => u.is_banned);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col">
      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-[#12121A] sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-extrabold text-base">Admin Moderation</h1>
            <p className="text-[11px] text-[#00E5FF]">Signed in as @{profile?.username}</p>
          </div>
        </div>
      </header>

      <div className="p-3 sm:p-4 max-w-5xl w-full mx-auto space-y-4 flex-1">
        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {ADMIN_TABS.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 min-h-[40px] rounded-xl text-xs font-bold shrink-0 whitespace-nowrap ${
                tab === t
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-white/[0.04] border border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Reports Tab */}
        {tab === 'Reports' && (
          <div className="space-y-3">
            {reports.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-10">No reports submitted yet.</p>
            ) : (
              reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-3.5 space-y-2 bg-white dark:bg-zinc-950 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-red-500">
                      {r.content_type.toUpperCase()} · {r.reason}
                    </span>
                    <span className="text-slate-400">Status: {r.status}</span>
                  </div>
                  <p className="text-slate-500 dark:text-zinc-400">
                    Reporter: @{r.reporter?.username || 'unknown'} · Reported: @
                    {r.reported_user?.username || 'external'}
                  </p>
                  {r.content_text && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black border border-slate-200 dark:border-zinc-800">
                      {r.content_text}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => warnUser(r)}
                      className="px-3 min-h-[34px] rounded-lg bg-amber-500 text-white font-bold"
                    >
                      Warn
                    </button>
                    <button
                      onClick={() => deleteReportedContent(r)}
                      className="px-3 min-h-[34px] rounded-lg bg-red-600 text-white font-bold"
                    >
                      Delete Content
                    </button>
                    {r.reported_user_id && (
                      <button
                        onClick={() => banUser(r.reported_user_id, r.reason, r.id)}
                        className="px-3 min-h-[34px] rounded-lg bg-black dark:bg-white text-white dark:text-black font-bold"
                      >
                        Ban User
                      </button>
                    )}
                    <button
                      onClick={() => dismissReport(r)}
                      className="px-3 min-h-[34px] rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Flagged Messages Tab */}
        {tab === 'Flagged Messages' && (
          <div className="space-y-3">
            {flaggedMessages.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-10">
                No auto-flagged or 3+ reported messages.
              </p>
            ) : (
              flaggedMessages.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-3.5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">@{m.sender?.username || 'user'}</span>
                    <span className="text-amber-500 font-bold tabular-nums">
                      {m.is_flagged ? 'Auto-flagged' : ''} · {m.report_count || 0} reports
                    </span>
                  </div>
                  <p className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950">{m.text}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => deleteFlaggedMessage(m)}
                      className="px-3 min-h-[34px] rounded-lg bg-red-600 text-white font-bold flex items-center gap-1"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                    <button
                      onClick={() => clearFlaggedMessage(m)}
                      className="px-3 min-h-[34px] rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold flex items-center gap-1"
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* All Users Tab */}
        {tab === 'All Users' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-900 rounded-xl px-3 min-h-[42px]">
              <Search size={15} className="text-slate-400" />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users by name or username..."
                className="bg-transparent text-xs outline-none w-full"
              />
            </div>

            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-sm">
                      {u.name} (@{u.username}) {u.role === 'admin' ? '· Admin' : ''}
                    </p>
                    <p className="text-slate-500 dark:text-zinc-400 tabular-nums">
                      Joined: {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'} ·{' '}
                      Messages: {msgCounts[u.id] || 0} · Reports: {repCounts[u.id] || 0}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {u.role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => makeAdmin(u)}
                        className="px-3 min-h-[34px] rounded-lg bg-[#7C3AED] text-white font-bold"
                      >
                        Make Admin
                      </button>
                    )}
                    <button
                      onClick={() => toggleMuteUser(u)}
                      className="px-3 min-h-[34px] rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold flex items-center gap-1"
                    >
                      <VolumeX size={13} /> {u.is_muted ? 'Unmute' : 'Mute'}
                    </button>
                    {u.id !== profile?.id && (
                      <button
                        onClick={() => banUser(u.id, 'Banned by Admin')}
                        className="px-3 min-h-[34px] rounded-lg bg-red-600 text-white font-bold flex items-center gap-1"
                      >
                        <Ban size={13} /> Ban
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocked Users Tab */}
        {tab === 'Blocked Users' && (
          <div className="space-y-2">
            {blockedUsers.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-10">No banned users.</p>
            ) : (
              blockedUsers.map((u) => (
                <div
                  key={u.id}
                  className="rounded-2xl border border-slate-200 dark:border-zinc-800 p-3.5 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-bold text-sm">
                      {u.name} (@{u.username})
                    </p>
                    <p className="text-red-500 font-semibold">Banned</p>
                  </div>
                  <button
                    onClick={() => unbanUser(u)}
                    className="px-3.5 min-h-[36px] rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-1"
                  >
                    <UserCheck size={14} /> Unban
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Recent Admin Logs */}
        {logs.length > 0 && (
          <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-2">
            <h3 className="text-xs font-bold text-slate-500">Recent Audit Log</h3>
            <div className="space-y-1 text-[11px] text-slate-500 dark:text-zinc-400">
              {logs.slice(0, 8).map((l) => (
                <p key={l.id}>
                  @{l.admin?.username || 'admin'} performed <strong>{l.action}</strong> ({l.reason})
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
