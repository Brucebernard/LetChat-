const SOUND_SETTING_KEY = 'letchat_message_sounds';

const SEND_SOUND_URL = '/sounds/send.mp3';
const RECEIVE_SOUND_URL = '/sounds/receive.mp3';

let sendAudio: HTMLAudioElement | null = null;
let receiveAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let audioUnlocked = false;
let preloaded = false;

const seenIncomingMessageIds = new Set<string>();

export function isMessageSoundsEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_SETTING_KEY) !== 'false';
  } catch {
    return true;
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      audioCtx = new Ctor();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function createPreloadedAudio(src: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.volume = 0.55;
  try {
    audio.load();
  } catch {
    // ignore preload errors in restricted environments
  }
  return audio;
}

function playFallbackPop(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.08);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  } catch {
    // ignore Web Audio failure
  }
}

function playFallbackDing(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const playTone = (freq: number, startOffset: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peak, now + startOffset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + dur + 0.01);
    };
    playTone(1318.51, 0, 0.16, 0.16);
    playTone(1760.0, 0.08, 0.22, 0.2);
  } catch {
    // ignore Web Audio failure
  }
}

export function unlockAudioOnFirstInteraction(): void {
  if (typeof window === 'undefined' || audioUnlocked) return;

  const unlock = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;

    getAudioContext();
    preloadMessageSounds();

    const silentPrime = (audio: HTMLAudioElement | null) => {
      if (!audio) return;
      const prevVolume = audio.volume;
      audio.muted = true;
      audio.volume = 0;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audio.volume = prevVolume;
        }).catch(() => {
          audio.muted = false;
          audio.volume = prevVolume;
          audioUnlocked = false;
        });
      } else {
        audio.muted = false;
        audio.volume = prevVolume;
      }
    };

    silentPrime(sendAudio);
    silentPrime(receiveAudio);

    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

export function preloadMessageSounds(): void {
  if (typeof window === 'undefined') return;
  if (!sendAudio) sendAudio = createPreloadedAudio(SEND_SOUND_URL);
  if (!receiveAudio) receiveAudio = createPreloadedAudio(RECEIVE_SOUND_URL);
  if (!preloaded) {
    preloaded = true;
    unlockAudioOnFirstInteraction();
  }
}

export function playSendSound(): void {
  if (!isMessageSoundsEnabled()) return;
  preloadMessageSounds();
  getAudioContext();

  if (sendAudio) {
    try {
      sendAudio.muted = false;
      sendAudio.volume = 0.55;
      sendAudio.currentTime = 0;
      const playPromise = sendAudio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          playFallbackPop();
        });
      }
      return;
    } catch {
      // fall through to Web Audio pop
    }
  }
  playFallbackPop();
}

export function playReceiveSound(options?: { vibrate?: boolean; messageId?: string }): void {
  if (options?.messageId) {
    if (seenIncomingMessageIds.has(options.messageId)) return;
    seenIncomingMessageIds.add(options.messageId);
    if (seenIncomingMessageIds.size > 300) {
      const oldest = seenIncomingMessageIds.values().next().value;
      if (oldest) seenIncomingMessageIds.delete(oldest);
    }
  }

  if (options?.vibrate !== false && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      const isBg = typeof document !== 'undefined' && document.hidden;
      navigator.vibrate(isBg ? [80, 40, 80] : 50);
    } catch {
      // ignore vibration errors on unsupported devices
    }
  }

  if (!isMessageSoundsEnabled()) return;
  preloadMessageSounds();
  getAudioContext();

  if (receiveAudio) {
    try {
      receiveAudio.muted = false;
      receiveAudio.volume = 0.55;
      receiveAudio.currentTime = 0;
      const playPromise = receiveAudio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          playFallbackDing();
        });
      }
      return;
    } catch {
      // fall through to Web Audio ding
    }
  }
  playFallbackDing();
}

export function playRecordStartBeep(): void {
  if (!isMessageSoundsEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    // ignore Web Audio failure
  }
}

export function notifyBackgroundIncomingMessage(params: {
  messageId?: string;
  senderName: string;
  preview: string;
  chatId?: string;
}): void {
  playReceiveSound({ messageId: params.messageId, vibrate: true });

  if (typeof document === 'undefined' || !document.hidden) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(params.senderName || 'New message', {
        body: params.preview || 'Sent you a message',
        tag: params.chatId || 'letchat-message',
      });
    } catch {
      // ignore notification construction errors in embedded contexts
    }
  }
}
