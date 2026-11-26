import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://lqgixqbciaperisapfnm.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Ms6qDzTYBDJ7qY9C-Dc89Q_HJKsjXi7';

type FeedPlatform = 'TikTok' | 'Instagram' | 'X' | 'Facebook' | 'YouTube' | 'TMDB' | 'News';

interface PublicFeedSpec {
  name: string;
  url: string;
  defaultCategory: 'News' | 'Music' | 'Entertainment' | 'Funny';
  defaultPlatform: FeedPlatform;
}

const PUBLIC_FEEDS: PublicFeedSpec[] = [
  {
    name: 'BBC World News',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    defaultCategory: 'News',
    defaultPlatform: 'News',
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    defaultCategory: 'News',
    defaultPlatform: 'News',
  },
  {
    name: 'Sky News World',
    url: 'https://feeds.skynews.com/feeds/rss/world.xml',
    defaultCategory: 'News',
    defaultPlatform: 'News',
  },
  {
    name: 'Google News World',
    url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
    defaultCategory: 'News',
    defaultPlatform: 'News',
  },
  {
    name: 'Google News Ghana',
    url: 'https://news.google.com/rss?hl=en-GH&gl=GH&ceid=GH:en',
    defaultCategory: 'News',
    defaultPlatform: 'News',
  },
  {
    name: 'Citi Newsroom',
    url: 'https://citinewsroom.com/feed/',
    defaultCategory: 'News',
    defaultPlatform: 'News',
  },
  {
    name: 'MyJoyOnline',
    url: 'https://www.myjoyonline.com/feed/',
    defaultCategory: 'News',
    defaultPlatform: 'News',
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    defaultCategory: 'News',
    defaultPlatform: 'News',
  },
  {
    name: 'BBC Entertainment',
    url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    defaultCategory: 'Entertainment',
    defaultPlatform: 'News',
  },
  {
    name: 'Billboard',
    url: 'https://www.billboard.com/feed/',
    defaultCategory: 'Music',
    defaultPlatform: 'News',
  },
  {
    name: 'NME Music',
    url: 'https://www.nme.com/news/music/feed',
    defaultCategory: 'Music',
    defaultPlatform: 'News',
  },
  {
    name: 'Rolling Stone',
    url: 'https://www.rollingstone.com/music/music-news/feed/',
    defaultCategory: 'Music',
    defaultPlatform: 'News',
  },
  {
    name: 'Variety',
    url: 'https://variety.com/feed/',
    defaultCategory: 'Entertainment',
    defaultPlatform: 'News',
  },
  {
    name: 'TMZ',
    url: 'https://www.tmz.com/rss.xml',
    defaultCategory: 'Entertainment',
    defaultPlatform: 'News',
  },
  {
    name: 'BuzzFeed',
    url: 'https://www.buzzfeed.com/index.xml',
    defaultCategory: 'Funny',
    defaultPlatform: 'News',
  },
  {
    name: 'Know Your Meme',
    url: 'https://knowyourmeme.com/newsfeed.rss',
    defaultCategory: 'Funny',
    defaultPlatform: 'News',
  },
  {
    name: 'BBC News YouTube',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC16niRr50-MSBwiO3YDb3RA',
    defaultCategory: 'News',
    defaultPlatform: 'YouTube',
  },
  {
    name: 'Vevo YouTube',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2pmfLm7iq6Ov1UwYrWYkZA',
    defaultCategory: 'Music',
    defaultPlatform: 'YouTube',
  },
];

interface AggregatedNewsItem {
  id: string;
  platform: FeedPlatform;
  handle: string;
  title: string;
  summary: string;
  category: string;
  sourceUrl: string;
  thumbnail: string;
  videoUrl: string | null;
  isYoutube: boolean;
  publishedAt: string;
}

let cachedFeed: { items: AggregatedNewsItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 2 * 60 * 1000;

function isSafeHttpUrl(raw?: string | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function decodeHtml(str = ''): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function extractAttr(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["'][^>]*>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function extractYoutubeId(link = ''): string | null {
  const m = link.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function detectSocialPlatform(title: string, desc: string, link: string, fallback: FeedPlatform): FeedPlatform {
  if (fallback === 'YouTube' || extractYoutubeId(link)) return 'YouTube';
  const text = `${title} ${desc} ${link}`.toLowerCase();
  if (text.includes('tiktok')) return 'TikTok';
  if (text.includes('instagram')) return 'Instagram';
  if (/\btwitter\b|\bx\.com\b|\btweet\b|\bon x\b/.test(text)) return 'X';
  if (text.includes('facebook') || text.includes('meta ')) return 'Facebook';
  return fallback;
}

function classifyCategory(title: string, desc: string, fallback: string): string {
  const text = `${title} ${desc}`.toLowerCase();
  if (/\b(song|album|music|rapper|singer|afrobeats|concert|tour|billboard|track)\b/.test(text)) {
    return 'Music';
  }
  if (/\b(meme|funny|hilarious|comedy|joke|laugh|prank|viral)\b/.test(text)) {
    return 'Funny';
  }
  if (/\b(movie|film|actor|actress|celebrity|netflix|hollywood|show|award|tv)\b/.test(text)) {
    return 'Entertainment';
  }
  return fallback;
}

async function fetchOneFeed(spec: PublicFeedSpec): Promise<AggregatedNewsItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(spec.url, {
      headers: { 'User-Agent': 'LetChat/2.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();

    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
    return blocks.slice(0, 8).map((block, idx) => {
      const title = decodeHtml(extractTag(block, 'title'));
      const rawLink =
        extractAttr(block, 'link', 'href') || decodeHtml(extractTag(block, 'link'));
      const sourceUrl = isSafeHttpUrl(rawLink) ? rawLink : '';
      const rawDesc =
        extractTag(block, 'description') ||
        extractTag(block, 'media:description') ||
        extractTag(block, 'summary');
      const summary = decodeHtml(rawDesc).slice(0, 220);
      const rawDate =
        extractTag(block, 'pubDate') ||
        extractTag(block, 'published') ||
        extractTag(block, 'updated');
      const publishedAt =
        rawDate && !Number.isNaN(Date.parse(rawDate))
          ? new Date(rawDate).toISOString()
          : new Date().toISOString();

      const ytId = extractYoutubeId(sourceUrl);
      const inlineImgMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
      const rawThumb =
        extractAttr(block, 'media:thumbnail', 'url') ||
        extractAttr(block, 'media:content', 'url') ||
        extractAttr(block, 'enclosure', 'url') ||
        (inlineImgMatch ? inlineImgMatch[1] : '') ||
        (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');
      const thumbnail = isSafeHttpUrl(rawThumb) ? rawThumb : '';

      const platform = detectSocialPlatform(title, summary, sourceUrl, spec.defaultPlatform);
      const category = classifyCategory(title, summary, spec.defaultCategory);

      return {
        id: `${spec.name.replace(/\s+/g, '-').toLowerCase()}-${idx}-${sourceUrl.slice(-24)}`,
        platform,
        handle: spec.name,
        title,
        summary: summary === title ? '' : summary,
        category,
        sourceUrl,
        thumbnail,
        videoUrl: ytId ? `https://www.youtube.com/embed/${ytId}` : null,
        isYoutube: Boolean(ytId),
        publishedAt,
      };
    }).filter((item) => item.title.length > 0);
  } catch {
    return [];
  }
}

interface YouTubeApiSnippet {
  title?: string;
  description?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnails?: {
    maxres?: { url?: string };
    high?: { url?: string };
    medium?: { url?: string };
    default?: { url?: string };
  };
}

function mapYouTubeItemToNews(
  videoId: string,
  snippet: YouTubeApiSnippet,
  defaultCategory: string
): AggregatedNewsItem {
  const title = decodeHtml(snippet.title || 'YouTube Video');
  const summary = decodeHtml(snippet.description || '').slice(0, 220);
  const rawThumb =
    snippet.thumbnails?.high?.url ||
    snippet.thumbnails?.medium?.url ||
    snippet.thumbnails?.default?.url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    id: `yt-${videoId}`,
    platform: 'YouTube',
    handle: snippet.channelTitle || 'YouTube',
    title,
    summary: summary === title ? '' : summary,
    category: classifyCategory(title, summary, defaultCategory),
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: isSafeHttpUrl(rawThumb) ? rawThumb : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    videoUrl: `https://www.youtube.com/embed/${videoId}`,
    isYoutube: true,
    publishedAt:
      snippet.publishedAt && !Number.isNaN(Date.parse(snippet.publishedAt))
        ? snippet.publishedAt
        : new Date().toISOString(),
  };
}

async function fetchYouTubePopularCategory(
  apiKey: string,
  videoCategoryId: string,
  defaultCategory: string,
  maxResults = 8
): Promise<AggregatedNewsItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&videoCategoryId=${encodeURIComponent(
      videoCategoryId
    )}&maxResults=${maxResults}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: { id?: string; snippet?: YouTubeApiSnippet }[];
    };
    if (!Array.isArray(data.items)) return [];
    return data.items
      .filter((item) => typeof item.id === 'string' && Boolean(item.snippet))
      .map((item) => mapYouTubeItemToNews(item.id as string, item.snippet as YouTubeApiSnippet, defaultCategory));
  } catch {
    return [];
  }
}

async function searchYouTubeApi(
  apiKey: string,
  query: string,
  defaultCategory: string,
  maxResults = 10
): Promise<AggregatedNewsItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance&maxResults=${maxResults}&q=${encodeURIComponent(
      query
    )}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: { id?: { videoId?: string }; snippet?: YouTubeApiSnippet }[];
    };
    if (!Array.isArray(data.items)) return [];
    return data.items
      .filter((item) => typeof item.id?.videoId === 'string' && Boolean(item.snippet))
      .map((item) =>
        mapYouTubeItemToNews(
          item.id?.videoId as string,
          item.snippet as YouTubeApiSnippet,
          defaultCategory
        )
      );
  } catch {
    return [];
  }
}

async function fetchYouTubeEntertainmentAndNews(): Promise<AggregatedNewsItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return [];

  const batches = await Promise.all([
    fetchYouTubePopularCategory(apiKey, '24', 'Entertainment', 12),
    fetchYouTubePopularCategory(apiKey, '10', 'Music', 8),
    fetchYouTubePopularCategory(apiKey, '23', 'Funny', 6),
    fetchYouTubePopularCategory(apiKey, '25', 'News', 6),
    searchYouTubeApi(apiKey, 'entertainment celebrity movie music news today', 'Entertainment', 8),
    searchYouTubeApi(apiKey, 'ghana afrobeats music entertainment trending', 'Entertainment', 8),
  ]);

  const seen = new Set<string>();
  const deduped: AggregatedNewsItem[] = [];
  for (const item of batches.flat()) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

interface TmdbMediaRow {
  id?: number;
  media_type?: 'movie' | 'tv' | 'person' | string;
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

function tmdbHeaders(): Record<string, string> | null {
  const bearer = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (bearer) {
    return {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
    };
  }
  return null;
}

async function fetchTmdbJson<T>(pathWithQuery: string): Promise<T | null> {
  const headers = tmdbHeaders();
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!headers && !apiKey) return null;

  const sep = pathWithQuery.includes('?') ? '&' : '?';
  const url =
    headers
      ? `https://api.themoviedb.org/3${pathWithQuery}`
      : `https://api.themoviedb.org/3${pathWithQuery}${sep}api_key=${encodeURIComponent(apiKey || '')}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      headers: headers || { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTmdbTrailerYoutubeKey(
  mediaType: 'movie' | 'tv',
  id: number
): Promise<string | null> {
  const data = await fetchTmdbJson<{
    results?: { site?: string; type?: string; key?: string; official?: boolean }[];
  }>(`/${mediaType}/${id}/videos?language=en-US`);
  const list = Array.isArray(data?.results) ? data.results : [];
  const preferred =
    list.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official && v.key) ||
    list.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.key) ||
    list.find((v) => v.site === 'YouTube' && v.key);
  return preferred?.key && /^[a-zA-Z0-9_-]{11}$/.test(preferred.key) ? preferred.key : null;
}

function mapTmdbRowToNews(
  row: TmdbMediaRow,
  fallbackType: 'movie' | 'tv',
  trailerKey: string | null,
  sourceLabel: string
): AggregatedNewsItem | null {
  if (!row.id) return null;
  const mediaType: 'movie' | 'tv' = row.media_type === 'tv' || fallbackType === 'tv' ? 'tv' : 'movie';
  if (row.media_type === 'person') return null;

  const title = decodeHtml(row.title || row.name || '').trim();
  if (!title) return null;

  const imgPath = row.backdrop_path || row.poster_path;
  const thumbnail = imgPath ? `https://image.tmdb.org/t/p/w780${imgPath}` : '';
  const rating =
    typeof row.vote_average === 'number' && row.vote_average > 0
      ? `★ ${row.vote_average.toFixed(1)} · `
      : '';
  const overview = decodeHtml(row.overview || '');
  const summary = `${rating}${overview}`.slice(0, 220);

  const rawDate = row.release_date || row.first_air_date;
  const publishedAt =
    rawDate && !Number.isNaN(Date.parse(rawDate))
      ? new Date(rawDate).toISOString()
      : new Date().toISOString();

  return {
    id: `tmdb-${mediaType}-${row.id}`,
    platform: 'TMDB',
    handle: sourceLabel,
    title: `${mediaType === 'tv' ? 'TV' : 'Movie'}: ${title}`,
    summary,
    category: 'Entertainment',
    sourceUrl: `https://www.themoviedb.org/${mediaType}/${row.id}`,
    thumbnail,
    videoUrl: trailerKey ? `https://www.youtube.com/embed/${trailerKey}` : null,
    isYoutube: Boolean(trailerKey),
    publishedAt,
  };
}

async function fetchTmdbEntertainmentNews(): Promise<AggregatedNewsItem[]> {
  if (!tmdbHeaders() && !process.env.TMDB_API_KEY?.trim()) return [];

  const [trending, nowPlaying, onAir] = await Promise.all([
    fetchTmdbJson<{ results?: TmdbMediaRow[] }>('/trending/all/day?language=en-US'),
    fetchTmdbJson<{ results?: TmdbMediaRow[] }>('/movie/now_playing?language=en-US&page=1'),
    fetchTmdbJson<{ results?: TmdbMediaRow[] }>('/tv/on_the_air?language=en-US&page=1'),
  ]);

  const rawCandidates: { row: TmdbMediaRow; type: 'movie' | 'tv'; label: string }[] = [
    ...(trending?.results || []).slice(0, 8).map((row) => ({
      row,
      type: (row.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
      label: 'TMDB Trending',
    })),
    ...(nowPlaying?.results || []).slice(0, 6).map((row) => ({
      row,
      type: 'movie' as const,
      label: 'In Theaters Now',
    })),
    ...(onAir?.results || []).slice(0, 6).map((row) => ({
      row,
      type: 'tv' as const,
      label: 'TV On The Air',
    })),
  ];

  // Fetch official trailers for top 10 entries in parallel
  const trailerKeys = await Promise.all(
    rawCandidates.slice(0, 10).map((c) =>
      c.row.id && c.row.media_type !== 'person'
        ? fetchTmdbTrailerYoutubeKey(c.type, c.row.id)
        : Promise.resolve(null)
    )
  );

  const seen = new Set<string>();
  const out: AggregatedNewsItem[] = [];
  rawCandidates.forEach((c, idx) => {
    const mapped = mapTmdbRowToNews(c.row, c.type, trailerKeys[idx] ?? null, c.label);
    if (!mapped || seen.has(mapped.id)) return;
    seen.add(mapped.id);
    out.push(mapped);
  });

  return out;
}

async function searchTmdbContent(query: string): Promise<AggregatedNewsItem[]> {
  if (!query.trim()) return [];
  if (!tmdbHeaders() && !process.env.TMDB_API_KEY?.trim()) return [];

  const data = await fetchTmdbJson<{ results?: TmdbMediaRow[] }>(
    `/search/multi?query=${encodeURIComponent(query.trim())}&language=en-US&page=1`
  );
  const rows = (data?.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 8);
  const keys = await Promise.all(
    rows.slice(0, 5).map((r) =>
      r.id ? fetchTmdbTrailerYoutubeKey(r.media_type === 'tv' ? 'tv' : 'movie', r.id) : Promise.resolve(null)
    )
  );
  return rows
    .map((r, idx) =>
      mapTmdbRowToNews(r, r.media_type === 'tv' ? 'tv' : 'movie', keys[idx] ?? null, 'TMDB Search')
    )
    .filter((item): item is AggregatedNewsItem => Boolean(item));
}

async function requireSupabaseUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Invalid authorization token.' });
    return;
  }
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!userRes.ok) {
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    const user = (await userRes.json()) as {
      id?: string;
      email?: string;
      user_metadata?: { name?: string };
    };
    if (!user?.id) {
      res.status(401).json({ error: 'Invalid user session.' });
      return;
    }
    res.locals.supabaseUser = {
      id: user.id,
      email: user.email || '',
      name: typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '',
    };
    next();
  } catch {
    res.status(502).json({ error: 'Unable to verify authentication session.' });
  }
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/gif-asset/:id.svg', (req: Request, res: Response) => {
    const id = String(req.params.id || '').toLowerCase();
    const specs: Record<
      string,
      { bg1: string; bg2: string; emoji: string; label: string; motion: 'bounce' | 'pulse' | 'spin' | 'wiggle' }
    > = {
      aurora_vibe: { bg1: '#2A0845', bg2: '#6441A5', emoji: '✨', label: 'Aurora Vibe', motion: 'pulse' },
      laugh_rofl: { bg1: '#FF8008', bg2: '#FFC837', emoji: '🤣', label: 'ROFL', motion: 'wiggle' },
      heart_love: { bg1: '#DD2476', bg2: '#FF512F', emoji: '❤️', label: 'Big Love', motion: 'pulse' },
      fire_hype: { bg1: '#F12711', bg2: '#F5AF19', emoji: '🔥', label: 'On Fire', motion: 'bounce' },
      ghana_goal: { bg1: '#CE1126', bg2: '#006B3F', emoji: '🇬🇭', label: 'Ghana Goal!', motion: 'bounce' },
      party_boom: { bg1: '#4776E6', bg2: '#8E54E9', emoji: '🎉', label: 'Celebrate!', motion: 'spin' },
      thumbs_ok: { bg1: '#11998E', bg2: '#38EF7D', emoji: '👍', label: 'Sorted!', motion: 'bounce' },
      mind_blown: { bg1: '#3A1C71', bg2: '#D76D77', emoji: '🤯', label: 'No Way!', motion: 'wiggle' },
      cry_tears: { bg1: '#2193B0', bg2: '#6DD5ED', emoji: '😭', label: 'Too Funny', motion: 'wiggle' },
      crown_king: { bg1: '#B79891', bg2: '#94716B', emoji: '👑', label: 'Legend', motion: 'pulse' },
      football_win: { bg1: '#134E5E', bg2: '#71B280', emoji: '⚽', label: 'GOOOAL!', motion: 'spin' },
      medaase_hi: { bg1: '#0F2027', bg2: '#2C5364', emoji: '🙏', label: 'Medaase!', motion: 'pulse' },
    };
    const item = specs[id] || specs.aurora_vibe;
    const animTag =
      item.motion === 'bounce'
        ? `<animateTransform attributeName="transform" type="translate" values="0 4; 0 -10; 0 4" dur="0.9s" repeatCount="indefinite" />`
        : item.motion === 'wiggle'
          ? `<animateTransform attributeName="transform" type="rotate" values="-10 110 75; 10 110 75; -10 110 75" dur="0.7s" repeatCount="indefinite" />`
          : item.motion === 'spin'
            ? `<animateTransform attributeName="transform" type="scale" values="1;1.18;1" dur="0.9s" additive="sum" repeatCount="indefinite" />`
            : `<animateTransform attributeName="transform" type="scale" values="0.95;1.16;0.95" dur="1.1s" repeatCount="indefinite" />`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="160" viewBox="0 0 220 160">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${item.bg1}" />
      <stop offset="100%" stop-color="${item.bg2}" />
    </linearGradient>
  </defs>
  <rect width="220" height="160" rx="18" fill="url(#g)" />
  <circle cx="38" cy="30" r="18" fill="rgba(255,255,255,0.12)">
    <animate attributeName="r" values="14;22;14" dur="2.2s" repeatCount="indefinite" />
  </circle>
  <circle cx="185" cy="128" r="24" fill="rgba(255,255,255,0.1)">
    <animate attributeName="r" values="18;28;18" dur="2.6s" repeatCount="indefinite" />
  </circle>
  <g transform="translate(110 74)">
    <g>
      ${item.motion === 'wiggle' ? `<animateTransform attributeName="transform" type="rotate" values="-12;12;-12" dur="0.65s" repeatCount="indefinite" />` : animTag}
      <text x="0" y="14" text-anchor="middle" font-size="56">${item.emoji}</text>
    </g>
  </g>
  <rect x="28" y="118" width="164" height="28" rx="14" fill="rgba(0,0,0,0.35)" />
  <text x="110" y="137" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="700" font-size="14" fill="#FFFFFF">${item.label}</text>
</svg>`;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(svg);
  });

  app.get('/api/gifs/search', (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const catalog = [
      { id: 'aurora_vibe', title: 'Aurora Vibe', tags: 'aurora glow magic sparkle hello hi', url: '/api/gif-asset/aurora_vibe.svg' },
      { id: 'laugh_rofl', title: 'ROFL Laughing', tags: 'funny laugh lol haha rofl happy', url: '/api/gif-asset/laugh_rofl.svg' },
      { id: 'heart_love', title: 'Big Love', tags: 'love heart kiss romantic cute', url: '/api/gif-asset/heart_love.svg' },
      { id: 'fire_hype', title: 'On Fire', tags: 'fire lit hype cool awesome', url: '/api/gif-asset/fire_hype.svg' },
      { id: 'ghana_goal', title: 'Ghana Vibes', tags: 'ghana accra black stars kumasi win', url: '/api/gif-asset/ghana_goal.svg' },
      { id: 'party_boom', title: 'Party Celebrate', tags: 'party celebrate congrats birthday win', url: '/api/gif-asset/party_boom.svg' },
      { id: 'thumbs_ok', title: 'All Good', tags: 'ok yes thumbs up cool sorted', url: '/api/gif-asset/thumbs_ok.svg' },
      { id: 'mind_blown', title: 'Mind Blown', tags: 'wow omg shocked crazy', url: '/api/gif-asset/mind_blown.svg' },
      { id: 'cry_tears', title: 'Tears of Joy', tags: 'cry funny sad lol', url: '/api/gif-asset/cry_tears.svg' },
      { id: 'crown_king', title: 'Royal Legend', tags: 'king queen crown boss respect', url: '/api/gif-asset/crown_king.svg' },
      { id: 'football_win', title: 'Goal Celebration', tags: 'football soccer goal score match', url: '/api/gif-asset/football_win.svg' },
      { id: 'medaase_hi', title: 'Medaase Thanks', tags: 'thanks medaase bless please ghana', url: '/api/gif-asset/medaase_hi.svg' },
    ];
    const items = q
      ? catalog.filter((c) => c.title.toLowerCase().includes(q) || c.tags.includes(q))
      : catalog;
    res.json({ items });
  });

  app.get('/api/moments/news', requireSupabaseUser, async (req: Request, res: Response) => {
    const forceRefresh = req.query.refresh === '1';
    if (!forceRefresh && cachedFeed && Date.now() - cachedFeed.fetchedAt < CACHE_TTL_MS) {
      res.json({
        items: cachedFeed.items,
        fetchedAt: new Date(cachedFeed.fetchedAt).toISOString(),
      });
      return;
    }

    const [rssSettled, ytItems, tmdbItems] = await Promise.all([
      Promise.all(PUBLIC_FEEDS.map(fetchOneFeed)),
      fetchYouTubeEntertainmentAndNews(),
      fetchTmdbEntertainmentNews(),
    ]);

    const seen = new Set<string>();
    const items = [...tmdbItems, ...ytItems, ...rssSettled.flat()]
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    cachedFeed = { items, fetchedAt: Date.now() };
    res.json({
      items,
      fetchedAt: new Date(cachedFeed.fetchedAt).toISOString(),
    });
  });

  app.get('/api/news/search', requireSupabaseUser, async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim().slice(0, 120);
    if (!q) {
      res.json({ items: [] });
      return;
    }
    const category = String(req.query.category || 'Entertainment').trim().slice(0, 40) || 'Entertainment';
    const ytKey = process.env.YOUTUBE_API_KEY?.trim();

    const [tmdbResults, ytResults] = await Promise.all([
      searchTmdbContent(q),
      ytKey ? searchYouTubeApi(ytKey, `${q} video`, category, 8) : Promise.resolve([]),
    ]);

    const seen = new Set<string>();
    const items = [...tmdbResults, ...ytResults].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    res.json({ items });
  });

  app.get('/api/youtube/search', requireSupabaseUser, async (req: Request, res: Response) => {
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      res.json({ items: [] });
      return;
    }
    const q = String(req.query.q || '').trim().slice(0, 120);
    const category = String(req.query.category || 'Entertainment').trim() || 'Entertainment';
    const searchQuery = q ? `${q} video` : 'entertainment celebrity music news';
    const items = await searchYouTubeApi(apiKey, searchQuery, category, 12);
    res.json({ items });
  });

  app.get('/api/youtube/football', requireSupabaseUser, async (req: Request, res: Response) => {
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      res.json({ items: [] });
      return;
    }
    const q = String(req.query.q || '').trim().slice(0, 120);
    const searchQuery = q
      ? `${q} football highlights goals`
      : 'football highlights premier league champions league ghana black stars';
    const items = await searchYouTubeApi(apiKey, searchQuery, 'Highlights', 12);
    res.json({ items });
  });

  app.get('/api/metered/config', requireSupabaseUser, (_req: Request, res: Response) => {
    const rawRoom = (process.env.METERED_DEFAULT_ROOM || '').trim();
    const safeRoom =
      /^[a-zA-Z0-9_.-]+\.metered\.live\/[a-zA-Z0-9_-]+$/.test(rawRoom)
        ? rawRoom
        : 'letchat_gnana-123.metered.live/azttjqrujl';
    const realtimeEnabled = Boolean(
      process.env.METERED_API_KEY?.trim() && process.env.METERED_SECRET_KEY?.trim()
    );
    res.json({ defaultRoomUrl: safeRoom, realtimeEnabled });
  });

  app.post('/api/metered/token', requireSupabaseUser, async (req: Request, res: Response) => {
    const skId = process.env.METERED_API_KEY?.trim();
    const skSecret = process.env.METERED_SECRET_KEY?.trim();
    if (!skId || !skSecret) {
      res.status(503).json({
        error: 'Metered call service is not configured on the server.',
      });
      return;
    }

    const authUser = res.locals.supabaseUser as { id: string; name?: string } | undefined;
    if (!authUser?.id) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const rawCallId = typeof req.body?.callId === 'string' ? req.body.callId.trim() : '';
    const sanitizedCallId = /^[a-zA-Z0-9_-]{1,80}$/.test(rawCallId) ? rawCallId : '';
    const displayName =
      typeof req.body?.displayName === 'string' && req.body.displayName.trim()
        ? req.body.displayName.trim().slice(0, 60)
        : authUser.name || 'LetChat User';

    const channels = sanitizedCallId ? [`letchat-call-${sanitizedCallId}`] : ['letchat-call-*'];
    const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    if (
      process.env.METERED_TURN_URL?.trim() &&
      process.env.METERED_TURN_USERNAME?.trim() &&
      process.env.METERED_TURN_CREDENTIAL?.trim()
    ) {
      iceServers.push({
        urls: process.env.METERED_TURN_URL.trim(),
        username: process.env.METERED_TURN_USERNAME.trim(),
        credential: process.env.METERED_TURN_CREDENTIAL.trim(),
      });
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const tokenRes = await fetch('https://rms.metered.ca/v1/tokens', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${skId}:${skSecret}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          peerId: authUser.id,
          channels,
          permissions: ['publish', 'subscribe', 'presence', 'send'],
          expiresInSec: 3600,
          peerMetadata: { name: displayName },
          metadata: { iceServers },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!tokenRes.ok) {
        res.status(502).json({ error: 'Unable to start Metered call session.' });
        return;
      }

      const tokenData = (await tokenRes.json()) as { token?: string; expiresAt?: number };
      if (!tokenData?.token) {
        res.status(502).json({ error: 'Invalid token response from Metered.' });
        return;
      }

      res.json({
        token: tokenData.token,
        expiresAt: tokenData.expiresAt || null,
        peerId: authUser.id,
      });
    } catch {
      res.status(502).json({ error: 'Unable to reach Metered call service.' });
    }
  });

  app.post('/api/ai/chat', requireSupabaseUser, async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Please add it in Settings > Secrets.',
      });
      return;
    }

    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const contents = rawMessages
      .filter(
        (m: unknown): m is { role: string; text: string } =>
          Boolean(m) &&
          typeof (m as { text?: unknown }).text === 'string' &&
          (m as { text: string }).text.trim().length > 0
      )
      .slice(-20)
      .map((m: { role: string; text: string }) => ({
        role: m.role === 'model' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.text.trim().slice(0, 4000) }],
      }));

    if (contents.length === 0) {
      res.status(400).json({ error: 'Please enter a message for the AI Assistant.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const stream = await ai.models.generateContentStream({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction:
            'You are LetChat AI, a friendly, concise, practical AI assistant inside the LetChat messaging app. Help users draft messages, translate languages (including English, Twi, Ga, Ewe, French), answer questions, summarize topics, and brainstorm ideas. Keep responses clear, well-structured, and easy to read on mobile.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI Assistant request failed';
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  });

  const serveSourceZip = (_req: Request, res: Response) => {
    const candidates = [
      path.resolve(process.cwd(), 'public', 'letchat-v2.zip'),
      path.resolve(process.cwd(), 'dist', 'letchat-v2.zip'),
    ];
    const zipPath = candidates.find((p) => fs.existsSync(p));
    if (!zipPath) {
      res.status(404).json({ error: 'Source archive not found.' });
      return;
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="letchat-v2.zip"');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(zipPath);
  };

  app.get('/api/download-source', serveSourceZip);
  app.get('/letchat-v2.zip', serveSourceZip);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LetChat server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
