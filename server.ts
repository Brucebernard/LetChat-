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

const flowAiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export type NewsCategory =
  | 'Football'
  | 'Global'
  | 'Ghana'
  | 'Entertainment'
  | 'Tech'
  | 'Politics';

interface NewsFeedSpec {
  name: string;
  url: string;
  category: NewsCategory;
}

const NEWS_RSS_FEEDS: NewsFeedSpec[] = [
  // Football
  {
    name: 'BBC Sport Football',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    category: 'Football',
  },
  {
    name: 'Sky Sports Football',
    url: 'https://www.skysports.com/rss/12040',
    category: 'Football',
  },
  {
    name: 'ESPN FC',
    url: 'https://www.espn.com/espn/rss/soccer/news',
    category: 'Football',
  },
  {
    name: 'Football Highlights',
    url: 'https://news.google.com/rss/search?q=football+scores+transfers+match+highlights&hl=en-GB&gl=GB&ceid=GB:en',
    category: 'Football',
  },
  // Global
  {
    name: 'BBC World News',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    category: 'Global',
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    category: 'Global',
  },
  {
    name: 'Sky News World',
    url: 'https://feeds.skynews.com/feeds/rss/world.xml',
    category: 'Global',
  },
  // Ghana
  {
    name: 'Citi Newsroom',
    url: 'https://citinewsroom.com/feed/',
    category: 'Ghana',
  },
  {
    name: 'MyJoyOnline',
    url: 'https://www.myjoyonline.com/feed/',
    category: 'Ghana',
  },
  {
    name: 'Google News Ghana',
    url: 'https://news.google.com/rss?hl=en-GH&gl=GH&ceid=GH:en',
    category: 'Ghana',
  },
  // Entertainment
  {
    name: 'BBC Entertainment',
    url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    category: 'Entertainment',
  },
  {
    name: 'Variety',
    url: 'https://variety.com/feed/',
    category: 'Entertainment',
  },
  {
    name: 'Billboard',
    url: 'https://www.billboard.com/feed/',
    category: 'Entertainment',
  },
  // Tech
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    category: 'Tech',
  },
  {
    name: 'BBC Technology',
    url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
    category: 'Tech',
  },
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    category: 'Tech',
  },
  // Politics
  {
    name: 'BBC Politics',
    url: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
    category: 'Politics',
  },
  {
    name: 'World Politics',
    url: 'https://news.google.com/rss/search?q=world+politics+government+election&hl=en-US&gl=US&ceid=US:en',
    category: 'Politics',
  },
];

interface AggregatedNewsArticle {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  category: NewsCategory;
  imageUrl: string;
  videoUrl: string | null;
  articleUrl: string;
  publishedAt: string;
  isBreaking: boolean;
}

let cachedNewsFeed: { items: AggregatedNewsArticle[]; fetchedAt: number } | null = null;
const NEWS_CACHE_TTL_MS = 3 * 60 * 1000;

function isSafePublicHttpUrl(raw?: string | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }
    return true;
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
    .replace(/&nbsp;/g, ' ')
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

function isBreakingHeadline(title: string, publishedAtIso: string): boolean {
  const lower = title.toLowerCase();
  if (/\b(breaking|urgent|just in|live:|full[- ]time|ft:|official:)\b/.test(lower)) {
    return true;
  }
  const ts = Date.parse(publishedAtIso);
  if (!Number.isNaN(ts)) {
    const ageMs = Date.now() - ts;
    return ageMs >= 0 && ageMs <= 2 * 60 * 60 * 1000;
  }
  return false;
}

function classifyNewsCategory(
  title: string,
  summary: string,
  fallback: NewsCategory
): NewsCategory {
  const text = `${title} ${summary}`.toLowerCase();
  if (
    /\b(ghana|accra|kumasi|black stars|tamale|takoradi|gfa|mahama|akufo|cedi)\b/.test(text) &&
    fallback === 'Ghana'
  ) {
    return 'Ghana';
  }
  if (
    /\b(premier league|champions league|la liga|serie a|bundesliga|fifa|uefa|afcon|football|soccer|striker|goalkeeper|transfer|fc|goal|matchday|epl)\b/.test(
      text
    )
  ) {
    return 'Football';
  }
  if (/\b(ai|apple|google|microsoft|startup|software|cyber|chip|iphone|android|tech)\b/.test(text)) {
    return 'Tech';
  }
  if (/\b(election|parliament|senate|president|minister|policy|government|diplomat|summit)\b/.test(text)) {
    return 'Politics';
  }
  if (/\b(movie|film|album|music|afrobeats|grammy|concert|actor|singer|celebrity|netflix)\b/.test(text)) {
    return 'Entertainment';
  }
  return fallback;
}

function stableNewsId(prefix: string, url: string, title: string): string {
  const raw = `${prefix}:${url || title}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${hash.toString(36)}`;
}

async function fetchOneNewsRss(spec: NewsFeedSpec): Promise<AggregatedNewsArticle[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    const res = await fetch(spec.url, {
      headers: { 'User-Agent': 'LetChatFlow/3.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();
    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];

    return blocks
      .slice(0, 8)
      .map((block) => {
        const title = decodeHtml(extractTag(block, 'title'));
        const rawLink =
          extractAttr(block, 'link', 'href') || decodeHtml(extractTag(block, 'link'));
        const articleUrl = isSafePublicHttpUrl(rawLink) ? rawLink.trim() : '';
        const rawDesc =
          extractTag(block, 'content:encoded') ||
          extractTag(block, 'description') ||
          extractTag(block, 'media:description') ||
          extractTag(block, 'summary');
        const summary = decodeHtml(rawDesc).slice(0, 320);
        const rawDate =
          extractTag(block, 'pubDate') ||
          extractTag(block, 'published') ||
          extractTag(block, 'updated');
        const publishedAt =
          rawDate && !Number.isNaN(Date.parse(rawDate))
            ? new Date(rawDate).toISOString()
            : new Date().toISOString();

        const ytId = extractYoutubeId(articleUrl);
        const inlineImgMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
        const rawThumb =
          extractAttr(block, 'media:thumbnail', 'url') ||
          extractAttr(block, 'media:content', 'url') ||
          extractAttr(block, 'enclosure', 'url') ||
          (inlineImgMatch ? inlineImgMatch[1] : '') ||
          (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');
        const imageUrl = isSafePublicHttpUrl(rawThumb) ? rawThumb.trim() : '';
        const sourceTag = decodeHtml(extractTag(block, 'source'));
        const sourceName = sourceTag || spec.name;
        const category = classifyNewsCategory(title, summary, spec.category);

        return {
          id: stableNewsId(spec.category.toLowerCase(), articleUrl, title),
          title,
          summary: summary === title ? '' : summary,
          sourceName,
          category,
          imageUrl,
          videoUrl: ytId ? `https://www.youtube.com/embed/${ytId}` : null,
          articleUrl,
          publishedAt,
          isBreaking: isBreakingHeadline(title, publishedAt),
        };
      })
      .filter((item) => item.title.length > 0 && item.articleUrl.length > 0);
  } catch {
    return [];
  }
}

interface GNewsRawArticle {
  title?: string;
  description?: string;
  content?: string;
  url?: string;
  image?: string;
  publishedAt?: string;
  source?: { name?: string };
}

const gnewsCache = new Map<string, { articles: GNewsRawArticle[]; fetchedAt: number }>();
let gnewsQueue: Promise<void> = Promise.resolve();
let lastGnewsReqAt = 0;

async function fetchGNewsBatch(
  endpoint: 'top-headlines' | 'search',
  queryOrCat: string,
  mappedCategory: NewsCategory
): Promise<AggregatedNewsArticle[]> {
  const apiKey = process.env.GNEWS_API_KEY?.trim();
  if (!apiKey) return [];

  const cacheKey = `${endpoint}:${queryOrCat}`;
  const cached = gnewsCache.get(cacheKey);
  let rawList: GNewsRawArticle[] = [];

  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) {
    rawList = cached.articles;
  } else {
    try {
      rawList = await new Promise<GNewsRawArticle[]>((resolve) => {
        gnewsQueue = gnewsQueue.then(async () => {
          const waitMs = Math.max(0, 1150 - (Date.now() - lastGnewsReqAt));
          if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
          lastGnewsReqAt = Date.now();
          const url =
            endpoint === 'search'
              ? `https://gnews.io/api/v4/search?q=${encodeURIComponent(queryOrCat)}&lang=en&max=8&apikey=${encodeURIComponent(apiKey)}`
              : `https://gnews.io/api/v4/top-headlines?category=${encodeURIComponent(queryOrCat)}&lang=en&max=8&apikey=${encodeURIComponent(apiKey)}`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 7000);
          try {
            const upstream = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!upstream.ok) {
              resolve([]);
              return;
            }
            const json = (await upstream.json()) as { articles?: GNewsRawArticle[] };
            const list = Array.isArray(json.articles) ? json.articles : [];
            gnewsCache.set(cacheKey, { articles: list, fetchedAt: Date.now() });
            resolve(list);
          } catch {
            clearTimeout(timer);
            resolve([]);
          }
        });
      });
    } catch {
      rawList = [];
    }
  }

  return rawList
    .filter((a) => Boolean(a.title) && isSafePublicHttpUrl(a.url))
    .map((a) => {
      const title = decodeHtml(a.title || '');
      const summary = decodeHtml(a.description || a.content || '').slice(0, 320);
      const publishedAt =
        a.publishedAt && !Number.isNaN(Date.parse(a.publishedAt))
          ? a.publishedAt
          : new Date().toISOString();
      const articleUrl = String(a.url || '');
      return {
        id: stableNewsId('gn', articleUrl, title),
        title,
        summary,
        sourceName: a.source?.name || 'GNews',
        category: classifyNewsCategory(title, summary, mappedCategory),
        imageUrl: isSafePublicHttpUrl(a.image) ? String(a.image) : '',
        videoUrl: null,
        articleUrl,
        publishedAt,
        isBreaking: isBreakingHeadline(title, publishedAt),
      };
    });
}

async function fetchYouTubeFootballHighlights(): Promise<AggregatedNewsArticle[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=6&q=${encodeURIComponent(
      'football match highlights premier league champions league goals'
    )}&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: {
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
        };
      }[];
    };
    return (data.items || [])
      .filter((i) => i.id?.videoId && i.snippet?.title)
      .map((i) => {
        const videoId = i.id!.videoId!;
        const sn = i.snippet!;
        const title = decodeHtml(sn.title || 'Match Highlights');
        const publishedAt =
          sn.publishedAt && !Number.isNaN(Date.parse(sn.publishedAt))
            ? sn.publishedAt
            : new Date().toISOString();
        return {
          id: `yt-fb-${videoId}`,
          title,
          summary: decodeHtml(sn.description || '').slice(0, 260),
          sourceName: sn.channelTitle || 'YouTube Sport',
          category: 'Football' as NewsCategory,
          imageUrl:
            sn.thumbnails?.high?.url ||
            sn.thumbnails?.medium?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          videoUrl: `https://www.youtube.com/embed/${videoId}`,
          articleUrl: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt,
          isBreaking: isBreakingHeadline(title, publishedAt),
        };
      });
  } catch {
    return [];
  }
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

  // Real Aggregated News Feed for Moments > News tab
  app.get('/api/news/feed', requireSupabaseUser, async (req: Request, res: Response) => {
    const forceRefresh = req.query.refresh === '1';
    if (!forceRefresh && cachedNewsFeed && Date.now() - cachedNewsFeed.fetchedAt < NEWS_CACHE_TTL_MS) {
      res.json({
        items: cachedNewsFeed.items,
        articles: cachedNewsFeed.items,
        fetchedAt: new Date(cachedNewsFeed.fetchedAt).toISOString(),
      });
      return;
    }

    const [rssResults, gWorld, gSports, gTech, gEnt, gGhana, ytFootball] = await Promise.all([
      Promise.all(NEWS_RSS_FEEDS.map(fetchOneNewsRss)),
      fetchGNewsBatch('top-headlines', 'world', 'Global'),
      fetchGNewsBatch('search', 'football premier league champions league', 'Football'),
      fetchGNewsBatch('top-headlines', 'technology', 'Tech'),
      fetchGNewsBatch('top-headlines', 'entertainment', 'Entertainment'),
      fetchGNewsBatch('search', 'Ghana news', 'Ghana'),
      fetchYouTubeFootballHighlights(),
    ]);

    const seenTitles = new Set<string>();
    const items = [...ytFootball, ...gGhana, ...gSports, ...gWorld, ...gTech, ...gEnt, ...rssResults.flat()]
      .filter((item) => {
        const key = item.title.toLowerCase().slice(0, 64);
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 90);

    cachedNewsFeed = { items, fetchedAt: Date.now() };
    res.json({
      items,
      articles: items,
      fetchedAt: new Date(cachedNewsFeed.fetchedAt).toISOString(),
    });
  });

  // Safe In-App Full Article Reader Proxy (validates public URL & blocks private IPs)
  app.get('/api/news/article', requireSupabaseUser, async (req: Request, res: Response) => {
    const targetUrl = String(req.query.url || '').trim();
    if (!isSafePublicHttpUrl(targetUrl)) {
      res.status(400).json({ error: 'Invalid article URL.' });
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LetChatFlowReader/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!upstream.ok) {
        res.status(502).json({ error: 'Unable to load full article.' });
        return;
      }

      const html = (await upstream.text()).slice(0, 500_000);
      const cleanedHtml = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

      const paragraphs = Array.from(cleanedHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
        .map((m) => decodeHtml(m[1]))
        .filter((p) => p.length >= 45 && !/^(cookie|subscribe|sign up|advertisement)/i.test(p))
        .slice(0, 22);

      const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      const leadImage =
        ogImgMatch && isSafePublicHttpUrl(ogImgMatch[1]) ? ogImgMatch[1] : '';

      res.json({
        paragraphs,
        leadImage,
        imageUrl: leadImage,
      });
    } catch {
      res.status(502).json({ error: 'Article reader timed out.' });
    }
  });

  // @FLOW AI Assistant route (fast server-side Gemini 4 Hydrogen)
  app.post('/api/ai/flow', requireSupabaseUser, async (req: Request, res: Response) => {
    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({
        error: 'Gemini API key is not configured in server secrets.',
      });
      return;
    }

    const body = (req.body || {}) as {
      action?: 'chat' | 'write' | 'translate' | 'summarize' | 'suggest_reply' | 'moment_caption';
      prompt?: string;
      targetLanguage?: 'Twi' | 'English' | 'French';
      contextMessages?: { sender?: string; text?: string }[];
      history?: { role?: 'user' | 'assistant'; text?: string }[];
    };

    const action = body.action || 'chat';
    const userPrompt = String(body.prompt || '').trim().slice(0, 2500);
    const targetLanguage = body.targetLanguage || 'Twi';
    const recentChat = Array.isArray(body.contextMessages)
      ? body.contextMessages
          .slice(-14)
          .map((m) => `${m.sender || 'User'}: ${String(m.text || '').slice(0, 240)}`)
          .join('\n')
      : '';
    const historyBlock = Array.isArray(body.history)
      ? body.history
          .slice(-6)
          .map((h) => `${h.role === 'assistant' ? '@FLOW AI' : 'User'}: ${String(h.text || '').slice(0, 400)}`)
          .join('\n')
      : '';

    let taskPrompt = userPrompt;
    if (action === 'write') {
      taskPrompt = `Draft a natural, ready-to-send chat message for this request. Output ONLY the message text with no quotes or preamble:\n${userPrompt}`;
    } else if (action === 'translate') {
      taskPrompt = `Translate the following text accurately and naturally into ${targetLanguage} (use natural Ghanaian Akan/Asante Twi when Twi is selected). Output ONLY the translation:\n${userPrompt || recentChat}`;
    } else if (action === 'summarize') {
      taskPrompt = `Summarize this conversation in 3 crisp bullet points focusing on key updates, plans, and decisions:\n${recentChat || userPrompt}`;
    } else if (action === 'suggest_reply') {
      taskPrompt = `Based on the recent chat below, write ONE short, natural, friendly reply ready to send. Output ONLY the reply text:\n${recentChat}${userPrompt ? `\nNote: ${userPrompt}` : ''}`;
    } else if (action === 'moment_caption') {
      taskPrompt = `Create an engaging short Moment video caption plus 3 relevant hashtags for:\n${userPrompt || 'a cool Moment video'}`;
    } else if (historyBlock) {
      taskPrompt = `Previous conversation:\n${historyBlock}\n\nUser: ${userPrompt}`;
    }

    if (!taskPrompt.trim()) {
      res.status(400).json({ error: 'Please provide a prompt or chat context.' });
      return;
    }

    try {
      const response = await flowAiClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: taskPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are @FLOW AI inside LetChat FLOW. Be ultra-concise, fast, warm, and helpful (under 90 words unless summarizing). Support English, Asante Twi, and French fluently. Return clean plain text without markdown wrappers when drafting messages or translations.',
        },
      });
      const reply = (response.text || '').trim();
      if (!reply) {
        res.status(502).json({ error: 'Empty response from AI.' });
        return;
      }
      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed.';
      res.status(502).json({ error: msg });
    }
  });

  // Dynamic Metered TURN/STUN ICE servers (supports MTN / Telecel Ghana mobile data)
  let cachedIce: { iceServers: RTCIceServer[]; fetchedAt: number; cacheKey: string } | null = null;
  app.get('/api/metered/ice', requireSupabaseUser, async (_req: Request, res: Response) => {
    const baseStun: RTCIceServer[] = [
      { urls: 'stun:stun.metered.ca:80' },
      { urls: 'stun:stun.l.google.com:19302' },
    ];

    const domain = (
      process.env.METERED_DOMAIN ||
      process.env.VITE_METERED_DOMAIN ||
      'letchat_ghana-123.metered.live'
    ).trim();
    const apiKey = (
      process.env.METERED_API_KEY ||
      process.env.VITE_METERED_API_KEY ||
      ''
    ).trim();
    const turnUser = (process.env.METERED_TURN_USERNAME || '').trim();
    const turnCred = (process.env.METERED_TURN_CREDENTIAL || '').trim();
    const cacheKey = `${domain}:${apiKey.slice(0, 8)}`;

    if (cachedIce && cachedIce.cacheKey === cacheKey && Date.now() - cachedIce.fetchedAt < 5 * 60 * 1000) {
      res.json({ iceServers: cachedIce.iceServers });
      return;
    }

    let collected: RTCIceServer[] = [...baseStun];

    if (domain && apiKey) {
      try {
        const cleanDomain = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const iceRes = await fetch(
          `https://${cleanDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
          { signal: controller.signal }
        );
        clearTimeout(timer);
        if (iceRes.ok) {
          const parsed = (await iceRes.json()) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validServers = parsed.filter(
              (entry): entry is RTCIceServer =>
                Boolean(entry) && typeof (entry as { urls?: unknown }).urls !== 'undefined'
            );
            if (validServers.length > 0) {
              collected = [...baseStun, ...validServers];
            }
          }
        }
      } catch {
        // Fall through to configured TURN env credentials if API call fails
      }
    }

    if (turnUser && turnCred) {
      const hasTurn80 = collected.some(
        (s) =>
          (typeof s.urls === 'string' && s.urls.includes('global.turn.metered.ca:80')) ||
          (Array.isArray(s.urls) && s.urls.some((u) => u.includes('global.turn.metered.ca:80')))
      );
      if (!hasTurn80) {
        collected.push(
          {
            urls: 'turn:global.turn.metered.ca:80',
            username: turnUser,
            credential: turnCred,
          },
          {
            urls: 'turn:global.turn.metered.ca:80?transport=tcp',
            username: turnUser,
            credential: turnCred,
          },
          {
            urls: 'turns:global.turn.metered.ca:443?transport=tcp',
            username: turnUser,
            credential: turnCred,
          }
        );
      }
    }

    cachedIce = { iceServers: collected, fetchedAt: Date.now(), cacheKey };
    res.json({ iceServers: collected });
  });

  app.post('/api/account/delete', requireSupabaseUser, async (req: Request, res: Response) => {
    const authUser = res.locals.supabaseUser as { id: string } | undefined;
    if (!authUser?.id) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const callerBearer = req.headers.authorization?.slice(7).trim() || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const authHeaderKey = serviceRoleKey || callerBearer;
    const apiKey = serviceRoleKey || SUPABASE_ANON_KEY;

    const restHeaders = {
      apikey: apiKey,
      Authorization: `Bearer ${authHeaderKey}`,
      'Content-Type': 'application/json',
    };

    const userId = authUser.id;
    const deletions = [
      `calls?or=(caller_id.eq.${userId},receiver_id.eq.${userId})`,
      `messages?or=(sender_id.eq.${userId},receiver_id.eq.${userId})`,
      `friends?or=(user_id.eq.${userId},friend_id.eq.${userId})`,
      `follows?or=(follower_id.eq.${userId},following_id.eq.${userId})`,
      `moment_saves?user_id=eq.${userId}`,
      `moment_likes?user_id=eq.${userId}`,
      `moment_comments?user_id=eq.${userId}`,
      `moments?user_id=eq.${userId}`,
      `news_likes?user_id=eq.${userId}`,
      `news_comments?user_id=eq.${userId}`,
      `group_messages?sender_id=eq.${userId}`,
      `group_members?user_id=eq.${userId}`,
      `chat_members?user_id=eq.${userId}`,
      `profiles?id=eq.${userId}`,
    ];

    try {
      await Promise.all(
        deletions.map((queryPath) =>
          fetch(`${SUPABASE_URL}/rest/v1/${queryPath}`, {
            method: 'DELETE',
            headers: restHeaders,
          }).catch(() => null)
        )
      );

      if (serviceRoleKey) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
          method: 'DELETE',
          headers: restHeaders,
        }).catch(() => null);
      }

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete user data completely.' });
    }
  });

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
    console.log(`LetChat FLOW server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
