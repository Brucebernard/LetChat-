const DRAFT_PREFIX = 'letchat_msg_draft_v1:';

export function getDraftKey(userId: string | undefined | null, chatId: string): string {
  return `${DRAFT_PREFIX}${userId || 'anon'}:${chatId}`;
}

export function loadMessageDraft(userId: string | undefined | null, chatId: string): string {
  if (!chatId || typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(getDraftKey(userId, chatId)) || '';
  } catch {
    return '';
  }
}

export function saveMessageDraft(
  userId: string | undefined | null,
  chatId: string,
  draft: string
): void {
  if (!chatId || typeof localStorage === 'undefined') return;
  try {
    const key = getDraftKey(userId, chatId);
    if (!draft.trim()) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, draft);
    }
  } catch {
    // ignore storage quota errors
  }
}

export function clearMessageDraft(userId: string | undefined | null, chatId: string): void {
  if (!chatId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getDraftKey(userId, chatId));
  } catch {
    // ignore storage errors
  }
}
