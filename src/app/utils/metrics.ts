import type { BaselineSource, VideoData, VideoMetrics, VideoWithMetrics } from '../../types/youtube.ts';
import { getVideoType } from './videoUtils.ts';

const DAY_MS = 86_400_000;

/** 같은 포맷 동료가 이보다 적으면 중앙값이 불안정해 채널 전체 통계로 내려간다. */
export const MIN_FORMAT_PEERS = 3;

/**
 * 파생 지표 계산.
 *
 * 여기가 파생값을 만드는 **유일한 곳**이다. VideoData에는 API가 준 사실만
 * 담고, 성과배수 같은 값은 저장하지 않는다. 저장하면 원본과 파생값이 두 개의
 * 진실이 되어 언젠가 어긋난다.
 *
 * 계산 불가는 0이 아니라 null이다. 좋아요를 숨긴 영상의 참여율을 0으로 쓰면
 * "반응이 없는 영상"과 구분되지 않는다.
 */

/** 업로드 후 경과일(내림). 미래 시각이면 0. */
export function daysSincePublish(publishedAt: string, now: number = Date.now()): number {
  const published = new Date(publishedAt).getTime();
  if (!Number.isFinite(published)) return 0;
  return Math.max(0, Math.floor((now - published) / DAY_MS));
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * 이 영상을 **뺀** 나머지 영상들의 평균 조회수.
 *
 * 채널 평균(총조회수 ÷ 총영상수)을 그대로 분모로 쓰면 안 된다. 그 평균에는
 * 비교 대상인 영상 자신이 들어 있어서, 영상 수가 적은 채널일수록 자기 자신이
 * 평균을 끌어올려 배수가 눌린다.
 *
 * 영상 5편 채널에서 나머지 대비 실제 20배인 영상이 4.17배로 나왔고(79% 과소평가),
 * 측정값이 채널 영상 수 N을 구조적으로 넘지 못했다. 이 도구가 찾으려는 것이
 * "작은 채널이 크게 터뜨린 영상"이라, 편향이 가장 중요한 지점에서 가장 컸다.
 *
 * 비교할 나머지가 없거나(1편뿐) 채널 총계가 이 영상보다 작으면(집계 불일치)
 * 추정하지 않고 null을 낸다.
 */
export function peerAverageViews(video: VideoData): number | null {
  const { totalViewCount, videoCount } = video.channel;
  if (totalViewCount === null || videoCount === null || videoCount <= 1) return null;

  const peerViews = totalViewCount - video.viewCount;
  if (peerViews <= 0) return null;

  return peerViews / (videoCount - 1);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface Baseline {
  value: number | null;
  source: BaselineSource;
  peerCount: number;
}

/**
 * 성과배수의 분모.
 *
 * 1순위: 같은 채널·**같은 포맷**(Shorts/롱폼) 최근 영상들의 **중앙값**, 본 영상 제외.
 *   Shorts와 롱폼은 조회수 분포가 전혀 달라 섞으면 평균이 의미를 잃는다. 중앙값을
 *   쓰는 이유는 한 편 터진 영상이 기준선을 끌어올리지 못하게 하기 위해서다.
 * 2순위: 최근 목록이 없거나 같은 포맷 동료가 MIN_FORMAT_PEERS 미만이면 채널 전체
 *   통계 기반 평균(peerAverageViews). 열등한 기준이며 source로 드러낸다.
 */
export function baselineFor(video: VideoData): Baseline {
  const uploads = video.channel.recentUploads;
  if (uploads) {
    const format = getVideoType(video.duration);
    const peers = uploads.filter((u) => u.id !== video.id && getVideoType(u.duration) === format);
    if (peers.length >= MIN_FORMAT_PEERS) {
      const value = median(peers.map((u) => u.viewCount));
      return { value: value > 0 ? value : null, source: value > 0 ? 'format-median' : null, peerCount: peers.length };
    }
  }

  const lifetime = peerAverageViews(video);
  if (lifetime === null) return { value: null, source: null, peerCount: 0 };
  return { value: lifetime, source: 'lifetime-mean', peerCount: (video.channel.videoCount ?? 1) - 1 };
}

/**
 * 일평균 배수의 분모: 같은 채널·같은 포맷 동료의 일평균 중앙값 (본 영상 제외, 동료 ≥3편).
 * 누적 배수는 오래된 대상에 유리하고, 일평균 배수는 갓 올라온 대상에 유리하다.
 */
function peerViewsPerDayMedian(video: VideoData, now: number): number | null {
  const uploads = video.channel.recentUploads;
  if (!uploads) return null;
  const format = getVideoType(video.duration);
  const rates = uploads
    .filter((u) => u.id !== video.id && getVideoType(u.duration) === format)
    .map((u) => u.viewCount / Math.max(1, daysSincePublish(u.publishedAt, now)));
  if (rates.length < MIN_FORMAT_PEERS) return null;
  const m = median(rates);
  return m > 0 ? m : null;
}

export function computeMetrics(video: VideoData, now: number = Date.now()): VideoMetrics {
  const days = daysSincePublish(video.publishedAt, now);
  const baseline = baselineFor(video);
  const viewsPerDay = video.viewCount / Math.max(1, days);

  return {
    // 주지표: 같은 채널의 **다른** 영상들이 평소 받는 조회수 대비 몇 배인가.
    // 구독자수와 달리 반올림도 없고 비공개로 사라지지도 않는다.
    performanceMultiple: ratio(video.viewCount, baseline.value),
    baselineSource: baseline.source,
    baselinePeerCount: baseline.peerCount,

    // 채널 평균은 영상들의 '누적' 조회수 평균이라 신작에 불리하다.
    // 그 편향을 보정할 짝으로 하루당 조회수를 함께 둔다.
    // 업로드 당일 영상은 0일이 되므로 최소 1일로 본다(과대평가 방지).
    viewsPerDay,
    viewsPerDayMultiple: ratio(viewsPerDay, peerViewsPerDayMedian(video, now)),
    daysSincePublish: days,

    likeRate: ratio(video.likeCount, video.viewCount),
    commentRate: ratio(video.commentCount, video.viewCount),

    // 예전 떡상지수. 분모가 3자리로 반올림되고 비공개면 사라지므로 참고값.
    subscriberRatio: ratio(video.viewCount, video.channel.subscriberCount),
  };
}

export function withMetrics(videos: VideoData[], now: number = Date.now()): VideoWithMetrics[] {
  return videos.map((video) => ({ ...video, metrics: computeMetrics(video, now) }));
}

/**
 * 정렬 키. 계산 불가(null)는 항상 뒤로 보낸다.
 *
 * null을 0으로 바꿔 정렬하면 "측정 불가"가 "성과 없음"인 척하며 목록 아래쪽에
 * 섞여 들어간다. 방향(오름/내림)과 무관하게 뒤로 밀어야 구분이 유지된다.
 */
export function compareByMetric(
  a: VideoWithMetrics,
  b: VideoWithMetrics,
  key: SortKey,
  order: 'asc' | 'desc',
): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);

  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;

  return order === 'asc' ? av - bv : bv - av;
}

export type SortKey =
  | 'viewCount'
  | 'performanceMultiple'
  | 'viewsPerDay'
  | 'likeRate'
  | 'subscriberCount'
  | 'publishedAt';

function sortValue(video: VideoWithMetrics, key: SortKey): number | null {
  switch (key) {
    case 'viewCount':
      return video.viewCount;
    case 'performanceMultiple':
      return video.metrics.performanceMultiple;
    case 'viewsPerDay':
      return video.metrics.viewsPerDay;
    case 'likeRate':
      return video.metrics.likeRate;
    case 'subscriberCount':
      return video.channel.subscriberCount;
    case 'publishedAt': {
      const t = new Date(video.publishedAt).getTime();
      return Number.isFinite(t) ? t : null;
    }
  }
}
