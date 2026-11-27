import React, { createContext, useCallback, useContext, useState } from 'react';
import LetChatKeyboard from '../components/Chats/LetChatKeyboard';
import { useSettings } from './SettingsContext';

export interface ActiveKeyboardField {
  id: string;
  label?: string;
  placeholder?: string;
  text: string;
  cursorPos?: number;
  sendLabel?: string;
  allowEmptySubmit?: boolean;
  onChange: (nextText: string) => void;
  onSubmit?: (finalText: string) => void;
}

interface KeyboardContextValue {
  activeField: ActiveKeyboardField | null;
  openKeyboard: (field: ActiveKeyboardField) => void;
  syncFieldText: (id: string, text: string) => void;
  closeKeyboard: (id?: string) => void;
}

const KeyboardContext = createContext<KeyboardContextValue>({
  activeField: null,
  openKeyboard: () => {},
  syncFieldText: () => {},
  closeKeyboard: () => {},
});

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [activeField, setActiveField] = useState<ActiveKeyboardField | null>(null);
  const [cursorPos, setCursorPos] = useState<number>(0);

  const openKeyboard = useCallback((field: ActiveKeyboardField) => {
    setActiveField(field);
    setCursorPos(
      typeof field.cursorPos === 'number'
        ? Math.max(0, Math.min(field.text.length, field.cursorPos))
        : field.text.length
    );
  }, []);

  const syncFieldText = useCallback((id: string, text: string) => {
    setActiveField((prev) => (prev && prev.id === id ? { ...prev, text } : prev));
    setCursorPos((pos) => Math.min(pos, text.length));
  }, []);

  const closeKeyboard = useCallback((id?: string) => {
    setActiveField((prev) => {
      if (!prev) return null;
      if (id && prev.id !== id) return prev;
      return null;
    });
  }, []);

  return (
    <KeyboardContext.Provider
      value={{ activeField, openKeyboard, syncFieldText, closeKeyboard }}
    >
      {children}
      <GlobalFlowKeyboardDock
        activeField={activeField}
        cursorPos={cursorPos}
        setCursorPos={setCursorPos}
        setActiveField={setActiveField}
        onClose={() => setActiveField(null)}
      />
    </KeyboardContext.Provider>
  );
}

function GlobalFlowKeyboardDock({
  activeField,
  cursorPos,
  setCursorPos,
  setActiveField,
  onClose,
}: {
  activeField: ActiveKeyboardField | null;
  cursorPos: number;
  setCursorPos: React.Dispatch<React.SetStateAction<number>>;
  setActiveField: React.Dispatch<React.SetStateAction<ActiveKeyboardField | null>>;
  onClose: () => void;
}) {
  const { keyboardTheme, keyboardSoundEnabled, keyboardVibrateEnabled } = useSettings();

  if (!activeField) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex flex-col bg-black/55 backdrop-blur-md">
      {/* Live Field Preview Bar above keyboard so target input is always readable */}
      <div className="px-3 py-2 bg-[#12121A]/95 border-t border-white/15 flex items-center gap-2 text-white">
        <div className="flex-1 min-w-0">
          {activeField.label && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#00E5FF] mb-0.5 truncate">
              {activeField.label}
            </p>
          )}
          <div className="px-3 py-1.5 rounded-xl bg-white/[0.08] border border-[#7C3AED]/50 text-sm text-white min-h-[34px] max-h-20 overflow-y-auto whitespace-pre-wrap break-words">
            {activeField.text.length === 0 ? (
              <span className="text-zinc-400">
                <span className="inline-block w-[2px] h-4 bg-[#00E5FF] align-middle animate-pulse mr-1" />
                {activeField.placeholder || 'Type with FLOW Keyboard...'}
              </span>
            ) : (
              <>
                <span>{activeField.text.slice(0, cursorPos)}</span>
                <span className="inline-block w-[2px] h-4 bg-[#00E5FF] align-middle animate-pulse mx-[0.5px]" />
                <span>{activeField.text.slice(cursorPos)}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            activeField.onSubmit?.(activeField.text);
            onClose();
          }}
          className="px-3 min-h-[34px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-bold shrink-0"
        >
          {activeField.sendLabel || 'Done'}
        </button>
      </div>

      <LetChatKeyboard
        visible
        compactMode
        sendLabel={activeField.sendLabel || 'Done'}
        allowEmptySend={activeField.allowEmptySubmit ?? true}
        text={activeField.text}
        cursorPos={cursorPos}
        theme={keyboardTheme}
        soundEnabled={keyboardSoundEnabled}
        vibrateEnabled={keyboardVibrateEnabled}
        recordingVoice={false}
        onChangeText={(nextText, nextCursor) => {
          setCursorPos(nextCursor);
          setActiveField((prev) => (prev ? { ...prev, text: nextText } : prev));
          activeField.onChange(nextText);
        }}
        onMoveCursor={(delta) => {
          setCursorPos((cur) => Math.max(0, Math.min(activeField.text.length, cur + delta)));
        }}
        onSend={(finalText) => {
          activeField.onChange(finalText);
          activeField.onSubmit?.(finalText);
          onClose();
        }}
        onSelectGif={() => {}}
        onOpenStickers={() => {}}
        onToggleVoiceRecord={() => {}}
        onOpenVoiceFile={() => {}}
        onCamera={() => {}}
        onShareLocation={() => {}}
        onDismiss={onClose}
      />
    </div>
  );
}

export const useFlowKeyboard = () => useContext(KeyboardContext);
