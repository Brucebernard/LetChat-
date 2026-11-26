import type React from 'react';

export type ChatThemeId = 'wechat' | 'ocean' | 'midnight' | 'rose' | 'emerald' | 'royal';

export type ChatWallpaperId =
  | 'default'
  | 'doodle'
  | 'aurora'
  | 'sunset'
  | 'ocean_wave'
  | 'midnight_stars'
  | 'ghana'
  | 'botanical'
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
    id: 'wechat',
    name: 'WeChat Classic',
    description: 'Clean light grey & signature green bubbles',
    isDarkSurface: false,
    topBarBg: '#FFFFFF',
    topBarBorder: '#E5E5E5',
    topBarText: '#000000',
    topBarSubtext: '#888888',
    surfaceBg: '#EDEDED',
    myBubbleBg: '#95EC69',
    myBubbleText: '#000000',
    peerBubbleBg: '#FFFFFF',
    peerBubbleText: '#000000',
    accentColor: '#07C160',
    inputBarBg: '#FFFFFF',
    inputBarBorder: '#E5E5E5',
    inputBoxBg: '#FFFFFF',
    inputBoxBorder: '#DCDCDC',
    inputBoxText: '#000000',
    inputPlaceholder: '#999999',
    inputIconColor: '#000000',
    sheetBg: '#F7F7F7',
    sheetBorder: '#E5E5E5',
    sheetText: '#222222',
  },
  {
    id: 'ocean',
    name: 'LetChat Ocean',
    description: 'Deep navy & crisp aqua accents',
    isDarkSurface: false,
    topBarBg: '#FFFFFF',
    topBarBorder: '#DCEBF2',
    topBarText: '#0A3D62',
    topBarSubtext: '#5B7A8C',
    surfaceBg: '#EBF5FA',
    myBubbleBg: '#0A3D62',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#FFFFFF',
    peerBubbleText: '#0F172A',
    accentColor: '#1AA7B8',
    inputBarBg: '#FFFFFF',
    inputBarBorder: '#DCEBF2',
    inputBoxBg: '#F7FBFD',
    inputBoxBorder: '#CBE3EE',
    inputBoxText: '#0F172A',
    inputPlaceholder: '#64748B',
    inputIconColor: '#0A3D62',
    sheetBg: '#F3FAFD',
    sheetBorder: '#DCEBF2',
    sheetText: '#0A3D62',
  },
  {
    id: 'midnight',
    name: 'Midnight Dark',
    description: 'True dark surface with teal bubbles',
    isDarkSurface: true,
    topBarBg: '#111827',
    topBarBorder: '#1F2937',
    topBarText: '#F8FAFC',
    topBarSubtext: '#94A3B8',
    surfaceBg: '#090D16',
    myBubbleBg: '#0F766E',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#1E293B',
    peerBubbleText: '#F1F5F9',
    accentColor: '#14B8A6',
    inputBarBg: '#111827',
    inputBarBorder: '#1F2937',
    inputBoxBg: '#1E293B',
    inputBoxBorder: '#334155',
    inputBoxText: '#F8FAFC',
    inputPlaceholder: '#94A3B8',
    inputIconColor: '#E2E8F0',
    sheetBg: '#161F2E',
    sheetBorder: '#273549',
    sheetText: '#E2E8F0',
  },
  {
    id: 'rose',
    name: 'Blossom Rose',
    description: 'Warm petal backdrop & crimson-rose bubbles',
    isDarkSurface: false,
    topBarBg: '#FFF9FB',
    topBarBorder: '#F9DCE5',
    topBarText: '#4C0519',
    topBarSubtext: '#9F1239',
    surfaceBg: '#FDF2F5',
    myBubbleBg: '#E11D48',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#FFFFFF',
    peerBubbleText: '#1F2937',
    accentColor: '#E11D48',
    inputBarBg: '#FFF9FB',
    inputBarBorder: '#F9DCE5',
    inputBoxBg: '#FFFFFF',
    inputBoxBorder: '#FBCFE8',
    inputBoxText: '#1F2937',
    inputPlaceholder: '#9D7B87',
    inputIconColor: '#881337',
    sheetBg: '#FFF1F5',
    sheetBorder: '#F9DCE5',
    sheetText: '#881337',
  },
  {
    id: 'emerald',
    name: 'Forest Mint',
    description: 'Fresh mint canvas & emerald bubbles',
    isDarkSurface: false,
    topBarBg: '#FFFFFF',
    topBarBorder: '#D1FAE5',
    topBarText: '#064E3B',
    topBarSubtext: '#047857',
    surfaceBg: '#ECFDF5',
    myBubbleBg: '#059669',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#FFFFFF',
    peerBubbleText: '#064E3B',
    accentColor: '#10B981',
    inputBarBg: '#FFFFFF',
    inputBarBorder: '#D1FAE5',
    inputBoxBg: '#F6FEFA',
    inputBoxBorder: '#A7F3D0',
    inputBoxText: '#064E3B',
    inputPlaceholder: '#6B9080',
    inputIconColor: '#065F46',
    sheetBg: '#F0FDF7',
    sheetBorder: '#D1FAE5',
    sheetText: '#064E3B',
  },
  {
    id: 'royal',
    name: 'Royal Violet',
    description: 'Soft lavender mist & indigo-violet bubbles',
    isDarkSurface: false,
    topBarBg: '#FFFFFF',
    topBarBorder: '#E9D5FF',
    topBarText: '#2E1065',
    topBarSubtext: '#6D28D9',
    surfaceBg: '#F5F3FF',
    myBubbleBg: '#6D28D9',
    myBubbleText: '#FFFFFF',
    peerBubbleBg: '#FFFFFF',
    peerBubbleText: '#1E1B4B',
    accentColor: '#7C3AED',
    inputBarBg: '#FFFFFF',
    inputBarBorder: '#E9D5FF',
    inputBoxBg: '#FAF8FF',
    inputBoxBorder: '#DDD6FE',
    inputBoxText: '#1E1B4B',
    inputPlaceholder: '#7C749E',
    inputIconColor: '#4C1D95',
    sheetBg: '#F8F5FF',
    sheetBorder: '#E9D5FF',
    sheetText: '#4C1D95',
  },
];

export interface ChatWallpaperSpec {
  id: ChatWallpaperId;
  name: string;
  previewCss: string;
  isDarkBackdrop: boolean;
}

const DOODLE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none" stroke="rgba(120,130,145,0.14)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 22h18v12H26l-5 4v-4h-3z"/><circle cx="88" cy="24" r="7"/><path d="M84 24h8M88 20v8"/><path d="M26 78l4-8 4 8-7-5h8z"/><path d="M74 74c0-4 3-7 7-7s7 3 7 7c0 6-7 11-7 11s-7-5-7-11z"/><path d="M46 48c4-3 10-3 14 0"/><circle cx="53" cy="96" r="5"/></svg>`
);

const BOTANICAL_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140" fill="none" stroke="rgba(16,185,129,0.18)" stroke-width="1.6"><path d="M24 44c12-16 28-16 34-4-12 12-26 12-34 4z"/><path d="M24 44l34-4"/><path d="M90 98c10-18 26-20 34-10-10 14-24 16-34 10z"/><path d="M90 98l34-10"/></svg>`
);

const STARS_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140" fill="rgba(255,255,255,0.22)"><circle cx="22" cy="30" r="1.4"/><circle cx="86" cy="18" r="1.8"/><circle cx="118" cy="64" r="1.2"/><circle cx="48" cy="92" r="1.6"/><circle cx="102" cy="116" r="1.3"/><circle cx="16" cy="112" r="1"/></svg>`
);

export const CHAT_WALLPAPERS: ChatWallpaperSpec[] = [
  {
    id: 'default',
    name: 'Theme Default',
    previewCss: 'linear-gradient(135deg, #EDEDED 0%, #DFDFDF 100%)',
    isDarkBackdrop: false,
  },
  {
    id: 'doodle',
    name: 'Classic Doodle',
    previewCss: 'linear-gradient(135deg, #ECECEC 0%, #E2E6EC 100%)',
    isDarkBackdrop: false,
  },
  {
    id: 'aurora',
    name: 'Aurora Glow',
    previewCss: 'linear-gradient(135deg, #0F172A 0%, #312E81 50%, #0E7490 100%)',
    isDarkBackdrop: true,
  },
  {
    id: 'sunset',
    name: 'Golden Sunset',
    previewCss: 'linear-gradient(135deg, #FFF7ED 0%, #FDBA74 55%, #FDA4AF 100%)',
    isDarkBackdrop: false,
  },
  {
    id: 'ocean_wave',
    name: 'Ocean Breeze',
    previewCss: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 50%, #99F6E4 100%)',
    isDarkBackdrop: false,
  },
  {
    id: 'midnight_stars',
    name: 'Starry Night',
    previewCss: 'radial-gradient(circle at top right, #1E293B 0%, #090D16 70%, #020617 100%)',
    isDarkBackdrop: true,
  },
  {
    id: 'ghana',
    name: 'Ghana Pride',
    previewCss:
      'linear-gradient(155deg, rgba(206,17,38,0.18) 0%, rgba(252,209,22,0.22) 50%, rgba(0,107,63,0.2) 100%), #F8FAFC',
    isDarkBackdrop: false,
  },
  {
    id: 'botanical',
    name: 'Soft Mint',
    previewCss: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 60%, #A7F3D0 100%)',
    isDarkBackdrop: false,
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
        backgroundImage: `linear-gradient(rgba(10,15,25,0.22), rgba(10,15,25,0.22)), url("${customWallpaperUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
    };
  }

  switch (wallpaperId) {
    case 'doodle':
      return {
        isDarkBackdrop: theme.isDarkSurface,
        style: {
          backgroundColor: theme.surfaceBg,
          backgroundImage: `url("data:image/svg+xml,${DOODLE_SVG}")`,
          backgroundRepeat: 'repeat',
        },
      };
    case 'aurora':
      return {
        isDarkBackdrop: true,
        style: {
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(26,167,184,0.35), transparent 55%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.35), transparent 55%), linear-gradient(160deg, #090D16 0%, #1E1B4B 52%, #0C4A6E 100%)',
        },
      };
    case 'sunset':
      return {
        isDarkBackdrop: false,
        style: {
          backgroundImage: 'linear-gradient(155deg, #FFF7ED 0%, #FED7AA 52%, #FECDD3 100%)',
        },
      };
    case 'ocean_wave':
      return {
        isDarkBackdrop: false,
        style: {
          backgroundImage: 'linear-gradient(155deg, #E0F2FE 0%, #BAE6FD 52%, #CCFBF1 100%)',
        },
      };
    case 'midnight_stars':
      return {
        isDarkBackdrop: true,
        style: {
          backgroundColor: '#070B14',
          backgroundImage: `url("data:image/svg+xml,${STARS_SVG}"), radial-gradient(circle at 75% 15%, rgba(30,58,138,0.45), transparent 55%)`,
          backgroundRepeat: 'repeat, no-repeat',
        },
      };
    case 'ghana':
      return {
        isDarkBackdrop: false,
        style: {
          backgroundColor: '#FAF8F5',
          backgroundImage:
            'linear-gradient(145deg, rgba(206,17,38,0.16) 0%, rgba(252,209,22,0.22) 50%, rgba(0,107,63,0.18) 100%)',
        },
      };
    case 'botanical':
      return {
        isDarkBackdrop: false,
        style: {
          backgroundColor: '#ECFDF5',
          backgroundImage: `url("data:image/svg+xml,${BOTANICAL_SVG}"), linear-gradient(160deg, #ECFDF5 0%, #D1FAE5 100%)`,
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
    return JSON.parse(raw) as ChatAppearanceOverride;
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
