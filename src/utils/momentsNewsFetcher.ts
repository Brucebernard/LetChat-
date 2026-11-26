import { FootballSourcesConfig, GeneratedMomentNews } from '../types';
import { fetchAllFootballFeeds } from './footballFetcher';

const CACHE_KEY = 'letchat_moments_live_news';

export interface LiveMomentsNewsResponse {
  items: GeneratedMomentNews[];
  fetchedAt: string;
}

export function getCachedMomentsNews(): LiveMomentsNewsResponse | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveMomentsNewsResponse;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedMomentsNews(data: LiveMomentsNewsResponse): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchLiveMomentsNews(params: {
  accessToken: string;
  forceRefresh?: boolean;
  connectedSources?: Partial<FootballSourcesConfig>;
}): Promise<LiveMomentsNewsResponse> {
  const qs = params.forceRefresh ? '?refresh=1' : '';
  const serverPromise = fetch(`/api/moments/news${qs}`, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Failed to load live feeds (HTTP ${res.status})`);
    }
    return data;
  });

  const hasConnectedAccounts = Boolean(
    params.connectedSources &&
      (params.connectedSources.youtubeApiKey ||
        params.connectedSources.facebookToken ||
        params.connectedSources.instagramToken ||
        params.connectedSources.xBearerToken ||
        params.connectedSources.customRssUrls)
  );

  const connectedPromise = hasConnectedAccounts
    ? fetchAllFootballFeeds(params.connectedSources).then((posts) =>
        posts
          .filter((p) => p.platform === 'Facebook' || p.platform === 'Instagram' || p.platform === 'X' || p.platform === 'YouTube')
          .map<GeneratedMomentNews>((p) => ({
            id: `conn-${p.id}`,
            platform: p.platform === 'RSS' || p.platform === 'LetChat' ? 'YouTube' : p.platform,
            handle: p.pageName,
            title: p.title,
            summary: p.description,
            category: 'News',
            sourceUrl: p.originalUrl,
            thumbnail: p.thumbnail,
            videoUrl: p.videoUrl,
            isYoutube: p.isYoutube,
            publishedAt: p.time,
          }))
      )
    : Promise.resolve([] as GeneratedMomentNews[]);

  const [serverData, connectedItems] = await Promise.all([serverPromise, connectedPromise]);

  const rawServerItems: GeneratedMomentNews[] = Array.isArray(serverData.items)
    ? serverData.items
    : [];

  const combined = [...connectedItems, ...rawServerItems].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const payload: LiveMomentsNewsResponse = {
    items: combined,
    fetchedAt: serverData.fetchedAt || new Date().toISOString(),
  };

  if (payload.items.length > 0) {
    saveCachedMomentsNews(payload);
  }
  return payload;
}

export async function searchLiveNewsAndEntertainment(params: {
  accessToken: string;
  query: string;
  category?: string;
}): Promise<GeneratedMomentNews[]> {
  const qs = new URLSearchParams({
    q: params.query.trim(),
    category: params.category || 'Entertainment',
  });
  const res = await fetch(`/api/news/search?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { items?: GeneratedMomentNews[] };
  return Array.isArray(data.items) ? data.items : [];
}

export const searchLiveYouTubeVideos = searchLiveNewsAndEntertainment;
