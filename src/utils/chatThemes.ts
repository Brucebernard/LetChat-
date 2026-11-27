import type React from 'react';

export type ChatThemeId =
  | 'flow_obsidian'
  | 'flow_violet'
  | 'flow_cyan'
  | 'flow_midnight'
  | 'flow_rose';

export type ChatWallpaperId =
  | 'default'
  | 'flow_mesh'
  | 'aurora'
  | 'midnight_stars'
  | 'doodle_dark'
  | 'cyber_grid'
  | 'custom';

export interface ChatThemeSpec {
  id: ChatThemeId;
  name: string;
  description: string;
  isDarkSurface: boolean;
  topBarBg: string;
  topBarBorder: string;
  topBarText: string;
  topBarSubtext: string;
  surfaceBg: string;
  myBubbleBg: string;
  myBubbleText: string;
  peerBubbleBg: string;
  peerBubbleText: string;
  accentColor: string;
  inputBarBg: string;
  inputBarBorder: string;
  inputBoxBg: string;
  inputBoxBorder: string;
  inputBoxText: string;
  inputPlaceholder: string;
  inputIconColor: string;
  sheetBg: string;
  sheetBorder: string;
  sheetText: string;
}

export const CHAT_THEMES: ChatThemeSpec[] = [
  {
    id: 'flow_obsidian',
    name: 'FLOW Obsidian',
    description: 'Deep black canvas, Electric Violet & Cyan',
    isDarkSurface: true,
    topBarBg: '#0E0E14',
    topBarBorder: 'rgba(255,255,255,0.08)',
    topBarText: '#FFFFFF',
    topBarSubtext: '#94A3B8',
    surfaceBg: '#0A0A0A',
    myBubbleBg: '#7C3AED',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#161622',
    peerBubbleText: '#F8FAFC',
    accentColor: '#00E5FF',
    inputBarBg: '#0E0E14',
    inputBarBorder: 'rgba(255,255,255,0.08)',
    inputBoxBg: '#161622',
    inputBoxBorder: 'rgba(255,255,255,0.12)',
    inputBoxText: '#FFFFFF',
    inputPlaceholder: '#64748B',
    inputIconColor: '#E2E8F0',
    sheetBg: '#12121B',
    sheetBorder: 'rgba(255,255,255,0.1)',
    sheetText: '#F1F5F9',
  },
  {
    id: 'flow_violet',
    name: 'Electric Violet',
    description: 'Rich ultraviolet atmosphere with neon contrast',
    isDarkSurface: true,
    topBarBg: '#120C22',
    topBarBorder: 'rgba(168,85,247,0.22)',
    topBarText: '#FFFFFF',
    topBarSubtext: '#C4B5FD',
    surfaceBg: '#0B0714',
    myBubbleBg: '#6D28D9',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#1C1430',
    peerBubbleText: '#F5F3FF',
    accentColor: '#A855F7',
    inputBarBg: '#120C22',
    inputBarBorder: 'rgba(168,85,247,0.22)',
    inputBoxBg: '#1C1430',
    inputBoxBorder: 'rgba(168,85,247,0.32)',
    inputBoxText: '#FFFFFF',
    inputPlaceholder: '#8B7EC8',
    inputIconColor: '#DDD6FE',
    sheetBg: '#171029',
    sheetBorder: 'rgba(168,85,247,0.25)',
    sheetText: '#F3E8FF',
  },
  {
    id: 'flow_cyan',
    name: 'Cyan Pulse',
    description: 'Sleek dark glass with crisp neon cyan',
    isDarkSurface: true,
    topBarBg: '#09131C',
    topBarBorder: 'rgba(0,229,255,0.18)',
    topBarText: '#FFFFFF',
    topBarSubtext: '#7DD3FC',
    surfaceBg: '#060D14',
    myBubbleBg: '#0284C7',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#10202E',
    peerBubbleText: '#F0F9FF',
    accentColor: '#00E5FF',
    inputBarBg: '#09131C',
    inputBarBorder: 'rgba(0,229,255,0.18)',
    inputBoxBg: '#10202E',
    inputBoxBorder: 'rgba(0,229,255,0.25)',
    inputBoxText: '#FFFFFF',
    inputPlaceholder: '#648AA6',
    inputIconColor: '#BAE6FD',
    sheetBg: '#0C1924',
    sheetBorder: 'rgba(0,229,255,0.2)',
    sheetText: '#E0F2FE',
  },
  {
    id: 'flow_midnight',
    name: 'Midnight Cobalt',
    description: 'Deep space cobalt with clean glass highlights',
    isDarkSurface: true,
    topBarBg: '#0B0F1A',
    topBarBorder: 'rgba(59,130,246,0.2)',
    topBarText: '#FFFFFF',
    topBarSubtext: '#93C5FD',
    surfaceBg: '#060911',
    myBubbleBg: '#2563EB',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#141B2D',
    peerBubbleText: '#EFF6FF',
    accentColor: '#38BDF8',
    inputBarBg: '#0B0F1A',
    inputBarBorder: 'rgba(59,130,246,0.2)',
    inputBoxBg: '#141B2D',
    inputBoxBorder: 'rgba(59,130,246,0.28)',
    inputBoxText: '#FFFFFF',
    inputPlaceholder: '#64748B',
    inputIconColor: '#BFDBFE',
    sheetBg: '#0E1422',
    sheetBorder: 'rgba(59,130,246,0.22)',
    sheetText: '#DBEAFE',
  },
  {
    id: 'flow_rose',
    name: 'Crimson Neon',
    description: 'Obsidian backdrop & vivid rose-magenta bubbles',
    isDarkSurface: true,
    topBarBg: '#160A12',
    topBarBorder: 'rgba(244,63,94,0.22)',
    topBarText: '#FFFFFF',
    topBarSubtext: '#FDA4AF',
    surfaceBg: '#0D060A',
    myBubbleBg: '#E11D48',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#23111B',
    peerBubbleText: '#FFF1F2',
    accentColor: '#FB7185',
    inputBarBg: '#160A12',
    inputBarBorder: 'rgba(244,63,94,0.22)',
    inputBoxBg: '#23111B',
    inputBoxBorder: 'rgba(244,63,94,0.3)',
    inputBoxText: '#FFFFFF',
    inputPlaceholder: '#9F6B7A',
    inputIconColor: '#FECDD3',
    sheetBg: '#1C0D16',
    sheetBorder: 'rgba(244,63,94,0.25)',
    sheetText: '#FFE4E6',
  },
];

export interface ChatWallpaperSpec {
  id: ChatWallpaperId;
  name: string;
  previewCss: string;
  isDarkBackdrop: boolean;
}

const DOODLE_DARK_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none" stroke="rgba(124,58,237,0.16)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 22h18v12H26l-5 4v-4h-3z"/><circle cx="88" cy="24" r="7"/><path d="M84 24h8M88 20v8"/><path d="M26 78l4-8 4 8-7-5h8z"/><path d="M74 74c0-4 3-7 7-7s7 3 7 7c0 6-7 11-7 11s-7-5-7-11z"/><circle cx="53" cy="96" r="4" stroke="rgba(0,229,255,0.18)"/></svg>`
);

const CYBER_GRID_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M48 0H0v48" stroke="rgba(0,229,255,0.08)" stroke-width="1"/></svg>`
);

const STARS_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140" fill="rgba(255,255,255,0.28)"><circle cx="22" cy="30" r="1.4"/><circle cx="86" cy="18" r="1.8"/><circle cx="118" cy="64" r="1.2"/><circle cx="48" cy="92" r="1.6"/><circle cx="102" cy="116" r="1.3"/><circle cx="16" cy="112" r="1" fill="rgba(0,229,255,0.5)"/></svg>`
);

export const CHAT_WALLPAPERS: ChatWallpaperSpec[] = [
  {
    id: 'default',
    name: 'Theme Default',
    previewCss: 'linear-gradient(135deg, #0A0A0A 0%, #151520 100%)',
    isDarkBackdrop: true,
  },
  {
    id: 'flow_mesh',
    name: 'FLOW Mesh',
    previewCss:
      'radial-gradient(circle at 18% 18%, rgba(124,58,237,0.35), transparent 55%), radial-gradient(circle at 82% 80%, rgba(0,229,255,0.25), transparent 55%), #0A0A0A',
    isDarkBackdrop: true,
  },
  {
    id: 'aurora',
    name: 'Aurora Prism',
    previewCss: 'linear-gradient(135deg, #090910 0%, #311068 50%, #083344 100%)',
    isDarkBackdrop: true,
  },
  {
    id: 'midnight_stars',
    name: 'Starlight Void',
    previewCss: 'radial-gradient(circle at top right, #1E1B4B 0%, #0A0A0F 70%, #050507 100%)',
    isDarkBackdrop: true,
  },
  {
    id: 'doodle_dark',
    name: 'Neon Doodle',
    previewCss: 'linear-gradient(135deg, #0A0A10 0%, #141224 100%)',
    isDarkBackdrop: true,
  },
  {
    id: 'cyber_grid',
    name: 'Cyber Grid',
    previewCss: 'linear-gradient(135deg, #070B12 0%, #0B1926 100%)',
    isDarkBackdrop: true,
  },
];

export function getChatThemeById(id?: string | null): ChatThemeSpec {
  return CHAT_THEMES.find((t) => t.id === id) || CHAT_THEMES[0];
}

export function getChatWallpaperById(id?: string | null): ChatWallpaperSpec {
  return CHAT_WALLPAPERS.find((w) => w.id === id) || CHAT_WALLPAPERS[0];
}

export function getChatSurfaceStyle(params: {
  theme: ChatThemeSpec;
  wallpaperId: ChatWallpaperId;
  customWallpaperUrl?: string;
}): { style: React.CSSProperties; isDarkBackdrop: boolean } {
  const { theme, wallpaperId, customWallpaperUrl } = params;

  if (wallpaperId === 'custom' && customWallpaperUrl) {
    return {
      isDarkBackdrop: true,
      style: {
        backgroundColor: theme.surfaceBg,
        backgroundImage: `linear-gradient(rgba(10,10,16,0.45), rgba(10,10,16,0.55)), url("${customWallpaperUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
    };
  }

  switch (wallpaperId) {
    case 'flow_mesh':
      return {
        isDarkBackdrop: true,
        style: {
          backgroundColor: '#0A0A0A',
          backgroundImage:
            'radial-gradient(circle at 18% 15%, rgba(124,58,237,0.28), transparent 52%), radial-gradient(circle at 85% 82%, rgba(0,229,255,0.22), transparent 50%)',
        },
      };
    case 'aurora':
      return {
        isDarkBackdrop: true,
        style: {
          backgroundColor: '#0A0A0A',
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(0,229,255,0.24), transparent 55%), radial-gradient(circle at 80% 80%, rgba(124,58,237,0.34), transparent 55%), linear-gradient(160deg, #08080D 0%, #190D36 52%, #07222D 100%)',
        },
      };
    case 'midnight_stars':
      return {
        isDarkBackdrop: true,
        style: {
          backgroundColor: '#07070C',
          backgroundImage: `url("data:image/svg+xml,${STARS_SVG}"), radial-gradient(circle at 75% 15%, rgba(124,58,237,0.3), transparent 55%)`,
          backgroundRepeat: 'repeat, no-repeat',
        },
      };
    case 'doodle_dark':
      return {
        isDarkBackdrop: true,
        style: {
          backgroundColor: theme.surfaceBg,
          backgroundImage: `url("data:image/svg+xml,${DOODLE_DARK_SVG}")`,
          backgroundRepeat: 'repeat',
        },
      };
    case 'cyber_grid':
      return {
        isDarkBackdrop: true,
        style: {
          backgroundColor: '#070A10',
          backgroundImage: `url("data:image/svg+xml,${CYBER_GRID_SVG}"), radial-gradient(circle at 50% 0%, rgba(0,229,255,0.14), transparent 60%)`,
          backgroundRepeat: 'repeat, no-repeat',
        },
      };
    case 'default':
    default:
      return {
        isDarkBackdrop: theme.isDarkSurface,
        style: {
          backgroundColor: theme.surfaceBg,
        },
      };
  }
}

export interface ChatAppearanceOverride {
  themeId?: ChatThemeId;
  wallpaperId?: ChatWallpaperId;
  customWallpaperUrl?: string;
}

export function getChatAppearanceOverride(chatId: string): ChatAppearanceOverride | null {
  try {
    const raw = localStorage.getItem(`letchat_chat_appearance_${chatId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatAppearanceOverride;
    if (parsed.themeId && !CHAT_THEMES.some((t) => t.id === parsed.themeId)) {
      parsed.themeId = 'flow_obsidian';
    }
    if (
      parsed.wallpaperId &&
      parsed.wallpaperId !== 'custom' &&
      !CHAT_WALLPAPERS.some((w) => w.id === parsed.wallpaperId)
    ) {
      parsed.wallpaperId = 'default';
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveChatAppearanceOverride(
  chatId: string,
  override: ChatAppearanceOverride
): void {
  try {
    localStorage.setItem(`letchat_chat_appearance_${chatId}`, JSON.stringify(override));
  } catch {
    // ignore storage quota errors
  }
}

export function clearChatAppearanceOverride(chatId: string): void {
  try {
    localStorage.removeItem(`letchat_chat_appearance_${chatId}`);
  } catch {
    // ignore
  }
}
