import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://lqgixqbciaperisapfnm.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Ms6qDzTYBDJ7qY9C-Dc89Q_HJKsjXi7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export interface PingResult {
  ok: boolean;
  error: string | null;
  latency: number | null;
}

export async function pingSupabase(): Promise<PingResult> {
  try {
    const start = performance.now();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      cache: 'no-store',
    });
    const latency = Math.round(performance.now() - start);
    if (!res.ok && res.status >= 500) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, latency };
    }
    return { ok: true, error: null, latency };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network unreachable';
    return { ok: false, error: message, latency: null };
  }
}

export async function verifyRequiredTables(): Promise<string[]> {
  const required = [
    'profiles',
    'friends',
    'messages',
    'moments',
    'video_calls',
    'reports',
    'admin_logs',
    'stickers',
    'sticker_favourites',
  ];
  const missing: string[] = [];
  await Promise.all(
    required.map(async (table) => {
      const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
      if (
        error &&
        (error.code === '42P01' ||
          error.message?.includes('does not exist') ||
          error.message?.includes('schema cache'))
      ) {
        missing.push(table);
      }
    })
  );
  return missing;
}

export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  let accessToken = SUPABASE_ANON_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      accessToken = data.session.access_token;
    }
  } catch {
    const tokenKey = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (tokenKey) {
      try {
        const parsed = JSON.parse(localStorage.getItem(tokenKey) || '{}');
        if (parsed?.access_token) accessToken = parsed.access_token;
      } catch {
        // fallback to anon key
      }
    }
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    xhr.open('POST', url, true);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('x-upsert', 'true');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        resolve(data.publicUrl);
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during file upload'));
    xhr.send(file);
  });
}
