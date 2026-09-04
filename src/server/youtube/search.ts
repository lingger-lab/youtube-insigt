import type { SearchFilters, VideoData } from '../../types/youtube.ts';
import { youtubeGet, createStats, type CallStats } from './client.ts';

/** search.list가 한 번에 돌려줄 수 있는 최대 개수 */
const PAGE_SIZE = 50;
/** Deep Search 상한. 200개 = search.list 4회 = 400 할당량 단위 */
export const MAX_DEEP_SEARCH = 200;

type VideoDetails = Omit<VideoData, 'subscriberCount' | 'viralScore'>;

interface ChannelStats {
  channelId: string;
  subscriberCount: number;
}

/** 응답에서 배열 items를 안전하게 꺼낸다. 없으면 빈 배열. */
function readItems(payload: unknown): unknown[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? items : [];
}

function readString(source: unknown, ...path: string[]): string {
  let current: unknown = source;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : '';
}

function readCount(source: unknown, ...path: string[]): number {
  const raw = readString(source, ...path);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calcViralScore(viewCount: number, subscriberCount: number): number {
  if (subscriberCount === 0) return 0;
  return viewCount / subscriberCount;
}

async function getVideoDetails(videoIds: string[], stats: CallStats): Promise<VideoDetails[]> {
  const payload = await youtubeGet(
    'videos',
    new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      id: videoIds.join(','),
    }),
    stats,
  );

  return readItems(payload).map((item) => ({
    id: readString(item, 'id'),
    title: readString(item, 'snippet', 'title'),
    description: readString(item, 'snippet', 'description'),
    thumbnailUrl: readString(item, 'snippet', 'thumbnails', 'medium', 'url'),
    viewCount: readCount(item, 'statistics', 'viewCount'),
    publishedAt: readString(item, 'snippet', 'publishedAt'),
    channelId: readString(item, 'snippet', 'channelId'),
    channelTitle: readString(item, 'snippet', 'channelTitle'),
    duration: readString(item, 'contentDetails', 'duration') || 'PT0S',
  }));
}

async function getChannelStats(channelIds: string[], stats: CallStats): Promise<ChannelStats[]> {
  const payload = await youtubeGet(
    'channels',
    new URLSearchParams({
      part: 'statistics',
      id: channelIds.join(','),
    }),
    stats,
  );

  return readItems(payload).map((item) => ({
    channelId: readString(item, 'id'),
    subscriberCount: readCount(item, 'statistics', 'subscriberCount'),
  }));
}

/**
 * 키워드로 영상을 모아 조회수·구독자수를 붙여 돌려준다.
 *
 * API 키는 이 모듈 안에서만 쓰이며 절대 클라이언트로 나가지 않는다.
 */
export async function searchYouTube(
  term: string,
  filters: SearchFilters,
  maxResults: number,
): Promise<{ videos: VideoData[]; stats: CallStats }> {
  const stats = createStats();
  const videos: VideoData[] = [];
  const total = Math.min(maxResults, MAX_DEEP_SEARCH);
  let nextPageToken = '';

  while (videos.length < total) {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: term,
      order: filters.order,
      videoDuration: filters.videoDuration,
      maxResults: String(Math.min(PAGE_SIZE, total - videos.length)),
    });
    if (filters.publishedAfter) params.append('publishedAfter', filters.publishedAfter);
    if (nextPageToken) params.append('pageToken', nextPageToken);

    const payload = await youtubeGet('search', params, stats);

    const videoIds = readItems(payload)
      .map((item) => readString(item, 'id', 'videoId'))
      .filter(Boolean);
    if (videoIds.length === 0) break;

    const details = await getVideoDetails(videoIds, stats);
    const channelIds = [...new Set(details.map((v) => v.channelId).filter(Boolean))];
    const channels = channelIds.length > 0 ? await getChannelStats(channelIds, stats) : [];

    const seen = new Set(videos.map((v) => v.id));
    for (const video of details) {
      if (seen.has(video.id)) continue;
      const subscriberCount = channels.find((c) => c.channelId === video.channelId)?.subscriberCount ?? 0;
      videos.push({
        ...video,
        subscriberCount,
        viralScore: calcViralScore(video.viewCount, subscriberCount),
      });
    }

    nextPageToken = readString(payload, 'nextPageToken');
    if (!nextPageToken) break;
  }

  return { videos: videos.slice(0, total), stats };
}
