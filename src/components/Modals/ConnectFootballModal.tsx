import React, { useState } from 'react';
import { X, Plug, Check } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { FootballSourcesConfig } from '../../types';

interface ConnectFootballModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ConnectFootballModal({ open, onClose }: ConnectFootballModalProps) {
  const { footballSources, setFootballSources } = useSettings();
  const [form, setForm] = useState<FootballSourcesConfig>(footballSources);

  if (!open) return null;

  const save = () => {
    setFootballSources(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Plug className="text-[#1AA7B8]" size={18} />
            <h3 className="font-bold text-base">Connect Football Sources</h3>
          </div>
          <button
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          <p className="text-slate-500 dark:text-zinc-400">
            BBC Sport Football, ESPN Soccer, Sky Sports, and Premier League/FIFA YouTube feeds are active by default. Add your own API keys, Page IDs, or RSS URLs below.
          </p>

          <div className="space-y-2">
            <label className="font-bold block">YouTube Data API v3</label>
            <input
              type="password"
              value={form.youtubeApiKey}
              onChange={(e) => setForm({ ...form, youtubeApiKey: e.target.value })}
              placeholder="YouTube API Key"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
            <input
              value={form.youtubeChannelIds}
              onChange={(e) => setForm({ ...form, youtubeChannelIds: e.target.value })}
              placeholder="Channel IDs (comma-separated)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
          </div>

          <div className="space-y-2">
            <label className="font-bold block">Facebook Graph API</label>
            <input
              type="password"
              value={form.facebookToken}
              onChange={(e) => setForm({ ...form, facebookToken: e.target.value })}
              placeholder="Facebook Page Access Token"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
            <input
              value={form.facebookPageIds}
              onChange={(e) => setForm({ ...form, facebookPageIds: e.target.value })}
              placeholder="Facebook Page IDs (comma-separated)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
          </div>

          <div className="space-y-2">
            <label className="font-bold block">Instagram Graph API</label>
            <input
              type="password"
              value={form.instagramToken}
              onChange={(e) => setForm({ ...form, instagramToken: e.target.value })}
              placeholder="Instagram Graph Access Token"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
            <input
              value={form.instagramAccountIds}
              onChange={(e) => setForm({ ...form, instagramAccountIds: e.target.value })}
              placeholder="Instagram Business Account IDs (comma-separated)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
          </div>

          <div className="space-y-2">
            <label className="font-bold block">X (Twitter) API v2</label>
            <input
              type="password"
              value={form.xBearerToken}
              onChange={(e) => setForm({ ...form, xBearerToken: e.target.value })}
              placeholder="X API v2 Bearer Token"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
            <input
              value={form.xUsernames}
              onChange={(e) => setForm({ ...form, xUsernames: e.target.value })}
              placeholder="X Usernames (comma-separated, e.g. FabrizioRomano, ghanafaofficial)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
          </div>

          <div className="space-y-2">
            <label className="font-bold block">Custom Football RSS URLs (one per line)</label>
            <textarea
              rows={3}
              value={form.customRssUrls}
              onChange={(e) => setForm({ ...form, customRssUrls: e.target.value })}
              placeholder="https://example.com/football/rss.xml"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-transparent outline-none focus:border-[#1AA7B8]"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-zinc-800 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-800 font-semibold text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex-1 min-h-[44px] rounded-xl bg-[#0A3D62] text-white font-semibold text-sm flex items-center justify-center gap-1.5"
          >
            <Check size={16} /> Save & Refresh Feeds
          </button>
        </div>
      </div>
    </div>
  );
}
