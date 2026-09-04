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
function installFetch(options: { totalVideos: number; channelCount: number; hiddenChannels?: Set<string> }) {
  const { totalVideos, channelCount, hiddenChannels = new Set<string>() } = options;

  globalThis.fetch = (async (url: string | URL) => {
    const parsed = new URL(String(url));
    const endpoint = parsed.pathname.split('/').pop() ?? '';
    const params = parsed.searchParams;
    calls.push({ endpoint, params });

    if (endpoint === 'search') {
      const page = Number(params.get('pageToken') ?? '0');
      const size = Number(params.get('maxResults'));
      const start = page * 50;
      const count = Math.max(0, Math.min(size, totalVideos - start));
      const items = Array.from({ length: count }, (_, i) => ({ id: { videoId: `v${start + i}` } }));
      const consumed = start + count;
      return jsonResponse({
        items,
        ...(consumed < totalVideos ? { nextPageToken: String(page + 1) } : {}),
      });
    }

    if (endpoint === 'videos') {
      const ids = (params.get('id') ?? '').split(',').filter(Boolean);
      assert.ok(ids.length <= 50, `videos.list에 ${ids.length}개를 한 번에 요청했다 (상한 50)`);
      return jsonResponse({
        items: ids.map((id) => {
          const n = Number(id.slice(1));
          return {
            id,
            snippet: {
              title: `영상 ${n}`,
              description: `설명 ${n}`,
              publishedAt: '2026-08-01T00:00:00Z',
              channelId: `c${n % channelCount}`,
              channelTitle: `채널 ${n % channelCount}`,
              tags: ['태그A', '태그B'],
              categoryId: '22',
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
            contentDetails: { duration: 'PT10M', caption: n % 2 === 0 ? 'true' : 'false' },
          };
        }),
      });
    }

    if (endpoint === 'channels') {
      const ids = (params.get('id') ?? '').split(',').filter(Boolean);
      assert.ok(ids.length <= 50, `channels.list에 ${ids.length}개를 한 번에 요청했다 (상한 50)`);
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

beforeEach(() => {
  calls = [];
  process.env.YT_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('searchYouTube — 호출 구조', () => {
  test('200개 검색: search 4회 + videos 4회 + channels 1회', async () => {
    installFetch({ totalVideos: 200, channelCount: 10 });
    const { videos, stats } = await searchYouTube('테스트', FILTERS, 200);

    assert.equal(videos.length, 200);
    assert.equal(countBy('search'), 4);
    // 페이지마다 부르지 않고 200개를 50개씩 나눠 부른다
    assert.equal(countBy('videos'), 4);
    // 고유 채널 10개뿐이므로 한 번이면 된다 (예전에는 페이지마다 4번 불렀다)
    assert.equal(countBy('channels'), 1);
    assert.equal(stats.calls, 9);
  });

  test('할당량은 search.list가 대부분을 차지한다', async () => {
    installFetch({ totalVideos: 200, channelCount: 10 });
    const { stats } = await searchYouTube('테스트', FILTERS, 200);
    assert.equal(stats.quotaUnits, 4 * 100 + 4 * 1 + 1 * 1); // 405
  });

  test('50개 검색은 각 1회씩만 부른다', async () => {
    installFetch({ totalVideos: 50, channelCount: 5 });
    const { videos, stats } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(videos.length, 50);
    assert.equal(stats.calls, 3);
    assert.equal(stats.quotaUnits, 102);
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

  test('videos.list에 snippet·statistics·contentDetails를 모두 요청한다', async () => {
    installFetch({ totalVideos: 1, channelCount: 1 });
    await searchYouTube('테스트', FILTERS, 50);
    const videosCall = calls.find((c) => c.endpoint === 'videos');
    assert.equal(videosCall?.params.get('part'), 'snippet,statistics,contentDetails');
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
    assert.equal(videos[0].channel.averageViews, 10_000); // 1,000,000 / 100
    assert.equal(videos[0].channel.subscriberCount, 50_000);
  });

  test('구독자를 숨긴 채널은 null이며 1로 추정하지 않는다', async () => {
    installFetch({ totalVideos: 1, channelCount: 1, hiddenChannels: new Set(['c0']) });
    const { videos } = await searchYouTube('테스트', FILTERS, 50);
    assert.equal(videos[0].channel.subscriberCount, null);
    assert.equal(videos[0].channel.hiddenSubscriberCount, true);
    // 숨겨도 채널 평균은 살아 있어 성과배수는 계산 가능하다
    assert.equal(videos[0].channel.averageViews, 10_000);
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
