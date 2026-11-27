export function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 KB';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(seconds?: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function isUserOnline(lastSeen?: string | null): boolean {
  if (!lastSeen) return false;
  const ms = new Date(lastSeen).getTime();
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms < 5 * 60 * 1000;
}

export function formatLastSeen(lastSeen?: string | null, fallbackCreatedAt?: string | null): string {
  const raw = lastSeen || fallbackCreatedAt;
  if (!raw) return 'Offline';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Offline';

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  if (diffMs < 5 * 60 * 1000) {
    return 'Online';
  }

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfTarget) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) {
    return `Last seen today at ${timeStr}`;
  }
  if (dayDiff === 1) {
    return `Last seen yesterday at ${timeStr}`;
  }
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `Last seen ${dateStr} at ${timeStr}`;
}

export function formatLastSeenShort(lastSeen?: string | null): string {
  if (!lastSeen) return '';
  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (now.getTime() - date.getTime() < 5 * 60 * 1000) return 'Online';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfTarget) / (24 * 60 * 60 * 1000));
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (dayDiff === 0) return `Last seen ${timeStr}`;
  if (dayDiff === 1) return 'Last seen yesterday';
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function isSafeHttpUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to execCommand below (common inside restricted iframes)
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function downloadAppSourceZip(): Promise<void> {
  const res = await fetch('/api/download-source', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Download failed (HTTP ${res.status})`);
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (
    contentType &&
    !contentType.includes('zip') &&
    !contentType.includes('octet-stream')
  ) {
    throw new Error('Server did not return a valid zip archive.');
  }
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error('Downloaded zip archive is empty.');
  }
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = 'letchat-v2.zip';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

export async function compressImage(file: File, lowDataMode = false): Promise<File> {
  const maxDim = lowDataMode ? 480 : 1280;
  const maxBytes = lowDataMode ? 200 * 1024 : 1.5 * 1024 * 1024;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    const objUrl = URL.createObjectURL(file);
    i.onload = () => resolve(i);
    i.onerror = (err) => {
      URL.revokeObjectURL(objUrl);
      reject(err);
    };
    i.src = objUrl;
  });

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(img.src);
    return file;
  }
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(img.src);

  let quality = lowDataMode ? 0.72 : 0.85;
  let blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  while (blob && blob.size > maxBytes && quality > 0.25) {
    quality -= 0.1;
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
  }

  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

export function getVideoMetadata(
  file: File
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const objUrl = URL.createObjectURL(file);
    video.src = objUrl;
    video.onloadedmetadata = () => {
      const duration = Math.round(video.duration || 0);
      const width = video.videoWidth;
      const height = video.videoHeight;
      URL.revokeObjectURL(objUrl);
      resolve({ duration, width, height });
    };
    video.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve({ duration: 0, width: 0, height: 0 });
    };
  });
}

export async function compressVideoTo480p(
  file: File,
  onProgress?: (pct: number) => void
): Promise<File> {
  if (file.size <= 2.5 * 1024 * 1024 || typeof MediaRecorder === 'undefined') {
    return file;
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objUrl = URL.createObjectURL(file);
    video.src = objUrl;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const targetHeight = Math.min(480, video.videoHeight || 480);
      const scale = targetHeight / (video.videoHeight || 480);
      const targetWidth = Math.round((video.videoWidth || 640) * scale);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objUrl);
        resolve(file);
        return;
      }

      const stream = canvas.captureStream(24);
      try {
        const capVideo = video as HTMLVideoElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        };
        const videoStream = capVideo.captureStream?.() || capVideo.mozCaptureStream?.();
        if (videoStream) {
          videoStream.getAudioTracks().forEach((t) => stream.addTrack(t));
        }
      } catch {
        // continue without audio track if browser blocks captureStream audio
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 450_000,
        });
      } catch {
        URL.revokeObjectURL(objUrl);
        resolve(file);
        return;
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        URL.revokeObjectURL(objUrl);
        const compressed = new Blob(chunks, { type: 'video/webm' });
        if (compressed.size > 0 && compressed.size < file.size) {
          resolve(
            new File([compressed], file.name.replace(/\.[^.]+$/, '.webm'), { type: 'video/webm' })
          );
        } else {
          resolve(file);
        }
      };

      let animId = 0;
      const draw = () => {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        if (onProgress && video.duration) {
          onProgress(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
        }
        animId = requestAnimationFrame(draw);
      };

      video.onplay = () => {
        recorder.start(250);
        draw();
      };
      video.onended = () => {
        cancelAnimationFrame(animId);
        recorder.stop();
      };
      video.play().catch(() => {
        URL.revokeObjectURL(objUrl);
        resolve(file);
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve(file);
    };
  });
}

const BAD_WORDS_AND_SCAMS = [
  'free money',
  'double your money',
  'send momo pin',
  'momo pin',
  'lottery winner',
  'claim your prize',
  'bit.ly/',
  'tinyurl.com/',
  'porn',
  'nude',
  'kill yourself',
  'idiot',
  'stupid',
  'scam',
  'fraud',
];

export function detectFlaggedContent(text = ''): boolean {
  const lower = text.toLowerCase();
  return BAD_WORDS_AND_SCAMS.some((term) => lower.includes(term));
}
