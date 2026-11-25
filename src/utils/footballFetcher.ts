import { FootballPost, FootballSourcesConfig } from '../types';
import { isSafeHttpUrl } from './mediaUtils';

const RSS_TO_JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
const ALLORIGINS_RAW = 'https://api.allorigins.win/raw?url=';

interface FeedSource {
  name: string;
  source: string;
  platform: FootballPost['platform'];
  url: string;
  category: string;
}

const DEFAULT_FEEDS: FeedSource[] = [
  {
    name: 'BBC Sport Football',
    source: 'BBC Sport',
    platform: 'RSS',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    category: 'News',
  },
  {
    name: 'ESPN Soccer',
    source: 'ESPN FC',
    platform: 'RSS',
    url: 'https://www.espn.com/espn/rss/soccer/news',
    category: 'News',
  },
  {
    name: 'Sky Sports Football',
    source: 'Sky Sports',
    platform: 'RSS',
    url: 'https://www.skysports.com/rss/12040',
    category: 'Transfers',
  },
  {
    name: 'Premier League YouTube',
    source: 'Premier League',
    platform: 'YouTube',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCG5qGWdu8nIRZqJ_GgDwQ-w',
    category: 'Highlights',
  },
  {
    name: 'FIFA YouTube',
    source: 'FIFA',
    platform: 'YouTube',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCpcTrCXblq78GZrTUTLWeBw',
    category: 'Videos',
  },
];

function extractYoutubeId(link = ''): string | null {
  const m = link.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function classifyFootballPost(title = '', desc = '', defaultCat = 'News'): string {
  const text = `${title} ${desc}`.toLowerCase();
  if (text.includes('highlight')) return 'Highlights';
  if (text.includes('transfer') || text.includes('sign') || text.includes('bid') || text.includes('deal')) {
    return 'Transfers';
  }
  if (text.includes('score') || text.includes('vs') || text.includes('beat') || text.includes('draw')) {
    return 'Scores';
  }
  return defaultCat;
}

function stripHtml(raw = ''): string {
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  return (doc.body.textContent || '').trim();
}

async function fetchRssViaXml(feed: FeedSource): Promise<FootballPost[]> {
  try {
    const res = await fetch(`${ALLORIGINS_RAW}${encodeURIComponent(feed.url)}`);
    if (!res.ok) return [];
    const xmlText = await res.text();
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const entries = [...doc.querySelectorAll('item'), ...doc.querySelectorAll('entry')];

    return entries.slice(0, 15).map((node, idx) => {
      const title = node.querySelector('title')?.textContent || '';
      const rawLink =
        node.querySelector('link')?.getAttribute('href') ||
        node.querySelector('link')?.textContent ||
        '';
      const link = isSafeHttpUrl(rawLink) ? rawLink : '';
      const pubDate =
        node.querySelector('pubDate')?.textContent ||
        node.querySelector('published')?.textContent ||
        new Date().toISOString();
      const desc = stripHtml(
        node.querySelector('description')?.textContent ||
          node.querySelector('media\\:description')?.textContent ||
          ''
      );
      const rawThumb =
        node.querySelector('media\\:thumbnail, thumbnail')?.getAttribute('url') ||
        node.querySelector('enclosure')?.getAttribute('url') ||
        '';
      const ytId = extractYoutubeId(link);
      const thumb = isSafeHttpUrl(rawThumb)
        ? rawThumb
        : ytId
        ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
        : '';

      return {
        id: `${feed.source}-xml-${idx}-${link}`,
        platform: ytId ? 'YouTube' : feed.platform,
        pageName: feed.source,
        time: pubDate,
        title: stripHtml(title),
        description: desc.slice(0, 180),
        thumbnail: thumb,
        originalUrl: link,
        videoUrl: ytId ? `https://www.youtube.com/embed/${ytId}` : null,
        isYoutube: Boolean(ytId),
        category: classifyFootballPost(title, desc, feed.category),
        likes: 0,
      };
    });
  } catch {
    return [];
  }
}

async function fetchRssViaJson(feed: FeedSource): Promise<FootballPost[]> {
  try {
    const res = await fetch(`${RSS_TO_JSON}${encodeURIComponent(feed.url)}`);
    if (!res.ok) throw new Error('rss2json error');
    const data = await res.json();
    if (data.status !== 'ok' || !Array.isArray(data.items)) {
      throw new Error('bad rss2json payload');
    }

    return data.items.map((item: Record<string, unknown>, idx: number) => {
      const rawLink = typeof item.link === 'string' ? item.link : '';
      const link = isSafeHttpUrl(rawLink) ? rawLink : '';
      const ytId = extractYoutubeId(link);
      const rawDesc = typeof item.description === 'string' ? item.description : '';
      const cleanDesc = stripHtml(rawDesc);
      const enclosure = (item.enclosure as { link?: string; type?: string } | undefined) || {};
      const rawThumb =
        (typeof item.thumbnail === 'string' ? item.thumbnail : '') ||
        (typeof enclosure.link === 'string' ? enclosure.link : '') ||
        (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');
      const thumb = isSafeHttpUrl(rawThumb) ? rawThumb : '';
      const vidUrl = ytId
        ? `https://www.youtube.com/embed/${ytId}`
        : enclosure.type?.startsWith('video') && isSafeHttpUrl(enclosure.link)
        ? enclosure.link || null
        : null;

      return {
        id: `${feed.source}-${String(item.guid || link || idx)}`,
        platform: ytId ? 'YouTube' : feed.platform,
        pageName: feed.source,
        time: typeof item.pubDate === 'string' ? item.pubDate : new Date().toISOString(),
        title: stripHtml(typeof item.title === 'string' ? item.title : ''),
        description: cleanDesc.slice(0, 180),
        thumbnail: thumb,
        originalUrl: link,
        videoUrl: vidUrl,
        isYoutube: Boolean(ytId),
        category: classifyFootballPost(
          typeof item.title === 'string' ? item.title : '',
          cleanDesc,
          feed.category
        ),
        likes: 0,
      };
    });
  } catch {
    return fetchRssViaXml(feed);
  }
}

async function fetchConnectedYouTube(apiKey?: string, channelIds?: string): Promise<FootballPost[]> {
  if (!apiKey || !channelIds) return [];
  const ids = channelIds.split(',').map((s) => s.trim()).filter(Boolean);
  const results: FootballPost[] = [];
  for (const cid of ids) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(
        cid
      )}&maxResults=10&order=date&type=video&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          const vid = item.id?.videoId;
          if (!vid) continue;
          const thumb = item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '';
          results.push({
            id: `yt-api-${vid}`,
            platform: 'YouTube',
            pageName: item.snippet?.channelTitle || 'YouTube Channel',
            time: item.snippet?.publishedAt || new Date().toISOString(),
            title: item.snippet?.title || 'Football Highlight',
            description: (item.snippet?.description || '').slice(0, 180),
            thumbnail: isSafeHttpUrl(thumb) ? thumb : '',
            originalUrl: `https://www.youtube.com/watch?v=${vid}`,
            videoUrl: `https://www.youtube.com/embed/${vid}`,
            isYoutube: true,
            category: classifyFootballPost(item.snippet?.title, item.snippet?.description, 'Highlights'),
            likes: 0,
          });
        }
      }
    } catch {
      // ignore invalid channel/key errors
    }
  }
  return results;
}

async function fetchConnectedFacebook(token?: string, pageIds?: string): Promise<FootballPost[]> {
  if (!token || !pageIds) return [];
  const ids = pageIds.split(',').map((s) => s.trim()).filter(Boolean);
  const results: FootballPost[] = [];
  for (const pid of ids) {
    try {
      const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
        pid
      )}/posts?fields=id,message,created_time,full_picture,permalink_url,source&limit=10&access_token=${encodeURIComponent(
        token
      )}`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data.data)) {
        for (const post of data.data) {
          results.push({
            id: `fb-${post.id}`,
            platform: 'Facebook',
            pageName: `Facebook (${pid})`,
            time: post.created_time || new Date().toISOString(),
            title: (post.message || 'Facebook Football Update').slice(0, 120),
            description: (post.message || '').slice(0, 180),
            thumbnail: isSafeHttpUrl(post.full_picture) ? post.full_picture : '',
            originalUrl: isSafeHttpUrl(post.permalink_url) ? post.permalink_url : '',
            videoUrl: isSafeHttpUrl(post.source) ? post.source : null,
            isYoutube: false,
            category: classifyFootballPost(post.message, '', 'News'),
            likes: 0,
          });
        }
      }
    } catch {
      // ignore failed page fetch
    }
  }
  return results;
}

async function fetchConnectedInstagram(token?: string, accountIds?: string): Promise<FootballPost[]> {
  if (!token || !accountIds) return [];
  const ids = accountIds.split(',').map((s) => s.trim()).filter(Boolean);
  const results: FootballPost[] = [];
  for (const aid of ids) {
    try {
      const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
        aid
      )}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=10&access_token=${encodeURIComponent(
        token
      )}`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data.data)) {
        for (const post of data.data) {
          const isVid = post.media_type === 'VIDEO';
          const rawThumb = isVid ? post.thumbnail_url : post.media_url;
          results.push({
            id: `ig-${post.id}`,
            platform: 'Instagram',
            pageName: `Instagram (${aid})`,
            time: post.timestamp || new Date().toISOString(),
            title: (post.caption || 'Instagram Football Post').slice(0, 120),
            description: (post.caption || '').slice(0, 180),
            thumbnail: isSafeHttpUrl(rawThumb) ? rawThumb : '',
            originalUrl: isSafeHttpUrl(post.permalink) ? post.permalink : '',
            videoUrl: isVid && isSafeHttpUrl(post.media_url) ? post.media_url : null,
            isYoutube: false,
            category: classifyFootballPost(post.caption, '', isVid ? 'Videos' : 'News'),
            likes: 0,
          });
        }
      }
    } catch {
      // ignore
    }
  }
  return results;
}

async function fetchConnectedX(bearerToken?: string, usernames?: string): Promise<FootballPost[]> {
  if (!bearerToken || !usernames) return [];
  const names = usernames
    .split(',')
    .map((s) => s.trim().replace(/^@/, ''))
    .filter(Boolean);
  const results: FootballPost[] = [];
  for (const uname of names) {
    try {
      const userRes = await fetch(
        `https://api.twitter.com/2/users/by/username/${encodeURIComponent(uname)}`,
        { headers: { Authorization: `Bearer ${bearerToken}` } }
      );
      const userJson = await userRes.json();
      const uid = userJson?.data?.id;
      if (!uid) continue;
      const tweetsRes = await fetch(
        `https://api.twitter.com/2/users/${uid}/tweets?max_results=10&tweet.fields=created_at`,
        { headers: { Authorization: `Bearer ${bearerToken}` } }
      );
      const tweetsJson = await tweetsRes.json();
      if (Array.isArray(tweetsJson.data)) {
        for (const tw of tweetsJson.data) {
          results.push({
            id: `x-${tw.id}`,
            platform: 'X',
            pageName: `@${uname}`,
            time: tw.created_at || new Date().toISOString(),
            title: (tw.text || '').slice(0, 140),
            description: tw.text || '',
            thumbnail: '',
            originalUrl: `https://x.com/${uname}/status/${tw.id}`,
            videoUrl: null,
            isYoutube: false,
            category: classifyFootballPost(tw.text, '', 'News'),
            likes: 0,
          });
        }
      }
    } catch {
      // ignore
    }
  }
  return results;
}

export async function fetchAllFootballFeeds(
  sourcesConfig: Partial<FootballSourcesConfig> = {}
): Promise<FootballPost[]> {
  const customRss: FeedSource[] = (sourcesConfig.customRssUrls || '')
    .split('\n')
    .map((u) => u.trim())
    .filter((u) => isSafeHttpUrl(u))
    .map((url, idx) => ({
      name: `Custom RSS ${idx + 1}`,
      source: new URL(url).hostname.replace('www.', ''),
      platform: 'RSS',
      url,
      category: 'News',
    }));

  const rssPromises = [...DEFAULT_FEEDS, ...customRss].map(fetchRssViaJson);
  const apiPromises = [
    fetchConnectedYouTube(sourcesConfig.youtubeApiKey, sourcesConfig.youtubeChannelIds),
    fetchConnectedFacebook(sourcesConfig.facebookToken, sourcesConfig.facebookPageIds),
    fetchConnectedInstagram(sourcesConfig.instagramToken, sourcesConfig.instagramAccountIds),
    fetchConnectedX(sourcesConfig.xBearerToken, sourcesConfig.xUsernames),
  ];

  const settled = await Promise.all([...rssPromises, ...apiPromises]);
  const combined = settled.flat().filter((item) => item.title);

  return combined.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}
