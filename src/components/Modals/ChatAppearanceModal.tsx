import React, { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Palette, RotateCcw, Sparkles, X } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { compressImage } from '../../utils/mediaUtils';
import {
  CHAT_THEMES,
  CHAT_WALLPAPERS,
  ChatThemeId,
  ChatWallpaperId,
  clearChatAppearanceOverride,
  getChatAppearanceOverride,
  getChatSurfaceStyle,
  getChatThemeById,
  saveChatAppearanceOverride,
} from '../../utils/chatThemes';

interface ChatAppearanceModalProps {
  open: boolean;
  onClose: () => void;
  chatId?: string;
  chatTitle?: string;
  onChanged?: () => void;
}

export default function ChatAppearanceModal({
  open,
  onClose,
  chatId,
  chatTitle,
  onChanged,
}: ChatAppearanceModalProps) {
  const {
    chatTheme,
    setChatTheme,
    chatWallpaper,
    setChatWallpaper,
    customWallpaperUrl,
    setCustomWallpaperUrl,
  } = useSettings();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [scope, setScope] = useState<'chat' | 'global'>(chatId ? 'chat' : 'global');
  const [draftTheme, setDraftTheme] = useState<ChatThemeId>(chatTheme);
  const [draftWallpaper, setDraftWallpaper] = useState<ChatWallpaperId>(chatWallpaper);
  const [draftCustomUrl, setDraftCustomUrl] = useState<string>(customWallpaperUrl);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (chatId) {
      const ov = getChatAppearanceOverride(chatId);
      setScope(ov ? 'chat' : 'global');
      setDraftTheme(ov?.themeId || chatTheme);
      setDraftWallpaper(ov?.wallpaperId || chatWallpaper);
      setDraftCustomUrl(ov?.customWallpaperUrl || customWallpaperUrl);
    } else {
      setScope('global');
      setDraftTheme(chatTheme);
      setDraftWallpaper(chatWallpaper);
      setDraftCustomUrl(customWallpaperUrl);
    }
  }, [open, chatId, chatTheme, chatWallpaper, customWallpaperUrl]);

  if (!open) return null;

  const previewThemeSpec = getChatThemeById(draftTheme);
  const { style: previewSurfaceStyle, isDarkBackdrop } = getChatSurfaceStyle({
    theme: previewThemeSpec,
    wallpaperId: draftWallpaper,
    customWallpaperUrl: draftCustomUrl,
  });

  const applySelection = (
    nextTheme: ChatThemeId,
    nextWallpaper: ChatWallpaperId,
    nextCustomUrl: string,
    targetScope: 'chat' | 'global' = scope
  ) => {
    if (targetScope === 'chat' && chatId) {
      saveChatAppearanceOverride(chatId, {
        themeId: nextTheme,
        wallpaperId: nextWallpaper,
        customWallpaperUrl: nextWallpaper === 'custom' ? nextCustomUrl : undefined,
      });
    } else {
      setChatTheme(nextTheme);
      setChatWallpaper(nextWallpaper);
      if (nextWallpaper === 'custom' && nextCustomUrl) {
        setCustomWallpaperUrl(nextCustomUrl);
      }
      if (chatId) {
        clearChatAppearanceOverride(chatId);
      }
    }
    onChanged?.();
  };

  const handleUploadWallpaper = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file, true);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(compressed);
      });
      setDraftCustomUrl(dataUrl);
      setDraftWallpaper('custom');
      applySelection(draftTheme, 'custom', dataUrl, scope);
      showToast('Custom wallpaper applied!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#111118] text-white border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Palette size={18} className="text-[#00E5FF] shrink-0" />
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm truncate">Chat Themes &amp; Wallpapers</h3>
              {chatTitle && (
                <p className="text-[11px] text-zinc-400 truncate">
                  {scope === 'chat' ? `Customizing ${chatTitle}` : 'Applying to all chats'}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Scope Switcher when opened from inside a chat */}
          {chatId && (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setScope('chat');
                  applySelection(draftTheme, draftWallpaper, draftCustomUrl, 'chat');
                }}
                className={`py-2 rounded-lg text-xs font-bold transition ${
                  scope === 'chat'
                    ? 'bg-[#7C3AED] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Only This Chat
              </button>
              <button
                type="button"
                onClick={() => {
                  setScope('global');
                  applySelection(draftTheme, draftWallpaper, draftCustomUrl, 'global');
                }}
                className={`py-2 rounded-lg text-xs font-bold transition ${
                  scope === 'global'
                    ? 'bg-[#7C3AED] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All Chats Default
              </button>
            </div>
          )}

          {/* Live Mini Chat Preview */}
          <div
            className="rounded-2xl border border-white/10 overflow-hidden shadow-sm"
            style={previewSurfaceStyle}
          >
            <div
              className="px-3 py-2 flex items-center justify-between text-xs font-bold border-b"
              style={{
                backgroundColor: previewThemeSpec.topBarBg,
                borderColor: previewThemeSpec.topBarBorder,
                color: previewThemeSpec.topBarText,
              }}
            >
              <span>{chatTitle || 'LetChat FLOW'}</span>
              <span className="text-[10px]" style={{ color: previewThemeSpec.accentColor }}>
                Online
              </span>
            </div>
            <div className="p-3 space-y-2.5">
              <div className="flex justify-center">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    isDarkBackdrop ? 'bg-black/45 text-white' : 'bg-black/25 text-white'
                  }`}
                >
                  Today 9:41 AM
                </span>
              </div>
              <div className="flex justify-start">
                <div
                  className="px-3 py-1.5 rounded-lg text-xs max-w-[75%] shadow-xs"
                  style={{
                    backgroundColor: previewThemeSpec.peerBubbleBg,
                    color: previewThemeSpec.peerBubbleText,
                  }}
                >
                  Love this FLOW aesthetic!
                </div>
              </div>
              <div className="flex justify-end">
                <div
                  className="px-3 py-1.5 rounded-lg text-xs max-w-[75%] shadow-xs"
                  style={{
                    backgroundColor: previewThemeSpec.myBubbleBg,
                    color: previewThemeSpec.myBubbleText,
                  }}
                >
                  Clean obsidian glass & crisp gradients!
                </div>
              </div>
            </div>
          </div>

          {/* Chat Themes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#00E5FF]" /> Chat Theme
              </h4>
              <span className="text-xs font-bold text-[#00E5FF]">{previewThemeSpec.name}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CHAT_THEMES.map((theme) => {
                const active = draftTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      setDraftTheme(theme.id);
                      applySelection(theme.id, draftWallpaper, draftCustomUrl, scope);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      active
                        ? 'border-[#00E5FF] ring-2 ring-[#00E5FF]/30 bg-white/[0.08]'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <div className="flex items-center gap-1">
                        <span
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: theme.surfaceBg }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: theme.myBubbleBg }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: theme.peerBubbleBg }}
                        />
                      </div>
                      {active && <Check size={14} className="text-[#00E5FF] shrink-0" />}
                    </div>
                    <p className="text-xs font-bold truncate text-white">{theme.name}</p>
                    <p className="text-[10px] text-zinc-400 truncate">
                      {theme.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat Wallpapers */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                Chat Wallpaper
              </h4>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex items-center gap-1 text-xs font-bold text-[#00E5FF] hover:underline"
              >
                <ImagePlus size={14} />
                {uploadingPhoto ? 'Loading...' : 'Upload Photo'}
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {CHAT_WALLPAPERS.map((wp) => {
                const active = draftWallpaper === wp.id;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => {
                      setDraftWallpaper(wp.id);
                      applySelection(draftTheme, wp.id, draftCustomUrl, scope);
                    }}
                    className={`relative h-20 rounded-xl overflow-hidden border text-left transition ${
                      active
                        ? 'border-[#00E5FF] ring-2 ring-[#00E5FF]/40 scale-[1.01]'
                        : 'border-white/10 hover:opacity-95'
                    }`}
                    style={{
                      background: wp.id === 'default' ? previewThemeSpec.surfaceBg : wp.previewCss,
                    }}
                  >
                    {active && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#00E5FF] text-black flex items-center justify-center shadow">
                        <Check size={12} />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/55 text-white text-[10px] font-bold truncate">
                      {wp.name}
                    </span>
                  </button>
                );
              })}

              {draftCustomUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftWallpaper('custom');
                    applySelection(draftTheme, 'custom', draftCustomUrl, scope);
                  }}
                  className={`relative h-20 rounded-xl overflow-hidden border text-left transition ${
                    draftWallpaper === 'custom'
                      ? 'border-[#00E5FF] ring-2 ring-[#00E5FF]/40'
                      : 'border-white/10'
                  }`}
                  style={{
                    backgroundImage: `url("${draftCustomUrl}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {draftWallpaper === 'custom' && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#00E5FF] text-black flex items-center justify-center shadow">
                      <Check size={12} />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/60 text-white text-[10px] font-bold truncate">
                    My Photo
                  </span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadWallpaper}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setDraftTheme('flow_obsidian');
              setDraftWallpaper('flow_mesh');
              if (chatId) {
                clearChatAppearanceOverride(chatId);
                onChanged?.();
              } else {
                setChatTheme('flow_obsidian');
                setChatWallpaper('flow_mesh');
              }
              showToast('Reset to LetChat FLOW default', 'info');
            }}
            className="flex items-center gap-1.5 px-3 min-h-[38px] rounded-xl border border-white/15 text-xs font-bold text-zinc-300 hover:bg-white/10"
          >
            <RotateCcw size={13} /> Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 min-h-[38px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-bold hover:opacity-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
