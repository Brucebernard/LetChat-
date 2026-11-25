import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QrCode, ScanLine, Copy, Check, X, UserPlus } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/mediaUtils';

interface QrFriendModalProps {
  open: boolean;
  initialMode?: 'my-qr' | 'scan';
  onClose: () => void;
  onAdded: () => void;
}

export function MyQRCode({ username }: { username: string }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const qrValue = `letchat://add/${username}`;

  const copyLink = async () => {
    const ok = await copyToClipboard(qrValue);
    if (ok) {
      setCopied(true);
      showToast('QR link copied!', 'success');
      setTimeout(() => setCopied(false), 1800);
    } else {
      showToast('Unable to access clipboard in this browser.', 'error');
    }
  };

  return (
    <div className="flex flex-col items-center gap-3.5 py-4 text-center">
      <h3 className="font-bold text-base">My QR Code</h3>
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <QRCodeSVG
          value={qrValue}
          size={210}
          bgColor="#FFFFFF"
          fgColor="#0A3D62"
          level="M"
        />
      </div>
      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
        @{username} · Scan to add me on LetChat
      </p>
      <button
        type="button"
        onClick={copyLink}
        className="flex items-center gap-1.5 px-5 min-h-[40px] bg-[#0A3D62] text-white rounded-xl text-xs font-bold hover:opacity-90"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy Link'}
      </button>
    </div>
  );
}

export function ScanQR({
  myUsername,
  onAdded,
}: {
  myUsername: string;
  onAdded: () => void;
}) {
  const { profile: myProfile } = useAuth();
  const { showToast } = useToast();
  const [scanned, setScanned] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (scanned) return;
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 220, height: 220 } },
      false
    );

    scanner.render(
      (decodedText) => {
        const cleaned = decodedText
          .replace(/^letchat:\/\/add\//i, '')
          .replace(/^@/, '')
          .trim()
          .toLowerCase();
        if (cleaned) {
          setScanned(cleaned);
          scanner.clear().catch(() => {});
        }
      },
      () => {
        // ignore per-frame scan misses
      }
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [scanned]);

  const addFriend = async () => {
    if (!scanned) return;
    if (scanned.toLowerCase() === myUsername.toLowerCase()) {
      setStatus("You can't add yourself.");
      return;
    }

    setAdding(true);
    setStatus('Adding...');
    try {
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, username, name')
        .ilike('username', scanned)
        .maybeSingle();

      if (!targetProfile) {
        setStatus('User not found.');
        return;
      }

      let myId = myProfile?.id;
      if (!myId) {
        const { data: me } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', myUsername)
          .maybeSingle();
        myId = me?.id;
      }

      if (!myId) {
        setStatus('Could not verify your profile.');
        return;
      }

      const { error } = await supabase.from('friends').upsert(
        [
          { user_id: myId, friend_id: targetProfile.id, status: 'accepted' },
          { user_id: targetProfile.id, friend_id: myId, status: 'accepted' },
        ],
        { onConflict: 'user_id,friend_id' }
      );

      if (error) {
        setStatus(error.message);
        return;
      }

      setStatus(`Added @${targetProfile.username}!`);
      showToast(`Added ${targetProfile.name} (@${targetProfile.username})`, 'success');
      onAdded();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="py-2 space-y-3">
      <h3 className="font-bold text-base text-center">Scan QR to Add Friend</h3>
      {!scanned ? (
        <div
          id="qr-reader"
          className="w-full rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-black text-black dark:text-white"
        />
      ) : (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm">
            Found user: <span className="font-extrabold text-[#1AA7B8]">@{scanned}</span>
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setScanned(null);
                setStatus('');
              }}
              className="px-4 min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold"
            >
              Scan Again
            </button>
            <button
              type="button"
              disabled={adding}
              onClick={addFriend}
              className="flex items-center gap-1.5 px-5 min-h-[42px] bg-[#1AA7B8] text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              <UserPlus size={15} /> {adding ? 'Adding...' : 'Add Friend'}
            </button>
          </div>
          {status && (
            <p className="text-xs font-semibold text-slate-600 dark:text-zinc-300">{status}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function QrFriendModal({
  open,
  initialMode = 'my-qr',
  onClose,
  onAdded,
}: QrFriendModalProps) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'my-qr' | 'scan'>(initialMode);

  useEffect(() => {
    if (open) setTab(initialMode);
  }, [open, initialMode]);

  if (!open || !profile) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 p-4 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 flex-1 mr-2">
            <button
              type="button"
              onClick={() => setTab('my-qr')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                tab === 'my-qr'
                  ? 'bg-white dark:bg-black text-[#0A3D62] dark:text-[#1AA7B8] shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <QrCode size={14} /> My QR
            </button>
            <button
              type="button"
              onClick={() => setTab('scan')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                tab === 'scan'
                  ? 'bg-white dark:bg-black text-[#0A3D62] dark:text-[#1AA7B8] shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <ScanLine size={14} /> Scan QR
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
            aria-label="Close QR Modal"
          >
            <X size={18} />
          </button>
        </div>

        {tab === 'my-qr' ? (
          <MyQRCode username={profile.username} />
        ) : (
          <ScanQR
            myUsername={profile.username}
            onAdded={() => {
              onAdded();
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}
