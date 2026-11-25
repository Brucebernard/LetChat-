import React, { useState } from 'react';
import { X, Flag, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { ReportTarget } from '../../types';

const REASONS = ['Spam', 'Harassment', 'Hate Speech', 'Nudity', 'Scam', 'Fake News', 'Other'];

interface ReportModalProps {
  target: ReportTarget | null;
  onClose: () => void;
}

export default function ReportModal({ target, onClose }: ReportModalProps) {
  const { profile } = useAuth();
  const [reason, setReason] = useState('Spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!target) return null;

  const submitReport = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const fullReason = details.trim() ? `${reason}: ${details.trim()}` : reason;
      await supabase.from('reports').insert({
        reporter_id: profile.id,
        reported_user_id: target.reportedUserId || null,
        content_type: target.contentType,
        content_id: String(target.contentId),
        content_text: (target.contentText || '').slice(0, 500),
        reason: fullReason,
        status: 'pending',
      });

      if (target.contentType === 'message' && target.contentId) {
        const { count } = await supabase
          .from('reports')
          .select('*', { count: 'exact', head: true })
          .eq('content_type', 'message')
          .eq('content_id', String(target.contentId));
        if (typeof count === 'number') {
          await supabase
            .from('messages')
            .update({ report_count: count })
            .eq('id', target.contentId);
        }
      }
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setDetails('');
        onClose();
      }, 1300);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-red-500 font-bold">
            <Flag size={18} />
            <span>Report {target.contentType.replace('_', ' ')}</span>
          </div>
          <button
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center space-y-2">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
            <p className="font-semibold">Report Submitted Privately</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Our moderation team will review this. The reported user is not notified.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <p className="text-xs text-slate-500 dark:text-zinc-400">Why are you reporting this?</p>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`px-3 min-h-[40px] rounded-xl text-xs font-medium border text-left transition ${
                    reason === r
                      ? 'bg-red-600 text-white border-red-600'
                      : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Optional extra context..."
              className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#1AA7B8]"
            />
            <button
              disabled={submitting}
              onClick={submitReport}
              className="w-full min-h-[44px] rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
