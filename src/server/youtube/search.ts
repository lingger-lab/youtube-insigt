import type { ChannelSnapshot, SearchFilters, VideoData } from '../../types/youtube.ts';
import { youtubeGet, createStats, type CallStats } from './client.ts';
import {
  ChannelListResponseSchema,
  SearchResponseSchema,
  VideoListResponseSchema,
  parseOrThrow,
  toCount,
} from './schema.ts';

/** search.list / videos.list / channels.list 모두 한 번에 최대 50건 */
const PAGE_SIZE = 50;
/** Deep Search 상한. 200개 = search.list 4회 = 400 할당량 단위 */
export const MAX_DEEP_SEARCH = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * search.list를 페이지 단위로 돌며 영상 ID만 모은다.
 *
 * 이 단계만 순차다. 다음 페이지 토큰이 앞 응답에 들어 있어 병렬화할 수 없다.
 * 여기서 할당량의 98%가 나간다(페이지당 100단위).
 */
async function collectVideoIds(
  term: string,
  filters: SearchFilters,
  total: number,
  stats: CallStats,
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let pageToken = '';

  while (ids.length < total) {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: term,
      order: filters.order,
      videoDuration: filters.videoDuration,
      maxResults: String(Math.min(PAGE_SIZE, total - ids.length)),
    });
    if (filters.publishedAfter) params.append('publishedAfter', filters.publishedAfter);
    if (pageToken) params.append('pageToken', pageToken);

    const payload = parseOrThrow(SearchResponseSchema, await youtubeGet('search', params, stats), 'search');

    let added = 0;
    for (const item of payload.items ?? []) {
      const id = item.id?.videoId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      added += 1;
    }

    if (added === 0 && !payload.nextPageToken) break;
    if (!payload.nextPageToken) break;
    pageToken = payload.nextPageToken;
  }

  return ids.slice(0, total);
}

type VideoCore = Omit<VideoData, 'channel'>;

/**
 * videos.list로 상세를 받는다. 50개씩 나눠 **병렬로** 부른다.
 *
 * 예전에는 검색 페이지마다 한 번씩 순차로 불러 왕복이 길어졌다.
 * 이 호출은 페이지당 1단위라 나눠 불러도 할당량은 같다.
 */
async function fetchVideoDetails(videoIds: string[], stats: CallStats): Promise<VideoCore[]> {
  const batches = await Promise.all(
    chunk(videoIds, PAGE_SIZE).map(async (batch) => {
      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        id: batch.join(','),
      });
      const payload = parseOrThrow(
        VideoListResponseSchema,
        await youtubeGet('videos', params, stats),
        'videos',
      );

      return (payload.items ?? []).map((item): VideoCore => {
        const snippet = item.snippet;
        const thumbs = snippet?.thumbnails;
        return {
          id: item.id,
          title: snippet?.title ?? '',
          description: snippet?.description ?? '',
          thumbnailUrl: thumbs?.medium?.url ?? thumbs?.high?.url ?? '',
          // 분석에 붙일 때는 큰 쪽이 필요하다. maxres는 없는 영상이 많아 단계적으로 내려간다.
          thumbnailHighUrl: thumbs?.maxres?.url ?? thumbs?.high?.url ?? thumbs?.medium?.url ?? '',
          viewCount: toCount(item.statistics?.viewCount) ?? 0,
          likeCount: toCount(item.statistics?.likeCount),
          commentCount: toCount(item.statistics?.commentCount),
          publishedAt: snippet?.publishedAt ?? '',
          channelId: snippet?.channelId ?? '',
          channelTitle: snippet?.channelTitle ?? '',
          duration: item.contentDetails?.duration ?? 'PT0S',
          tags: snippet?.tags ?? [],
          categoryId: snippet?.categoryId ?? '',
          hasCaption: item.contentDetails?.caption === 'true',
        };
      });
    }),
  );

  return batches.flat();
}

/**
 * channels.list로 채널 통계를 받는다.
 *
 * 예전에는 검색 페이지마다 불러 같은 채널을 여러 번 조회했다. 이제 고유
 * 채널만 모아 50개씩 병렬로 한 번씩만 부른다.
 */
async function fetchChannelSnapshots(
  channelIds: string[],
  stats: CallStats,
): Promise<Map<string, ChannelSnapshot>> {
  const batches = await Promise.all(
    chunk(channelIds, PAGE_SIZE).map(async (batch) => {
      const params = new URLSearchParams({ part: 'statistics', id: batch.join(',') });
      const payload = parseOrThrow(
        ChannelListResponseSchema,
        await youtubeGet('channels', params, stats),
        'channels',
      );

      return (payload.items ?? []).map((item): ChannelSnapshot => {
        const hidden = item.statistics?.hiddenSubscriberCount === true;
        const subscriberCount = hidden ? null : toCount(item.statistics?.subscriberCount);
        const videoCount = toCount(item.statistics?.videoCount);
        const totalViewCount = toCount(item.statistics?.viewCount);
        return {
          channelId: item.id,
          subscriberCount,
          hiddenSubscriberCount: hidden,
          videoCount,
          totalViewCount,
          averageViews:
            totalViewCount !== null && videoCount !== null && videoCount > 0
              ? totalViewCount / videoCount
              : null,
        };
      });
    }),
  );

  return new Map(batches.flat().map((snapshot) => [snapshot.channelId, snapshot]));
}

/** 통계를 못 받은 채널. 값을 지어내지 않고 전부 null로 둔다. */
function unknownChannel(channelId: string): ChannelSnapshot {
  return {
    channelId,
    subscriberCount: null,
    hiddenSubscriberCount: false,
    videoCount: null,
    totalViewCount: null,
    averageViews: null,
  };
}

/**
 * 키워드로 영상을 모아 영상·채널 통계를 붙여 돌려준다.
 *
 * API 키는 이 모듈 안에서만 쓰이며 절대 클라이언트로 나가지 않는다.
 * 파생 지표(성과배수 등)는 여기서 계산하지 않는다 — utils/metrics.ts 담당.
 */
export async function searchYouTube(
  term: string,
  filters: SearchFilters,
  maxResults: number,
): Promise<{ videos: VideoData[]; stats: CallStats }> {
  const stats = createStats();
  const total = Math.min(maxResults, MAX_DEEP_SEARCH);

  const videoIds = await collectVideoIds(term, filters, total, stats);
  if (videoIds.length === 0) return { videos: [], stats };

  const details = await fetchVideoDetails(videoIds, stats);

  const channelIds = [...new Set(details.map((v) => v.channelId).filter(Boolean))];
  const channels = channelIds.length > 0 ? await fetchChannelSnapshots(channelIds, stats) : new Map();

  const byId = new Map(details.map((video) => [video.id, video]));

  // 검색이 돌려준 순서가 곧 관련도 순서다. videos.list는 이 순서를 보장하지
  // 않으므로 원래 ID 순서로 되돌린다.
  return {
    videos: videoIds
      .map((id) => byId.get(id))
      .filter((video): video is VideoCore => video !== undefined)
      .map((video) => ({
        ...video,
        channel: channels.get(video.channelId) ?? unknownChannel(video.channelId),
      })),
    stats,
  };
}
