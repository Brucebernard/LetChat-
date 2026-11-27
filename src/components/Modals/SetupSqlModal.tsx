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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111118] text-white border border-white/10 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <h3 className="font-bold text-base">Supabase Setup SQL</h3>
            <p className="text-xs text-zinc-400">
              Run in Supabase SQL Editor for project lqgixqbciaperisapfnm
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copySql}
              className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-semibold hover:opacity-95 whitespace-nowrap"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy SQL'}
            </button>
            <button
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <pre className="p-4 text-[11px] leading-relaxed overflow-auto font-mono bg-[#0A0A0A] text-zinc-200">
          {SETUP_SQL}
        </pre>
      </div>
    </div>
  );
}
