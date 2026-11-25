import React from 'react';
import { X, ShieldCheck } from 'lucide-react';

export const COMMUNITY_RULES = [
  'Respect everyone. Harassment, hate speech, threats, and bullying are strictly prohibited.',
  'No nudity, sexually explicit content, or graphic violence.',
  'Zero tolerance for scams, phishing links, fake Mobile Money (MoMo) promos, or fraud.',
  'No spam or automated flooding in Chats, Moments, or Football comments.',
  'Do not share false news or impersonate other users or officials.',
  'Content receiving 3+ community reports is automatically hidden pending administrator review.',
  'Administrators reserve the right to warn, mute, delete content, or permanently ban violators.',
];

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RulesModal({ open, onClose }: RulesModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[#1AA7B8]" size={20} />
            <h3 className="font-bold text-base">LetChat Community Rules</h3>
          </div>
          <button
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-[68vh] overflow-y-auto">
          {COMMUNITY_RULES.map((rule, idx) => (
            <div key={idx} className="flex gap-2.5 text-sm leading-relaxed">
              <span className="font-bold text-[#1AA7B8] tabular-nums">{idx + 1}.</span>
              <p className="text-slate-800 dark:text-zinc-200">{rule}</p>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl bg-[#0A3D62] text-white font-semibold text-sm hover:opacity-95"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
