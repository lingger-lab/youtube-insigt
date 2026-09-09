import type { ChannelSnapshot, LiveStatus, RecentUpload, SearchFilters, VideoData } from '../../types/youtube.ts';
import { youtubeGet, createStats, type CallStats } from './client.ts';
import { YouTubeApiError } from './errors.ts';
import {
  ChannelListResponseSchema,
  PlaylistItemsResponseSchema,
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

/** 채널별 업로드 조회 동시성. 수십 채널을 한꺼번에 쏘면 userRateLimitExceeded가 난다. */
const UPLOADS_CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
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

  // 검색 호출 수는 페이지 수로 고정한다. 실측에서 search.list가 한 페이지에 50개 미만을
  // 돌려주거나 페이지 간 중복을 내면, 개수를 채우려 1개짜리 페이지를 더 부르다가
  // 50개 검색에 검색 호출 4회를 쓴 사례가 있었다("홈카페 레시피": 46 -> 4 -> 1 -> 1).
  // 검색 버킷은 하루 100회가 전부라, 개수를 정확히 채우는 것보다 비용을 정확히
  // 지키는 편이 낫다. 결과가 depth보다 적을 수 있고, UI의 "검색 N회 소비"는 그대로 참이다.
  const maxPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let page = 0;

  while (ids.length < total && page < maxPages) {
    page += 1;
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: term,
      order: filters.order,
      videoDuration: filters.videoDuration,
      maxResults: String(PAGE_SIZE),
    });
    if (filters.publishedAfter) params.append('publishedAfter', filters.publishedAfter);
    if (pageToken) params.append('pageToken', pageToken);

    const payload = parseOrThrow(SearchResponseSchema, await youtubeGet('search', params, stats), 'search');

    for (const item of payload.items ?? []) {
      const id = item.id?.videoId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }

    if (!payload.nextPageToken) break;
    pageToken = payload.nextPageToken;
  }

  return ids.slice(0, total);
}

type VideoCore = Omit<VideoData, 'channel'>;

function toLiveStatus(raw: string | undefined): LiveStatus {
  return raw === 'live' || raw === 'upcoming' ? raw : 'none';
}

/**
 * videos.list로 상세를 받는다. 50개씩 나눠 **병렬로** 부른다.
 *
 * 예전에는 검색 페이지마다 한 번씩 순차로 불러 왕복이 길어졌다.
 * 이 호출은 페이지당 1단위라 나눠 불러도 할당량은 같다.
 */
/** "https://en.wikipedia.org/wiki/Lifestyle_(sociology)" → "Lifestyle (sociology)" */
function topicTitle(url: string): string {
  const last = url.split('/').pop() ?? url;
  try {
    return decodeURIComponent(last).replace(/_/g, ' ');
  } catch {
    return last.replace(/_/g, ' ');
  }
}

async function fetchVideoDetails(videoIds: string[], stats: CallStats): Promise<VideoCore[]> {
  const batches = await Promise.all(
    chunk(videoIds, PAGE_SIZE).map(async (batch) => {
      const params = new URLSearchParams({
        // part를 늘려도 비용은 그대로(1 unit). 받을 수 있는 필드는 전부 받는다.
        part: 'snippet,statistics,contentDetails,topicDetails,paidProductPlacementDetails',
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
          liveStatus: toLiveStatus(snippet?.liveBroadcastContent),
          hasPaidProductPlacement: item.paidProductPlacementDetails?.hasPaidProductPlacement ?? false,
          topicCategories: (item.topicDetails?.topicCategories ?? []).map(topicTitle),
          audioLanguage: snippet?.defaultAudioLanguage ?? null,
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
      // contentDetails를 더해도 비용은 같다(part는 정액). 업로드 재생목록 ID가 공짜로 온다.
      const params = new URLSearchParams({ part: 'statistics,contentDetails', id: batch.join(',') });
      const payload = parseOrThrow(
        ChannelListResponseSchema,
        await youtubeGet('channels', params, stats),
        'channels',
      );

      return (payload.items ?? []).map((item): ChannelSnapshot => {
        const hidden = item.statistics?.hiddenSubscriberCount === true;
        const subscriberCount = hidden ? null : toCount(item.statistics?.subscriberCount);
        return {
          channelId: item.id,
          subscriberCount,
          hiddenSubscriberCount: hidden,
          videoCount: toCount(item.statistics?.videoCount),
          totalViewCount: toCount(item.statistics?.viewCount),
          uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
          recentUploads: null,
        };
      });
    }),
  );

  return new Map(batches.flat().map((snapshot) => [snapshot.channelId, snapshot]));
}

/**
 * 채널 하나의 최근 업로드(최대 50편)를 받는다. 2 units, 검색 버킷과 무관.
 *
 * playlistItems.list(1) -> videoId 50개 -> videos.list(1) -> 조회수·길이.
 * 이 목록이 있어야 Shorts와 롱폼을 갈라 같은 포맷끼리 기준선을 세울 수 있다.
 *
 * 재생목록이 없는 채널(404 playlistNotFound)은 null로 두고 넘어간다. 채널 하나
 * 때문에 검색 전체를 실패시키지 않기 위한 **의도된 부분 실패**이며, 결과는
 * metrics.baselineSource='lifetime-mean'으로 사용자에게 보인다. 할당량·키 오류는
 * 그대로 던진다 — 그건 채널 문제가 아니다.
 */
async function fetchRecentUploads(
  uploadsPlaylistId: string,
  stats: CallStats,
): Promise<RecentUpload[] | null> {
  try {
    const listed = parseOrThrow(
      PlaylistItemsResponseSchema,
      await youtubeGet(
        'playlistItems',
        new URLSearchParams({ part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: '50' }),
        stats,
      ),
      'playlistItems',
    );
    const ids = (listed.items ?? []).map((i) => i.contentDetails?.videoId).filter((id): id is string => !!id);
    if (ids.length === 0) return [];

    const detailed = parseOrThrow(
      VideoListResponseSchema,
      await youtubeGet(
        'videos',
        new URLSearchParams({ part: 'statistics,contentDetails,snippet', id: ids.join(',') }),
        stats,
      ),
      'videos',
    );
    return (detailed.items ?? []).map((item) => ({
      id: item.id,
      title: item.snippet?.title ?? '',
      viewCount: toCount(item.statistics?.viewCount) ?? 0,
      duration: item.contentDetails?.duration ?? 'PT0S',
      publishedAt: item.snippet?.publishedAt ?? '',
      liveStatus: toLiveStatus(item.snippet?.liveBroadcastContent),
    }));
  } catch (error) {
    if (error instanceof YouTubeApiError && error.code === 'NOT_FOUND') {
      console.warn('[youtube/search] 업로드 재생목록 없음, 채널 전체 통계로 대체', { uploadsPlaylistId });
      return null;
    }
    throw error;
  }
}

async function attachRecentUploads(
  channels: Map<string, ChannelSnapshot>,
  stats: CallStats,
): Promise<void> {
  const targets = [...channels.values()].filter((c) => c.uploadsPlaylistId);
  const uploads = await mapWithConcurrency(targets, UPLOADS_CONCURRENCY, (c) =>
    fetchRecentUploads(c.uploadsPlaylistId as string, stats),
  );
  targets.forEach((c, i) => {
    channels.set(c.channelId, { ...c, recentUploads: uploads[i] });
  });
}

/** 통계를 못 받은 채널. 값을 지어내지 않고 전부 null로 둔다. */
function unknownChannel(channelId: string): ChannelSnapshot {
  return {
    channelId,
    subscriberCount: null,
    hiddenSubscriberCount: false,
    videoCount: null,
    totalViewCount: null,
    uploadsPlaylistId: null,
    recentUploads: null,
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
  const channels: Map<string, ChannelSnapshot> =
    channelIds.length > 0 ? await fetchChannelSnapshots(channelIds, stats) : new Map();
  await attachRecentUploads(channels, stats);

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
