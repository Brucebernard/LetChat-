import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { SETUP_SQL } from '../../setupSql';
import { copyToClipboard } from '../../utils/mediaUtils';

interface SetupSqlModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SetupSqlModal({ open, onClose }: SetupSqlModalProps) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const copySql = async () => {
    const ok = await copyToClipboard(SETUP_SQL);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <div>
            <h3 className="font-bold text-base">Supabase Setup SQL</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Run in Supabase SQL Editor for project lqgixqbciaperisapfnm
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copySql}
              className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-[#0A3D62] text-white text-xs font-semibold hover:opacity-90 whitespace-nowrap"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy SQL'}
            </button>
            <button
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <pre className="p-4 text-[11px] leading-relaxed overflow-auto font-mono bg-slate-50 dark:bg-black text-slate-800 dark:text-zinc-200">
          {SETUP_SQL}
        </pre>
      </div>
    </div>
  );
}
