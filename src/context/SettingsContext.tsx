import React, { createContext, useContext, useEffect, useState } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabaseClient';
import {
  CALL_TONE_OPTIONS,
  CallToneId,
  CHAT_TONE_OPTIONS,
  ChatToneId,
  preloadMessageSounds,
} from '../utils/messageSounds';
import {
  CHAT_THEMES,
  CHAT_WALLPAPERS,
  ChatThemeId,
  ChatWallpaperId,
} from '../utils/chatThemes';

export type KeyboardTheme = 'aurora' | 'dark' | 'light' | 'ghana';
export type KeyboardSize = 'compact' | 'mini';

interface SettingsContextValue {
  lowDataMode: boolean;
  setLowDataMode: (v: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (v: boolean) => void;
  messageSoundsEnabled: boolean;
  setMessageSoundsEnabled: (v: boolean) => void;
  keyboardTheme: KeyboardTheme;
  setKeyboardTheme: (v: KeyboardTheme) => void;
  keyboardSize: KeyboardSize;
  setKeyboardSize: (v: KeyboardSize) => void;
  keyboardSoundEnabled: boolean;
  setKeyboardSoundEnabled: (v: boolean) => void;
  keyboardVibrateEnabled: boolean;
  setKeyboardVibrateEnabled: (v: boolean) => void;
  keyboardAutoCap: boolean;
  setKeyboardAutoCap: (v: boolean) => void;
  keyboardAutoCorrect: boolean;
  setKeyboardAutoCorrect: (v: boolean) => void;
  chatTheme: ChatThemeId;
  setChatTheme: (v: ChatThemeId) => void;
  chatWallpaper: ChatWallpaperId;
  setChatWallpaper: (v: ChatWallpaperId) => void;
  customWallpaperUrl: string;
  setCustomWallpaperUrl: (v: string) => void;
  chatTone: ChatToneId;
  setChatTone: (v: ChatToneId) => void;
  voiceCallTone: CallToneId;
  setVoiceCallTone: (v: CallToneId) => void;
  videoCallTone: CallToneId;
  setVideoCallTone: (v: CallToneId) => void;
  privacyOnlineVisible: boolean;
  setPrivacyOnlineVisible: (v: boolean) => void;
  language: string;
  setLanguage: (v: string) => void;
  networkSpeedMbps: number | null;
  isSlowNetwork: boolean;
  measureSpeed: () => Promise<number>;
}

const SettingsContext = createContext<SettingsContextValue>({} as SettingsContextValue);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [lowDataMode, setLowDataMode] = useState<boolean>(
    () => localStorage.getItem('letchat_low_data') === 'true'
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    () => localStorage.getItem('letchat_notifications') !== 'false'
  );
  const [messageSoundsEnabled, setMessageSoundsEnabled] = useState<boolean>(
    () => localStorage.getItem('letchat_message_sounds') !== 'false'
  );
  const [keyboardTheme, setKeyboardTheme] = useState<KeyboardTheme>(() => {
    const saved = localStorage.getItem('letchat_keyboard_theme');
    return saved === 'dark' || saved === 'light' || saved === 'ghana' ? saved : 'aurora';
  });
  const [keyboardSize, setKeyboardSize] = useState<KeyboardSize>(() =>
    localStorage.getItem('letchat_keyboard_size') === 'mini' ? 'mini' : 'compact'
  );
  const [keyboardSoundEnabled, setKeyboardSoundEnabled] = useState<boolean>(
    () => localStorage.getItem('letchat_keyboard_sound') !== 'false'
  );
  const [keyboardVibrateEnabled, setKeyboardVibrateEnabled] = useState<boolean>(
    () => localStorage.getItem('letchat_keyboard_vibrate') !== 'false'
  );
  const [keyboardAutoCap, setKeyboardAutoCap] = useState<boolean>(
    () => localStorage.getItem('letchat_keyboard_autocap') !== 'false'
  );
  const [keyboardAutoCorrect, setKeyboardAutoCorrect] = useState<boolean>(
    () => localStorage.getItem('letchat_keyboard_autocorrect') !== 'false'
  );
  const [chatTheme, setChatTheme] = useState<ChatThemeId>(() => {
    const saved = localStorage.getItem('letchat_chat_theme');
    return CHAT_THEMES.some((t) => t.id === saved) ? (saved as ChatThemeId) : 'flow_obsidian';
  });
  const [chatWallpaper, setChatWallpaper] = useState<ChatWallpaperId>(() => {
    const saved = localStorage.getItem('letchat_chat_wallpaper');
    if (saved === 'custom' || CHAT_WALLPAPERS.some((w) => w.id === saved)) {
      return saved as ChatWallpaperId;
    }
    return 'flow_mesh';
  });
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState<string>(
    () => localStorage.getItem('letchat_custom_wallpaper') || ''
  );
  const [chatTone, setChatTone] = useState<ChatToneId>(() => {
    const saved = localStorage.getItem('letchat_chat_tone');
    return CHAT_TONE_OPTIONS.some((t) => t.id === saved) ? (saved as ChatToneId) : 'classic';
  });
  const [voiceCallTone, setVoiceCallTone] = useState<CallToneId>(() => {
    const saved = localStorage.getItem('letchat_voice_call_tone');
    return CALL_TONE_OPTIONS.some((t) => t.id === saved) ? (saved as CallToneId) : 'kalimba';
  });
  const [videoCallTone, setVideoCallTone] = useState<CallToneId>(() => {
    const saved = localStorage.getItem('letchat_video_call_tone');
    return CALL_TONE_OPTIONS.some((t) => t.id === saved) ? (saved as CallToneId) : 'horizon';
  });
  const [privacyOnlineVisible, setPrivacyOnlineVisible] = useState<boolean>(
    () => localStorage.getItem('letchat_privacy_online') !== 'false'
  );
  const [language, setLanguage] = useState<string>(
    () => localStorage.getItem('letchat_language') || 'English'
  );
  const [networkSpeedMbps, setNetworkSpeedMbps] = useState<number | null>(null);
  const [isSlowNetwork, setIsSlowNetwork] = useState<boolean>(false);

  useEffect(() => {
    preloadMessageSounds();
  }, []);

  useEffect(() => {
    localStorage.setItem('letchat_low_data', String(lowDataMode));
  }, [lowDataMode]);

  useEffect(() => {
    localStorage.setItem('letchat_notifications', String(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    localStorage.setItem('letchat_message_sounds', String(messageSoundsEnabled));
  }, [messageSoundsEnabled]);

  useEffect(() => {
    localStorage.setItem('letchat_keyboard_theme', keyboardTheme);
  }, [keyboardTheme]);

  useEffect(() => {
    localStorage.setItem('letchat_keyboard_size', keyboardSize);
  }, [keyboardSize]);

  useEffect(() => {
    localStorage.setItem('letchat_keyboard_sound', String(keyboardSoundEnabled));
  }, [keyboardSoundEnabled]);

  useEffect(() => {
    localStorage.setItem('letchat_keyboard_vibrate', String(keyboardVibrateEnabled));
  }, [keyboardVibrateEnabled]);

  useEffect(() => {
    localStorage.setItem('letchat_keyboard_autocap', String(keyboardAutoCap));
  }, [keyboardAutoCap]);

  useEffect(() => {
    localStorage.setItem('letchat_keyboard_autocorrect', String(keyboardAutoCorrect));
  }, [keyboardAutoCorrect]);

  useEffect(() => {
    localStorage.setItem('letchat_chat_theme', chatTheme);
  }, [chatTheme]);

  useEffect(() => {
    localStorage.setItem('letchat_chat_wallpaper', chatWallpaper);
  }, [chatWallpaper]);

  useEffect(() => {
    try {
      if (customWallpaperUrl) {
        localStorage.setItem('letchat_custom_wallpaper', customWallpaperUrl);
      } else {
        localStorage.removeItem('letchat_custom_wallpaper');
      }
    } catch {
      // ignore storage quota errors
    }
  }, [customWallpaperUrl]);

  useEffect(() => {
    localStorage.setItem('letchat_chat_tone', chatTone);
  }, [chatTone]);

  useEffect(() => {
    localStorage.setItem('letchat_voice_call_tone', voiceCallTone);
  }, [voiceCallTone]);

  useEffect(() => {
    localStorage.setItem('letchat_video_call_tone', videoCallTone);
  }, [videoCallTone]);

  useEffect(() => {
    localStorage.setItem('letchat_privacy_online', String(privacyOnlineVisible));
  }, [privacyOnlineVisible]);

  useEffect(() => {
    localStorage.setItem('letchat_language', language);
  }, [language]);

  const measureSpeed = async (): Promise<number> => {
    const nav = navigator as Navigator & {
      connection?: { downlink?: number; addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void };
    };
    if (nav.connection && typeof nav.connection.downlink === 'number' && nav.connection.downlink > 0) {
      setNetworkSpeedMbps(nav.connection.downlink);
      setIsSlowNetwork(nav.connection.downlink < 1.0);
      return nav.connection.downlink;
    }
    try {
      const t0 = performance.now();
      await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SUPABASE_ANON_KEY },
        cache: 'no-store',
      });
      const dt = Math.max(performance.now() - t0, 1);
      const approx = Number(Math.min(25, Math.max(0.2, 300 / dt)).toFixed(2));
      setNetworkSpeedMbps(approx);
      setIsSlowNetwork(approx < 1.0);
      return approx;
    } catch {
      setNetworkSpeedMbps(0);
      setIsSlowNetwork(true);
      return 0;
    }
  };

  useEffect(() => {
    measureSpeed();
    const nav = navigator as Navigator & {
      connection?: { addEventListener?: (e: string, fn: () => void) => void; removeEventListener?: (e: string, fn: () => void) => void };
    };
    const conn = nav.connection;
    if (conn?.addEventListener) {
      conn.addEventListener('change', measureSpeed);
      return () => conn.removeEventListener?.('change', measureSpeed);
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        lowDataMode,
        setLowDataMode,
        notificationsEnabled,
        setNotificationsEnabled,
        messageSoundsEnabled,
        setMessageSoundsEnabled,
        keyboardTheme,
        setKeyboardTheme,
        keyboardSize,
        setKeyboardSize,
        keyboardSoundEnabled,
        setKeyboardSoundEnabled,
        keyboardVibrateEnabled,
        setKeyboardVibrateEnabled,
        keyboardAutoCap,
        setKeyboardAutoCap,
        keyboardAutoCorrect,
        setKeyboardAutoCorrect,
        chatTheme,
        setChatTheme,
        chatWallpaper,
        setChatWallpaper,
        customWallpaperUrl,
        setCustomWallpaperUrl,
        chatTone,
        setChatTone,
        voiceCallTone,
        setVoiceCallTone,
        videoCallTone,
        setVideoCallTone,
        privacyOnlineVisible,
        setPrivacyOnlineVisible,
        language,
        setLanguage,
        networkSpeedMbps,
        isSlowNetwork,
        measureSpeed,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
