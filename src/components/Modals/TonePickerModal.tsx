import React, { useEffect, useState } from 'react';
import { Check, MessageSquare, Phone, Play, Video, Volume2, X } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import {
  CALL_TONE_OPTIONS,
  CallToneId,
  CHAT_TONE_OPTIONS,
  ChatToneId,
  previewCallTone,
  previewChatTone,
} from '../../utils/messageSounds';

export type ToneTab = 'chat' | 'voice' | 'video';

interface TonePickerModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: ToneTab;
}

export default function TonePickerModal({
  open,
  onClose,
  initialTab = 'chat',
}: TonePickerModalProps) {
  const {
    chatTone,
    setChatTone,
    voiceCallTone,
    setVoiceCallTone,
    videoCallTone,
    setVideoCallTone,
    messageSoundsEnabled,
    setMessageSoundsEnabled,
  } = useSettings();

  const [activeTab, setActiveTab] = useState<ToneTab>(initialTab);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const tabs: { id: ToneTab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'chat', label: 'Chat Tone', icon: MessageSquare },
    { id: 'voice', label: 'Voice Call', icon: Phone },
    { id: 'video', label: 'Video Call', icon: Video },
  ];

  const handleSelectChatTone = (id: ChatToneId) => {
    setChatTone(id);
    if (id !== 'silent' && !messageSoundsEnabled) {
      setMessageSoundsEnabled(true);
    }
    previewChatTone(id);
  };

  const handleSelectCallTone = (id: CallToneId) => {
    if (activeTab === 'voice') {
      setVoiceCallTone(id);
    } else {
      setVideoCallTone(id);
    }
    previewCallTone(id);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-950 text-black dark:text-white border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Volume2 size={18} className="text-[#1AA7B8]" />
            <div>
              <h3 className="font-extrabold text-sm">Sound & Ringtones</h3>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Choose your chat, voice call & video call tones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-zinc-900"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition ${
                    active
                      ? 'bg-white dark:bg-zinc-800 text-[#0A3D62] dark:text-[#1AA7B8] shadow-sm'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tone Options */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {activeTab === 'chat'
            ? CHAT_TONE_OPTIONS.map((opt) => {
                const selected = chatTone === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition ${
                      selected
                        ? 'border-[#1AA7B8] bg-[#1AA7B8]/10'
                        : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectChatTone(opt.id)}
                      className="flex-1 text-left min-w-0 flex items-center gap-2.5"
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                          selected
                            ? 'bg-[#1AA7B8] border-[#1AA7B8] text-white'
                            : 'border-slate-300 dark:border-zinc-700'
                        }`}
                      >
                        {selected && <Check size={12} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{opt.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                          {opt.description}
                        </p>
                      </div>
                    </button>
                    {opt.id !== 'silent' && (
                      <button
                        type="button"
                        onClick={() => previewChatTone(opt.id)}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-[#1AA7B8] hover:text-white flex items-center justify-center transition shrink-0"
                        title={`Preview ${opt.name}`}
                        aria-label={`Preview ${opt.name}`}
                      >
                        <Play size={13} />
                      </button>
                    )}
                  </div>
                );
              })
            : CALL_TONE_OPTIONS.map((opt) => {
                const currentTone = activeTab === 'voice' ? voiceCallTone : videoCallTone;
                const selected = currentTone === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition ${
                      selected
                        ? 'border-[#1AA7B8] bg-[#1AA7B8]/10'
                        : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectCallTone(opt.id)}
                      className="flex-1 text-left min-w-0 flex items-center gap-2.5"
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                          selected
                            ? 'bg-[#1AA7B8] border-[#1AA7B8] text-white'
                            : 'border-slate-300 dark:border-zinc-700'
                        }`}
                      >
                        {selected && <Check size={12} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{opt.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                          {opt.description}
                        </p>
                      </div>
                    </button>
                    {opt.id !== 'silent' && (
                      <button
                        type="button"
                        onClick={() => previewCallTone(opt.id)}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-[#1AA7B8] hover:text-white flex items-center justify-center transition shrink-0"
                        title={`Preview ${opt.name}`}
                        aria-label={`Preview ${opt.name}`}
                      >
                        <Play size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-zinc-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 min-h-[38px] rounded-xl bg-[#0A3D62] text-white text-xs font-bold hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
