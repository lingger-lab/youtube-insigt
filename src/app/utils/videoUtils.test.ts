import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { VideoData } from './youtubeApi.ts';
import {
  getVideoDurationInSeconds,
  getVideoType,
  formatDuration,
  filterVideosByType,
  isShorts,
  addVideoTypeToData,
} from './videoUtils.ts';

/** 테스트마다 독립된 객체를 만들기 위한 팩토리 (정적 픽스처 공유 금지) */
function makeVideo(overrides: Partial<VideoData> = {}): VideoData {
  return {
    id: 'vid1',
    title: '제목',
    description: '설명',
    thumbnailUrl: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg',
    viewCount: 1000,
    publishedAt: '2026-01-01T00:00:00Z',
    channelId: 'ch1',
    channelTitle: '채널',
    subscriberCount: 100,
    viralScore: 10,
    duration: 'PT5M',
    ...overrides,
  };
}

describe('getVideoDurationInSeconds', () => {
  test('분·초를 초로 환산한다', () => {
    assert.equal(getVideoDurationInSeconds('PT4M13S'), 253);
  });

  test('시·분을 초로 환산한다', () => {
    assert.equal(getVideoDurationInSeconds('PT1H30M'), 5400);
  });

  test('초 단위만 있어도 처리한다', () => {
    assert.equal(getVideoDurationInSeconds('PT59S'), 59);
  });

  test('시 단위만 있어도 처리한다', () => {
    assert.equal(getVideoDurationInSeconds('PT1H'), 3600);
  });

  test('시·분·초가 모두 있는 경우', () => {
    assert.equal(getVideoDurationInSeconds('PT1H1M1S'), 3661);
  });

  test('PT0S와 빈 문자열은 0을 반환한다', () => {
    assert.equal(getVideoDurationInSeconds('PT0S'), 0);
    assert.equal(getVideoDurationInSeconds(''), 0);
  });

  // YouTube는 24시간 이상 영상(라이브 아카이브 등)에 일(D) 단위를 포함해 반환한다.
  // 이를 놓치면 0초가 되어 Shorts로 잘못 분류된다.
  test('일(D) 단위가 포함된 기간을 처리한다', () => {
    assert.equal(getVideoDurationInSeconds('P1DT2H'), 93600);
  });

  test('일 단위만 있는 기간을 처리한다', () => {
    assert.equal(getVideoDurationInSeconds('P2D'), 172800);
  });

  test('일·시·분·초가 모두 있는 경우', () => {
    assert.equal(getVideoDurationInSeconds('P1DT1H1M1S'), 90061);
  });
});

describe('getVideoType', () => {
  test('180초 이하는 shorts로 분류한다', () => {
    assert.equal(getVideoType('PT3M'), 'shorts');
    assert.equal(getVideoType('PT59S'), 'shorts');
  });

  test('180초 초과는 long으로 분류한다', () => {
    assert.equal(getVideoType('PT3M1S'), 'long');
    assert.equal(getVideoType('PT1H'), 'long');
  });

  test('일 단위 장시간 영상은 long으로 분류한다', () => {
    assert.equal(getVideoType('P1DT2H'), 'long');
  });

  test('isShorts는 getVideoType과 일치한다', () => {
    assert.equal(isShorts('PT3M'), true);
    assert.equal(isShorts('PT3M1S'), false);
  });
});

describe('formatDuration', () => {
  test('1시간 미만은 분:초로 표기한다', () => {
    assert.equal(formatDuration('PT4M13S'), '4:13');
    assert.equal(formatDuration('PT59S'), '0:59');
  });

  test('1시간 이상은 시:분:초로 표기한다', () => {
    assert.equal(formatDuration('PT1H30M'), '1:30:00');
    assert.equal(formatDuration('PT1H1M1S'), '1:01:01');
  });

  test('길이가 0이면 0:00을 반환한다', () => {
    assert.equal(formatDuration('PT0S'), '0:00');
  });
});

describe('filterVideosByType', () => {
  test('home은 전체를 그대로 반환한다', () => {
    const videos = [makeVideo({ duration: 'PT1M' }), makeVideo({ duration: 'PT10M' })];
    assert.equal(filterVideosByType(videos, 'home').length, 2);
  });

  test('shorts는 3분 이하만 남긴다', () => {
    const videos = [
      makeVideo({ id: 'a', duration: 'PT1M' }),
      makeVideo({ id: 'b', duration: 'PT10M' }),
    ];
    const result = filterVideosByType(videos, 'shorts');
    assert.deepEqual(result.map((v) => v.id), ['a']);
  });

  test('long은 3분 초과만 남긴다', () => {
    const videos = [
      makeVideo({ id: 'a', duration: 'PT1M' }),
      makeVideo({ id: 'b', duration: 'PT10M' }),
    ];
    const result = filterVideosByType(videos, 'long');
    assert.deepEqual(result.map((v) => v.id), ['b']);
  });

  test('duration이 없으면 shorts로 취급한다 (기존 동작)', () => {
    const videos = [makeVideo({ id: 'a', duration: undefined })];
    assert.equal(filterVideosByType(videos, 'shorts').length, 1);
    assert.equal(filterVideosByType(videos, 'long').length, 0);
  });

  test('원본 배열을 변경하지 않는다', () => {
    const videos = [makeVideo({ duration: 'PT1M' }), makeVideo({ duration: 'PT10M' })];
    filterVideosByType(videos, 'shorts');
    assert.equal(videos.length, 2);
  });
});

describe('addVideoTypeToData', () => {
  test('videoType과 durationFormatted를 덧붙인다', () => {
    const result = addVideoTypeToData([makeVideo({ duration: 'PT4M13S' })]);
    assert.equal(result[0].videoType, 'long');
    assert.equal(result[0].durationFormatted, '4:13');
  });

  test('원본 객체를 변경하지 않는다', () => {
    const video = makeVideo({ duration: 'PT4M13S' });
    addVideoTypeToData([video]);
    assert.equal('videoType' in video, false);
  });
});
