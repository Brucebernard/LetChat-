import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Languages,
  FileText,
  Wand2,
  MessageSquarePlus,
  Film,
  Copy,
  Check,
  Trash2,
  Loader2,
  CornerDownLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/mediaUtils';

export type FlowAiAction =
  | 'chat'
  | 'write'
  | 'translate'
  | 'summarize'
  | 'suggest_reply'
  | 'moment_caption';

export interface FlowAiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: FlowAiAction;
  createdAt: string;
}

export interface FlowAiContextMessage {
  sender?: string;
  text?: string;
}

const STORAGE_KEY_PREFIX = 'letchat_flow_ai_chat_';

export async function callFlowAi(params: {
  accessToken: string;
  action: FlowAiAction;
  prompt?: string;
  targetLanguage?: 'Twi' | 'English' | 'French';
  contextMessages?: FlowAiContextMessage[];
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<string> {
  const res = await fetch('/api/ai/flow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      action: params.action,
      prompt: params.prompt,
      targetLanguage: params.targetLanguage,
      contextMessages: params.contextMessages,
      history: params.history,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
  if (!res.ok || !data.reply) {
    throw new Error(data.error || 'Could not reach @FLOW AI.');
  }
  return data.reply;
}

export default function FlowAiChatModal({
  open,
  mode = 'standalone',
  onClose,
  onInsertText,
  contextMessages = [],
  draftText = '',
  defaultAction,
}: {
  open: boolean;
  mode?: 'standalone' | 'assist';
  onClose: () => void;
  onInsertText?: (text: string) => void;
  contextMessages?: FlowAiContextMessage[];
  draftText?: string;
  defaultAction?: FlowAiAction;
}) {
  const { session, profile } = useAuth();
  const { showToast } = useToast();

  const storageKey = `${STORAGE_KEY_PREFIX}${profile?.id || 'guest'}_${mode}`;
  const [messages, setMessages] = useState<FlowAiMessage[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved) as FlowAiMessage[];
    } catch {
      // ignore
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        text:
          mode === 'assist'
            ? 'Akwaaba! I am @FLOW AI. Pick a quick action below to write a message, translate to Twi / English / French, summarize this chat, or suggest a reply.'
            : 'Akwaaba! I am @FLOW AI. Ask me anything — translate between Twi, English & French, write messages, summarize ideas, or craft Moment captions.',
        createdAt: new Date().toISOString(),
      },
    ];
  });

  const [promptInput, setPromptInput] = useState('');
  const [translateLang, setTranslateLang] = useState<'Twi' | 'English' | 'French'>('Twi');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    } catch {
      // ignore
    }
  }, [messages, storageKey]);

  useEffect(() => {
    if (open) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, [open, messages.length]);

  useEffect(() => {
    if (open && draftText && !promptInput) {
      setPromptInput(draftText);
    }
  }, [open, draftText]);

  if (!open) return null;

  const runAction = async (
    action: FlowAiAction,
    customPrompt?: string,
    overrideLang?: 'Twi' | 'English' | 'French'
  ) => {
    if (!session?.access_token || loading) return;
    const textToUse = (customPrompt ?? promptInput).trim();
    if (
      (action === 'chat' || action === 'write' || action === 'moment_caption') &&
      !textToUse &&
      contextMessages.length === 0
    ) {
      showToast('Type what you need @FLOW AI to do first.', 'info');
      return;
    }

    const userDisplay =
      action === 'summarize'
        ? 'Summarize this conversation'
        : action === 'suggest_reply'
          ? 'Suggest a quick reply'
          : action === 'translate'
            ? `Translate to ${overrideLang || translateLang}: "${textToUse || 'last messages'}"`
            : action === 'moment_caption'
              ? `Create Moment caption: ${textToUse}`
              : action === 'write'
                ? `Write message: ${textToUse}`
                : textToUse;

    const userMsg: FlowAiMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: userDisplay,
      action,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (action === 'chat') setPromptInput('');
    setLoading(true);

    try {
      const reply = await callFlowAi({
        accessToken: session.access_token,
        action,
        prompt: textToUse,
        targetLanguage: overrideLang || translateLang,
        contextMessages,
        history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: reply,
          action,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '@FLOW AI failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex flex-col sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full h-full sm:h-[85vh] sm:max-w-lg sm:rounded-3xl bg-[#0A0A0A] border border-[#7C3AED]/35 text-white flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-[#7C3AED]/20 via-[#12121A] to-[#00E5FF]/10 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] flex items-center justify-center shadow-lg shadow-[#7C3AED]/30 shrink-0">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-extrabold text-sm truncate">@FLOW AI</h2>
                <span className="px-1.5 py-0.5 rounded-full bg-[#7C3AED] text-white text-[9px] font-extrabold uppercase tracking-wider">
                  AI
                </span>
              </div>
              <p className="text-[11px] text-[#00E5FF] truncate">
                Write · Translate Twi/EN/FR · Summarize · Captions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: 'welcome',
                    role: 'assistant',
                    text: 'Chat cleared. How can @FLOW AI help you?',
                    createdAt: new Date().toISOString(),
                  },
                ])
              }
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
              title="Clear history"
              aria-label="Clear history"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10"
              aria-label="Close @FLOW AI"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Quick Action Pills */}
        <div className="px-3 py-2 border-b border-white/10 bg-[#111118] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              runAction('write', promptInput || 'Say hello and check in warmly on a friend')
            }
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-[#7C3AED]/30 border border-white/10 text-[11px] font-semibold flex items-center gap-1 shrink-0"
          >
            <Wand2 size={12} className="text-[#00E5FF]" /> Write Message
          </button>

          <div className="flex items-center rounded-xl bg-white/[0.06] border border-white/10 overflow-hidden shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={() => runAction('translate')}
              className="px-2.5 py-1.5 hover:bg-[#7C3AED]/30 text-[11px] font-semibold flex items-center gap-1"
            >
              <Languages size={12} className="text-[#00E5FF]" /> Translate
            </button>
            <select
              value={translateLang}
              onChange={(e) => setTranslateLang(e.target.value as 'Twi' | 'English' | 'French')}
              className="bg-transparent text-[11px] font-bold text-[#00E5FF] pr-2 py-1 outline-none cursor-pointer"
              aria-label="Target language"
            >
              <option value="Twi" className="bg-[#12121A] text-white">Twi</option>
              <option value="English" className="bg-[#12121A] text-white">English</option>
              <option value="French" className="bg-[#12121A] text-white">French</option>
            </select>
          </div>

          {contextMessages.length > 0 && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => runAction('summarize')}
                className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-[#7C3AED]/30 border border-white/10 text-[11px] font-semibold flex items-center gap-1 shrink-0"
              >
                <FileText size={12} className="text-[#7C3AED]" /> Summarize
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => runAction('suggest_reply')}
                className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-[#7C3AED]/30 border border-white/10 text-[11px] font-semibold flex items-center gap-1 shrink-0"
              >
                <MessageSquarePlus size={12} className="text-[#00E5FF]" /> Suggest Reply
              </button>
            </>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() =>
              runAction('moment_caption', promptInput || 'Vibes in Accra with friends')
            }
            className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-[#7C3AED]/30 border border-white/10 text-[11px] font-semibold flex items-center gap-1 shrink-0"
          >
            <Film size={12} className="text-[#7C3AED]" /> Moment Caption
          </button>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => {
            const isAi = m.role === 'assistant';
            return (
              <div key={m.id} className={`flex ${isAi ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow ${
                    isAi
                      ? 'bg-[#141422] border border-[#7C3AED]/40 text-white rounded-bl-sm'
                      : 'bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] text-white rounded-br-sm'
                  }`}
                >
                  {isAi && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#7C3AED] text-[9px] font-extrabold uppercase tracking-wider text-white">
                        <Sparkles size={9} /> AI
                      </span>
                      <span className="text-[11px] font-bold text-[#00E5FF]">@FLOW AI</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                  {isAi && m.id !== 'welcome' && (
                    <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => handleCopy(m.id, m.text)}
                        className="text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center gap-1"
                      >
                        {copiedId === m.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        {copiedId === m.id ? 'Copied' : 'Copy'}
                      </button>
                      {onInsertText && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertText(m.text);
                            onClose();
                          }}
                          className="text-[11px] font-bold text-[#00E5FF] hover:underline flex items-center gap-1 ml-auto"
                        >
                          <CornerDownLeft size={12} /> Use in {defaultAction === 'moment_caption' ? 'Moment' : 'Chat'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3.5 py-2.5 bg-[#141422] border border-[#7C3AED]/40 text-xs text-[#00E5FF] flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[#7C3AED]" />
                @FLOW AI is thinking...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runAction(defaultAction || 'chat');
          }}
          className="p-3 border-t border-white/10 bg-[#0E0E14] flex items-center gap-2 shrink-0"
        >
          <input
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="Ask @FLOW AI, paste text to translate to Twi..."
            className="flex-1 min-h-[42px] px-3.5 rounded-2xl bg-white/[0.06] border border-white/10 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-[#7C3AED]"
          />
          <button
            type="submit"
            disabled={loading || !promptInput.trim()}
            className="min-h-[42px] px-4 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send size={14} /> Ask
          </button>
        </form>
      </div>
    </div>
  );
}
