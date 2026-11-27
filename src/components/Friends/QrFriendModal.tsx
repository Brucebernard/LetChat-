import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  QrCode,
  ScanLine,
  Copy,
  Check,
  X,
  UserPlus,
  Download,
  Share2,
  RefreshCw,
  ImagePlus,
  Camera,
  SwitchCamera,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/mediaUtils';
import { normalizeProfileRecord, sendFriendRequest } from '../../utils/friendService';
import { Profile } from '../../types';

interface QrFriendModalProps {
  open: boolean;
  initialMode?: 'my-qr' | 'scan';
  onClose: () => void;
  onAdded: () => void;
}

export function extractUsernameFromQr(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^letchat:\/\/add\//i.test(trimmed)) {
    const candidate = trimmed.replace(/^letchat:\/\/add\//i, '').split(/[?#/]/)[0];
    const clean = candidate.replace(/^@/, '').trim().toLowerCase();
    return clean || null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const paramUser = url.searchParams.get('add') || url.searchParams.get('ref');
      if (paramUser) {
        const clean = paramUser.replace(/^@/, '').trim().toLowerCase();
        if (clean) return clean;
      }
      const pathParts = url.pathname.split('/').filter(Boolean);
      const last = pathParts[pathParts.length - 1];
      if (last && last.startsWith('@')) {
        return last.slice(1).toLowerCase();
      }
    } catch {
      // fall through
    }
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { username?: unknown; add?: unknown };
      const u =
        typeof parsed.username === 'string'
          ? parsed.username
          : typeof parsed.add === 'string'
            ? parsed.add
            : '';
      const clean = u.replace(/^@/, '').trim().toLowerCase();
      if (clean) return clean;
    } catch {
      // fall through
    }
  }

  const direct = trimmed.replace(/^@/, '').trim().toLowerCase();
  if (/^[a-z0-9_.-]{2,40}$/.test(direct)) {
    return direct;
  }

  return null;
}

export function MyQRCode({ username }: { username: string }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const svgWrapperRef = useRef<HTMLDivElement | null>(null);

  const activeName =
    profile && profile.username?.toLowerCase() === username.toLowerCase()
      ? profile.full_name || profile.name
      : username;
  const activeAvatar =
    profile && profile.username?.toLowerCase() === username.toLowerCase()
      ? profile.avatar_url
      : null;

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://letchat.app';
  const qrValue = `${origin}/?add=${encodeURIComponent(username)}`;

  const copyLink = async () => {
    const ok = await copyToClipboard(qrValue);
    if (ok) {
      setCopied(true);
      showToast('Invite QR link copied!', 'success');
      setTimeout(() => setCopied(false), 1800);
    } else {
      showToast('Unable to access clipboard in this browser.', 'error');
    }
  };

  const shareInvite = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Add ${activeName} on LetChat FLOW`,
          text: `Scan or open this link to add @${username} on LetChat FLOW`,
          url: qrValue,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    await copyLink();
  };

  const saveQrImage = async () => {
    const svgEl = svgWrapperRef.current?.querySelector('svg');
    if (!svgEl) return;
    setSaving(true);
    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const width = 640;
          const height = 780;
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(svgUrl);
            reject(new Error('Canvas unavailable'));
            return;
          }

          ctx.fillStyle = '#0A0A0A';
          ctx.fillRect(0, 0, width, height);

          const grad = ctx.createLinearGradient(0, 0, width, 0);
          grad.addColorStop(0, '#7C3AED');
          grad.addColorStop(1, '#00E5FF');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, 14);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(activeName, width / 2, 84);

          ctx.fillStyle = '#00E5FF';
          ctx.font = '600 22px system-ui, -apple-system, sans-serif';
          ctx.fillText(`@${username}`, width / 2, 120);

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(90, 155, 460, 460);
          ctx.drawImage(img, 100, 165, 440, 440);

          ctx.fillStyle = '#94A3B8';
          ctx.font = '500 20px system-ui, -apple-system, sans-serif';
          ctx.fillText('Scan with LetChat FLOW camera to connect', width / 2, 688);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
          ctx.fillText('LetChat FLOW', width / 2, 728);

          URL.revokeObjectURL(svgUrl);

          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `letchat-flow-qr-${username}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          reject(new Error('Could not export QR image'));
        };
        img.src = svgUrl;
      });
      showToast('QR card downloaded!', 'success');
    } catch {
      showToast('Failed to save QR image.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3.5 py-2 text-center">
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white/5 border border-white/10 w-full">
        {activeAvatar ? (
          <img
            src={activeAvatar}
            alt={activeName}
            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-white/15"
          />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] text-white flex items-center justify-center font-bold text-sm shrink-0">
            {activeName?.[0]?.toUpperCase() || 'U'}
          </div>
        )}
        <div className="min-w-0 text-left flex-1">
          <p className="font-bold text-sm text-white truncate">{activeName}</p>
          <p className="text-xs font-semibold text-[#00E5FF] truncate">@{username}</p>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-[#00E5FF] text-[10px] font-bold">
          FLOW QR
        </span>
      </div>

      <div
        ref={svgWrapperRef}
        className="p-3.5 bg-white rounded-2xl border-2 border-[#7C3AED]/40 shadow-[0_0_24px_rgba(124,58,237,0.25)] relative"
      >
        <QRCodeSVG
          value={qrValue}
          size={196}
          bgColor="#FFFFFF"
          fgColor="#0A0A0A"
          level="H"
          includeMargin
        />
      </div>

      <p className="text-xs font-medium text-zinc-400">
        Scan this code in LetChat FLOW to add @{username}
      </p>

      <div className="grid grid-cols-3 gap-2 w-full">
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center justify-center gap-1.5 min-h-[40px] px-2 bg-[#7C3AED] text-white rounded-xl text-xs font-bold hover:opacity-90 active:scale-95 transition"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>

        <button
          type="button"
          onClick={saveQrImage}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 min-h-[40px] px-2 border border-white/15 hover:bg-white/10 text-white rounded-xl text-xs font-bold active:scale-95 transition disabled:opacity-50"
        >
          <Download size={14} />
          <span>{saving ? '...' : 'Save QR'}</span>
        </button>

        <button
          type="button"
          onClick={shareInvite}
          className="flex items-center justify-center gap-1.5 min-h-[40px] px-2 bg-[#00E5FF] text-[#0A0A0A] rounded-xl text-xs font-extrabold hover:opacity-90 active:scale-95 transition"
        >
          <Share2 size={14} />
          <span>Share</span>
        </button>
      </div>
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
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(true);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [activeCamIdx, setActiveCamIdx] = useState<number>(0);
  const [scannerNonce, setScannerNonce] = useState(0);
  const [manualUsername, setManualUsername] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const readerRegionId = 'letchat-qr-camera-region';
  const fileRegionId = 'letchat-qr-file-region';

  const stopCameraCleanly = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (!inst) return;
    try {
      if (inst.isScanning) {
        await inst.stop();
      }
      inst.clear();
    } catch {
      // ignore cleanup errors if camera already stopped
    }
  }, []);

  const handleDecodedPayload = useCallback(
    async (decodedText: string) => {
      const extracted = extractUsernameFromQr(decodedText);
      if (!extracted) {
        setStatus('Unrecognized QR code. Please scan a LetChat FLOW profile QR.');
        return;
      }

      await stopCameraCleanly();
      setScanned(extracted);
      setStatus('');
      setLookingUp(true);
      setMatchedProfile(null);

      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .ilike('username', extracted)
          .maybeSingle();
        if (data) {
          setMatchedProfile(normalizeProfileRecord(data as Record<string, unknown>));
        } else {
          setStatus(`No LetChat FLOW user found for @${extracted}.`);
        }
      } finally {
        setLookingUp(false);
      }
    },
    [stopCameraCleanly]
  );

  useEffect(() => {
    let cancelled = false;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled || !devices?.length) return;
        setCameras(devices);
        const backIdx = devices.findIndex((d) =>
          /back|rear|environment|wide/i.test(d.label || '')
        );
        if (backIdx >= 0) {
          setActiveCamIdx(backIdx);
        }
      })
      .catch(() => {
        // fallback will use facingMode environment directly
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scanned) return;
    let cancelled = false;

    const startScanner = async () => {
      await stopCameraCleanly();
      if (cancelled) return;

      const el = document.getElementById(readerRegionId);
      if (!el) return;

      setCameraError(null);
      setCameraStarting(true);

      const html5QrCode = new Html5Qrcode(readerRegionId, { verbose: false });
      scannerRef.current = html5QrCode;

      const cameraConstraint: string | { facingMode: string } =
        cameras.length > 0 && cameras[activeCamIdx]
          ? cameras[activeCamIdx].id
          : { facingMode: 'environment' };

      try {
        await html5QrCode.start(
          cameraConstraint,
          {
            fps: 12,
            qrbox: { width: 200, height: 200 },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (!cancelled) {
              handleDecodedPayload(decodedText);
            }
          },
          () => {
            // ignore per-frame misses
          }
        );
        if (!cancelled) setCameraStarting(false);
      } catch (err) {
        if (!cancelled) {
          setCameraStarting(false);
          const msg = err instanceof Error ? err.message : String(err || '');
          if (/permission|denied|notallowed/i.test(msg)) {
            setCameraError(
              'Camera permission denied. Allow access or upload a QR image below.'
            );
          } else if (/notfound|no camera|requested device not found/i.test(msg)) {
            setCameraError(
              'No camera detected on this device. Upload a QR image or enter @username.'
            );
          } else {
            setCameraError('Could not start camera preview. Upload a QR image or type @username.');
          }
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopCameraCleanly();
    };
  }, [scanned, cameras, activeCamIdx, scannerNonce, handleDecodedPayload, stopCameraCleanly]);

  const handleGalleryScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      await stopCameraCleanly();
      const fileScanner = new Html5Qrcode(fileRegionId, { verbose: false });
      const result = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      await handleDecodedPayload(result);
    } catch {
      showToast('No valid LetChat QR code found in that image.', 'error');
      setScanned(null);
      setScannerNonce((n) => n + 1);
    }
  };

  const handleFlipCamera = () => {
    if (cameras.length < 2) return;
    setActiveCamIdx((prev) => (prev + 1) % cameras.length);
  };

  const handleManualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualUsername.replace(/^@/, '').trim().toLowerCase();
    if (!cleaned) return;
    await handleDecodedPayload(`@${cleaned}`);
  };

  const sendRequest = async () => {
    if (!scanned) return;
    if (scanned.toLowerCase() === myUsername.toLowerCase()) {
      setStatus("You can't add yourself.");
      return;
    }

    setAdding(true);
    setStatus('Sending friend request...');
    try {
      let targetProfile = matchedProfile;
      if (!targetProfile) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .ilike('username', scanned)
          .maybeSingle();
        targetProfile = data ? normalizeProfileRecord(data as Record<string, unknown>) : null;
      }

      if (!targetProfile) {
        setStatus('User not found.');
        return;
      }

      let me = myProfile;
      if (!me) {
        const { data: loadedMe } = await supabase
          .from('profiles')
          .select('*')
          .ilike('username', myUsername)
          .maybeSingle();
        me = loadedMe ? normalizeProfileRecord(loadedMe as Record<string, unknown>) : null;
      }

      if (!me) {
        setStatus('Could not verify your profile.');
        return;
      }

      const res = await sendFriendRequest(supabase, me, targetProfile);
      if (!res.ok) {
        setStatus(res.error || 'Could not send request.');
        return;
      }

      if (res.status === 'accepted') {
        setStatus(`You are now friends with @${targetProfile.username}!`);
        showToast(`Connected with @${targetProfile.username}!`, 'success');
      } else {
        setStatus(`Friend request sent to @${targetProfile.username}.`);
        showToast(`Friend request sent to @${targetProfile.username}`, 'success');
      }
      onAdded();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="py-1 space-y-3">
      <div id={fileRegionId} className="hidden" />
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-white">Scan QR to Add Friend</h3>
        {!scanned && (
          <div className="flex items-center gap-1.5">
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={handleFlipCamera}
                className="flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg border border-white/15 text-[11px] font-semibold text-zinc-200 hover:bg-white/10"
                title="Switch Camera"
              >
                <SwitchCamera size={13} /> Flip
              </button>
            )}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 min-h-[32px] rounded-lg bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-[#00E5FF] text-[11px] font-bold hover:opacity-90"
            >
              <ImagePlus size={13} /> Gallery
            </button>
          </div>
        )}
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleGalleryScan}
        className="hidden"
      />

      {!scanned ? (
        <>
          <div className="relative w-full aspect-square max-h-[250px] rounded-2xl overflow-hidden bg-black border border-white/15 flex items-center justify-center">
            <div id={readerRegionId} className="w-full h-full [&>video]:object-cover" />

            {!cameraError && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-44 h-44 relative">
                  <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#00E5FF] rounded-tl-lg" />
                  <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#00E5FF] rounded-tr-lg" />
                  <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#7C3AED] rounded-bl-lg" />
                  <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#7C3AED] rounded-br-lg" />
                </div>
              </div>
            )}

            {cameraStarting && !cameraError && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white gap-2">
                <Loader2 size={24} className="animate-spin text-[#00E5FF]" />
                <span className="text-xs font-medium">Starting camera...</span>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 bg-[#0A0A0A]/95 p-4 flex flex-col items-center justify-center text-center text-white gap-2.5">
                <AlertCircle size={26} className="text-amber-400" />
                <p className="text-xs text-zinc-300 leading-relaxed">{cameraError}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCameraError(null);
                      setScanned(null);
                      setScannerNonce((n) => n + 1);
                    }}
                    className="flex items-center gap-1 px-3 min-h-[34px] rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold"
                  >
                    <RefreshCw size={13} /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex items-center gap-1 px-3 min-h-[34px] rounded-lg bg-[#7C3AED] text-white text-xs font-bold"
                  >
                    <ImagePlus size={13} /> Pick Image
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-center text-zinc-400 flex items-center justify-center gap-1">
            <Camera size={12} /> Point camera at a friend&apos;s LetChat FLOW QR
          </p>

          <form onSubmit={handleManualLookup} className="flex items-center gap-1.5 pt-1">
            <input
              value={manualUsername}
              onChange={(e) => setManualUsername(e.target.value)}
              placeholder="Or enter @username..."
              className="flex-1 min-w-0 px-3 min-h-[38px] rounded-xl border border-white/15 bg-white/5 text-xs text-white outline-none focus:border-[#00E5FF]"
            />
            <button
              type="submit"
              disabled={!manualUsername.trim()}
              className="px-3.5 min-h-[38px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-bold disabled:opacity-45 shrink-0"
            >
              Find
            </button>
          </form>
        </>
      ) : (
        <div className="text-center py-4 space-y-3.5">
          {lookingUp ? (
            <div className="py-6 flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 size={24} className="animate-spin text-[#00E5FF]" />
              <span className="text-xs font-medium">Looking up @{scanned}...</span>
            </div>
          ) : matchedProfile ? (
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3 text-left">
              {matchedProfile.avatar_url ? (
                <img
                  src={matchedProfile.avatar_url}
                  alt={matchedProfile.full_name || matchedProfile.name}
                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/15"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] text-white flex items-center justify-center font-bold text-base shrink-0">
                  {(matchedProfile.full_name || matchedProfile.name)?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-white truncate">
                  {matchedProfile.full_name || matchedProfile.name}
                </p>
                <p className="text-xs font-semibold text-[#00E5FF] truncate">
                  @{matchedProfile.username}
                </p>
                {(matchedProfile.about || matchedProfile.bio) && (
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                    {matchedProfile.about || matchedProfile.bio}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm py-2 text-zinc-300">
              Scanned user: <span className="font-extrabold text-[#00E5FF]">@{scanned}</span>
            </p>
          )}

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setScanned(null);
                setMatchedProfile(null);
                setStatus('');
              }}
              className="px-4 min-h-[42px] rounded-xl border border-white/15 text-xs font-semibold text-zinc-200 hover:bg-white/10"
            >
              Scan Again
            </button>
            <button
              type="button"
              disabled={adding || lookingUp || !matchedProfile}
              onClick={sendRequest}
              className="flex items-center gap-1.5 px-5 min-h-[42px] bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              <UserPlus size={15} /> {adding ? 'Sending...' : 'Send Friend Request'}
            </button>
          </div>
          {status && <p className="text-xs font-semibold text-[#00E5FF]">{status}</p>}
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
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-3xl bg-[#111118] text-white border border-white/10 p-4 space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-white/5 border border-white/10 flex-1 mr-2">
            <button
              type="button"
              onClick={() => setTab('my-qr')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                tab === 'my-qr'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <QrCode size={14} /> My QR
            </button>
            <button
              type="button"
              onClick={() => setTab('scan')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                tab === 'scan'
                  ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ScanLine size={14} /> Scan QR
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
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
            }}
          />
        )}
      </div>
    </div>
  );
}
