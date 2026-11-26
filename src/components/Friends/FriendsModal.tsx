import React, { useEffect, useState } from 'react';
import { QrCode, ScanLine, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { MyQRCode, ScanQR } from './QrFriendModal';

export type FriendsModalView = 'my-qr' | 'scan';

interface FriendsModalProps {
  open: boolean;
  initialMode?: FriendsModalView;
  onClose: () => void;
  onAdded?: () => void;
}

export default function FriendsModal({
  open,
  initialMode = 'my-qr',
  onClose,
  onAdded,
}: FriendsModalProps) {
  const { profile } = useAuth();
  const [activeView, setActiveView] = useState<FriendsModalView>(initialMode);

  useEffect(() => {
    if (open) {
      setActiveView(initialMode);
    }
  }, [open, initialMode]);

  if (!open || !profile) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 p-4 space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabbed Header Toggle: My QR | Scan Friend */}
        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 flex-1">
            <button
              type="button"
              onClick={() => setActiveView('my-qr')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                activeView === 'my-qr'
                  ? 'bg-white dark:bg-black text-[#0A3D62] dark:text-[#1AA7B8] shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <QrCode size={14} /> My QR
            </button>
            <button
              type="button"
              onClick={() => setActiveView('scan')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
                activeView === 'scan'
                  ? 'bg-white dark:bg-black text-[#0A3D62] dark:text-[#1AA7B8] shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <ScanLine size={14} /> Scan Friend
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
            aria-label="Close Friends Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Active QR View */}
        {activeView === 'my-qr' ? (
          <MyQRCode username={profile.username} />
        ) : (
          <ScanQR
            myUsername={profile.username}
            onAdded={() => {
              onAdded?.();
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}
