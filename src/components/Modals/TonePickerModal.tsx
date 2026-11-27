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
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#111118] text-white border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Volume2 size={18} className="text-[#00E5FF]" />
            <div>
              <h3 className="font-extrabold text-sm">Sound &amp; Ringtones</h3>
              <p className="text-[11px] text-zinc-400">
                Choose your chat, voice call &amp; video call tones
              </p>
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

        {/* Category Tabs */}
        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10">
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
                      ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
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
                    className={`flex items-center justify-between gap-2 p-3 rounded-2xl border transition ${
                      selected
                        ? 'border-[#00E5FF]/60 bg-[#7C3AED]/15'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
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
                            ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] border-transparent text-white'
                            : 'border-white/25'
                        }`}
                      >
                        {selected && <Check size={12} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{opt.name}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{opt.description}</p>
                      </div>
                    </button>
                    {opt.id !== 'silent' && (
                      <button
                        type="button"
                        onClick={() => previewChatTone(opt.id)}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-[#00E5FF] hover:text-[#0A0A0A] text-white flex items-center justify-center transition shrink-0"
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
                    className={`flex items-center justify-between gap-2 p-3 rounded-2xl border transition ${
                      selected
                        ? 'border-[#00E5FF]/60 bg-[#7C3AED]/15'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
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
                            ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] border-transparent text-white'
                            : 'border-white/25'
                        }`}
                      >
                        {selected && <Check size={12} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{opt.name}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{opt.description}</p>
                      </div>
                    </button>
                    {opt.id !== 'silent' && (
                      <button
                        type="button"
                        onClick={() => previewCallTone(opt.id)}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-[#00E5FF] hover:text-[#0A0A0A] text-white flex items-center justify-center transition shrink-0"
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

        <div className="px-4 py-3 border-t border-white/10 flex justify-end shrink-0">
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
