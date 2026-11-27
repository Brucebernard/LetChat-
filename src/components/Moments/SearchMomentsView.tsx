import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Hash,
  Music2,
  Play,
  Heart,
  UserPlus,
  UserCheck,
  Users,
  X,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { searchRealProfiles } from '../../utils/friendService';
import { MomentItem, Profile } from '../../types';

interface SearchMomentsViewProps {
  moments: MomentItem[];
  initialQuery?: string;
  followingIds: Set<string>;
  onToggleFollow: (creatorId: string) => void;
  onSelectMoment: (momentId: string) => void;
}

export default function SearchMomentsView({
  moments,
  initialQuery = '',
  followingIds,
  onToggleFollow,
  onSelectMoment,
}: SearchMomentsViewProps) {
  const { profile } = useAuth();
  const [query, setQuery] = useState(initialQuery);
  const [searchedPeople, setSearchedPeople] = useState<Profile[]>([]);
  const [searchingPeople, setSearchingPeople] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Query real profiles when searching
  useEffect(() => {
    const clean = query.trim();
    if (!clean || !profile?.id) {
      setSearchedPeople([]);
      return;
    }
    let cancelled = false;
    setSearchingPeople(true);
    const timer = setTimeout(async () => {
      const results = await searchRealProfiles(supabase, profile.id, clean);
      if (!cancelled) {
        setSearchedPeople(results);
        setSearchingPeople(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, profile?.id]);

  // Derive trending hashtags strictly from real moments
  const trendingHashtags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of moments) {
      const tags = Array.isArray(m.hashtags) ? m.hashtags : [];
      for (const raw of tags) {
        const clean = raw.replace(/^#/, '').trim().toLowerCase();
        if (!clean) continue;
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
      // Also parse #tags inside caption/text
      const matches = `${m.caption || ''} ${m.text || ''}`.match(/#([a-zA-Z0-9_]+)/g) || [];
      for (const match of matches) {
        const clean = match.slice(1).toLowerCase();
        if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));
  }, [moments]);

  // Derive trending creators strictly from real moments
  const trendingCreators = useMemo(() => {
    const map = new Map<
      string,
      { author: Profile; totalLikes: number; postCount: number }
    >();
    for (const m of moments) {
      if (!m.author || m.author.id === profile?.id) continue;
      const existing = map.get(m.author.id);
      if (existing) {
        existing.totalLikes += m.likes_count || 0;
        existing.postCount += 1;
      } else {
        map.set(m.author.id, {
          author: m.author,
          totalLikes: m.likes_count || 0,
          postCount: 1,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.totalLikes + b.postCount * 3 - (a.totalLikes + a.postCount * 3))
      .slice(0, 10);
  }, [moments, profile?.id]);

  // Derive sounds strictly from real moments
  const allSounds = useMemo(() => {
    const map = new Map<string, { name: string; count: number; sampleMomentId: string }>();
    for (const m of moments) {
      const sound = (m.music_name || 'Original Sound').trim();
      if (!sound) continue;
      const existing = map.get(sound);
      if (existing) existing.count += 1;
      else map.set(sound, { name: sound, count: 1, sampleMomentId: m.id });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [moments]);

  const normalizedQ = query.trim().toLowerCase().replace(/^#/, '');

  const matchingMoments = useMemo(() => {
    if (!normalizedQ) return [];
    return moments.filter((m) => {
      const caption = `${m.caption || ''} ${m.text || ''}`.toLowerCase();
      const sound = (m.music_name || '').toLowerCase();
      const authorName = (m.author?.full_name || m.author?.name || '').toLowerCase();
      const authorUser = (m.author?.username || '').toLowerCase();
      const tags = (m.hashtags || []).join(' ').toLowerCase();
      return (
        caption.includes(normalizedQ) ||
        sound.includes(normalizedQ) ||
        authorName.includes(normalizedQ) ||
        authorUser.includes(normalizedQ) ||
        tags.includes(normalizedQ)
      );
    });
  }, [moments, normalizedQ]);

  const matchingSounds = useMemo(() => {
    if (!normalizedQ) return allSounds.slice(0, 8);
    return allSounds.filter((s) => s.name.toLowerCase().includes(normalizedQ));
  }, [allSounds, normalizedQ]);

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A] text-white overflow-hidden">
      {/* Top Search Bar */}
      <div className="px-4 pt-16 pb-3 border-b border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl shrink-0">
        <div className="max-w-2xl mx-auto relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, videos, #hashtags, or sounds..."
            className="w-full pl-10 pr-10 min-h-[42px] rounded-2xl bg-white/[0.07] border border-white/15 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#00E5FF] transition"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Results / Discovery Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-6 pb-8">
          {/* Search Results Mode */}
          {normalizedQ ? (
            <>
              {/* Matching People */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Users size={13} className="text-[#00E5FF]" />
                  People
                </h3>
                {searchingPeople ? (
                  <p className="text-xs text-zinc-500">Searching people...</p>
                ) : searchedPeople.length === 0 ? (
                  <p className="text-xs text-zinc-500">No matching people found.</p>
                ) : (
                  <div className="space-y-2">
                    {searchedPeople.map((person) => {
                      const isFollowing = followingIds.has(person.id);
                      return (
                        <div
                          key={person.id}
                          className="p-3 rounded-2xl bg-[#121218] border border-white/10 flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex items-center justify-center font-bold text-sm shrink-0">
                            {person.avatar_url ? (
                              <img
                                src={person.avatar_url}
                                alt={person.full_name || person.name || person.username || 'User'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              ((person.full_name || person.name || person.username)?.[0] || '?').toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">
                              {person.full_name || person.name || person.username || 'User'}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">@{person.username || 'user'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleFollow(person.id)}
                            className={`px-3.5 min-h-[34px] rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                              isFollowing
                                ? 'bg-white/10 text-zinc-200 border border-white/15'
                                : 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
                            }`}
                          >
                            {isFollowing ? <UserCheck size={13} /> : <UserPlus size={13} />}
                            <span>{isFollowing ? 'Following' : 'Follow'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Matching Sounds */}
              {matchingSounds.length > 0 && (
                <section className="space-y-2.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Music2 size={13} className="text-[#7C3AED]" />
                    Sounds
                  </h3>
                  <div className="space-y-1.5">
                    {matchingSounds.map((sound) => (
                      <button
                        key={sound.name}
                        type="button"
                        onClick={() => onSelectMoment(sound.sampleMomentId)}
                        className="w-full p-3 rounded-2xl bg-[#121218] hover:bg-white/[0.07] border border-white/10 flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7C3AED]/30 to-[#00E5FF]/20 flex items-center justify-center text-[#00E5FF] shrink-0">
                            <Music2 size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{sound.name}</p>
                            <p className="text-[11px] text-zinc-400">
                              {sound.count} {sound.count === 1 ? 'video' : 'videos'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-[#00E5FF]">Watch →</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Matching Moments */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Play size={13} className="text-[#00E5FF]" />
                  Moments ({matchingMoments.length})
                </h3>
                {matchingMoments.length === 0 ? (
                  <p className="text-xs text-zinc-500">No Moments matched &ldquo;{query}&rdquo;.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {matchingMoments.map((m) => {
                      const mediaSrc = m.video_url || m.media_url || m.image_url;
                      const isVid = Boolean(m.video_url);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onSelectMoment(m.id)}
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
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] font-bold text-white">
                            <span className="truncate">@{m.author?.username || 'user'}</span>
                            <span className="flex items-center gap-0.5 shrink-0">
                              <Heart size={10} /> {m.likes_count || 0}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : (
            /* Discovery Mode: Trending Hashtags + Trending Creators + Sounds */
            <>
              {/* Trending Hashtags */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Hash size={13} className="text-[#00E5FF]" />
                  Trending Hashtags
                </h3>
                {trendingHashtags.length === 0 ? (
                  <p className="text-xs text-zinc-500 p-4 rounded-2xl bg-[#121218] border border-white/10">
                    No hashtags posted yet. Add #hashtags to your next Moment!
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {trendingHashtags.map((item) => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => setQuery(`#${item.tag}`)}
                        className="px-3.5 py-2 rounded-2xl bg-[#121218] hover:bg-white/[0.08] border border-white/10 text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <span className="text-[#00E5FF]">#{item.tag}</span>
                        <span className="text-[10px] text-zinc-500">{item.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Trending Creators */}
              <section className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-[#7C3AED]" />
                  Trending Creators
                </h3>
                {trendingCreators.length === 0 ? (
                  <p className="text-xs text-zinc-500 p-4 rounded-2xl bg-[#121218] border border-white/10">
                    Creators will appear here as people post Moments.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {trendingCreators.map(({ author, totalLikes, postCount }) => {
                      const isFollowing = followingIds.has(author.id);
                      return (
                        <div
                          key={author.id}
                          className="p-3 rounded-2xl bg-[#121218] border border-white/10 flex items-center gap-3"
                        >
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#00E5FF] p-[2px] shrink-0">
                            <div className="w-full h-full rounded-full bg-[#0A0A0A] overflow-hidden flex items-center justify-center font-bold text-sm">
                              {author.avatar_url ? (
                                <img
                                  src={author.avatar_url}
                                  alt={author.full_name || author.name || author.username || 'Creator'}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                ((author.full_name || author.name || author.username)?.[0] || '?').toUpperCase()
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">
                              {author.full_name || author.name || author.username || 'Creator'}
                            </p>
                            <p className="text-[11px] text-zinc-400 truncate">
                              @{author.username || 'user'} · {postCount}{' '}
                              {postCount === 1 ? 'Moment' : 'Moments'} · {totalLikes} likes
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleFollow(author.id)}
                            className={`px-3.5 min-h-[34px] rounded-xl text-xs font-bold transition ${
                              isFollowing
                                ? 'bg-white/10 text-zinc-200 border border-white/15'
                                : 'bg-gradient-to-r from-[#7C3AED] to-[#00E5FF] text-white'
                            }`}
                          >
                            {isFollowing ? 'Following' : 'Follow'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Popular Sounds */}
              {allSounds.length > 0 && (
                <section className="space-y-2.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Music2 size={13} className="text-[#00E5FF]" />
                    Sounds in Moments
                  </h3>
                  <div className="space-y-2">
                    {allSounds.slice(0, 6).map((sound) => (
                      <button
                        key={sound.name}
                        type="button"
                        onClick={() => setQuery(sound.name)}
                        className="w-full p-3 rounded-2xl bg-[#121218] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Music2 size={16} className="text-[#00E5FF] shrink-0" />
                          <span className="text-xs font-bold truncate">{sound.name}</span>
                        </div>
                        <span className="text-[11px] text-zinc-400 shrink-0">
                          {sound.count} {sound.count === 1 ? 'post' : 'posts'}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
