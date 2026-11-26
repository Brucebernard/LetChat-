import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowBigUp,
  ArrowBigUpDash,
  Camera,
  ChevronDown,
  Delete,
  Film,
  MapPin,
  Mic,
  Send,
  Settings,
  Smile,
  Sticker,
  Volume2,
  X,
} from 'lucide-react';
import { KeyboardSize, KeyboardTheme, useSettings } from '../../context/SettingsContext';
import { playKeypressSound } from '../../utils/messageSounds';

type KeyboardMode = 'abc' | '123' | 'emoji' | 'gif' | 'settings';
type ShiftMode = 'off' | 'once' | 'caps';
type EmojiCategoryId = 'smileys' | 'love' | 'fire' | 'ghana' | 'party';

const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const SYMBOL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '&', '_', '-', '+', '(', ')', '/'],
  ['*', '"', "'", ':', ';', '!', '?', ',', '%'],
];

const KEY_LONG_PRESS_VARIANTS: Record<string, string[]> = {
  q: ['1', 'q'],
  w: ['2', 'w'],
  e: ['3', 'è', 'é', 'ê', 'ë', 'e'],
  r: ['4', 'r'],
  t: ['5', 't'],
  y: ['6', 'ÿ', 'y'],
  u: ['7', 'ù', 'ú', 'û', 'ü', 'u'],
  i: ['8', 'ì', 'í', 'î', 'ï', 'i'],
  o: ['9', 'ò', 'ó', 'ô', 'ö', 'ø', 'o'],
  p: ['0', 'p'],
  a: ['à', 'á', 'â', 'ä', 'ã', 'å', '@', 'a'],
  s: ['ß', 'ś', 'š', '$', 's'],
  c: ['ç', 'ć', 'č', 'c'],
  n: ['ñ', 'ń', 'n'],
  z: ['ž', 'ź', 'ż', 'z'],
};

const EMOJI_CATEGORIES: { id: EmojiCategoryId; icon: string; label: string; items: string[] }[] = [
  {
    id: 'smileys',
    icon: '😊',
    label: 'Smileys',
    items: [
      '😀', '😃', '😄', '😁', '😆', '🥹', '😅', '😂',
      '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍',
      '🥰', '😘', '😜', '🤪', '😎', '🤩', '🥳', '🤔',
      '🤗', '🤭', '😴', '😭', '😤', '🤯', '🙌', '👏',
    ],
  },
  {
    id: 'love',
    icon: '❤️',
    label: 'Love',
    items: [
      '❤️', '🩷', '🧡', '💛', '💚', '💙', '💜', '🖤',
      '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗',
      '💖', '💘', '💝', '💟', '💌', '💋', '🫂', '🌹',
      '🌷', '💐', '🫶', '🤝', '🙏', '✨', '🌟', '💫',
    ],
  },
  {
    id: 'fire',
    icon: '🔥',
    label: 'Hype',
    items: [
      '🔥', '⚡', '💥', '💯', '🚀', '💎', '👑', '🏆',
      '🥇', '⚽', '🎯', '💪', '👍', '👎', '👌', '✌️',
      '🤞', '🤟', '🤘', '🤙', '👀', '🗣️', '📣', '🚨',
      '💸', '📈', '🎧', '🎤', '🎬', '📸', '🎮', '🛸',
    ],
  },
  {
    id: 'ghana',
    icon: '🇬🇭',
    label: 'Ghana',
    items: [
      '🇬🇭', '⭐', '🖤', '💛', '❤️', '💚', '🥁', '💃',
      '🕺', '🎶', '🎷', '🎺', '🌴', '☀️', '🌊', '🍲',
      '🍛', '🍗', '🥥', '🍍', '🥭', '🍌', '👑', '🦁',
      '🙏', '🤝', '🗣️', '⚽', '🏟️', '🌍', '🕊️', '✨',
    ],
  },
  {
    id: 'party',
    icon: '🎉',
    label: 'Party',
    items: [
      '🎉', '🎊', '🎈', '🎂', '🍰', '🧁', '🥂', '🍾',
      '🍻', '🍹', '🎁', '🎀', '🎆', '🎇', '🧨', '🪩',
      '🪄', '🪅', '🎭', '🎨', '🎤', '🎵', '💃', '🕺',
      '🥳', '🤩', '😎', '🌟', '💫', '🙌', '👏', '❤️‍🔥',
    ],
  },
];

const AUTOCORRECT_MAP: Record<string, string> = {
  teh: 'the',
  taht: 'that',
  wiht: 'with',
  adn: 'and',
  jsut: 'just',
  recieve: 'receive',
  beleive: 'believe',
  freind: 'friend',
  tomorow: 'tomorrow',
  becuase: 'because',
  beacuse: 'because',
  seperate: 'separate',
  definately: 'definitely',
  occured: 'occurred',
  untill: 'until',
  thier: 'their',
  wierd: 'weird',
  im: "I'm",
  ive: "I've",
  ill: "I'll",
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  cant: "can't",
  wont: "won't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  youre: "you're",
  theyre: "they're",
  thats: "that's",
  whats: "what's",
  heres: "here's",
  theres: "there's",
  hes: "he's",
  shes: "she's",
  weve: "we've",
  youve: "you've",
  i: 'I',
};

export function applyAutoCorrectAtCursor(
  value: string,
  cursorPos: number
): { nextValue: string; nextCursor: number } {
  const before = value.slice(0, cursorPos);
  const after = value.slice(cursorPos);
  const match = before.match(/([A-Za-z']+)$/);
  if (!match) return { nextValue: value, nextCursor: cursorPos };

  const word = match[1];
  const replacement = AUTOCORRECT_MAP[word.toLowerCase()];
  if (!replacement) return { nextValue: value, nextCursor: cursorPos };

  const adjusted =
    word[0] === word[0].toUpperCase() && replacement !== 'I' && !replacement.startsWith("I'")
      ? replacement[0].toUpperCase() + replacement.slice(1)
      : replacement;

  if (adjusted === word) return { nextValue: value, nextCursor: cursorPos };

  const prefix = before.slice(0, before.length - word.length);
  const nextValue = `${prefix}${adjusted}${after}`;
  const nextCursor = prefix.length + adjusted.length;
  return { nextValue, nextCursor };
}

function shouldAutoCapitalize(value: string, cursorPos: number): boolean {
  const before = value.slice(0, cursorPos);
  if (before.trim().length === 0) return true;
  return /[.!?\n]\s+$/.test(before);
}

interface GifItem {
  id: string;
  title: string;
  tags: string;
  url: string;
}

interface LetChatKeyboardProps {
  visible: boolean;
  text: string;
  cursorPos: number;
  theme: KeyboardTheme;
  soundEnabled: boolean;
  vibrateEnabled: boolean;
  recordingVoice: boolean;
  onChangeText: (nextText: string, nextCursor: number) => void;
  onMoveCursor: (delta: number) => void;
  onSend: (finalText: string) => void;
  onSelectGif: (url: string, title: string) => void;
  onOpenStickers: () => void;
  onToggleVoiceRecord: () => void;
  onOpenVoiceFile: () => void;
  onCamera: () => void;
  onShareLocation: () => void;
  onDismiss: () => void;
}

export default function LetChatKeyboard({
  visible,
  text,
  cursorPos,
  theme,
  soundEnabled,
  vibrateEnabled,
  recordingVoice,
  onChangeText,
  onMoveCursor,
  onSend,
  onSelectGif,
  onOpenStickers,
  onToggleVoiceRecord,
  onOpenVoiceFile,
  onCamera,
  onShareLocation,
  onDismiss,
}: LetChatKeyboardProps) {
  const [mode, setMode] = useState<KeyboardMode>('abc');
  const [shiftMode, setShiftMode] = useState<ShiftMode>('once');
  const [emojiCat, setEmojiCat] = useState<EmojiCategoryId>('smileys');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [accentPopup, setAccentPopup] = useState<{ key: string; options: string[] } | null>(null);

  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<GifItem[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);

  const lastTapShiftRef = useRef(0);
  const keyGlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredKeyRef = useRef<string | null>(null);

  const backspaceHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceRepeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backspaceDidRepeatRef = useRef(false);

  const spaceDragStartXRef = useRef<number | null>(null);
  const spaceSwipeStepsAppliedRef = useRef(0);
  const [swipingSpace, setSwipingSpace] = useState(false);

  const {
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
  } = useSettings();

  const activeTheme = theme || keyboardTheme;
  const activeSound = soundEnabled ?? keyboardSoundEnabled;
  const activeVibrate = vibrateEnabled ?? keyboardVibrateEnabled;
  const isMini = keyboardSize === 'mini';

  const latestTextRef = useRef(text);
  const latestCursorRef = useRef(cursorPos);
  latestTextRef.current = text;
  latestCursorRef.current = cursorPos;

  useEffect(() => {
    if (!keyboardAutoCap) {
      setShiftMode((cur) => (cur === 'caps' ? 'caps' : 'off'));
      return;
    }
    if (shouldAutoCapitalize(text, cursorPos)) {
      setShiftMode((cur) => (cur === 'caps' ? 'caps' : 'once'));
    }
  }, [text, cursorPos, keyboardAutoCap]);

  useEffect(() => {
    if (mode !== 'gif') return;
    let active = true;
    setLoadingGifs(true);
    const controller = new AbortController();
    fetch(`/api/gifs/search?q=${encodeURIComponent(gifQuery.trim())}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data?.items)) {
          setGifResults(data.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingGifs(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [mode, gifQuery]);

  useEffect(() => {
    return () => {
      if (keyGlowTimerRef.current) clearTimeout(keyGlowTimerRef.current);
      if (longPressKeyTimerRef.current) clearTimeout(longPressKeyTimerRef.current);
      if (backspaceHoldTimerRef.current) clearTimeout(backspaceHoldTimerRef.current);
      if (backspaceRepeatRef.current) clearInterval(backspaceRepeatRef.current);
    };
  }, []);

  if (!visible) return null;

  const triggerFeedback = (keyId: string) => {
    setActiveKey(keyId);
    if (keyGlowTimerRef.current) clearTimeout(keyGlowTimerRef.current);
    keyGlowTimerRef.current = setTimeout(() => {
      setActiveKey((cur) => (cur === keyId ? null : cur));
    }, 150);

    playKeypressSound(activeSound);

    if (
      activeVibrate &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        navigator.vibrate(12);
      } catch {
        // ignore vibration failure
      }
    }
  };

  const insertCharAtCursor = (charToInsert: string, options?: { autoCorrectBefore?: boolean }) => {
    let baseText = latestTextRef.current;
    let baseCursor = Math.max(0, Math.min(latestCursorRef.current, baseText.length));

    if (options?.autoCorrectBefore && keyboardAutoCorrect) {
      const corrected = applyAutoCorrectAtCursor(baseText, baseCursor);
      baseText = corrected.nextValue;
      baseCursor = corrected.nextCursor;
    }

    const nextText = `${baseText.slice(0, baseCursor)}${charToInsert}${baseText.slice(baseCursor)}`;
    const nextCursor = baseCursor + charToInsert.length;
    onChangeText(nextText, nextCursor);

    if (mode === 'abc' && /^[a-zA-ZÀ-ÿ]$/.test(charToInsert)) {
      if (shiftMode === 'once') {
        setShiftMode('off');
      }
    } else if (keyboardAutoCap && shouldAutoCapitalize(nextText, nextCursor)) {
      setShiftMode((cur) => (cur === 'caps' ? 'caps' : 'once'));
    }
  };

  const deleteSingleChar = () => {
    const curText = latestTextRef.current;
    const curPos = Math.max(0, Math.min(latestCursorRef.current, curText.length));
    if (curPos <= 0) return;

    // Handle multi-codepoint emojis cleanly
    const prefix = curText.slice(0, curPos);
    const chars = Array.from(prefix);
    chars.pop();
    const nextPrefix = chars.join('');
    const nextText = `${nextPrefix}${curText.slice(curPos)}`;
    onChangeText(nextText, nextPrefix.length);
  };

  const deleteWholeWord = () => {
    const curText = latestTextRef.current;
    const curPos = Math.max(0, Math.min(latestCursorRef.current, curText.length));
    if (curPos <= 0) return;

    const before = curText.slice(0, curPos);
    const after = curText.slice(curPos);
    const stripped = before.replace(/\s*\S+\s*$/, '');
    const nextPrefix = stripped === before ? '' : stripped;
    onChangeText(`${nextPrefix}${after}`, nextPrefix.length);
  };

  const handleShiftPress = () => {
    triggerFeedback('shift');
    const now = Date.now();
    if (now - lastTapShiftRef.current < 320) {
      setShiftMode((cur) => (cur === 'caps' ? 'off' : 'caps'));
      lastTapShiftRef.current = 0;
      return;
    }
    lastTapShiftRef.current = now;
    setShiftMode((cur) => (cur === 'off' ? 'once' : 'off'));
  };

  const handleSendClick = () => {
    triggerFeedback('send');
    const finalText = keyboardAutoCorrect
      ? applyAutoCorrectAtCursor(latestTextRef.current, latestCursorRef.current).nextValue
      : latestTextRef.current;
    onSend(finalText);
  };

  const startKeyLongPress = (lowerKey: string) => {
    longPressTriggeredKeyRef.current = null;
    if (longPressKeyTimerRef.current) clearTimeout(longPressKeyTimerRef.current);
    const variants = KEY_LONG_PRESS_VARIANTS[lowerKey];
    if (!variants) return;

    longPressKeyTimerRef.current = setTimeout(() => {
      longPressTriggeredKeyRef.current = lowerKey;
      const isUpper = shiftMode !== 'off';
      const displayOpts = variants.map((v) =>
        isUpper && v.length === 1 && /[a-zà-ÿ]/i.test(v) ? v.toUpperCase() : v
      );
      setAccentPopup({ key: lowerKey, options: displayOpts });
    }, 360);
  };

  const endKeyPress = (lowerKey: string, outputChar: string) => {
    if (longPressKeyTimerRef.current) {
      clearTimeout(longPressKeyTimerRef.current);
      longPressKeyTimerRef.current = null;
    }
    if (longPressTriggeredKeyRef.current === lowerKey) {
      longPressTriggeredKeyRef.current = null;
      return;
    }
    setAccentPopup(null);
    triggerFeedback(lowerKey);
    insertCharAtCursor(outputChar);
  };

  const startBackspacePress = () => {
    backspaceDidRepeatRef.current = false;
    triggerFeedback('backspace');
    if (backspaceHoldTimerRef.current) clearTimeout(backspaceHoldTimerRef.current);
    if (backspaceRepeatRef.current) clearInterval(backspaceRepeatRef.current);

    backspaceHoldTimerRef.current = setTimeout(() => {
      backspaceDidRepeatRef.current = true;
      deleteWholeWord();
      backspaceRepeatRef.current = setInterval(() => {
        triggerFeedback('backspace');
        deleteWholeWord();
      }, 145);
    }, 380);
  };

  const endBackspacePress = () => {
    if (backspaceHoldTimerRef.current) {
      clearTimeout(backspaceHoldTimerRef.current);
      backspaceHoldTimerRef.current = null;
    }
    if (backspaceRepeatRef.current) {
      clearInterval(backspaceRepeatRef.current);
      backspaceRepeatRef.current = null;
    }
    if (!backspaceDidRepeatRef.current) {
      deleteSingleChar();
    }
    backspaceDidRepeatRef.current = false;
  };

  const cancelBackspaceHold = () => {
    if (backspaceHoldTimerRef.current) {
      clearTimeout(backspaceHoldTimerRef.current);
      backspaceHoldTimerRef.current = null;
    }
    if (backspaceRepeatRef.current) {
      clearInterval(backspaceRepeatRef.current);
      backspaceRepeatRef.current = null;
    }
  };

  // Theme tokens
  const themeStyles = (() => {
    switch (activeTheme) {
      case 'dark':
        return {
          shell: 'bg-[#121218]/95 backdrop-blur-xl border-t border-white/10 text-white',
          key: 'bg-white/12 hover:bg-white/20 text-white border border-white/10',
          fnKey: 'bg-white/20 hover:bg-white/28 text-white border border-white/15',
          activeGlow: 'bg-purple-500/60 shadow-[0_0_16px_rgba(168,85,247,0.85)] scale-105',
          sendBtn: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-[0_0_14px_rgba(236,72,153,0.45)]',
          topBarBtn: 'bg-white/10 hover:bg-white/20 text-white/90',
          popup: 'bg-[#1F1F2B] border border-white/20 text-white shadow-2xl',
        };
      case 'light':
        return {
          shell: 'bg-[#EAECEF]/95 backdrop-blur-xl border-t border-slate-300 text-slate-900',
          key: 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 shadow-[0_1px_0_rgba(0,0,0,0.16)]',
          fnKey: 'bg-[#D5DAE2] hover:bg-[#C7CDD8] text-slate-800 border border-slate-300/70',
          activeGlow: 'bg-purple-200 text-purple-950 shadow-[0_0_14px_rgba(168,85,247,0.55)] scale-105',
          sendBtn: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md',
          topBarBtn: 'bg-white/85 hover:bg-white text-slate-700 border border-slate-200',
          popup: 'bg-white border border-slate-300 text-slate-900 shadow-2xl',
        };
      case 'ghana':
        return {
          shell: 'bg-[#1B1303]/95 backdrop-blur-xl border-t-2 border-[#FCD116] text-amber-50',
          key: 'bg-amber-400/18 hover:bg-amber-400/28 text-amber-50 border border-amber-400/30',
          fnKey: 'bg-emerald-600/30 hover:bg-emerald-600/45 text-amber-100 border border-amber-400/35',
          activeGlow: 'bg-amber-400/55 text-black shadow-[0_0_16px_rgba(252,209,22,0.85)] scale-105',
          sendBtn: 'bg-gradient-to-r from-[#FCD116] via-[#22C55E] to-[#006B3F] text-black font-extrabold shadow-[0_0_14px_rgba(252,209,22,0.45)]',
          topBarBtn: 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-100 border border-amber-400/25',
          popup: 'bg-[#2A1D05] border border-[#FCD116]/60 text-amber-50 shadow-2xl',
        };
      case 'aurora':
      default:
        return {
          shell: 'bg-[#1A0033]/92 backdrop-blur-xl border-t border-purple-400/30 text-white',
          key: 'bg-white/15 hover:bg-white/22 text-white border border-white/15 backdrop-blur-sm',
          fnKey: 'bg-purple-500/28 hover:bg-purple-500/40 text-white border border-purple-300/20',
          activeGlow: 'bg-purple-500/65 shadow-[0_0_16px_rgba(168,85,247,0.9)] scale-105',
          sendBtn: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-[0_0_16px_rgba(236,72,153,0.5)]',
          topBarBtn: 'bg-white/12 hover:bg-purple-500/30 text-white border border-white/10',
          popup: 'bg-[#29064F]/95 border border-purple-400/50 text-white shadow-2xl backdrop-blur-xl',
        };
    }
  })();

  const topTools = [
    { id: 'mic', label: recordingVoice ? 'Stop' : 'Mic', icon: Mic, onClick: onToggleVoiceRecord, active: recordingVoice },
    { id: 'sticker', label: 'Sticker', icon: Sticker, onClick: onOpenStickers, active: false },
    {
      id: 'gif',
      label: 'GIF',
      icon: Film,
      onClick: () => setMode((m) => (m === 'gif' ? 'abc' : 'gif')),
      active: mode === 'gif',
    },
    { id: 'voice', label: 'Voice Note', icon: Volume2, onClick: onOpenVoiceFile, active: false },
    { id: 'camera', label: 'Camera', icon: Camera, onClick: onCamera, active: false },
    { id: 'location', label: 'Location', icon: MapPin, onClick: onShareLocation, active: false },
  ];

  const isUpper = shiftMode !== 'off';
  const hasText = text.trim().length > 0;
  const keyHeightClass = isMini
    ? 'h-[29px] rounded-[7px] text-[13.5px]'
    : 'h-[34px] rounded-[8px] text-[14.5px]';
  const containerWidthClass = isMini ? 'max-w-[390px]' : 'max-w-[420px]';

  return (
    <div
      className={`relative z-30 select-none w-full rounded-t-[18px] shadow-[0_-6px_22px_rgba(0,0,0,0.2)] transition-all duration-200 ${themeStyles.shell}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Kente Woven Accent Strip for Ghana theme */}
      {activeTheme === 'ghana' && (
        <div className="h-1 w-full rounded-t-[18px] overflow-hidden flex">
          <div className="flex-1 bg-[#CE1126]" />
          <div className="flex-1 bg-[#FCD116]" />
          <div className="flex-1 bg-[#006B3F]" />
        </div>
      )}

      <div className={`w-full ${containerWidthClass} mx-auto`}>
        {/* Top Personalized Utility Bar with Built-In Keyboard Settings */}
        <div className="flex items-center gap-1 px-1.5 pt-1 pb-1 overflow-x-auto no-scrollbar">
          {topTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  triggerFeedback(`tool-${tool.id}`);
                  tool.onClick();
                }}
                className={`flex items-center gap-1 px-1.5 min-h-[26px] rounded-[7px] text-[10px] font-semibold shrink-0 transition active:scale-95 ${
                  tool.active
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                    : themeStyles.topBarBtn
                }`}
              >
                <Icon size={11} />
                <span className="whitespace-nowrap">{tool.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              triggerFeedback('kb-settings');
              setMode((m) => (m === 'settings' ? 'abc' : 'settings'));
            }}
            className={`ml-auto min-h-[26px] min-w-[26px] flex items-center justify-center rounded-[7px] shrink-0 transition ${
              mode === 'settings' ? themeStyles.activeGlow : themeStyles.topBarBtn
            }`}
            title="Keyboard Settings"
            aria-label="Keyboard Settings"
          >
            <Settings size={13} />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className={`min-h-[26px] min-w-[26px] flex items-center justify-center rounded-[7px] shrink-0 transition ${themeStyles.topBarBtn}`}
            title="Hide Keyboard"
            aria-label="Hide Keyboard"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Built-In Keyboard Settings Panel */}
        {mode === 'settings' && (
          <div className="px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-bold tracking-tight">Keyboard Settings</span>
              <button
                type="button"
                onClick={() => setMode('abc')}
                className={`px-2.5 min-h-[26px] rounded-[7px] text-[10.5px] font-bold ${themeStyles.sendBtn}`}
              >
                Done
              </button>
            </div>

            {/* Theme Pills */}
            <div className="space-y-1">
              <p className="text-[10px] opacity-75 font-semibold">Theme</p>
              <div className="grid grid-cols-4 gap-1">
                {(['aurora', 'dark', 'light', 'ghana'] as KeyboardTheme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      triggerFeedback(`theme-${t}`);
                      setKeyboardTheme(t);
                    }}
                    className={`min-h-[28px] rounded-[7px] capitalize font-bold transition ${
                      activeTheme === t ? themeStyles.sendBtn : themeStyles.key
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Size Pills */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] opacity-75 font-semibold">Keyboard Size</span>
              <div className="grid grid-cols-2 gap-1 w-40">
                {(['compact', 'mini'] as KeyboardSize[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      triggerFeedback(`size-${sz}`);
                      setKeyboardSize(sz);
                    }}
                    className={`min-h-[26px] rounded-[7px] font-bold transition ${
                      keyboardSize === sz ? themeStyles.sendBtn : themeStyles.key
                    }`}
                  >
                    {sz === 'compact' ? 'Small' : 'Mini'}
                  </button>
                ))}
              </div>
            </div>

            {/* Behavior Toggles */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setKeyboardSoundEnabled(!activeSound)}
                className={`min-h-[28px] px-2 rounded-[7px] flex items-center justify-between font-semibold ${themeStyles.key}`}
              >
                <span>Key Sound</span>
                <span className="font-bold opacity-90">{activeSound ? 'ON' : 'OFF'}</span>
              </button>
              <button
                type="button"
                onClick={() => setKeyboardVibrateEnabled(!activeVibrate)}
                className={`min-h-[28px] px-2 rounded-[7px] flex items-center justify-between font-semibold ${themeStyles.key}`}
              >
                <span>Vibration</span>
                <span className="font-bold opacity-90">{activeVibrate ? 'ON' : 'OFF'}</span>
              </button>
              <button
                type="button"
                onClick={() => setKeyboardAutoCap(!keyboardAutoCap)}
                className={`min-h-[28px] px-2 rounded-[7px] flex items-center justify-between font-semibold ${themeStyles.key}`}
              >
                <span>Auto-Caps</span>
                <span className="font-bold opacity-90">{keyboardAutoCap ? 'ON' : 'OFF'}</span>
              </button>
              <button
                type="button"
                onClick={() => setKeyboardAutoCorrect(!keyboardAutoCorrect)}
                className={`min-h-[28px] px-2 rounded-[7px] flex items-center justify-between font-semibold ${themeStyles.key}`}
              >
                <span>Auto-Correct</span>
                <span className="font-bold opacity-90">{keyboardAutoCorrect ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        )}

        {/* GIF Search View */}
        {mode === 'gif' && (
          <div className="px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                placeholder="Search GIFs (happy, ghana, love, fire...)"
                className={`flex-1 px-2.5 min-h-[32px] rounded-[8px] text-xs outline-none ${
                  activeTheme === 'light'
                    ? 'bg-white text-slate-900 border border-slate-300'
                    : 'bg-white/15 text-white placeholder:text-white/60 border border-white/15'
                }`}
              />
              <button
                type="button"
                onClick={() => setMode('abc')}
                className={`px-2.5 min-h-[32px] rounded-[8px] text-[11px] font-bold flex items-center gap-1 ${themeStyles.fnKey}`}
              >
                <X size={13} /> ABC
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {['', 'love', 'funny', 'fire', 'ghana', 'football'].map((tag) => (
                <button
                  key={tag || 'all'}
                  type="button"
                  onClick={() => setGifQuery(tag)}
                  className={`px-2 py-0.5 rounded-[7px] text-[10.5px] font-semibold capitalize shrink-0 ${
                    gifQuery === tag
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                      : themeStyles.topBarBtn
                  }`}
                >
                  {tag || 'Trending'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-h-[124px] overflow-y-auto pr-0.5">
              {loadingGifs ? (
                <p className="col-span-3 text-center text-xs opacity-70 py-5">Loading GIFs...</p>
              ) : gifResults.length === 0 ? (
                <p className="col-span-3 text-center text-xs opacity-70 py-5">No GIFs matched.</p>
              ) : (
                gifResults.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => {
                      triggerFeedback(`gif-${gif.id}`);
                      onSelectGif(gif.url, gif.title);
                    }}
                    className="rounded-[8px] overflow-hidden border border-white/15 hover:scale-[1.03] active:scale-95 transition bg-black/20"
                  >
                    <img
                      src={gif.url}
                      alt={gif.title}
                      className="w-full h-16 object-cover block"
                      loading="lazy"
                    />
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Emoji Keyboard View */}
        {mode === 'emoji' && (
          <div className="px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    triggerFeedback(`ecat-${cat.id}`);
                    setEmojiCat(cat.id);
                  }}
                  className={`flex-1 min-h-[30px] rounded-[8px] text-base flex items-center justify-center transition ${
                    emojiCat === cat.id ? themeStyles.activeGlow : themeStyles.topBarBtn
                  }`}
                  title={cat.label}
                >
                  {cat.icon}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-8 gap-0.5 max-h-[116px] overflow-y-auto py-0.5">
              {(EMOJI_CATEGORIES.find((c) => c.id === emojiCat)?.items || []).map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    triggerFeedback(`em-${em}`);
                    insertCharAtCursor(em);
                  }}
                  className="h-8 text-lg rounded-[7px] flex items-center justify-center hover:bg-white/15 active:scale-125 transition"
                >
                  {em}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  triggerFeedback('abc-from-emoji');
                  setMode('abc');
                }}
                className={`px-3 h-9 rounded-[8px] text-[11px] font-bold ${themeStyles.fnKey}`}
              >
                ABC
              </button>
              <button
                type="button"
                onPointerDown={startBackspacePress}
                onPointerUp={endBackspacePress}
                onPointerCancel={cancelBackspaceHold}
                onPointerLeave={cancelBackspaceHold}
                className={`px-3 h-9 rounded-[8px] flex items-center justify-center ${themeStyles.fnKey}`}
                aria-label="Backspace"
              >
                <Delete size={16} />
              </button>
              <button
                type="button"
                onClick={handleSendClick}
                disabled={!hasText}
                className={`flex-1 h-9 rounded-[8px] text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 ${themeStyles.sendBtn}`}
              >
                <Send size={13} /> Send
              </button>
            </div>
          </div>
        )}

        {/* Main Letters / Symbols Keyboard */}
        {(mode === 'abc' || mode === '123') && (
          <div className="px-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))] space-y-1 relative">
            {/* Accent Popup Overlay */}
            {accentPopup && (
              <div className="px-2 pb-0.5 flex justify-center">
                <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg ${themeStyles.popup}`}>
                  {accentPopup.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        triggerFeedback(`acc-${opt}`);
                        insertCharAtCursor(opt);
                        setAccentPopup(null);
                      }}
                      className="min-w-[28px] min-h-[28px] px-1 rounded-md text-sm font-semibold hover:bg-purple-500/40"
                    >
                      {opt}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAccentPopup(null)}
                    className="ml-0.5 p-1 opacity-70 hover:opacity-100"
                    aria-label="Close accents"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}

            {mode === 'abc' ? (
              <>
                {/* Row 1: Q W E R T Y U I O P */}
                <div className="grid grid-cols-10 gap-1">
                  {LETTER_ROWS[0].map((k) => {
                    const char = isUpper ? k.toUpperCase() : k;
                    const glow = activeKey === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onPointerDown={() => startKeyLongPress(k)}
                        onPointerUp={() => endKeyPress(k, char)}
                        onPointerCancel={() => {
                          if (longPressKeyTimerRef.current) clearTimeout(longPressKeyTimerRef.current);
                        }}
                        className={`${keyHeightClass} font-medium flex items-center justify-center transition duration-100 ${
                          glow ? themeStyles.activeGlow : themeStyles.key
                        }`}
                      >
                        {char}
                      </button>
                    );
                  })}
                </div>

                {/* Row 2: A S D F G H J K L */}
                <div className="px-3.5 grid grid-cols-9 gap-1">
                  {LETTER_ROWS[1].map((k) => {
                    const char = isUpper ? k.toUpperCase() : k;
                    const glow = activeKey === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onPointerDown={() => startKeyLongPress(k)}
                        onPointerUp={() => endKeyPress(k, char)}
                        onPointerCancel={() => {
                          if (longPressKeyTimerRef.current) clearTimeout(longPressKeyTimerRef.current);
                        }}
                        className={`${keyHeightClass} font-medium flex items-center justify-center transition duration-100 ${
                          glow ? themeStyles.activeGlow : themeStyles.key
                        }`}
                      >
                        {char}
                      </button>
                    );
                  })}
                </div>

                {/* Row 3: Shift | Z X C V B N M | Backspace */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleShiftPress}
                    className={`w-[13%] ${keyHeightClass} flex items-center justify-center transition ${
                      shiftMode === 'caps'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                        : shiftMode === 'once'
                          ? themeStyles.activeGlow
                          : themeStyles.fnKey
                    }`}
                    aria-label="Shift"
                    title="Tap for Shift, double-tap for Caps Lock"
                  >
                    {shiftMode === 'caps' ? <ArrowBigUpDash size={17} /> : <ArrowBigUp size={17} />}
                  </button>
                  <div className="flex-1 grid grid-cols-7 gap-1">
                    {LETTER_ROWS[2].map((k) => {
                      const char = isUpper ? k.toUpperCase() : k;
                      const glow = activeKey === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onPointerDown={() => startKeyLongPress(k)}
                          onPointerUp={() => endKeyPress(k, char)}
                          onPointerCancel={() => {
                            if (longPressKeyTimerRef.current) clearTimeout(longPressKeyTimerRef.current);
                          }}
                          className={`${keyHeightClass} font-medium flex items-center justify-center transition duration-100 ${
                            glow ? themeStyles.activeGlow : themeStyles.key
                          }`}
                        >
                          {char}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onPointerDown={startBackspacePress}
                    onPointerUp={endBackspacePress}
                    onPointerCancel={cancelBackspaceHold}
                    onPointerLeave={cancelBackspaceHold}
                    className={`w-[13%] ${keyHeightClass} flex items-center justify-center transition ${
                      activeKey === 'backspace' ? themeStyles.activeGlow : themeStyles.fnKey
                    }`}
                    aria-label="Backspace (hold to delete word)"
                    title="Tap to delete, hold to delete word"
                  >
                    <Delete size={16} />
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* 123 / Symbols Row 1 */}
                <div className="grid grid-cols-10 gap-1">
                  {SYMBOL_ROWS[0].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        triggerFeedback(k);
                        insertCharAtCursor(k);
                      }}
                      className={`${keyHeightClass} font-medium flex items-center justify-center transition ${
                        activeKey === k ? themeStyles.activeGlow : themeStyles.key
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                {/* 123 / Symbols Row 2 */}
                <div className="grid grid-cols-10 gap-1">
                  {SYMBOL_ROWS[1].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        triggerFeedback(k);
                        insertCharAtCursor(k);
                      }}
                      className={`${keyHeightClass} font-medium flex items-center justify-center transition ${
                        activeKey === k ? themeStyles.activeGlow : themeStyles.key
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                {/* 123 / Symbols Row 3 */}
                <div className="flex items-center gap-1">
                  <div className="flex-1 grid grid-cols-9 gap-1">
                    {SYMBOL_ROWS[2].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          triggerFeedback(k);
                          insertCharAtCursor(k);
                        }}
                        className={`${keyHeightClass} font-medium flex items-center justify-center transition ${
                          activeKey === k ? themeStyles.activeGlow : themeStyles.key
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onPointerDown={startBackspacePress}
                    onPointerUp={endBackspacePress}
                    onPointerCancel={cancelBackspaceHold}
                    onPointerLeave={cancelBackspaceHold}
                    className={`w-[13%] ${keyHeightClass} flex items-center justify-center transition ${
                      activeKey === 'backspace' ? themeStyles.activeGlow : themeStyles.fnKey
                    }`}
                    aria-label="Backspace"
                  >
                    <Delete size={16} />
                  </button>
                </div>
              </>
            )}

            {/* Bottom Bar: [123/ABC] [Emoji] [Space - Swipe Cursor] [ . ] [Send Gradient] */}
            <div className="flex items-center gap-1 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  triggerFeedback('mode-num');
                  setMode((m) => (m === '123' ? 'abc' : '123'));
                }}
                className={`w-[14%] ${keyHeightClass} !text-[11px] font-bold flex items-center justify-center transition ${themeStyles.fnKey}`}
              >
                {mode === '123' ? 'ABC' : '123'}
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerFeedback('emoji-mode');
                  setMode('emoji');
                }}
                className={`w-[11%] ${keyHeightClass} flex items-center justify-center transition ${themeStyles.fnKey}`}
                aria-label="Emoji Keyboard"
              >
                <Smile size={15} />
              </button>

              {/* Space Bar with Swipe-to-Move Cursor */}
              <button
                type="button"
                onPointerDown={(e) => {
                  spaceDragStartXRef.current = e.clientX;
                  spaceSwipeStepsAppliedRef.current = 0;
                  setSwipingSpace(false);
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (spaceDragStartXRef.current === null) return;
                  const dx = e.clientX - spaceDragStartXRef.current;
                  const totalSteps = Math.trunc(dx / 14);
                  const diff = totalSteps - spaceSwipeStepsAppliedRef.current;
                  if (diff !== 0) {
                    setSwipingSpace(true);
                    spaceSwipeStepsAppliedRef.current = totalSteps;
                    onMoveCursor(diff);
                  }
                }}
                onPointerUp={() => {
                  const didSwipe = spaceSwipeStepsAppliedRef.current !== 0;
                  spaceDragStartXRef.current = null;
                  spaceSwipeStepsAppliedRef.current = 0;
                  setSwipingSpace(false);
                  if (!didSwipe) {
                    triggerFeedback('space');
                    insertCharAtCursor(' ', { autoCorrectBefore: true });
                  }
                }}
                onPointerCancel={() => {
                  spaceDragStartXRef.current = null;
                  spaceSwipeStepsAppliedRef.current = 0;
                  setSwipingSpace(false);
                }}
                className={`flex-1 ${keyHeightClass} !text-[11px] font-medium flex items-center justify-center transition touch-none ${
                  swipingSpace || activeKey === 'space' ? themeStyles.activeGlow : themeStyles.key
                }`}
                title="Tap for space, swipe left/right to move cursor"
              >
                {swipingSpace ? '‹ · · · ›' : 'LetChat'}
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerFeedback('dot');
                  insertCharAtCursor('.', { autoCorrectBefore: true });
                }}
                className={`w-[10%] ${keyHeightClass} font-bold flex items-center justify-center transition ${
                  activeKey === 'dot' ? themeStyles.activeGlow : themeStyles.key
                }`}
                aria-label="Period"
              >
                .
              </button>

              <button
                type="button"
                onClick={handleSendClick}
                disabled={!hasText}
                className={`w-[18%] ${keyHeightClass} !text-[11px] font-bold flex items-center justify-center gap-1 transition active:scale-95 disabled:opacity-50 ${themeStyles.sendBtn}`}
                aria-label="Send message"
              >
                <Send size={12} />
                <span>Send</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
