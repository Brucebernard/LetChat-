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

type FeedPlatform = 'TikTok' | 'Instagram' | 'X' | 'Facebook' | 'YouTube' | 'News';

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
    name: 'Citi Newsroom',
    url: 'https://citinewsroom.com/feed/',
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
const CACHE_TTL_MS = 5 * 60 * 1000;

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
      const rawThumb =
        extractAttr(block, 'media:thumbnail', 'url') ||
        extractAttr(block, 'media:content', 'url') ||
        extractAttr(block, 'enclosure', 'url') ||
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
    next();
  } catch {
    res.status(502).json({ error: 'Unable to verify authentication session.' });
  }
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/moments/news', requireSupabaseUser, async (req: Request, res: Response) => {
    const forceRefresh = req.query.refresh === '1';
    if (!forceRefresh && cachedFeed && Date.now() - cachedFeed.fetchedAt < CACHE_TTL_MS) {
      res.json({
        items: cachedFeed.items,
        fetchedAt: new Date(cachedFeed.fetchedAt).toISOString(),
      });
      return;
    }

    const settled = await Promise.all(PUBLIC_FEEDS.map(fetchOneFeed));
    const items = settled
      .flat()
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    cachedFeed = { items, fetchedAt: Date.now() };
    res.json({
      items,
      fetchedAt: new Date(cachedFeed.fetchedAt).toISOString(),
    });
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
