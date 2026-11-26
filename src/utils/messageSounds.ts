const SOUND_SETTING_KEY = 'letchat_message_sounds';
const CHAT_TONE_KEY = 'letchat_chat_tone';
const VOICE_CALL_TONE_KEY = 'letchat_voice_call_tone';
const VIDEO_CALL_TONE_KEY = 'letchat_video_call_tone';

const SEND_SOUND_URL = '/sounds/send.mp3';
const RECEIVE_SOUND_URL = '/sounds/receive.mp3';

export type ChatToneId =
  | 'classic'
  | 'wechat'
  | 'chime'
  | 'marimba'
  | 'bell'
  | 'pulse'
  | 'silent';

export type CallToneId =
  | 'classic_ring'
  | 'kalimba'
  | 'radar'
  | 'galaxy'
  | 'digital'
  | 'horizon'
  | 'crystal_wave'
  | 'marimba_groove'
  | 'aurora_bell'
  | 'gentle'
  | 'silent';

export interface ToneOption<T extends string> {
  id: T;
  name: string;
  description: string;
}

export const CHAT_TONE_OPTIONS: ToneOption<ChatToneId>[] = [
  { id: 'classic', name: 'LetChat Ding', description: 'Bright signature two-note chime' },
  { id: 'wechat', name: 'Bubble Pop', description: 'Soft double bubble pop' },
  { id: 'chime', name: 'Crystal Chime', description: 'Warm harmonic triad' },
  { id: 'marimba', name: 'Marimba Tap', description: 'Crisp wooden melody' },
  { id: 'bell', name: 'Glass Bell', description: 'Clear resonant bell shimmer' },
  { id: 'pulse', name: 'Digital Pulse', description: 'Clean modern blip' },
  { id: 'silent', name: 'Silent (Vibrate)', description: 'Mute message audio tones' },
];

export const CALL_TONE_OPTIONS: ToneOption<CallToneId>[] = [
  { id: 'kalimba', name: 'Kalimba Breeze', description: 'Warm thumb-piano arpeggio' },
  { id: 'horizon', name: 'Horizon Uplift', description: 'Bright upbeat 4-note melody' },
  { id: 'classic_ring', name: 'Classic Ring', description: 'Traditional dual-tone telephone ring' },
  { id: 'crystal_wave', name: 'Crystal Wave', description: 'Sparkling cascading notes' },
  { id: 'marimba_groove', name: 'Marimba Groove', description: 'Lively rhythmic marimba motif' },
  { id: 'radar', name: 'Radar Pulse', description: 'Modern rising ring pattern' },
  { id: 'aurora_bell', name: 'Aurora Bell', description: 'Ethereal bell sweep' },
  { id: 'galaxy', name: 'Starlight Harp', description: 'Gentle ascending harp chord' },
  { id: 'digital', name: 'Retro Digital', description: 'Crisp classic trill' },
  { id: 'gentle', name: 'Soft Chime', description: 'Calm minimal 2-note ring' },
  { id: 'silent', name: 'Silent', description: 'No ringtone audio' },
];

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

export function getSelectedChatTone(): ChatToneId {
  try {
    const val = localStorage.getItem(CHAT_TONE_KEY);
    if (CHAT_TONE_OPTIONS.some((t) => t.id === val)) {
      return val as ChatToneId;
    }
  } catch {
    // ignore
  }
  return 'classic';
}

export function getSelectedVoiceCallTone(): CallToneId {
  try {
    const val = localStorage.getItem(VOICE_CALL_TONE_KEY);
    if (CALL_TONE_OPTIONS.some((t) => t.id === val)) {
      return val as CallToneId;
    }
  } catch {
    // ignore
  }
  return 'kalimba';
}

export function getSelectedVideoCallTone(): CallToneId {
  try {
    const val = localStorage.getItem(VIDEO_CALL_TONE_KEY);
    if (CALL_TONE_OPTIONS.some((t) => t.id === val)) {
      return val as CallToneId;
    }
  } catch {
    // ignore
  }
  return 'horizon';
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

function scheduleNote(
  ctx: AudioContext,
  opts: {
    freq: number;
    endFreq?: number;
    startOffset: number;
    duration: number;
    peak: number;
    type?: OscillatorType;
  }
): void {
  const now = ctx.currentTime + opts.startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type || 'sine';
  osc.frequency.setValueAtTime(opts.freq, now);
  if (opts.endFreq && opts.endFreq !== opts.freq) {
    osc.frequency.exponentialRampToValueAtTime(opts.endFreq, now + opts.duration);
  }
  gain.gain.setValueAtTime(0.0008, now);
  gain.gain.linearRampToValueAtTime(opts.peak, now + Math.min(0.015, opts.duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0008, now + opts.duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + opts.duration + 0.02);
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
    scheduleNote(ctx, {
      freq: 360,
      endFreq: 820,
      startOffset: 0,
      duration: 0.16,
      peak: 0.18,
      type: 'sine',
    });
  } catch {
    // ignore Web Audio failure
  }
}

function playFallbackDing(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    scheduleNote(ctx, { freq: 1318.51, startOffset: 0, duration: 0.16, peak: 0.16, type: 'sine' });
    scheduleNote(ctx, { freq: 1760.0, startOffset: 0.08, duration: 0.22, peak: 0.2, type: 'sine' });
  } catch {
    // ignore Web Audio failure
  }
}

export function playSynthChatTone(toneId: ChatToneId): void {
  if (toneId === 'silent') return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    switch (toneId) {
      case 'wechat':
        scheduleNote(ctx, { freq: 520, endFreq: 960, startOffset: 0, duration: 0.09, peak: 0.16, type: 'sine' });
        scheduleNote(ctx, { freq: 720, endFreq: 1220, startOffset: 0.08, duration: 0.11, peak: 0.18, type: 'sine' });
        break;
      case 'chime':
        scheduleNote(ctx, { freq: 1046.5, startOffset: 0, duration: 0.22, peak: 0.14, type: 'triangle' });
        scheduleNote(ctx, { freq: 1318.51, startOffset: 0.07, duration: 0.24, peak: 0.15, type: 'triangle' });
        scheduleNote(ctx, { freq: 1567.98, startOffset: 0.14, duration: 0.28, peak: 0.16, type: 'sine' });
        break;
      case 'marimba':
        scheduleNote(ctx, { freq: 659.25, startOffset: 0, duration: 0.11, peak: 0.2, type: 'triangle' });
        scheduleNote(ctx, { freq: 987.77, startOffset: 0.09, duration: 0.16, peak: 0.18, type: 'triangle' });
        break;
      case 'bell':
        scheduleNote(ctx, { freq: 1567.98, startOffset: 0, duration: 0.38, peak: 0.17, type: 'sine' });
        scheduleNote(ctx, { freq: 3135.96, startOffset: 0, duration: 0.2, peak: 0.06, type: 'sine' });
        break;
      case 'pulse':
        scheduleNote(ctx, { freq: 880, endFreq: 1174.66, startOffset: 0, duration: 0.12, peak: 0.15, type: 'sine' });
        break;
      case 'classic':
      default:
        playFallbackDing();
        break;
    }
  } catch {
    // ignore Web Audio failure
  }
}

export function previewChatTone(toneId: ChatToneId): void {
  preloadMessageSounds();
  getAudioContext();
  if (toneId === 'classic' && receiveAudio) {
    try {
      receiveAudio.muted = false;
      receiveAudio.volume = 0.55;
      receiveAudio.currentTime = 0;
      const p = receiveAudio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => playFallbackDing());
      }
      return;
    } catch {
      // fall through
    }
  }
  playSynthChatTone(toneId);
}

export function playCallRingtoneCycle(
  toneId: CallToneId,
  role: 'caller' | 'receiver' = 'receiver',
  targetCtx?: AudioContext | null
): void {
  if (toneId === 'silent') return;
  const ctx = targetCtx || getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  const volScale = role === 'caller' ? 0.55 : 1.0;

  try {
    switch (toneId) {
      case 'classic_ring':
        for (let i = 0; i < 2; i++) {
          const offset = i * 0.36;
          scheduleNote(ctx, { freq: 440, startOffset: offset, duration: 0.24, peak: 0.09 * volScale, type: 'sine' });
          scheduleNote(ctx, { freq: 480, startOffset: offset, duration: 0.24, peak: 0.08 * volScale, type: 'sine' });
        }
        break;
      case 'kalimba': {
        const notes = [523.25, 659.25, 783.99, 1046.5, 783.99];
        notes.forEach((freq, idx) => {
          scheduleNote(ctx, {
            freq,
            startOffset: idx * 0.14,
            duration: 0.26,
            peak: 0.13 * volScale,
            type: 'triangle',
          });
        });
        break;
      }
      case 'horizon': {
        const notes = [587.33, 739.99, 880.0, 1174.66];
        notes.forEach((freq, idx) => {
          scheduleNote(ctx, {
            freq,
            startOffset: idx * 0.15,
            duration: 0.28,
            peak: 0.12 * volScale,
            type: 'sine',
          });
        });
        break;
      }
      case 'crystal_wave': {
        const notes = [783.99, 987.77, 1174.66, 1567.98];
        notes.forEach((freq, idx) => {
          scheduleNote(ctx, {
            freq,
            startOffset: idx * 0.11,
            duration: 0.34,
            peak: 0.11 * volScale,
            type: 'sine',
          });
        });
        break;
      }
      case 'marimba_groove': {
        const notes = [523.25, 659.25, 587.33, 783.99, 659.25];
        notes.forEach((freq, idx) => {
          scheduleNote(ctx, {
            freq,
            startOffset: idx * 0.13,
            duration: 0.14,
            peak: 0.15 * volScale,
            type: 'triangle',
          });
        });
        break;
      }
      case 'radar':
        [0, 0.18, 0.36].forEach((offset, idx) => {
          scheduleNote(ctx, {
            freq: 660 + idx * 140,
            startOffset: offset,
            duration: 0.14,
            peak: 0.11 * volScale,
            type: 'sine',
          });
        });
        break;
      case 'aurora_bell':
        scheduleNote(ctx, { freq: 659.25, startOffset: 0, duration: 0.55, peak: 0.11 * volScale, type: 'sine' });
        scheduleNote(ctx, { freq: 987.77, startOffset: 0.18, duration: 0.55, peak: 0.11 * volScale, type: 'sine' });
        scheduleNote(ctx, { freq: 1318.51, startOffset: 0.36, duration: 0.65, peak: 0.1 * volScale, type: 'sine' });
        break;
      case 'galaxy': {
        const notes = [440, 554.37, 659.25, 880, 1108.73];
        notes.forEach((freq, idx) => {
          scheduleNote(ctx, {
            freq,
            startOffset: idx * 0.12,
            duration: 0.36,
            peak: 0.1 * volScale,
            type: 'sine',
          });
        });
        break;
      }
      case 'digital':
        for (let i = 0; i < 4; i++) {
          scheduleNote(ctx, {
            freq: i % 2 === 0 ? 1046.5 : 1318.51,
            startOffset: i * 0.1,
            duration: 0.09,
            peak: 0.1 * volScale,
            type: 'square',
          });
        }
        break;
      case 'gentle':
      default:
        scheduleNote(ctx, { freq: 523.25, startOffset: 0, duration: 0.32, peak: 0.1 * volScale, type: 'sine' });
        scheduleNote(ctx, { freq: 659.25, startOffset: 0.24, duration: 0.42, peak: 0.1 * volScale, type: 'sine' });
        break;
    }
  } catch {
    // ignore Web Audio failure
  }
}

export function previewCallTone(toneId: CallToneId): void {
  getAudioContext();
  playCallRingtoneCycle(toneId, 'receiver');
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
  if (getSelectedChatTone() === 'silent') return;
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
  const chatTone = getSelectedChatTone();
  if (chatTone === 'silent') return;

  preloadMessageSounds();
  getAudioContext();

  if (chatTone === 'classic' && receiveAudio) {
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
  playSynthChatTone(chatTone);
}

export function playRecordStartBeep(): void {
  if (!isMessageSoundsEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    scheduleNote(ctx, { freq: 740, startOffset: 0, duration: 0.09, peak: 0.14, type: 'sine' });
  } catch {
    // ignore Web Audio failure
  }
}

export function playKeypressSound(enabled = true): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    scheduleNote(ctx, {
      freq: 520,
      endFreq: 220,
      startOffset: 0,
      duration: 0.028,
      peak: 0.08,
      type: 'triangle',
    });
  } catch {
    // ignore Web Audio errors
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
