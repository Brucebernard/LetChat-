import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Copy, Check, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/mediaUtils';
import LetChatLogo from '../LetChatLogo';

interface ShareAppModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ShareAppModal({ open, onClose }: ShareAppModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [includeInvite, setIncludeInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const baseUrl = window.location.origin;
  const shareUrl =
    includeInvite && profile?.username
      ? `${baseUrl}/?add=${encodeURIComponent(profile.username)}`
      : baseUrl;

  const copyLink = async () => {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      showToast('App link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } else {
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
      showToast('Link selected — press Ctrl+C / Copy to copy it.', 'info');
    }
  };

  const nativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'LetChat',
          text: 'Join me on LetChat — Chat. Share. Discover Everything.',
          url: shareUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    await copyLink();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LetChatLogo size={34} />
            <div>
              <h3 className="font-extrabold text-sm">Share LetChat</h3>
              <p className="text-[11px] text-[#1AA7B8] font-medium">
                Chat. Share. Discover Everything.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
            aria-label="Close Share Modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 py-2">
          <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <QRCodeSVG
              value={shareUrl}
              size={168}
              bgColor="#FFFFFF"
              fgColor="#0A3D62"
              level="M"
            />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 text-center">
            Scan to open LetChat in any browser
          </p>
        </div>

        {profile && (
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInvite}
              onChange={(e) => setIncludeInvite(e.target.checked)}
              className="w-4 h-4 accent-[#1AA7B8]"
            />
            <span>Include my friend invite (@{profile.username})</span>
          </label>
        )}

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          <input
            ref={urlInputRef}
            type="text"
            readOnly
            value={shareUrl}
            onClick={(e) => e.currentTarget.select()}
            aria-label="LetChat app link"
            className="text-xs font-mono bg-transparent flex-1 min-w-0 outline-none select-all"
          />
          <button
            type="button"
            onClick={copyLink}
            className="text-xs font-bold text-[#1AA7B8] shrink-0 min-h-[34px] px-1.5"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-800 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            type="button"
            onClick={nativeShare}
            className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#0A3D62] to-[#1AA7B8] text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-95"
          >
            <Share2 size={15} /> Share App
          </button>
        </div>
      </div>
    </div>
  );
}
