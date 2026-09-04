import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ChannelSnapshot, VideoData } from '../../types/youtube.ts';
import { computeMetrics, daysSincePublish, withMetrics, compareByMetric } from './metrics.ts';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const DAY_MS = 86_400_000;

function makeChannel(overrides: Partial<ChannelSnapshot> = {}): ChannelSnapshot {
  return {
    channelId: 'ch1',
    subscriberCount: 100_000,
    hiddenSubscriberCount: false,
    videoCount: 200,
    totalViewCount: 20_000_000,
    ...overrides,
  };
}

function makeVideo(overrides: Partial<VideoData> = {}): VideoData {
  return {
    id: 'vid1',
    title: '제목',
    description: '설명',
    thumbnailUrl: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg',
    thumbnailHighUrl: 'https://i.ytimg.com/vi/vid1/maxresdefault.jpg',
    viewCount: 500_000,
    likeCount: 25_000,
    commentCount: 1_000,
    publishedAt: new Date(NOW - 10 * DAY_MS).toISOString(),
    channelId: 'ch1',
    channelTitle: '채널',
    duration: 'PT10M',
    tags: ['태그1'],
    categoryId: '22',
    hasCaption: true,
    channel: makeChannel(),
    ...overrides,
  };
}

describe('daysSincePublish', () => {
  test('경과일을 내림해서 센다', () => {
    assert.equal(daysSincePublish(new Date(NOW - 10 * DAY_MS).toISOString(), NOW), 10);
    assert.equal(daysSincePublish(new Date(NOW - 10.9 * DAY_MS).toISOString(), NOW), 10);
  });

  test('오늘 올라온 영상은 0일이다', () => {
    assert.equal(daysSincePublish(new Date(NOW - 3600_000).toISOString(), NOW), 0);
  });

  test('미래 시각과 잘못된 값은 0으로 본다', () => {
    assert.equal(daysSincePublish(new Date(NOW + DAY_MS).toISOString(), NOW), 0);
    assert.equal(daysSincePublish('not-a-date', NOW), 0);
  });
});

describe('performanceMultiple (주지표)', () => {
  test('채널의 나머지 영상 평균 대비 배수를 낸다', () => {
    // 채널 200편, 총 2,000만 조회. 이 영상이 50만이면
    // 나머지 199편 평균 = (2,000만 - 50만) / 199 = 97,989
    const m = computeMetrics(makeVideo({ viewCount: 500_000 }), NOW);
    assert.equal(Math.round(m.performanceMultiple! * 100) / 100, 5.1);
  });

  // 분모에 그 영상 자신이 섞여 있으면, 영상 수가 적은 채널일수록 자기 자신이
  // 평균을 끌어올려 배수가 눌린다. 영상 5편 채널에서 실제 20배 터진 영상이
  // 4.17배로 나왔다. 측정값이 채널 영상 수 N을 구조적으로 넘지 못한다.
  // 이 도구의 목적이 "작은 채널이 크게 터뜨린 영상"이라 편향이 정확히
  // 가장 중요한 지점에서 가장 크다.
  test('영상 수가 적은 채널에서 배수가 눌리지 않는다', () => {
    const channel = makeChannel({
      videoCount: 5,
      totalViewCount: 1_000_000 + 4 * 50_000, // 이 영상 100만 + 나머지 4편 각 5만
    });
    const m = computeMetrics(makeVideo({ viewCount: 1_000_000, channel }), NOW);
    // 나머지 4편 평균 5만 대비 20배
    assert.equal(m.performanceMultiple, 20);
    assert.notEqual(Math.round(m.performanceMultiple! * 100) / 100, 4.17);
  });

  test('배수에 채널 영상 수라는 상한이 없다', () => {
    const channel = makeChannel({
      videoCount: 3,
      totalViewCount: 1_000_000 + 2 * 1_000,
    });
    const m = computeMetrics(makeVideo({ viewCount: 1_000_000, channel }), NOW);
    assert.ok(m.performanceMultiple! > 3, `영상 3개 채널인데 ${m.performanceMultiple}배로 막혔다`);
    assert.equal(m.performanceMultiple, 1000); // 나머지 평균 1,000 대비
  });

  test('영상이 1편뿐인 채널은 비교 대상이 없어 null이다', () => {
    const channel = makeChannel({ videoCount: 1, totalViewCount: 500_000 });
    assert.equal(computeMetrics(makeVideo({ viewCount: 500_000, channel }), NOW).performanceMultiple, null);
  });

  test('채널 총조회수가 이 영상보다 적으면(데이터 불일치) null이다', () => {
    const channel = makeChannel({ videoCount: 10, totalViewCount: 100_000 });
    assert.equal(computeMetrics(makeVideo({ viewCount: 500_000, channel }), NOW).performanceMultiple, null);
  });

  test('채널 통계를 모르면 null이다 (0으로 메우지 않는다)', () => {
    const channel = makeChannel({ totalViewCount: null, videoCount: null });
    assert.equal(computeMetrics(makeVideo({ channel }), NOW).performanceMultiple, null);
  });

  test('영상이 0개인 채널은 null이다 (0으로 나누지 않는다)', () => {
    const channel = makeChannel({ videoCount: 0 });
    assert.equal(computeMetrics(makeVideo({ channel }), NOW).performanceMultiple, null);
  });

  test('구독자를 숨긴 채널도 성과배수는 계산된다', () => {
    const channel = makeChannel({ subscriberCount: null, hiddenSubscriberCount: true });
    const m = computeMetrics(makeVideo({ channel }), NOW);
    assert.ok(m.performanceMultiple !== null && m.performanceMultiple > 0);
  });
});

describe('subscriberRatio (구 떡상지수)', () => {
  test('조회수를 구독자수로 나눈다', () => {
    const m = computeMetrics(makeVideo({ viewCount: 500_000 }), NOW);
    assert.equal(m.subscriberRatio, 5); // 500,000 / 100,000
  });

  // 회귀 방지: 예전에는 `subscriberCount || 1` 이라 구독자를 숨긴 채널의
  // 떡상지수가 '조회수 전체값'이 되어 정렬 상위를 독식했다.
  test('구독자 비공개 채널은 null이며, 조회수만큼 부풀지 않는다', () => {
    const channel = makeChannel({ subscriberCount: null, hiddenSubscriberCount: true });
    const m = computeMetrics(makeVideo({ viewCount: 500_000, channel }), NOW);
    assert.equal(m.subscriberRatio, null);
    assert.notEqual(m.subscriberRatio, 500_000);
  });

  test('구독자 0명도 null이다', () => {
    const channel = makeChannel({ subscriberCount: 0 });
    assert.equal(computeMetrics(makeVideo({ channel }), NOW).subscriberRatio, null);
  });
});

describe('viewsPerDay', () => {
  test('경과일로 나눈다', () => {
    const video = makeVideo({ viewCount: 1_000_000, publishedAt: new Date(NOW - 10 * DAY_MS).toISOString() });
    assert.equal(computeMetrics(video, NOW).viewsPerDay, 100_000);
  });

  test('업로드 당일 영상은 최소 1일로 본다 (과대평가 방지)', () => {
    const video = makeVideo({ viewCount: 50_000, publishedAt: new Date(NOW - 3600_000).toISOString() });
    assert.equal(computeMetrics(video, NOW).viewsPerDay, 50_000);
  });
});

describe('참여율', () => {
  test('좋아요율과 댓글율을 계산한다', () => {
    const m = computeMetrics(makeVideo({ viewCount: 500_000, likeCount: 25_000, commentCount: 1_000 }), NOW);
    assert.equal(m.likeRate, 0.05);
    assert.equal(m.commentRate, 0.002);
  });

  test('좋아요를 숨긴 영상은 null이다 (0과 구분된다)', () => {
    const m = computeMetrics(makeVideo({ likeCount: null }), NOW);
    assert.equal(m.likeRate, null);
  });

  test('좋아요가 실제로 0이면 0이다', () => {
    const m = computeMetrics(makeVideo({ likeCount: 0 }), NOW);
    assert.equal(m.likeRate, 0);
  });

  test('조회수 0이면 참여율은 null, 성과배수는 0이다', () => {
    const m = computeMetrics(makeVideo({ viewCount: 0 }), NOW);
    assert.equal(m.likeRate, null);
    assert.equal(m.performanceMultiple, 0);
  });
});

describe('withMetrics', () => {
  test('원본 객체를 변경하지 않는다', () => {
    const video = makeVideo();
    withMetrics([video], NOW);
    assert.equal('metrics' in video, false);
  });

  test('모든 항목에 metrics를 붙인다', () => {
    const result = withMetrics([makeVideo({ id: 'a' }), makeVideo({ id: 'b' })], NOW);
    assert.deepEqual(result.map((v) => v.id), ['a', 'b']);
    assert.equal(typeof result[0].metrics.viewsPerDay, 'number');
  });
});

describe('compareByMetric', () => {
  const withHidden = withMetrics(
    [
      makeVideo({ id: 'high', viewCount: 900_000 }),
      makeVideo({ id: 'low', viewCount: 100_000 }),
      makeVideo({
        id: 'unknown',
        viewCount: 500_000,
        channel: makeChannel({ subscriberCount: null, hiddenSubscriberCount: true }),
      }),
    ],
    NOW,
  );

  test('내림차순 정렬 시 측정 불가 항목은 맨 뒤로 간다', () => {
    const sorted = [...withHidden].sort((a, b) => compareByMetric(a, b, 'subscriberCount', 'desc'));
    assert.deepEqual(sorted.map((v) => v.id), ['high', 'low', 'unknown']);
  });

  // null을 0으로 바꿔 정렬하면 오름차순에서 측정 불가가 맨 앞으로 튀어나온다.
  test('오름차순 정렬에서도 측정 불가 항목은 맨 뒤로 간다', () => {
    const sorted = [...withHidden].sort((a, b) => compareByMetric(a, b, 'subscriberCount', 'asc'));
    assert.equal(sorted[sorted.length - 1].id, 'unknown');
  });

  test('조회수 내림차순', () => {
    const sorted = [...withHidden].sort((a, b) => compareByMetric(a, b, 'viewCount', 'desc'));
    assert.deepEqual(sorted.map((v) => v.viewCount), [900_000, 500_000, 100_000]);
  });

  test('최신순은 업로드 시각으로 정렬한다', () => {
    const videos = withMetrics(
      [
        makeVideo({ id: 'old', publishedAt: new Date(NOW - 30 * DAY_MS).toISOString() }),
        makeVideo({ id: 'new', publishedAt: new Date(NOW - 1 * DAY_MS).toISOString() }),
      ],
      NOW,
    );
    const sorted = [...videos].sort((a, b) => compareByMetric(a, b, 'publishedAt', 'desc'));
    assert.deepEqual(sorted.map((v) => v.id), ['new', 'old']);
  });
});
