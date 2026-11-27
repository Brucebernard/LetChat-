import { SupabaseClient } from '@supabase/supabase-js';
import { Message, Profile } from '../types';

export const V1_MSG_PREFIX = '__LETCHAT_MSG__:';

type SchemaMode = 'unknown' | 'v2_media' | 'v2' | 'v1_media' | 'v1';

let messagesSchemaMode: SchemaMode = 'unknown';

export function getDmChatId(userA: string, userB: string): string {
  return `dm_${[userA, userB].sort().join('_')}`;
}

export function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; details?: string; hint?: string };
  const code = String(e.code || '');
  const msg = `${e.message || ''} ${e.details || ''} ${e.hint || ''}`.toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST200' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the') ||
    msg.includes('schema cache')
  );
}

function isTextLenConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; details?: string };
  const code = String(e.code || '');
  const msg = `${e.message || ''} ${e.details || ''}`.toLowerCase();
  return code === '23514' || msg.includes('messages_text_len');
}

export function getMessagesSchemaMode(): SchemaMode {
  return messagesSchemaMode;
}

export function normalizeMediaKind(value?: string | null): Message['type'] | null {
  if (!value || typeof value !== 'string') return null;
  const lower = value.trim().toLowerCase();
  if (!lower) return null;
  if (lower === 'audio' || lower === 'voice' || lower.startsWith('audio/')) {
    return lower === 'voice' ? 'voice' : 'audio';
  }
  if (lower === 'video' || lower.startsWith('video/')) return 'video';
  if (lower === 'image' || lower === 'photo' || lower.startsWith('image/')) return 'image';
  if (lower === 'sticker') return 'sticker';
  if (lower === 'document' || lower === 'file' || lower.startsWith('application/')) {
    return 'document';
  }
  if (lower === 'text') return 'text';
  return null;
}

interface EncodedPayload {
  v: 2;
  type: Message['type'];
  text?: string;
  image_url?: string | null;
  video_url?: string | null;
  sticker_url?: string | null;
  voice_url?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number;
  duration?: number;
  reply_to_id?: string | null;
  forwarded?: boolean;
  deleted_for_everyone?: boolean;
  read_at?: string | null;
  reactions?: Record<string, string[]>;
}

export function normalizeReactionsMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, string[]> = {};
  for (const [emoji, users] of Object.entries(raw as Record<string, unknown>)) {
    if (!emoji || !Array.isArray(users)) continue;
    const validUsers = Array.from(
      new Set(users.filter((u): u is string => typeof u === 'string' && u.length > 0))
    );
    if (validUsers.length > 0) {
      clean[emoji] = validUsers;
    }
  }
  return clean;
}

export function encodeV1MessageText(payload: Partial<Message>): string {
  const type =
    normalizeMediaKind(payload.type) ||
    normalizeMediaKind(payload.media_type) ||
    'text';
  const text = payload.text || '';
  const mediaUrl = payload.media_url || null;
  const reactions = normalizeReactionsMap(payload.reactions);
  const hasReactions = Object.keys(reactions).length > 0;

  const needsEnvelope =
    type !== 'text' ||
    Boolean(payload.deleted_for_everyone) ||
    Boolean(payload.forwarded) ||
    Boolean(payload.reply_to_id) ||
    Boolean(payload.voice_url) ||
    Boolean(payload.image_url) ||
    Boolean(payload.video_url) ||
    Boolean(payload.sticker_url) ||
    Boolean(payload.file_url) ||
    Boolean(mediaUrl) ||
    Boolean(payload.read_at) ||
    hasReactions;

  if (!needsEnvelope) {
    return text;
  }

  const resolvedVoiceUrl =
    payload.voice_url || (type === 'audio' || type === 'voice' ? mediaUrl : null);
  const resolvedVideoUrl = payload.video_url || (type === 'video' ? mediaUrl : null);
  const resolvedImageUrl = payload.image_url || (type === 'image' ? mediaUrl : null);

  const envelope: EncodedPayload = {
    v: 2,
    type,
    ...(text ? { text } : {}),
    ...(resolvedImageUrl ? { image_url: resolvedImageUrl } : {}),
    ...(resolvedVideoUrl ? { video_url: resolvedVideoUrl } : {}),
    ...(payload.sticker_url ? { sticker_url: payload.sticker_url } : {}),
    ...(resolvedVoiceUrl ? { voice_url: resolvedVoiceUrl } : {}),
    ...(mediaUrl ? { media_url: mediaUrl, media_type: payload.media_type || type } : {}),
    ...(payload.file_url ? { file_url: payload.file_url } : {}),
    ...(payload.file_name ? { file_name: payload.file_name } : {}),
    ...(payload.file_size ? { file_size: payload.file_size } : {}),
    ...(payload.duration ? { duration: payload.duration } : {}),
    ...(payload.reply_to_id ? { reply_to_id: payload.reply_to_id } : {}),
    ...(payload.forwarded ? { forwarded: true } : {}),
    ...(payload.deleted_for_everyone ? { deleted_for_everyone: true } : {}),
    ...(payload.read_at ? { read_at: payload.read_at } : {}),
    ...(hasReactions ? { reactions } : {}),
  };

  return `${V1_MSG_PREFIX}${JSON.stringify(envelope)}`;
}

function inferTypeFromUrl(url: string): Message['type'] | null {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith('data:audio/')) return 'audio';
  if (lower.startsWith('data:video/')) return 'video';
  if (lower.startsWith('data:image/')) return 'image';

  const clean = lower.split('?')[0];
  if (/\.(mp3|wav|m4a|ogg|aac|webm|flac|opus)$/.test(clean) || clean.includes('/audio/')) {
    return 'audio';
  }
  if (/\.(mp4|mov|m4v|mkv)$/.test(clean) || clean.includes('/video/')) {
    return 'video';
  }
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(clean)) {
    return 'image';
  }
  return null;
}

export function normalizeMessageRow(
  rawRow: Record<string, unknown>,
  senderLookup?: (senderId: string) => Profile | undefined
): Message {
  const senderId = String(rawRow.sender_id || '');
  const receiverId = rawRow.receiver_id ? String(rawRow.receiver_id) : undefined;
  const rawText =
    typeof rawRow.content === 'string' && rawRow.content.length > 0
      ? rawRow.content
      : typeof rawRow.text === 'string'
        ? rawRow.text
        : '';

  let decoded: Partial<EncodedPayload> | null = null;
  if (rawText.startsWith(V1_MSG_PREFIX)) {
    try {
      decoded = JSON.parse(rawText.slice(V1_MSG_PREFIX.length)) as Partial<EncodedPayload>;
    } catch {
      decoded = null;
    }
  }

  const rawMediaType =
    decoded?.media_type ?? (rawRow.media_type as string | null | undefined) ?? null;
  const rawMediaUrl =
    decoded?.media_url ?? (rawRow.media_url as string | null | undefined) ?? null;

  const decodedKind = normalizeMediaKind(decoded?.type);
  const rowTypeKind = normalizeMediaKind(rawRow.type as string | null | undefined);
  const mediaTypeKind = normalizeMediaKind(rawMediaType);

  let resolvedType: Message['type'] = 'text';
  if (decodedKind && decodedKind !== 'text') {
    resolvedType = decodedKind;
  } else if (mediaTypeKind && mediaTypeKind !== 'text') {
    // media_type stored in messages table overrides Postgres default type='text'
    resolvedType = mediaTypeKind;
  } else if (rowTypeKind && rowTypeKind !== 'text') {
    resolvedType = rowTypeKind;
  } else if (rawMediaUrl) {
    resolvedType = inferTypeFromUrl(rawMediaUrl) || 'document';
  } else {
    resolvedType = decodedKind || rowTypeKind || mediaTypeKind || 'text';
  }

  let resolvedText = decoded ? decoded.text || '' : rawText;

  let voiceUrl =
    decoded?.voice_url ??
    (rawRow.voice_url as string | null | undefined) ??
    (resolvedType === 'audio' || resolvedType === 'voice' ? rawMediaUrl : null) ??
    null;
  let imageUrl =
    decoded?.image_url ??
    (rawRow.image_url as string | null | undefined) ??
    (resolvedType === 'image' ? rawMediaUrl : null) ??
    null;
  let videoUrl =
    decoded?.video_url ??
    (rawRow.video_url as string | null | undefined) ??
    (resolvedType === 'video' ? rawMediaUrl : null) ??
    null;
  let stickerUrl =
    decoded?.sticker_url ??
    (rawRow.sticker_url as string | null | undefined) ??
    (resolvedType === 'sticker' ? rawMediaUrl : null) ??
    null;
  let fileUrl =
    decoded?.file_url ??
    (rawRow.file_url as string | null | undefined) ??
    (resolvedType === 'document' ? rawMediaUrl : null) ??
    null;

  // Fallback inference if an external/V1 row stored a raw audio/image/video URL directly in `text`
  if (!decoded && resolvedType === 'text' && /^https?:\/\/\S+$/i.test(rawText.trim())) {
    const inferred = inferTypeFromUrl(rawText.trim());
    if (inferred === 'audio') {
      resolvedType = 'audio';
      voiceUrl = rawText.trim();
      resolvedText = '';
    } else if (inferred === 'image') {
      resolvedType = 'image';
      imageUrl = rawText.trim();
      resolvedText = '';
    } else if (inferred === 'video') {
      resolvedType = 'video';
      videoUrl = rawText.trim();
      resolvedText = '';
    }
  }

  // Handle data:audio or data:video URLs stored directly in text
  if (!decoded && resolvedType === 'text' && rawText.startsWith('data:audio/')) {
    resolvedType = 'audio';
    voiceUrl = rawText;
    resolvedText = '';
  } else if (!decoded && resolvedType === 'text' && rawText.startsWith('data:video/')) {
    resolvedType = 'video';
    videoUrl = rawText;
    resolvedText = '';
  }

  // Backfill resolvedType if a dedicated media column exists on the row
  if (resolvedType === 'text') {
    if (voiceUrl) resolvedType = 'audio';
    else if (videoUrl) resolvedType = 'video';
    else if (imageUrl) resolvedType = 'image';
    else if (stickerUrl) resolvedType = 'sticker';
    else if (fileUrl) resolvedType = 'document';
  }

  const chatId =
    (typeof rawRow.chat_id === 'string' && rawRow.chat_id) ||
    (senderId && receiverId ? getDmChatId(senderId, receiverId) : '');

  const existingSender = rawRow.sender as Profile | undefined;
  const effectiveMediaUrl =
    rawMediaUrl || voiceUrl || videoUrl || imageUrl || fileUrl || stickerUrl || null;

  const resolvedReadAt =
    (typeof rawRow.read_at === 'string' && rawRow.read_at) ||
    decoded?.read_at ||
    null;

  return {
    id: String(rawRow.id || ''),
    chat_id: chatId,
    sender_id: senderId,
    receiver_id: receiverId || null,
    text: resolvedText,
    content: resolvedText,
    image_url: imageUrl,
    video_url: videoUrl,
    sticker_url: stickerUrl,
    voice_url: voiceUrl,
    media_type: rawMediaType || resolvedType,
    media_url: effectiveMediaUrl,
    file_url: fileUrl,
    file_name: decoded?.file_name ?? (rawRow.file_name as string | null | undefined) ?? null,
    file_size: decoded?.file_size ?? (typeof rawRow.file_size === 'number' ? rawRow.file_size : 0),
    duration: decoded?.duration ?? (typeof rawRow.duration === 'number' ? rawRow.duration : 0),
    type: resolvedType,
    reply_to_id:
      decoded?.reply_to_id ?? (rawRow.reply_to_id as string | null | undefined) ?? null,
    forwarded: decoded?.forwarded ?? Boolean(rawRow.forwarded),
    deleted_for_everyone:
      decoded?.deleted_for_everyone ?? Boolean(rawRow.deleted_for_everyone),
    is_flagged: Boolean(rawRow.is_flagged),
    report_count: typeof rawRow.report_count === 'number' ? rawRow.report_count : 0,
    is_read: Boolean(rawRow.is_read) || Boolean(resolvedReadAt),
    read_by: Array.isArray(rawRow.read_by) ? (rawRow.read_by as string[]) : undefined,
    read_at: resolvedReadAt,
    reactions: normalizeReactionsMap(
      decoded?.reactions && Object.keys(decoded.reactions).length > 0
        ? decoded.reactions
        : rawRow.reactions
    ),
    created_at: String(rawRow.created_at || new Date().toISOString()),
    sender: existingSender || (senderLookup ? senderLookup(senderId) : undefined),
  };
}

export async function fetchConversationMessages(
  supabase: SupabaseClient,
  params: {
    chatId: string;
    isGroup: boolean;
    myId: string;
    peerId?: string;
    senderLookup?: (senderId: string) => Profile | undefined;
  }
): Promise<{ messages: Message[]; error: string | null }> {
  const { chatId, isGroup, myId, peerId, senderLookup } = params;
  const canTryV2 = messagesSchemaMode !== 'v1' && messagesSchemaMode !== 'v1_media';

  const dmOrFilter =
    !isGroup && peerId
      ? `chat_id.eq.${chatId},and(sender_id.eq.${myId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${myId})`
      : null;

  if (canTryV2) {
    let query = supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(id, username, name, avatar_url)');
    query = dmOrFilter ? query.or(dmOrFilter) : query.eq('chat_id', chatId);
    const joined = await query.order('created_at', { ascending: true });

    if (!joined.error && joined.data) {
      if (messagesSchemaMode === 'unknown') messagesSchemaMode = 'v2_media';
      return {
        messages: (joined.data as Record<string, unknown>[]).map((r) =>
          normalizeMessageRow(r, senderLookup)
        ),
        error: null,
      };
    }

    // Check if the error was only the FK join name vs missing `chat_id`
    if (joined.error && joined.error.code === 'PGRST200') {
      let plainQuery = supabase.from('messages').select('*');
      plainQuery = dmOrFilter ? plainQuery.or(dmOrFilter) : plainQuery.eq('chat_id', chatId);
      const plainV2 = await plainQuery.order('created_at', { ascending: true });

      if (!plainV2.error && plainV2.data) {
        if (messagesSchemaMode === 'unknown') messagesSchemaMode = 'v2_media';
        return {
          messages: (plainV2.data as Record<string, unknown>[]).map((r) =>
            normalizeMessageRow(r, senderLookup)
          ),
          error: null,
        };
      }
      if (plainV2.error && isMissingColumnError(plainV2.error)) {
        messagesSchemaMode = 'v1_media';
      } else if (plainV2.error) {
        return { messages: [], error: plainV2.error.message };
      }
    } else if (joined.error && isMissingColumnError(joined.error)) {
      messagesSchemaMode = 'v1_media';
    } else if (joined.error) {
      return { messages: [], error: joined.error.message };
    }
  }

  // V1 fallback: 5-column or lightweight `messages` table (`id, sender_id, receiver_id, text, created_at[, media_type, media_url]`)
  if (!isGroup && peerId) {
    const v1 = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${myId})`
      )
      .order('created_at', { ascending: true });

    if (v1.error) {
      return { messages: [], error: v1.error.message };
    }

    return {
      messages: ((v1.data || []) as Record<string, unknown>[]).map((r) =>
        normalizeMessageRow(r, senderLookup)
      ),
      error: null,
    };
  }

  return { messages: [], error: null };
}

export async function fetchRecentUserMessages(
  supabase: SupabaseClient,
  myId: string,
  chatIds: string[]
): Promise<Message[]> {
  const canTryV2 = messagesSchemaMode !== 'v1' && messagesSchemaMode !== 'v1_media';

  if (canTryV2) {
    const orParts = [`sender_id.eq.${myId}`, `receiver_id.eq.${myId}`];
    if (chatIds.length > 0) {
      orParts.push(`chat_id.in.(${chatIds.join(',')})`);
    }
    const v2 = await supabase
      .from('messages')
      .select('*')
      .or(orParts.join(','))
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!v2.error && v2.data) {
      if (messagesSchemaMode === 'unknown') messagesSchemaMode = 'v2_media';
      return (v2.data as Record<string, unknown>[]).map((r) => normalizeMessageRow(r));
    }
    if (v2.error && isMissingColumnError(v2.error)) {
      messagesSchemaMode = 'v1_media';
    }
  }

  const v1 = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (v1.error || !v1.data) return [];
  return (v1.data as Record<string, unknown>[]).map((r) => normalizeMessageRow(r));
}

async function ensureSenderProfile(
  supabase: SupabaseClient,
  senderId: string,
  senderProfile?: Profile
): Promise<void> {
  const shortId = senderId.replace(/-/g, '').slice(0, 8);
  const username = senderProfile?.username || `user_${shortId}`;
  const name = senderProfile?.full_name || senderProfile?.name || `User ${shortId.slice(0, 4).toUpperCase()}`;
  const avatarUrl = senderProfile?.avatar_url || '';

  try {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', senderId)
      .maybeSingle();

    if (!existing) {
      await supabase
        .from('profiles')
        .upsert(
          {
            id: senderId,
            username,
            name,
            avatar_url: avatarUrl,
            bio: '',
            role: 'user',
          },
          { onConflict: 'id' }
        );
    }
  } catch {
    // ignore if profiles insert is constrained; surface original message insert error
  }

  try {
    await supabase
      .from('users')
      .upsert(
        {
          id: senderId,
          username,
          avatar_url: avatarUrl || null,
        },
        { onConflict: 'id' }
      );
  } catch {
    // ignore if legacy users table does not exist or has restrictive RLS
  }
}

export async function insertCompatibleMessage(
  supabase: SupabaseClient,
  params: {
    chatId: string;
    senderId: string;
    receiverId?: string | null;
    payload: Partial<Message>;
    senderProfile?: Profile;
  }
): Promise<{ message: Message | null; error: string | null }> {
  const { chatId, senderId, receiverId, payload, senderProfile } = params;

  const isDirectMessage = !chatId.startsWith('grp_');
  if (isDirectMessage && !receiverId) {
    return { message: null, error: 'Select a chat first' };
  }

  const resolvedMediaUrl =
    payload.media_url ||
    payload.voice_url ||
    payload.video_url ||
    payload.image_url ||
    payload.file_url ||
    payload.sticker_url ||
    null;
  const resolvedMediaType = payload.media_type || payload.type || 'text';
  const rawContentText = typeof payload.text === 'string' ? payload.text : '';
  const isMediaMessage =
    resolvedMediaType !== 'text' ||
    (payload.type && payload.type !== 'text') ||
    Boolean(resolvedMediaUrl);

  // Text messages still require non-empty text; media messages can have empty text
  if (!isMediaMessage && !rawContentText.trim()) {
    return { message: null, error: 'Message text cannot be empty' };
  }

  // Fallback label for DBs still enforcing messages_text_len (>= 1 char on text)
  const fallbackMediaLabel =
    resolvedMediaType === 'audio' || resolvedMediaType === 'voice'
      ? '[Voice message]'
      : resolvedMediaType === 'video'
        ? '[Video]'
        : resolvedMediaType === 'image'
          ? '[Photo]'
          : `[${resolvedMediaType}]`;

  const getSafeDbText = (forceNonEmptyForMedia = false): string => {
    if (rawContentText.trim().length > 0) return rawContentText;
    if (!isMediaMessage) return rawContentText;
    if (!forceNonEmptyForMedia) return '';
    return encodeV1MessageText({ ...payload, text: '' }) || fallbackMediaLabel;
  };

  const tryInsert = async (forceNonEmptyText = false): Promise<{
    data: Record<string, unknown> | null;
    error: { code?: string; message?: string; details?: string } | null;
  }> => {
    const dbText = getSafeDbText(forceNonEmptyText);

    // 1) Full V2 schema with media_type, media_url, and receiver_id columns
    if (messagesSchemaMode === 'unknown' || messagesSchemaMode === 'v2_media') {
      const v2MediaRow = {
        chat_id: chatId,
        sender_id: senderId,
        ...(receiverId ? { receiver_id: receiverId } : {}),
        type: payload.type || 'text',
        media_type: resolvedMediaType,
        media_url: resolvedMediaUrl,
        text: dbText,
        image_url: payload.image_url || null,
        video_url: payload.video_url || null,
        sticker_url: payload.sticker_url || null,
        voice_url: payload.voice_url || null,
        file_url: payload.file_url || null,
        file_name: payload.file_name || null,
        file_size: payload.file_size || 0,
        duration: payload.duration || 0,
        reply_to_id: payload.reply_to_id || null,
        forwarded: Boolean(payload.forwarded),
        is_flagged: Boolean(payload.is_flagged),
        read_by: payload.read_by || [senderId],
      };

      const res = await supabase.from('messages').insert(v2MediaRow).select('*').single();
      if (!res.error && res.data) {
        messagesSchemaMode = 'v2_media';
        return { data: res.data as Record<string, unknown>, error: null };
      }

      if (res.error && isTextLenConstraintError(res.error) && !forceNonEmptyText && isMediaMessage) {
        return tryInsert(true);
      }

      if (res.error && !isMissingColumnError(res.error)) {
        return { data: null, error: res.error };
      }
      messagesSchemaMode = 'v2';
    }

    // 2) V2 schema with receiver_id (when media_type/media_url are not added yet)
    if (messagesSchemaMode === 'v2') {
      // Preserve media_type / media_url inside encoded envelope when media_type column does not exist yet
      const v2Text = isMediaMessage && !rawContentText.trim()
        ? encodeV1MessageText({ ...payload, text: '' })
        : dbText;
      const baseV2Row = {
        chat_id: chatId,
        sender_id: senderId,
        ...(receiverId ? { receiver_id: receiverId } : {}),
        type: payload.type || 'text',
        text: v2Text,
        image_url: payload.image_url || null,
        video_url: payload.video_url || null,
        sticker_url: payload.sticker_url || null,
        voice_url: payload.voice_url || null,
        file_url: payload.file_url || null,
        file_name: payload.file_name || null,
        file_size: payload.file_size || 0,
        duration: payload.duration || 0,
        reply_to_id: payload.reply_to_id || null,
        forwarded: Boolean(payload.forwarded),
        is_flagged: Boolean(payload.is_flagged),
        read_by: payload.read_by || [senderId],
      };

      const res = await supabase.from('messages').insert(baseV2Row).select('*').single();
      if (!res.error && res.data) {
        return { data: res.data as Record<string, unknown>, error: null };
      }

      if (res.error && isTextLenConstraintError(res.error) && !forceNonEmptyText && isMediaMessage) {
        return tryInsert(true);
      }

      // If receiver_id column does not exist on a strict V2-only schema, retry without receiver_id
      if (
        res.error &&
        isMissingColumnError(res.error) &&
        `${res.error.message || ''} ${res.error.details || ''}`.toLowerCase().includes('receiver_id')
      ) {
        const { receiver_id: _omit, ...withoutReceiver } = baseV2Row;
        const retryRes = await supabase.from('messages').insert(withoutReceiver).select('*').single();
        if (!retryRes.error && retryRes.data) {
          return { data: retryRes.data as Record<string, unknown>, error: null };
        }
        if (retryRes.error && !isMissingColumnError(retryRes.error)) {
          return { data: null, error: retryRes.error };
        }
      } else if (res.error && !isMissingColumnError(res.error)) {
        return { data: null, error: res.error };
      }
      messagesSchemaMode = 'v1_media';
    }

    if (!receiverId) {
      return {
        data: null,
        error: { message: 'Group chat requires running the latest database setup SQL.' },
      };
    }

    // 3) Lightweight V1 table that has media_type + media_url columns (without chat_id)
    if (messagesSchemaMode === 'v1_media') {
      const v1MediaRow = {
        sender_id: senderId,
        receiver_id: receiverId,
        media_type: resolvedMediaType,
        media_url: resolvedMediaUrl,
        duration: payload.duration || 0,
        text: forceNonEmptyText ? encodeV1MessageText(payload) : dbText,
      };

      const v1MediaRes = await supabase.from('messages').insert(v1MediaRow).select('*').single();
      if (!v1MediaRes.error && v1MediaRes.data) {
        return { data: v1MediaRes.data as Record<string, unknown>, error: null };
      }
      if (
        v1MediaRes.error &&
        isTextLenConstraintError(v1MediaRes.error) &&
        !forceNonEmptyText &&
        isMediaMessage
      ) {
        return tryInsert(true);
      }
      if (v1MediaRes.error && !isMissingColumnError(v1MediaRes.error)) {
        return { data: null, error: v1MediaRes.error };
      }
      messagesSchemaMode = 'v1';
    }

    // 4) Strict 5-column V1 fallback (`id, sender_id, receiver_id, text, created_at`)
    const v1Row = {
      sender_id: senderId,
      receiver_id: receiverId,
      text: encodeV1MessageText(payload) || fallbackMediaLabel,
    };

    const v1Res = await supabase.from('messages').insert(v1Row).select('*').single();
    return {
      data: (v1Res.data as Record<string, unknown> | null) || null,
      error: v1Res.error,
    };
  };

  let attempt = await tryInsert(false);

  if (attempt.error && attempt.error.code === '23503') {
    await ensureSenderProfile(supabase, senderId, senderProfile);
    attempt = await tryInsert(false);
  }

  if (attempt.error) {
    const details = `${attempt.error.message || ''} ${attempt.error.details || ''}`;
    if (attempt.error.code === '23503' && details.includes('messages_sender_id_fkey')) {
      return {
        message: null,
        error:
          'Foreign key messages_sender_id_fkey on Supabase still points to an outdated table. Open Setup SQL and run it in Supabase SQL Editor to fix it.',
      };
    }
    return { message: null, error: attempt.error.message || 'Failed to send message' };
  }

  if (!attempt.data) {
    return { message: null, error: 'Failed to send message' };
  }

  return {
    message: normalizeMessageRow(attempt.data, () => senderProfile),
    error: null,
  };
}

export async function deleteCompatibleMessage(
  supabase: SupabaseClient,
  messageId: string
): Promise<{ error: string | null }> {
  if (messagesSchemaMode === 'unknown' || messagesSchemaMode === 'v2_media') {
    const res = await supabase
      .from('messages')
      .update({
        deleted_for_everyone: true,
        text: 'This message was deleted',
        media_type: 'text',
        media_url: null,
        image_url: null,
        video_url: null,
        sticker_url: null,
        voice_url: null,
        file_url: null,
      })
      .eq('id', messageId);

    if (!res.error) {
      messagesSchemaMode = 'v2_media';
      return { error: null };
    }
    if (!isMissingColumnError(res.error)) {
      return { error: res.error.message };
    }
    messagesSchemaMode = 'v2';
  }

  if (messagesSchemaMode === 'v2') {
    const res = await supabase
      .from('messages')
      .update({
        deleted_for_everyone: true,
        text: 'This message was deleted',
        image_url: null,
        video_url: null,
        sticker_url: null,
        voice_url: null,
        file_url: null,
      })
      .eq('id', messageId);

    if (!res.error) {
      return { error: null };
    }
    if (!isMissingColumnError(res.error)) {
      return { error: res.error.message };
    }
    messagesSchemaMode = 'v1';
  }

  const v1Res = await supabase
    .from('messages')
    .update({
      text: encodeV1MessageText({
        type: 'text',
        text: 'This message was deleted',
        deleted_for_everyone: true,
      }),
    })
    .eq('id', messageId);

  return { error: v1Res.error?.message || null };
}

export async function markMessagesAsReadCompatible(
  supabase: SupabaseClient,
  params: {
    messages: Message[];
    readerId: string;
    readAt?: string;
  }
): Promise<{ updatedIds: string[]; readAt: string }> {
  const { messages, readerId } = params;
  const readAt = params.readAt || new Date().toISOString();
  const unread = messages.filter(
    (m) =>
      m.id &&
      !m.id.startsWith('local_') &&
      m.sender_id !== readerId &&
      (!m.read_at || !(m.read_by || []).includes(readerId))
  );

  if (unread.length === 0) {
    return { updatedIds: [], readAt };
  }

  const updatedIds: string[] = [];
  for (const msg of unread) {
    const nextReadBy = Array.from(new Set([...(msg.read_by || []), readerId]));
    const res = await supabase
      .from('messages')
      .update({ read_at: readAt, read_by: nextReadBy })
      .eq('id', msg.id);

    if (!res.error) {
      updatedIds.push(msg.id);
      continue;
    }

    if (isMissingColumnError(res.error)) {
      const msgLower = `${res.error.message || ''} ${res.error.details || ''}`.toLowerCase();
      if (msgLower.includes('read_at')) {
        const readByOnly = await supabase
          .from('messages')
          .update({ read_by: nextReadBy })
          .eq('id', msg.id);
        if (!readByOnly.error) {
          updatedIds.push(msg.id);
          continue;
        }
      }
      updatedIds.push(msg.id);
    }
  }

  return { updatedIds, readAt };
}

export async function toggleMessageReactionCompatible(
  supabase: SupabaseClient,
  params: {
    message: Message;
    emoji: string;
    userId: string;
  }
): Promise<{ reactions: Record<string, string[]>; error: string | null }> {
  const { message, emoji, userId } = params;
  const current = normalizeReactionsMap(message.reactions);
  const existingUsers = current[emoji] || [];
  const nextUsers = existingUsers.includes(userId)
    ? existingUsers.filter((id) => id !== userId)
    : [...existingUsers, userId];

  const nextReactions: Record<string, string[]> = { ...current };
  if (nextUsers.length > 0) {
    nextReactions[emoji] = nextUsers;
  } else {
    delete nextReactions[emoji];
  }

  if (message.id.startsWith('local_')) {
    return { reactions: nextReactions, error: null };
  }

  const res = await supabase
    .from('messages')
    .update({ reactions: nextReactions })
    .eq('id', message.id);

  if (!res.error) {
    return { reactions: nextReactions, error: null };
  }

  if (isMissingColumnError(res.error)) {
    const encodedFallback = await supabase
      .from('messages')
      .update({
        text: encodeV1MessageText({
          ...message,
          reactions: nextReactions,
        }),
      })
      .eq('id', message.id);

    if (!encodedFallback.error) {
      return { reactions: nextReactions, error: null };
    }
    return { reactions: nextReactions, error: encodedFallback.error.message };
  }

  return { reactions: nextReactions, error: res.error.message };
}

export function formatMessagePreview(msg?: Message): string {
  if (!msg) return 'Tap to start chatting';
  if (msg.deleted_for_everyone) return 'Message deleted';
  const kind =
    normalizeMediaKind(msg.media_type) || normalizeMediaKind(msg.type) || msg.type;
  if (kind === 'voice') return 'Voice message';
  if (kind === 'audio') return msg.file_name ? `Audio: ${msg.file_name}` : 'Audio message';
  if (kind === 'image') return 'Photo';
  if (kind === 'video') return 'Video';
  if (kind === 'sticker') return 'Sticker';
  if (kind === 'document') return msg.file_name ? `File: ${msg.file_name}` : 'Document';
  return msg.text || `[${msg.type}]`;
}
