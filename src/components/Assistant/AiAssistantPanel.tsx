import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  Trash2,
  Copy,
  Check,
  ArrowLeft,
  X,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard } from '../../utils/mediaUtils';
import AiTypingIndicator from './AiTypingIndicator';
import AiMarkdown from './AiMarkdown';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
}

const STARTER_PROMPTS = [
  'Draft a warm birthday message for a friend',
  'Translate "How are you doing today?" into Twi and French',
  'Give me 3 fun weekend conversation starters',
  'Help me write a short bio for my LetChat profile',
];

const QUICK_REPLIES: { label: string; prompt: string; followUpPrompt?: string }[] = [
  {
    label: 'Draft a reply',
    prompt: 'Help me draft a warm, polite reply for a friend.',
    followUpPrompt: 'Turn that into a short, natural reply I can send in chat.',
  },
  {
    label: 'Make shorter',
    prompt: 'Give me 3 short and friendly greeting messages.',
    followUpPrompt: 'Make that much shorter and easier to read.',
  },
  {
    label: 'Translate to French',
    prompt: 'Translate "How are you doing today?" into French.',
    followUpPrompt: 'Translate your last reply into French.',
  },
  {
    label: 'Birthday wish',
    prompt: 'Write a short, heartfelt birthday message for a close friend.',
  },
  {
    label: 'Icebreaker',
    prompt: 'Give me 3 fun conversation starters for a group chat.',
  },
  {
    label: 'Explain simply',
    prompt: 'Share a quick communication tip in simple words.',
    followUpPrompt: 'Explain that in simpler, everyday words.',
  },
];

interface AiAssistantPanelProps {
  onBack?: () => void;
  isModal?: boolean;
}

export default function AiAssistantPanel({
  onBack,
  isModal = false,
}: AiAssistantPanelProps) {
  const { profile, session } = useAuth();
  const { showToast } = useToast();
  const storageKey = `letchat_ai_history_${profile?.id || 'guest'}`;

  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? (JSON.parse(saved) as AiChatMessage[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40)));
    } catch {
      // ignore storage quota errors
    }
  }, [messages, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const sendMessage = async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || streaming) return;

    if (!session?.access_token) {
      setErrorMsg('Please sign in to chat with LetChat AI.');
      return;
    }

    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    const assistantMsgId = `a-${Date.now() + 1}`;
    const placeholderReply: AiChatMessage = {
      id: assistantMsgId,
      role: 'model',
      text: '',
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, placeholderReply]);
    if (!overrideText) setInput('');
    setStreaming(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error || `AI request failed (HTTP ${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Unable to read AI response stream.');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const payload = JSON.parse(jsonStr) as {
              text?: string;
              error?: string;
              done?: boolean;
            };
            if (payload.error) {
              throw new Error(payload.error);
            }
            if (payload.text) {
              accumulated += payload.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, text: accumulated } : m
                )
              );
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr;
            }
          }
        }
      }

      if (!accumulated) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach LetChat AI.');
    } finally {
      setStreaming(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setErrorMsg('');
    localStorage.removeItem(storageKey);
    showToast('AI conversation cleared', 'success');
  };

  const handleCopy = async (msg: AiChatMessage) => {
    const ok = await copyToClipboard(msg.text);
    if (ok) {
      setCopiedId(msg.id);
      showToast('Reply copied!', 'success');
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  return (
    <div
      className={`h-full flex flex-col bg-white dark:bg-black text-black dark:text-white ${
        isModal ? '' : 'animate-ai-panel'
      }`}
    >
      {/* Header */}
      <div className="h-14 px-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && !isModal && (
            <button
              type="button"
              onClick={onBack}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
              aria-label="Back to chats"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0A3D62] to-[#1AA7B8] text-white flex items-center justify-center shrink-0">
            <Sparkles size={17} />
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm truncate">LetChat AI Assistant</h3>
            <p className="text-[11px] text-[#1AA7B8] font-medium truncate">
              Always ready to help
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-zinc-900"
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <Trash2 size={16} />
            </button>
          )}
          {onBack && isModal && (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900"
              aria-label="Close AI Assistant"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {messages.length === 0 && (
          <div className="py-8 max-w-md mx-auto text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0A3D62] to-[#1AA7B8] text-white flex items-center justify-center mx-auto shadow-sm">
              <Sparkles size={22} />
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-base">Hi {profile?.name || 'there'}!</h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Ask questions, draft replies, translate messages, or brainstorm ideas.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="p-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-medium hover:border-[#1AA7B8] hover:bg-slate-50 dark:hover:bg-zinc-900 transition"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          if (!isUser && !msg.text) {
            return null;
          }
          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] min-w-0 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed space-y-1.5 ${
                  isUser
                    ? 'bg-[#0A3D62] text-white rounded-br-sm'
                    : 'bg-slate-100 dark:bg-zinc-900 text-black dark:text-white rounded-bl-sm'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                ) : (
                  <AiMarkdown content={msg.text} />
                )}
                {!isUser && msg.text && (
                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-[#1AA7B8]"
                    >
                      {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiedId === msg.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {streaming && <AiTypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="p-2.5 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2 shrink-0">
        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <p className="font-medium">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="p-0.5 hover:opacity-75 shrink-0"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
          role="group"
          aria-label="Quick replies"
        >
          {QUICK_REPLIES.map((item) => {
            const targetPrompt =
              messages.length > 0 && item.followUpPrompt ? item.followUpPrompt : item.prompt;
            return (
              <button
                key={item.label}
                type="button"
                disabled={streaming}
                onClick={() => sendMessage(targetPrompt)}
                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-[#1AA7B8] hover:text-[#0A3D62] dark:hover:text-[#1AA7B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7B8] whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask LetChat AI anything..."
            disabled={streaming}
            className="flex-1 px-3.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-[#1AA7B8]"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-gradient-to-r from-[#0A3D62] to-[#1AA7B8] text-white font-bold flex items-center justify-center disabled:opacity-40"
            aria-label="Send message to AI Assistant"
          >
            <Send size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}
