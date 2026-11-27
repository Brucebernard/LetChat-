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
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[#12121A] text-white border border-white/10 p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LetChatLogo size={34} />
            <div>
              <h3 className="font-extrabold text-sm">Share LetChat FLOW</h3>
              <p className="text-[11px] text-[#00E5FF] font-medium">
                Encrypted Messaging · Moments · HD Calls
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
            aria-label="Close Share Modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 py-2">
          <div className="p-3 bg-white rounded-2xl border border-white/20 shadow-sm">
            <QRCodeSVG
              value={shareUrl}
              size={168}
              bgColor="#FFFFFF"
              fgColor="#0A0A0A"
              level="M"
            />
          </div>
          <p className="text-[11px] text-zinc-400 text-center">
            Scan to open LetChat FLOW in any browser
          </p>
        </div>

        {profile && (
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-zinc-200">
            <input
              type="checkbox"
              checked={includeInvite}
              onChange={(e) => setIncludeInvite(e.target.checked)}
              className="w-4 h-4 accent-[#00E5FF]"
            />
            <span>Include my friend invite (@{profile.username})</span>
          </label>
        )}

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10">
          <input
            ref={urlInputRef}
            type="text"
            readOnly
            value={shareUrl}
            onClick={(e) => e.currentTarget.select()}
            aria-label="LetChat app link"
            className="text-xs font-mono bg-transparent text-zinc-200 flex-1 min-w-0 outline-none select-all"
          />
          <button
            type="button"
            onClick={copyLink}
            className="text-xs font-bold text-[#00E5FF] shrink-0 min-h-[34px] px-1.5"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="min-h-[44px] rounded-xl border border-white/10 bg-white/[0.04] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-white/[0.08]"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            type="button"
            onClick={nativeShare}
            className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:opacity-95"
          >
            <Share2 size={15} /> Share App
          </button>
        </div>
      </div>
    </div>
  );
}
