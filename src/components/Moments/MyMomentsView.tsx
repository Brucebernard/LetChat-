import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Pin,
  PinOff,
  Trash2,
  Eye,
  Heart,
  MessageCircle,
  Video,
  Image as ImageIcon,
  Camera,
  Upload,
  RefreshCw,
  Square,
  Circle,
  X,
  FolderOpen,
  Music2,
  Globe,
  Users,
  Lock,
  Save,
  Send,
} from 'lucide-react';
import { supabase, uploadWithProgress } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import {
  compressImage,
  formatDuration,
  getVideoMetadata,
} from '../../utils/mediaUtils';
import { MomentDraft, MomentItem, MomentVisibility } from '../../types';

const MAX_VIDEO_SECONDS = 60;

export function getMomentDraftsKey(userId: string): string {
  return `letchat_moment_drafts_${userId}`;
}

export function loadMomentDrafts(userId: string): MomentDraft[] {
  try {
    const raw = localStorage.getItem(getMomentDraftsKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as MomentDraft[]) : [];
  } catch {
    return [];
  }
}

export function saveMomentDrafts(userId: string, drafts: MomentDraft[]): void {
  localStorage.setItem(getMomentDraftsKey(userId), JSON.stringify(drafts));
}

function parseHashtags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, '').trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 32)
    )
  ).slice(0, 12);
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bin = atob(base64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read media'));
    reader.readAsDataURL(blob);
  });
}

interface CreateMomentModalProps {
  initialDraft?: MomentDraft | null;
  onClose: () => void;
  onPublished: (moment: MomentItem) => void;
  onDraftSaved: () => void;
}

export function CreateMomentModal({
  initialDraft = null,
  onClose,
  onPublished,
  onDraftSaved,
}: CreateMomentModalProps) {
  const { profile } = useAuth();
  const { lowDataMode } = useSettings();
  const { showToast } = useToast();

  const [mode, setMode] = useState<'camera' | 'upload'>('upload');
  const [caption, setCaption] = useState(initialDraft?.caption || '');
  const [hashtagsText, setHashtagsText] = useState(initialDraft?.hashtagsText || '');
  const [musicName, setMusicName] = useState(initialDraft?.musicName || 'Original Sound');
  const [visibility, setVisibility] = useState<MomentVisibility>(
    initialDraft?.visibility || 'everyone'
  );
  const [category, setCategory] = useState(initialDraft?.category || 'General');

  const [mediaFile, setMediaFile] = useState<File | null>(() => {
    if (initialDraft?.mediaDataUrl && initialDraft.fileName) {
      try {
        return dataUrlToFile(initialDraft.mediaDataUrl, initialDraft.fileName);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(
    initialDraft?.mediaType || null
  );
  const [previewUrl, setPreviewUrl] = useState<string>(initialDraft?.mediaDataUrl || '');

  // Live Camera Recorder state (max 60s)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCameraStream = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try {
        mediaRecRef.current.stop();
      } catch {
        // ignore
      }
    }
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);
    setIsRecording(false);
  };

  useEffect(() => {
    if (mode !== 'camera' || previewUrl) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.muted = true;
          liveVideoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch {
        showToast('Camera permission denied or unavailable. Use Upload instead.', 'error');
        setMode('upload');
      }
    })();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [mode, facingMode, previewUrl, showToast]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const startRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream || isRecording) return;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 900_000 })
      : new MediaRecorder(stream);

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      setIsRecording(false);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      if (blob.size > 0) {
        const file = new File([blob], `moment_${Date.now()}.webm`, {
          type: blob.type || 'video/webm',
        });
        const objUrl = URL.createObjectURL(blob);
        setMediaFile(file);
        setMediaType('video');
        setPreviewUrl(objUrl);
      }
      stopCameraStream();
    };

    mediaRecRef.current = recorder;
    setRecordSeconds(0);
    setIsRecording(true);
    recorder.start(250);

    const startedAt = Date.now();
    recordTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRecordSeconds(elapsed);
      if (elapsed >= MAX_VIDEO_SECONDS) {
        if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
          mediaRecRef.current.stop();
        }
      }
    }, 250);
  };

  const stopRecording = () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop();
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type.startsWith('video/')) {
      const meta = await getVideoMetadata(file);
      if (meta.duration > MAX_VIDEO_SECONDS) {
        showToast('Moment videos can be up to 60 seconds long', 'error');
        return;
      }
      setMediaFile(file);
      setMediaType('video');
      setPreviewUrl(URL.createObjectURL(file));
    } else if (file.type.startsWith('image/')) {
      const compressed = await compressImage(file, lowDataMode);
      setMediaFile(compressed);
      setMediaType('image');
      setPreviewUrl(URL.createObjectURL(compressed));
    } else {
      showToast('Please select a photo or video file', 'error');
    }
  };

  const handleSaveDraft = async () => {
    if (!profile?.id) return;
    if (!caption.trim() && !mediaFile && !previewUrl) {
      showToast('Add a video, photo, or caption before saving draft', 'error');
      return;
    }

    let mediaDataUrl: string | null = null;
    if (mediaFile) {
      if (mediaFile.size <= 3.5 * 1024 * 1024) {
        try {
          mediaDataUrl = await blobToDataUrl(mediaFile);
        } catch {
          mediaDataUrl = null;
        }
      } else {
        showToast('Large video draft saved without local file cache', 'info');
      }
    } else if (previewUrl.startsWith('data:')) {
      mediaDataUrl = previewUrl;
    }

    const existing = loadMomentDrafts(profile.id);
    const nextDraft: MomentDraft = {
      id: initialDraft?.id || `draft_${Date.now()}`,
      caption: caption.trim(),
      hashtagsText,
      musicName: musicName.trim() || 'Original Sound',
      visibility,
      category,
      mediaType,
      mediaDataUrl,
      fileName: mediaFile?.name || initialDraft?.fileName || null,
      updatedAt: new Date().toISOString(),
    };

    const merged = [nextDraft, ...existing.filter((d) => d.id !== nextDraft.id)].slice(0, 12);
    try {
      saveMomentDrafts(profile.id, merged);
      showToast('Saved to Drafts', 'success');
      onDraftSaved();
      onClose();
    } catch {
      // Retry without heavy mediaDataUrl if localStorage quota exceeded
      nextDraft.mediaDataUrl = null;
      saveMomentDrafts(
        profile.id,
        [nextDraft, ...existing.filter((d) => d.id !== nextDraft.id)].slice(0, 12)
      );
      showToast('Draft text saved (media exceeded browser storage limit)', 'info');
      onDraftSaved();
      onClose();
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    if (!mediaFile && !caption.trim()) {
      showToast('Record/upload a video or photo, or write a caption', 'error');
      return;
    }

    setSubmitting(true);
    try {
      let uploadedUrl: string | null = null;
      if (mediaFile) {
        const ext =
          mediaType === 'video'
            ? mediaFile.name.split('.').pop() || 'mp4'
            : 'jpg';
        const path = `moments/${profile.id}/${Date.now()}.${ext}`;
        setUploadPct(1);
        uploadedUrl = await uploadWithProgress('letchat-media', path, mediaFile, setUploadPct);
        setUploadPct(null);
      }

      const tags = parseHashtags(hashtagsText);
      const cleanCaption = caption.trim();
      const fullPayload = {
        user_id: profile.id,
        caption: cleanCaption,
        text: cleanCaption,
        media_url: uploadedUrl,
        video_url: mediaType === 'video' ? uploadedUrl : null,
        image_url: mediaType === 'image' ? uploadedUrl : null,
        category,
        hashtags: tags,
        music_name: musicName.trim() || 'Original Sound',
        visibility,
        likes_count: 0,
        views_count: 0,
      };

      let { data, error } = await supabase
        .from('moments')
        .insert(fullPayload)
        .select('*, author:profiles(*)')
        .single();

      // Graceful fallback if Supabase schema doesn't yet have new optional columns
      if (error && (error.code === '42703' || error.code === 'PGRST204')) {
        const fallbackPayload = {
          user_id: profile.id,
          caption: cleanCaption,
          text: cleanCaption,
          media_url: uploadedUrl,
          video_url: mediaType === 'video' ? uploadedUrl : null,
          image_url: mediaType === 'image' ? uploadedUrl : null,
          category,
          likes_count: 0,
        };
        const retry = await supabase
          .from('moments')
          .insert(fallbackPayload)
          .select('*, author:profiles(*)')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error || !data) {
        showToast(error?.message || 'Failed to publish Moment', 'error');
        return;
      }

      // Remove from drafts if published from a draft
      if (initialDraft?.id) {
        const remaining = loadMomentDrafts(profile.id).filter(
          (d) => d.id !== initialDraft.id
        );
        saveMomentDrafts(profile.id, remaining);
      }

      showToast('Moment posted!', 'success');
      onPublished(data as unknown as MomentItem);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setSubmitting(false);
      setUploadPct(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col text-white">
      <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]/95 shrink-0">
        <h3 className="font-extrabold text-base">
          {initialDraft ? 'Edit Draft Moment' : 'Create Moment'}
        </h3>
        <button
          type="button"
          onClick={() => {
            stopCameraStream();
            onClose();
          }}
          className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handlePublish} className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="max-w-lg mx-auto space-y-4 pb-8">
          {/* Mode Switcher */}
          {!previewUrl && (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white/[0.05] border border-white/10">
              <button
                type="button"
                onClick={() => setMode('camera')}
                className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  mode === 'camera'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
                    : 'text-zinc-300'
                }`}
              >
                <Camera size={15} />
                Record Video (60s)
              </button>
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  mode === 'upload'
                    ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
                    : 'text-zinc-300'
                }`}
              >
                <Upload size={15} />
                Upload Video / Photo
              </button>
            </div>
          )}

          {/* Media Capture / Preview Box */}
          {previewUrl ? (
            <div className="relative rounded-3xl overflow-hidden border border-white/15 bg-black aspect-[9/12] max-h-[380px] mx-auto">
              {mediaType === 'video' ? (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setMediaFile(null);
                  setMediaType(null);
                  setPreviewUrl('');
                }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/75 border border-white/20 text-xs font-bold text-white flex items-center gap-1"
              >
                <X size={13} /> Change
              </button>
            </div>
          ) : mode === 'camera' ? (
            <div className="relative rounded-3xl overflow-hidden border border-white/15 bg-black aspect-[9/12] max-h-[380px] mx-auto">
              <video
                ref={liveVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-black/70 text-xs font-bold text-white">
                  {formatDuration(recordSeconds)} / 1:00
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
                  }
                  disabled={isRecording}
                  className="w-9 h-9 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white disabled:opacity-40"
                >
                  <RefreshCw size={15} />
                </button>
              </div>

              <div className="absolute bottom-4 inset-x-0 flex justify-center">
                {isRecording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="w-16 h-16 rounded-full bg-red-600 border-4 border-white flex items-center justify-center shadow-xl animate-pulse"
                  >
                    <Square size={22} fill="white" className="text-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!cameraReady}
                    onClick={startRecording}
                    className="w-16 h-16 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] border-4 border-white flex items-center justify-center shadow-xl disabled:opacity-40"
                  >
                    <Circle size={24} fill="white" className="text-white" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-10 rounded-3xl border-2 border-dashed border-white/15 hover:border-[#00E5FF]/60 bg-[#121218] flex flex-col items-center justify-center gap-2.5 transition"
            >
              <div className="flex items-center gap-3 text-[#00E5FF]">
                <Video size={26} />
                <ImageIcon size={26} className="text-[#7C3AED]" />
              </div>
              <p className="font-bold text-sm">Tap to choose Video (up to 60s) or Photo</p>
              <p className="text-xs text-zinc-400">MP4, WebM, MOV, JPG, PNG</p>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            className="hidden"
            onChange={handleFilePick}
          />

          {uploadPct !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-[#00E5FF]">
                <span>Uploading Moment...</span>
                <span>{uploadPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#7C3AED] to-[#00E5FF]"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Caption */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300">Caption</label>
            <textarea
              rows={2}
              maxLength={300}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption for your Moment..."
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 text-sm text-white outline-none focus:border-[#00E5FF] resize-none"
            />
          </div>

          {/* Hashtags & Music */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">Hashtags</label>
              <input
                type="text"
                value={hashtagsText}
                onChange={(e) => setHashtagsText(e.target.value)}
                placeholder="#ghana #flow #vibes"
                className="w-full px-3.5 min-h-[42px] rounded-2xl bg-white/[0.06] border border-white/10 text-sm text-white outline-none focus:border-[#00E5FF]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-1">
                <Music2 size={12} className="text-[#00E5FF]" /> Music / Sound Name
              </label>
              <input
                type="text"
                maxLength={80}
                value={musicName}
                onChange={(e) => setMusicName(e.target.value)}
                placeholder="Original Sound"
                className="w-full px-3.5 min-h-[42px] rounded-2xl bg-white/[0.06] border border-white/10 text-sm text-white outline-none focus:border-[#00E5FF]"
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300">Category</label>
            <div className="flex flex-wrap gap-2">
              {['General', 'Entertainment', 'Football', 'Music', 'Tech', 'Lifestyle'].map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                      category === cat
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
                        : 'bg-white/[0.06] text-zinc-300 border border-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Visibility: Everyone / Friends / Only Me */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300">Who can see</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'everyone' as MomentVisibility, label: 'Everyone', icon: Globe },
                { id: 'friends' as MomentVisibility, label: 'Friends', icon: Users },
                { id: 'only_me' as MomentVisibility, label: 'Only Me', icon: Lock },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = visibility === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setVisibility(opt.id)}
                    className={`py-2.5 px-2 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      active
                        ? 'bg-[#7C3AED]/25 border-[#00E5FF] text-white'
                        : 'bg-white/[0.04] border-white/10 text-zinc-400'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Save Draft & Publish */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleSaveDraft}
              className="min-h-[46px] rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/15 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={16} />
              Save Draft
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[46px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/25 disabled:opacity-50"
            >
              <Send size={16} />
              {submitting ? 'Posting...' : 'Post Moment'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

interface MyMomentsViewProps {
  myMoments: MomentItem[];
  commentCounts: Record<string, number>;
  onBack: () => void;
  onOpenCreate: (draft?: MomentDraft | null) => void;
  onDeleted: (momentId: string) => void;
  onPinnedToggled: (momentId: string, nextPinned: boolean) => void;
  onDraftsChanged?: () => void;
}

export default function MyMomentsView({
  myMoments,
  commentCounts,
  onBack,
  onOpenCreate,
  onDeleted,
  onPinnedToggled,
  onDraftsChanged,
}: MyMomentsViewProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<'posted' | 'drafts'>('posted');
  const [drafts, setDrafts] = useState<MomentDraft[]>([]);
  const [selectedMoment, setSelectedMoment] = useState<MomentItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      setDrafts(loadMomentDrafts(profile.id));
    }
  }, [profile?.id, myMoments]);

  const sortedMoments = useMemo(() => {
    return [...myMoments].sort((a, b) => {
      if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) {
        return a.is_pinned ? -1 : 1;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [myMoments]);

  const handleTogglePin = async (m: MomentItem) => {
    const nextPinned = !m.is_pinned;
    const { error } = await supabase
      .from('moments')
      .update({ is_pinned: nextPinned })
      .eq('id', m.id);
    if (error) {
      showToast(error.message || 'Could not update pin status', 'error');
      return;
    }
    onPinnedToggled(m.id, nextPinned);
    setSelectedMoment((prev) => (prev?.id === m.id ? { ...prev, is_pinned: nextPinned } : prev));
    showToast(nextPinned ? 'Pinned to top' : 'Unpinned', 'success');
  };

  const handleDeleteMoment = async (id: string) => {
    const { error } = await supabase.from('moments').delete().eq('id', id);
    if (error) {
      showToast(error.message || 'Delete failed', 'error');
      return;
    }
    setConfirmDeleteId(null);
    setSelectedMoment(null);
    onDeleted(id);
    showToast('Moment deleted', 'success');
  };

  const handleDeleteDraft = (draftId: string) => {
    if (!profile?.id) return;
    const next = drafts.filter((d) => d.id !== draftId);
    saveMomentDrafts(profile.id, next);
    setDrafts(next);
    onDraftsChanged?.();
    showToast('Draft deleted', 'info');
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#0A0A0A] text-white flex flex-col">
      {/* Header */}
      <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]/95 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/10 flex items-center justify-center"
            aria-label="Back to Moments"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="font-extrabold text-base leading-tight">My Moments</h2>
            <p className="text-[11px] text-zinc-400">@{profile?.username}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenCreate(null)}
          className="px-3.5 min-h-[38px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-xs flex items-center gap-1.5"
        >
          <Plus size={15} />
          New Moment
        </button>
      </div>

      {/* Sub-tabs: Posted / Drafts */}
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setSubTab('posted')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
            subTab === 'posted'
              ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
              : 'bg-white/[0.06] text-zinc-300'
          }`}
        >
          Posted ({sortedMoments.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('drafts')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition ${
            subTab === 'drafts'
              ? 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
              : 'bg-white/[0.06] text-zinc-300'
          }`}
        >
          <FolderOpen size={13} />
          Drafts ({drafts.length})
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {subTab === 'posted' ? (
          sortedMoments.length === 0 ? (
            <div className="max-w-sm mx-auto mt-12 rounded-3xl border border-white/10 bg-[#121218] p-7 text-center space-y-3">
              <Video size={28} className="mx-auto text-[#00E5FF]" />
              <p className="font-bold text-sm">You haven&apos;t posted any Moments yet</p>
              <p className="text-xs text-zinc-400">
                Record a 60-second clip or upload a photo to share with FLOW.
              </p>
              <button
                type="button"
                onClick={() => onOpenCreate(null)}
                className="px-4 min-h-[40px] rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white font-bold text-xs inline-flex items-center gap-1.5"
              >
                <Plus size={15} /> Create First Moment
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 max-w-3xl mx-auto">
              {sortedMoments.map((m) => {
                const mediaSrc = m.video_url || m.media_url || m.image_url;
                const isVid = Boolean(m.video_url);
                const cCount = commentCounts[m.id] || 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMoment(m)}
                    className="relative aspect-[9/14] rounded-2xl overflow-hidden bg-[#121218] border border-white/10 text-left group"
                  >
                    {isVid && mediaSrc ? (
                      <video
                        src={mediaSrc}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : mediaSrc ? (
                      <img
                        src={mediaSrc}
                        alt={m.caption || 'Moment'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full p-2 flex items-center justify-center bg-gradient-to-br from-[#7C3AED]/30 to-[#00E5FF]/20 text-[11px] font-semibold text-center">
                        {m.caption || m.text}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />

                    {m.is_pinned && (
                      <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-[#7C3AED] text-white text-[9px] font-extrabold flex items-center gap-0.5">
                        <Pin size={9} /> Pinned
                      </span>
                    )}

                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-bold text-white">
                      <span className="flex items-center gap-0.5">
                        <Eye size={10} /> {m.views_count || 0}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="flex items-center gap-0.5">
                          <Heart size={10} /> {m.likes_count || 0}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MessageCircle size={10} /> {cCount}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : drafts.length === 0 ? (
          <div className="max-w-sm mx-auto mt-12 rounded-3xl border border-white/10 bg-[#121218] p-7 text-center space-y-2">
            <FolderOpen size={28} className="mx-auto text-[#7C3AED]" />
            <p className="font-bold text-sm">Drafts Folder is Empty</p>
            <p className="text-xs text-zinc-400">
              Save unfinished videos or captions as drafts while creating a Moment.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-2.5">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="p-3.5 rounded-3xl bg-[#121218] border border-white/10 flex items-center gap-3"
              >
                <div className="w-14 h-20 rounded-2xl bg-black border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  {d.mediaDataUrl && d.mediaType === 'image' ? (
                    <img
                      src={d.mediaDataUrl}
                      alt="Draft"
                      className="w-full h-full object-cover"
                    />
                  ) : d.mediaDataUrl && d.mediaType === 'video' ? (
                    <video
                      src={d.mediaDataUrl}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FolderOpen size={18} className="text-zinc-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">
                    {d.caption || '(No caption)'}
                  </p>
                  <p className="text-[11px] text-[#00E5FF] truncate mt-0.5">
                    {d.musicName || 'Original Sound'} · {d.visibility}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Updated {new Date(d.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenCreate(d)}
                    className="px-3 min-h-[34px] rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white text-xs font-bold"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDraft(d.id)}
                    className="w-9 h-9 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 flex items-center justify-center"
                    aria-label="Delete draft"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Moment Detail / Pin / Delete Modal */}
      {selectedMoment && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => {
            setConfirmDeleteId(null);
            setSelectedMoment(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[#12121A] border border-white/15 overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1">
                  <Eye size={14} className="text-[#00E5FF]" /> {selectedMoment.views_count || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Heart size={14} className="text-pink-400" /> {selectedMoment.likes_count || 0}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle size={14} className="text-[#7C3AED]" />{' '}
                  {commentCounts[selectedMoment.id] || 0}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMoment(null)}
                className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-black aspect-[9/12] max-h-[380px] flex items-center justify-center">
              {selectedMoment.video_url ? (
                <video
                  src={selectedMoment.video_url}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : selectedMoment.media_url || selectedMoment.image_url ? (
                <img
                  src={selectedMoment.media_url || selectedMoment.image_url || ''}
                  alt={selectedMoment.caption || 'Moment'}
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="p-6 text-center text-sm font-semibold">
                  {selectedMoment.caption || selectedMoment.text}
                </p>
              )}
            </div>

            <div className="p-4 space-y-3">
              {(selectedMoment.caption || selectedMoment.text) && (
                <p className="text-sm text-zinc-200">
                  {selectedMoment.caption || selectedMoment.text}
                </p>
              )}

              {confirmDeleteId === selectedMoment.id ? (
                <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-red-300">Delete this Moment?</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMoment(selectedMoment.id)}
                      className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleTogglePin(selectedMoment)}
                    className="min-h-[42px] rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    {selectedMoment.is_pinned ? (
                      <>
                        <PinOff size={15} className="text-[#00E5FF]" /> Unpin Video
                      </>
                    ) : (
                      <>
                        <Pin size={15} className="text-[#00E5FF]" /> Pin Video
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(selectedMoment.id)}
                    className="min-h-[42px] rounded-2xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={15} /> Delete Video
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
