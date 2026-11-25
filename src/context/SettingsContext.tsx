import React, { createContext, useContext, useEffect, useState } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabaseClient';
import { FootballSourcesConfig } from '../types';
import { preloadMessageSounds } from '../utils/messageSounds';

const DEFAULT_FOOTBALL_SOURCES: FootballSourcesConfig = {
  facebookToken: '',
  facebookPageIds: '',
  instagramToken: '',
  instagramAccountIds: '',
  xBearerToken: '',
  xUsernames: '',
  youtubeApiKey: '',
  youtubeChannelIds: '',
  customRssUrls: '',
};

interface SettingsContextValue {
  lowDataMode: boolean;
  setLowDataMode: (v: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (v: boolean) => void;
  messageSoundsEnabled: boolean;
  setMessageSoundsEnabled: (v: boolean) => void;
  privacyOnlineVisible: boolean;
  setPrivacyOnlineVisible: (v: boolean) => void;
  language: string;
  setLanguage: (v: string) => void;
  footballSources: FootballSourcesConfig;
  setFootballSources: (v: FootballSourcesConfig) => void;
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
  const [privacyOnlineVisible, setPrivacyOnlineVisible] = useState<boolean>(
    () => localStorage.getItem('letchat_privacy_online') !== 'false'
  );
  const [language, setLanguage] = useState<string>(
    () => localStorage.getItem('letchat_language') || 'English'
  );
  const [footballSources, setFootballSources] = useState<FootballSourcesConfig>(() => {
    try {
      const saved = localStorage.getItem('letchat_football_sources');
      return saved ? { ...DEFAULT_FOOTBALL_SOURCES, ...JSON.parse(saved) } : DEFAULT_FOOTBALL_SOURCES;
    } catch {
      return DEFAULT_FOOTBALL_SOURCES;
    }
  });
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
    localStorage.setItem('letchat_privacy_online', String(privacyOnlineVisible));
  }, [privacyOnlineVisible]);

  useEffect(() => {
    localStorage.setItem('letchat_language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('letchat_football_sources', JSON.stringify(footballSources));
  }, [footballSources]);

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
        privacyOnlineVisible,
        setPrivacyOnlineVisible,
        language,
        setLanguage,
        footballSources,
        setFootballSources,
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
