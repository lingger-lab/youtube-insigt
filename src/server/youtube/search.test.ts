import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchYouTube } from './search.ts';
import type { SearchFilters } from '../../types/youtube.ts';

/**
 * fetch를 경계에서만 갈아끼운다. 안쪽 로직(페이지네이션·배치·매핑)은 실제 코드가 돈다.
 */

const FILTERS: SearchFilters = { order: 'relevance', videoDuration: 'any' };

let calls: { endpoint: string; params: URLSearchParams }[] = [];
const realFetch = globalThis.fetch;

/** 검색 결과 총 개수와 채널 수를 바꿔가며 응답을 만든다. */
function installFetch(options: {
  totalVideos: number;
  channelCount: number;
  hiddenChannels?: Set<string>;
  /** 채널당 최근 업로드 편수 (기본 50) */
  uploadsPerChannel?: number;
  /** 404 playlistNotFound 를 돌려줄 재생목록 ID */
  missingPlaylists?: Set<string>;
  /** 첫 페이지가 이만큼만 돌려준다 (실제 API가 자주 그런다). nextPageToken은 준다. */
  shortFirstPage?: number;
}) {
  const {
    totalVideos,
    channelCount,
    hiddenChannels = new Set<string>(),
    uploadsPerChannel = 50,
    missingPlaylists = new Set<string>(),
    shortFirstPage,
  } = options;

  globalThis.fetch = (async (url: string | URL) => {
    const parsed = new URL(String(url));
    const endpoint = parsed.pathname.split('/').pop() ?? '';
    const params = parsed.searchParams;
    calls.push({ endpoint, params });

    if (endpoint === 'search') {
      const page = Number(params.get('pageToken') ?? '0');
      const size = Number(params.get('maxResults'));
      const start = page * 50;
      let count = Math.max(0, Math.min(size, totalVideos - start));
      if (page === 0 && shortFirstPage !== undefined) count = Math.min(count, shortFirstPage);
      const items = Array.from({ length: count }, (_, i) => ({ id: { videoId: `v${start + i}` } }));
      const consumed = start + count;
      return jsonResponse({
        items,
        ...(consumed < totalVideos ? { nextPageToken: String(page + 1) } : {}),
      });
    }

    if (endpoint === 'playlistItems') {
      const playlistId = params.get('playlistId') ?? '';
      assert.equal(params.get('part'), 'contentDetails');
      if (missingPlaylists.has(playlistId)) {
        return new Response(
          JSON.stringify({ error: { code: 404, errors: [{ reason: 'playlistNotFound' }] } }),
          { status: 404 },
        );
      }
      // 재생목록 UU<ch> 의 최근 업로드 uploadsPerChannel 편: 'u<ch>x<i>'
      const ch = playlistId.replace(/^UU/, '');
      return jsonResponse({
        items: Array.from({ length: uploadsPerChannel }, (_, i) => ({
          contentDetails: { videoId: `u${ch}x${i}` },
        })),
      });
    }

    if (endpoint === 'videos') {
      const ids = (params.get('id') ?? '').split(',').filter(Boolean);
      assert.ok(ids.length <= 50, `videos.list에 ${ids.length}개를 한 번에 요청했다 (상한 50)`);

      // 채널 업로드 상세: 짝수는 Shorts(1분), 홀수는 롱폼(10분). 조회수는 인덱스 기반.
      if (ids[0]?.startsWith('u')) {
        return jsonResponse({
          items: ids.map((id) => {
            const i = Number(id.split('x')[1]);
            return {
              id,
              snippet: { publishedAt: '2026-07-01T00:00:00Z', title: `업로드 ${id}` },
              statistics: { viewCount: String(i % 2 === 0 ? 5_000 + i : 50_000 + i * 100) },
              contentDetails: { duration: i % 2 === 0 ? 'PT1M' : 'PT10M' },
            };
          }),
        });
      }

      return jsonResponse({
        items: ids.map((id) => {
          const n = Number(id.slice(1));
          return {
            id,
            snippet: {
              title: `영상 ${n}`,
              description: `설명 ${n}`,
              // 7의 배수 영상은 진행 중 라이브
              liveBroadcastContent: n % 7 === 0 && n > 0 ? 'live' : 'none',
              publishedAt: '2026-08-01T00:00:00Z',
              channelId: `c${n % channelCount}`,
              channelTitle: `채널 ${n % channelCount}`,
              tags: ['태그A', '태그B'],
              categoryId: '22',
              ...(n % 2 === 0 ? { defaultAudioLanguage: 'ko' } : {}),
              thumbnails: {
                medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` },
                high: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` },
                // 짝수 영상만 maxres가 있다 — 실제 API도 자주 빠진다
                ...(n % 2 === 0 ? { maxres: { url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` } } : {}),
              },
            },
            statistics: {
              viewCount: String(1000 + n),
              // 3의 배수 영상은 좋아요를 숨겼다
              ...(n % 3 === 0 ? {} : { likeCount: String(10 + n) }),
              commentCount: String(n),
            },
            contentDetails: { duration: n % 7 === 0 && n > 0 ? 'P0D' : 'PT10M', caption: n % 2 === 0 ? 'true' : 'false' },
            // 0 unit 추가 필드: 5의 배수는 유료 PPL, 주제는 Wikipedia URL로 온다, 홀수는 음성 언어 없음
            paidProductPlacementDetails: { hasPaidProductPlacement: n % 5 === 0 },
            topicDetails: { topicCategories: ['https://en.wikipedia.org/wiki/Food', 'https://en.wikipedia.org/wiki/Lifestyle_(sociology)'] },
          };
        }),
      });
    }

    if (endpoint === 'channels') {
      const ids = (params.get('id') ?? '').split(',').filter(Boolean);
      assert.ok(ids.length <= 50, `channels.list에 ${ids.length}개를 한 번에 요청했다 (상한 50)`);
      assert.ok((params.get('part') ?? '').includes('contentDetails'), 'uploads 재생목록 ID를 요청해야 한다');
      return jsonResponse({
        items: ids.map((id) => {
          const hidden = hiddenChannels.has(id);
          return {
            id,
            statistics: {
              viewCount: '1000000',
              videoCount: '100',
              hiddenSubscriberCount: hidden,
              ...(hidden ? {} : { subscriberCount: '50000' }),
            },
            contentDetails: { relatedPlaylists: { uploads: `UU${id}` } },
          };
        }),
      });
    }

    throw new Error(`예상치 못한 엔드포인트: ${endpoint}`);
  }) as typeof fetch;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function countBy(endpoint: string): number {
  return calls.filter((c) => c.endpoint === endpoint).length;
}

function requestedParts(endpoint: string): string[] {
  return calls.filter((c) => c.endpoint === endpoint).map((c) => c.params.get('part') ?? '');
}

beforeEach(() => {
  calls = [];
  process.env.YT_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('searchYouTube — 호출 구조', () => {
  test('200개 검색: search 4 + videos 4 + channels 1 + 채널별 업로드(10채널 x 2)', async () => {
    installFetch({ totalVideos: 200, channelCount: 10 });
    const { videos, stats } = await searchYouTube('테스트', FILTERS, 200);

    assert.equal(videos.length, 200);
    assert.equal(countBy('search'), 4);
    // 검색 결과 200개는 50개씩 4회, 채널 10개의 업로드 상세는 채널당 1회
    assert.equal(countBy('videos'), 4 + 10);
    // 고유 채널 10개뿐이므로 channels.list는 한 번이면 된다
    assert.equal(countBy('channels'), 1);
    assert.equal(countBy('playlistItems'), 10);
    assert.equal(stats.calls, 4 + 4 + 1 + 10 + 10);
  });

  test('검색 버킷과 공용 버킷을 따로 센다', async () => {
    installFetch({ totalVideos: 200, channelCount: 10 });
    const { stats } = await searchYouTube('테스트', FILTERS, 200);
    assert.equal(stats.searchCalls, 4); // 전용 버킷: 하루 100회 중 4회
    assert.equal(stats.otherUnits, 4 + 1 + 10 * 2); // videos 4 + channels 1 + 채널별 2
  });

  test('50개 검색(채널 5): search 1 + videos 1 + channels 1 + 업로드 5x2', async () => {
    installFetch({ totalVideos: 50, channelCount: 5 });
    const { videos, stats } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(videos.length, 50);
    assert.equal(stats.calls, 3 + 10);
    assert.equal(stats.searchCalls, 1);
    assert.equal(stats.otherUnits, 2 + 10);
  });

  test('채널이 50개를 넘으면 channels.list를 나눠 부른다', async () => {
    installFetch({ totalVideos: 200, channelCount: 120 });
    await searchYouTube('테스트', FILTERS, 200);
    assert.equal(countBy('channels'), 3); // 120개 -> 50/50/20
  });

  test('결과가 없으면 뒤따르는 호출을 하지 않는다', async () => {
    installFetch({ totalVideos: 0, channelCount: 1 });
    const { videos } = await searchYouTube('없는키워드', FILTERS, 200);
    assert.equal(videos.length, 0);
    assert.equal(countBy('videos'), 0);
    assert.equal(countBy('channels'), 0);
    assert.equal(countBy('playlistItems'), 0);
  });

  // 실측: search.list는 한 페이지에 50개 미만을 자주 돌려준다. 개수를 채우려
  // 페이지를 더 부르면 50개 검색이 검색 버킷을 4회 쓴다. 비용을 지키는 쪽을 택한다.
  test('첫 페이지가 50개 미만이어도 검색 호출은 페이지 수(1회)로 고정하고 결과는 그만큼만', async () => {
    installFetch({ totalVideos: 500, channelCount: 5, shortFirstPage: 46 });
    const { videos, stats } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(stats.searchCalls, 1);
    assert.equal(videos.length, 46);
  });

  test('200개 검색은 첫 페이지가 짧아도 검색 호출을 4회로 고정한다', async () => {
    installFetch({ totalVideos: 500, channelCount: 5, shortFirstPage: 40 });
    const { videos, stats } = await searchYouTube('테스트', FILTERS, 200);
    assert.equal(stats.searchCalls, 4);
    assert.equal(videos.length, 40 + 50 + 50 + 50);
  });

  test('요청한 개수보다 결과가 적으면 있는 만큼만 돌려준다', async () => {
    installFetch({ totalVideos: 30, channelCount: 3 });
    const { videos } = await searchYouTube('테스트', FILTERS, 200);
    assert.equal(videos.length, 30);
  });
});

describe('searchYouTube — 필드 매핑', () => {
  test('확장된 필드를 모두 담는다', async () => {
    installFetch({ totalVideos: 2, channelCount: 1 });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    const first = videos[0];

    assert.equal(first.id, 'v0');
    assert.equal(first.title, '영상 0');
    assert.equal(first.viewCount, 1000);
    assert.deepEqual(first.tags, ['태그A', '태그B']);
    assert.equal(first.categoryId, '22');
    assert.equal(first.hasCaption, true);
    assert.equal(first.commentCount, 0);
  });

  // part를 늘려도 비용은 그대로다. 받을 수 있는 필드는 전부 받는다 (CLAUDE.md).
  test('0 unit 필드 — PPL 여부·주제 분류(Wikipedia URL의 제목만)·음성 언어를 담는다', async () => {
    installFetch({ totalVideos: 2, channelCount: 1 });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(videos[0].hasPaidProductPlacement, true);
    assert.equal(videos[1].hasPaidProductPlacement, false);
    assert.deepEqual(videos[0].topicCategories, ['Food', 'Lifestyle (sociology)']);
    assert.equal(videos[0].audioLanguage, 'ko');
    assert.equal(videos[1].audioLanguage, null);
  });

  test('videos.list에 topicDetails·paidProductPlacementDetails part를 요청한다', async () => {
    installFetch({ totalVideos: 1, channelCount: 1 });
    await searchYouTube('테스트', FILTERS, 50);
    const part = requestedParts('videos')[0];
    assert.ok(part.includes('topicDetails') && part.includes('paidProductPlacementDetails'), part);
  });

  test('liveBroadcastContent를 liveStatus로 담는다 (없으면 none)', async () => {
    installFetch({ totalVideos: 8, channelCount: 1 });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(videos[0].liveStatus, 'none');
    assert.equal(videos[7].liveStatus, 'live');
    assert.equal(videos[7].duration, 'P0D');
  });

  test('videos.list에 snippet·statistics·contentDetails를 모두 요청한다', async () => {
    installFetch({ totalVideos: 1, channelCount: 1 });
    await searchYouTube('테스트', FILTERS, 50);
    const videosCall = calls.find((c) => c.endpoint === 'videos');
    assert.equal(videosCall?.params.get('part'), 'snippet,statistics,contentDetails,topicDetails,paidProductPlacementDetails');
  });

  test('큰 썸네일은 maxres > high > medium 순으로 고른다', async () => {
    installFetch({ totalVideos: 2, channelCount: 1 });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    assert.ok(videos[0].thumbnailHighUrl.includes('maxresdefault')); // v0: maxres 있음
    assert.ok(videos[1].thumbnailHighUrl.includes('hqdefault')); // v1: maxres 없음 -> high
    // 카드용은 항상 medium
    assert.ok(videos[0].thumbnailUrl.includes('mqdefault'));
  });

  test('좋아요를 숨긴 영상은 null이다 (0이 아니다)', async () => {
    installFetch({ totalVideos: 4, channelCount: 1 });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(videos[0].likeCount, null); // v0: 3의 배수
    assert.equal(videos[1].likeCount, 11);
    assert.equal(videos[3].likeCount, null); // v3: 3의 배수
  });

  test('채널 평균 조회수를 계산해 담는다', async () => {
    installFetch({ totalVideos: 1, channelCount: 1 });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(videos[0].channel.totalViewCount, 1_000_000);
    assert.equal(videos[0].channel.videoCount, 100);
    assert.equal(videos[0].channel.subscriberCount, 50_000);
  });

  test('구독자를 숨긴 채널은 null이며 1로 추정하지 않는다', async () => {
    installFetch({ totalVideos: 1, channelCount: 1, hiddenChannels: new Set(['c0']) });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(videos[0].channel.subscriberCount, null);
    assert.equal(videos[0].channel.hiddenSubscriberCount, true);
    // 숨겨도 총조회수·총영상수는 살아 있어 성과배수는 계산 가능하다
    assert.equal(videos[0].channel.totalViewCount, 1_000_000);
  });

  test('검색이 돌려준 순서(관련도)를 유지한다', async () => {
    installFetch({ totalVideos: 120, channelCount: 4 });
    const { videos } = await searchYouTube('테스트', FILTERS, 120);
    assert.deepEqual(
      videos.slice(0, 5).map((v) => v.id),
      ['v0', 'v1', 'v2', 'v3', 'v4'],
    );
    assert.equal(videos[119].id, 'v119');
  });
});

describe('searchYouTube — 채널 최근 업로드', () => {
  test('채널마다 최근 업로드 목록을 붙인다 (조회수·길이·업로드일)', async () => {
    installFetch({ totalVideos: 2, channelCount: 1, uploadsPerChannel: 6 });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    const uploads = videos[0].channel.recentUploads;
    assert.ok(uploads && uploads.length === 6);
    assert.equal(uploads[1].duration, 'PT10M');
    assert.equal(uploads[1].viewCount, 50_100);
    assert.equal(uploads[0].duration, 'PT1M');
    // 제목은 이미 부르는 videos.list?part=snippet에 오므로 추가 할당량 없이 저장한다 (채널 내부 대조용)
    assert.equal(uploads[1].title, `업로드 ${uploads[1].id}`);
    assert.equal(videos[0].channel.uploadsPlaylistId, 'UUc0');
  });

  // 재생목록이 없는 채널 하나 때문에 검색 전체가 실패하면 안 된다.
  // 대신 null로 남겨 metrics가 열등한 기준선으로 내려갔음을 드러낸다.
  test('업로드 재생목록이 없는 채널(404)은 null로 두고 계속 진행한다', async () => {
    installFetch({ totalVideos: 4, channelCount: 2, missingPlaylists: new Set(['UUc1']) });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    const c0 = videos.find((v) => v.channelId === 'c0')!;
    const c1 = videos.find((v) => v.channelId === 'c1')!;
    assert.ok(Array.isArray(c0.channel.recentUploads));
    assert.equal(c1.channel.recentUploads, null);
  });

  test('업로드가 0편인 채널은 null이 아니라 빈 배열이다', async () => {
    installFetch({ totalVideos: 1, channelCount: 1, uploadsPerChannel: 0 });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    assert.deepEqual(videos[0].channel.recentUploads, []);
    // 목록이 비면 상세 조회를 하지 않는다 (videos.list 는 검색 결과 1회뿐)
    assert.equal(countBy('videos'), 1);
  });

  test('업로드 조회 중 할당량 소진은 삼키지 않고 던진다', async () => {
    installFetch({ totalVideos: 1, channelCount: 1 });
    const inner = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes('/playlistItems')) {
        return new Response(
          JSON.stringify({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }),
          { status: 403 },
        );
      }
      return inner(url, init);
    }) as typeof fetch;
    await assert.rejects(() => searchYouTube('테스트', FILTERS, 50), /할당량 소진/);
  });
});

describe('searchYouTube — 실패 처리', () => {
  test('할당량 소진은 조용히 빈 결과가 되지 않고 던진다', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }),
        { status: 403 },
      )) as typeof fetch;

    await assert.rejects(() => searchYouTube('테스트', FILTERS, 50), /할당량 소진/);
  });

  test('API 키가 없으면 즉시 실패한다', async () => {
    delete process.env.YT_API_KEY;
    installFetch({ totalVideos: 10, channelCount: 1 });
    await assert.rejects(() => searchYouTube('테스트', FILTERS, 50), /YT_API_KEY/);
  });

  test('응답 형식이 어긋나면 빈 값으로 메우지 않고 던진다', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ items: 'not-an-array' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(() => searchYouTube('테스트', FILTERS, 50), /응답 형식 불일치/);
  });
});
