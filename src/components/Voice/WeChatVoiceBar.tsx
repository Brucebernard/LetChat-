import React, { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Trash2, X } from 'lucide-react';
import { formatDuration } from '../../utils/mediaUtils';
import { useToast } from '../../context/ToastContext';

const MAX_VOICE_SECONDS = 60;
const BAR_COUNT = 22;

export function WeChatHoldToRecordButton({
  disabled = false,
  onSendVoice,
  onRecordingChange,
  iconColor,
  activeBg = '#7C3AED',
  activeText = '#FFFFFF',
  compact = false,
}: {
  disabled?: boolean;
  onSendVoice: (file: File, durationSeconds: number) => Promise<void> | void;
  onRecordingChange?: (recording: boolean) => void;
  iconColor?: string;
  activeBg?: string;
  activeText?: string;
  compact?: boolean;
}) {
  const { showToast } = useToast();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [gestureState, setGestureState] = useState<'normal' | 'cancel' | 'delete'>('normal');
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.25));

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const secondsRef = useRef(0);
  const actionRef = useRef<'send' | 'cancel' | 'delete'>('send');
  const isPressedRef = useRef(false);

  const stopResources = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopResources();
    };
  }, []);

  const finishRecording = (mode: 'send' | 'cancel' | 'delete') => {
    isPressedRef.current = false;
    actionRef.current = mode;
    setRecording(false);
    setGestureState('normal');
    onRecordingChange?.(false);

    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try {
        mediaRecRef.current.stop();
      } catch {
        stopResources();
      }
    } else {
      stopResources();
    }
  };

  const startRecording = async (startX: number, startY: number) => {
    if (disabled || recording) return;
    isPressedRef.current = true;
    actionRef.current = 'send';
    startPointRef.current = { x: startX, y: startY };
    secondsRef.current = 0;
    setSeconds(0);
    setGestureState('normal');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isPressedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      // Live WebAudio waveform analyser
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          src.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            if (!streamRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            const nextBars: number[] = [];
            for (let i = 0; i < BAR_COUNT; i++) {
              const v = dataArray[i % dataArray.length] || 0;
              nextBars.push(Math.max(0.18, Math.min(1, v / 210)));
            }
            setLevels(nextBars);
            animRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      } catch {
        // fallback waveform stays animated via timer
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        const finalAction = actionRef.current;
        const dur = Math.max(1, secondsRef.current);
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        stopResources();

        if (finalAction === 'cancel') {
          showToast('Voice recording cancelled', 'info');
          return;
        }
        if (finalAction === 'delete') {
          showToast('Voice recording deleted', 'info');
          return;
        }
        if (blob.size < 400 || secondsRef.current < 1) {
          showToast('Hold mic longer to record voice note', 'info');
          return;
        }

        const file = new File([blob], `voice_${Date.now()}.webm`, {
          type: mimeType || 'audio/webm',
        });
        await onSendVoice(file, dur);
      };

      rec.start(150);
      setRecording(true);
      onRecordingChange?.(true);

      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_VOICE_SECONDS) {
          finishRecording('send');
        }
      }, 1000);
    } catch {
      isPressedRef.current = false;
      setRecording(false);
      onRecordingChange?.(false);
      showToast('Microphone permission denied.', 'error');
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!recording || !startPointRef.current) return;
    const dy = startPointRef.current.y - clientY; // positive = slid up
    const dx = startPointRef.current.x - clientX; // positive = slid left
    if (dx >= 65) {
      actionRef.current = 'delete';
      setGestureState('delete');
    } else if (dy >= 55) {
      actionRef.current = 'cancel';
      setGestureState('cancel');
    } else {
      actionRef.current = 'send';
      setGestureState('normal');
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          startRecording(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (isPressedRef.current) handlePointerMove(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          if (isPressedRef.current) finishRecording(actionRef.current);
        }}
        onPointerCancel={() => {
          if (isPressedRef.current) finishRecording('cancel');
        }}
        style={{
          backgroundColor: recording ? activeBg : 'transparent',
          color: recording ? activeText : iconColor,
        }}
        className={`${
          compact ? 'min-h-[36px] min-w-[36px]' : 'min-h-[40px] min-w-[40px]'
        } flex items-center justify-center rounded-full select-none touch-none shrink-0 transition ${
          recording ? 'scale-110 shadow-lg shadow-[#7C3AED]/40' : 'hover:opacity-80'
        }`}
        title="Hold to record voice (Slide up to cancel · Slide left to delete)"
        aria-label="Hold to record voice"
      >
        <Mic size={compact ? 18 : 21} />
      </button>

      {/* Floating WeChat-style Live Waveform + Gesture HUD */}
      {recording && (
        <div className="flow-immersive-dark fixed inset-x-0 bottom-24 z-50 flex justify-center pointer-events-none px-4">
          <div
            className={`w-full max-w-xs rounded-3xl px-4 py-3.5 shadow-2xl border backdrop-blur-xl flex flex-col items-center gap-2.5 text-center transition ${
              gestureState === 'delete'
                ? 'bg-red-700/95 border-red-400 text-white'
                : gestureState === 'cancel'
                  ? 'bg-amber-600/95 border-amber-300 text-white'
                  : 'bg-[#12121A]/95 border-[#7C3AED]/60 text-white'
            }`}
          >
            <div className="w-full flex items-center justify-between text-[11px] font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="tabular-nums">
                  {formatDuration(seconds)} / {formatDuration(MAX_VOICE_SECONDS)}
                </span>
              </span>
              <span className="text-white/80">
                {gestureState === 'delete'
                  ? 'Release to delete'
                  : gestureState === 'cancel'
                    ? 'Release to cancel'
                    : 'Release to send'}
              </span>
            </div>

            {/* Live Waveform */}
            <div className="h-9 w-full flex items-center justify-center gap-1 px-2">
              {levels.map((lv, idx) => (
                <span
                  key={idx}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    gestureState === 'normal'
                      ? 'bg-gradient-to-t from-[#7C3AED] to-[#00E5FF]'
                      : 'bg-white/90'
                  }`}
                  style={{ height: `${Math.max(18, Math.round(lv * 100))}%` }}
                />
              ))}
            </div>

            <div className="w-full flex items-center justify-between text-[10px] font-semibold text-white/80">
              <span className="flex items-center gap-1">
                <Trash2 size={11} /> Slide left: Delete
              </span>
              <span className="flex items-center gap-1">
                <X size={11} /> Slide up: Cancel
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const WAVE_PATTERN = [0.35, 0.7, 0.5, 0.9, 0.6, 0.4, 0.85, 0.65, 0.45, 0.95, 0.55, 0.75, 0.4, 0.8, 0.6, 0.5];

export function VoiceNotePlayer({
  url,
  duration,
  isMine = false,
  compact = false,
}: {
  url: string;
  duration?: number | null;
  isMine?: boolean;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [totalSec, setTotalSec] = useState(duration || 0);

  useEffect(() => {
    if (duration && duration > 0) setTotalSec(duration);
  }, [duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = speed;
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  return (
    <div
      className={`flex items-center gap-2 ${
        compact ? 'py-1 px-2 rounded-xl bg-white/[0.06] border border-white/10' : 'min-w-[200px]'
      }`}
    >
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0 && (!duration || duration <= 0)) {
            setTotalSec(Math.round(d));
          }
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setCurrentSec(Math.floor(el.currentTime));
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setProgress(Math.min(1, el.currentTime / el.duration));
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setCurrentSec(0);
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        className={`shrink-0 flex items-center justify-center rounded-full transition ${
          compact ? 'w-7 h-7' : 'w-9 h-9'
        } ${
          isMine
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] text-white'
        }`}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause size={compact ? 12 : 15} /> : <Play size={compact ? 12 : 15} className="ml-0.5" />}
      </button>

      {/* Waveform bars */}
      <div
        onClick={togglePlay}
        className="flex-1 flex items-center gap-[2px] h-6 cursor-pointer min-w-[84px]"
      >
        {WAVE_PATTERN.map((h, i) => {
          const filled = i / WAVE_PATTERN.length <= progress;
          return (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${
                filled
                  ? isMine
                    ? 'bg-white'
                    : 'bg-[#00E5FF]'
                  : isMine
                    ? 'bg-white/35'
                    : 'bg-white/20'
              }`}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          );
        })}
      </div>

      <span className="text-[10px] font-semibold tabular-nums opacity-85 shrink-0">
        {formatDuration(playing ? currentSec : totalSec)}
      </span>

      <button
        type="button"
        onClick={cycleSpeed}
        className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums shrink-0 transition ${
          isMine
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-[#7C3AED]/25 text-[#00E5FF] border border-[#7C3AED]/40 hover:bg-[#7C3AED]/40'
        }`}
        title="Playback speed"
      >
        {speed}x
      </button>
    </div>
  );
}
