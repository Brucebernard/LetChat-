import React, { useEffect, useRef, useState } from 'react';
import { Search, Plus, Star, Clock, Share2, X, Check } from 'lucide-react';
import { BUILTIN_STICKER_PACKS, ALL_BUILTIN_STICKERS, PACK_NAMES } from '../../utils/stickerPacks';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StickerItem } from '../../types';
import { copyToClipboard } from '../../utils/mediaUtils';

interface StickerPickerProps {
  onSelectSticker: (url: string) => void;
  onClose: () => void;
}

export default function StickerPicker({ onSelectSticker, onClose }: StickerPickerProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [activePack, setActivePack] = useState(PACK_NAMES[0]);
  const [customStickers, setCustomStickers] = useState<StickerItem[]>([]);
  const [favourites, setFavourites] = useState<StickerItem[]>([]);
  const [recent, setRecent] = useState<StickerItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('letchat_recent_stickers') || '[]');
    } catch {
      return [];
    }
  });
  const [showCreate, setShowCreate] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCustomAndFavs = async () => {
    if (!profile) return;
    const { data: customs } = await supabase
      .from('stickers')
      .select('*')
      .or(`user_id.eq.${profile.id},is_public.eq.true`)
      .order('created_at', { ascending: false });
    if (customs) setCustomStickers(customs as StickerItem[]);

    const { data: favRows } = await supabase
      .from('sticker_favourites')
      .select('sticker_id, stickers(*)')
      .eq('user_id', profile.id);
    if (favRows) {
      const list = favRows
        .map((r) => (r as unknown as { stickers: StickerItem | null }).stickers)
        .filter((s): s is StickerItem => Boolean(s));
      setFavourites(list);
    }
  };

  useEffect(() => {
    loadCustomAndFavs();
  }, [profile]);

  const handleSelect = (sticker: StickerItem) => {
    const updated = [
      sticker,
      ...recent.filter((s) => s.image_url !== sticker.image_url),
    ].slice(0, 12);
    setRecent(updated);
    localStorage.setItem('letchat_recent_stickers', JSON.stringify(updated));
    onSelectSticker(sticker.image_url);
  };

  const addToFavourites = async (sticker: StickerItem) => {
    if (!profile) return;
    let stickerId = sticker.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(String(stickerId))) {
      const { data: existing } = await supabase
        .from('stickers')
        .select('id')
        .eq('image_url', sticker.image_url)
        .maybeSingle();
      if (existing) {
        stickerId = existing.id;
      } else {
        const { data: inserted } = await supabase
          .from('stickers')
          .insert({
            user_id: profile.id,
            image_url: sticker.image_url,
            pack_name: sticker.pack_name || 'Builtin',
            is_public: true,
          })
          .select()
          .single();
        if (inserted) stickerId = inserted.id;
      }
    }

    if (!stickerId) return;
    await supabase
      .from('sticker_favourites')
      .upsert(
        { user_id: profile.id, sticker_id: stickerId },
        { onConflict: 'user_id,sticker_id' }
      );
    showToast('Added to Favourites!', 'success');
    loadCustomAndFavs();
  };

  const sharePackLink = async () => {
    const url = `${window.location.origin}/?stickerPack=${encodeURIComponent(activePack)}`;
    const ok = await copyToClipboard(url);
    showToast(ok ? `Pack link copied (${activePack})` : 'Could not copy pack link.', ok ? 'success' : 'error');
  };

  const startLongPress = (sticker: StickerItem) => {
    longPressTimer.current = setTimeout(() => {
      addToFavourites(sticker);
    }, 550);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const displayedStickers = search.trim()
    ? [...ALL_BUILTIN_STICKERS, ...customStickers].filter(
        (s) =>
          s.label?.toLowerCase().includes(search.toLowerCase()) ||
          s.tags?.toLowerCase().includes(search.toLowerCase()) ||
          s.pack_name?.toLowerCase().includes(search.toLowerCase())
      )
    : activePack === 'Custom'
    ? customStickers
    : BUILTIN_STICKER_PACKS[activePack] || [];

  return (
    <div className="border-t border-[#E5E5E5] bg-[#FFFFFF] text-black flex flex-col h-80">
      {/* Search Top */}
      <div className="p-2 flex items-center gap-2 border-b border-[#E5E5E5]">
        <div className="flex-1 flex items-center gap-2 bg-[#F5F5F5] rounded-xl px-3 min-h-[38px]">
          <Search size={14} className="text-[#888888]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stickers (long-press to favourite)..."
            className="bg-transparent text-xs text-black placeholder:text-[#999999] outline-none w-full"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-2.5 min-h-[38px] rounded-xl bg-[#07C160] text-white text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
        >
          <Plus size={14} /> Create
        </button>
        <button
          type="button"
          onClick={sharePackLink}
          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-black hover:bg-[#F2F2F2]"
          title="Share Pack Link"
        >
          <Share2 size={15} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-black hover:bg-[#F2F2F2]"
        >
          <X size={15} />
        </button>
      </div>

      {/* Grid Middle */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Top Row: Recent + Favourites */}
        {!search && (recent.length > 0 || favourites.length > 0) && (
          <div className="space-y-2">
            {favourites.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-[11px] font-bold text-amber-500 mb-1">
                  <Star size={11} /> Favourites
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {favourites.map((s, idx) => (
                    <button
                      type="button"
                      key={`fav-${s.id}-${idx}`}
                      onClick={() => handleSelect(s)}
                      className="w-12 h-12 shrink-0 p-1 rounded-xl hover:bg-[#F2F2F2]"
                    >
                      <img
                        src={s.image_url}
                        alt="Favourite Sticker"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {recent.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-[11px] font-bold text-[#888888] mb-1">
                  <Clock size={11} /> Recent
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {recent.map((s, idx) => (
                    <button
                      type="button"
                      key={`rec-${idx}`}
                      onClick={() => handleSelect(s)}
                      className="w-12 h-12 shrink-0 p-1 rounded-xl hover:bg-[#F2F2F2]"
                    >
                      <img
                        src={s.image_url}
                        alt="Recent Sticker"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Pack Grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {displayedStickers.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => handleSelect(s)}
              onMouseDown={() => startLongPress(s)}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
              onTouchStart={() => startLongPress(s)}
              onTouchEnd={cancelLongPress}
              onContextMenu={(e) => {
                e.preventDefault();
                addToFavourites(s);
              }}
              className="aspect-square p-2 rounded-xl hover:bg-[#F2F2F2] flex items-center justify-center transition active:scale-95"
              title={`${s.label || 'Sticker'} (Long-press to favourite)`}
            >
              <img
                src={s.image_url}
                alt={s.label || 'Sticker'}
                referrerPolicy="no-referrer"
                className="w-14 h-14 object-contain select-none"
                loading="lazy"
                onError={(e) => {
                  if (s.fallback_url && e.currentTarget.src !== s.fallback_url) {
                    e.currentTarget.src = s.fallback_url;
                  }
                }}
              />
            </button>
          ))}
          {displayedStickers.length === 0 && (
            <p className="col-span-full text-center text-xs text-[#888888] py-6">
              {activePack === 'Custom'
                ? 'No custom stickers yet. Tap Create to upload & crop one!'
                : 'No matching stickers.'}
            </p>
          )}
        </div>
      </div>

      {/* Pack Tabs Bottom */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-[#E5E5E5] overflow-x-auto no-scrollbar">
        {[...PACK_NAMES, 'Custom'].map((pack) => (
          <button
            type="button"
            key={pack}
            onClick={() => {
              setSearch('');
              setActivePack(pack);
            }}
            className={`px-3 min-h-[34px] rounded-lg text-xs font-semibold shrink-0 transition whitespace-nowrap ${
              activePack === pack && !search
                ? 'bg-[#07C160] text-white'
                : 'text-[#555555] hover:bg-[#F2F2F2]'
            }`}
          >
            {pack}
          </button>
        ))}
      </div>

      {showCreate && (
        <CreateStickerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setActivePack('Custom');
            loadCustomAndFavs();
          }}
        />
      )}
    </div>
  );
}

function CreateStickerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [imgSrc, setImgSrc] = useState('');
  const [packName, setPackName] = useState('Custom');
  const [isPublic, setIsPublic] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgSrc(URL.createObjectURL(file));
  };

  const drawCrop = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 256);
    const minSide = Math.min(img.width, img.height) / zoom;
    const sx = (img.width - minSide) / 2;
    const sy = (img.height - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 256, 256);
  };

  useEffect(() => {
    if (!imgSrc || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      drawCrop();
    };
    img.src = imgSrc;
  }, [imgSrc]);

  useEffect(() => {
    drawCrop();
  }, [zoom]);

  const saveSticker = async () => {
    if (!canvasRef.current || !profile) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((res) =>
        canvasRef.current?.toBlob(res, 'image/png')
      );
      if (!blob) throw new Error('Could not export sticker');
      const file = new File([blob], `sticker_${Date.now()}.png`, { type: 'image/png' });
      const url = await uploadWithProgress(
        'letchat-media',
        `stickers/${profile.id}/${Date.now()}.png`,
        file
      );
      await supabase.from('stickers').insert({
        user_id: profile.id,
        image_url: url,
        pack_name: packName.trim() || 'Custom',
        is_public: isPublic,
      });
      showToast('Custom sticker saved!', 'success');
      onCreated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save sticker', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-[#FFFFFF] text-black border border-[#E5E5E5] rounded-2xl w-full max-w-sm p-4 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Create Custom Sticker</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-[#F2F2F2]"
          >
            <X size={18} />
          </button>
        </div>
        <input type="file" accept="image/*" onChange={handleFile} className="text-xs w-full" />
        {imgSrc && (
          <>
            <canvas
              ref={canvasRef}
              width={256}
              height={256}
              className="mx-auto w-44 h-44 rounded-xl border border-dashed border-[#CCCCCC] bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==')]"
            />
            <div className="flex items-center gap-2 text-xs">
              <span>Crop Zoom</span>
              <input
                type="range"
                min="1"
                max="2.5"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-[#07C160]"
              />
            </div>
            <input
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              placeholder="Pack name"
              className="w-full px-3 py-2 rounded-xl border border-[#DCDCDC] bg-[#FFFFFF] text-xs text-black"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="accent-[#07C160]"
              />
              Share pack publicly
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={saveSticker}
              className="w-full min-h-[44px] rounded-xl bg-[#07C160] text-white font-semibold text-sm flex items-center justify-center gap-1"
            >
              <Check size={15} /> {saving ? 'Saving...' : 'Save Sticker'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
