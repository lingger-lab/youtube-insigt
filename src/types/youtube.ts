/**
 * 서버(수집)와 클라이언트(계산·표시)가 함께 쓰는 타입의 단일 출처.
 *
 * 이 파일에는 런타임 코드를 두지 않는다. 타입만 있어야 클라이언트가 서버
 * 모듈을 끌어오는 일이 생기지 않는다.
 *
 * 설계 원칙: VideoData는 **API가 준 사실만** 담는다. 성과배수·참여율 같은
 * 파생값은 저장하지 않고 utils/metrics.ts에서 필요할 때 계산한다. 저장하면
 * 원본과 파생값이 두 개의 진실이 되어 언젠가 어긋난다.
 */

export type SearchOrder = 'relevance' | 'viewCount' | 'date' | 'rating';
export type VideoDuration = 'any' | 'short' | 'medium' | 'long';

export interface SearchFilters {
  order: SearchOrder;
  publishedAfter?: string;
  videoDuration: VideoDuration;
}

/** 검색 깊이. 할당량이 실질 상한이라 사용자가 직접 고른다. */
export type SearchDepth = 50 | 100 | 200;

/**
 * 채널 통계 스냅샷. API가 준 값만 담는다.
 *
 * subscriberCount는 두 가지 이유로 지표의 분모로 쓰기 나쁘다.
 * 1. 채널이 숨기면 아예 오지 않는다 (hiddenSubscriberCount)
 * 2. 1,000명을 넘으면 유효숫자 3자리로 반올림된다 (123,456 -> 123,000)
 * 그래서 총조회수·총영상수로 기준선을 세운다 (metrics.peerAverageViews).
 */
export interface ChannelSnapshot {
  channelId: string;
  /** 비공개면 null. 0으로 채우거나 1로 추정하지 않는다. */
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean;
  videoCount: number | null;
  totalViewCount: number | null;
}

/** API가 준 사실만. 파생 지표는 여기 없다. */
export interface VideoData {
  id: string;
  title: string;
  description: string;
  /** 카드 표시용 (medium, 320px) */
  thumbnailUrl: string;
  /** 분석 첨부용 (maxres > high > medium 순으로 가용한 것) */
  thumbnailHighUrl: string;
  viewCount: number;
  /** 좋아요를 숨긴 영상은 null */
  likeCount: number | null;
  /** 댓글을 끈 영상은 null */
  commentCount: number | null;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  duration: string;
  tags: string[];
  categoryId: string;
  /** 자막 트랙 존재 여부. 내용은 소유자만 받을 수 있다. */
  hasCaption: boolean;
  channel: ChannelSnapshot;
}

/**
 * VideoData에서 계산되는 지표. 저장하지 않고 표시·정렬 직전에 만든다.
 */
export interface VideoMetrics {
  /** 조회수 ÷ 같은 채널의 나머지 영상 평균. "평소 대비 몇 배" — 주지표. */
  performanceMultiple: number | null;
  /** 업로드 후 하루당 조회수. 오래된 영상의 상위 독식을 교정한다. */
  viewsPerDay: number;
  daysSincePublish: number;
  /** 좋아요 ÷ 조회수 */
  likeRate: number | null;
  /** 댓글 ÷ 조회수 */
  commentRate: number | null;
  /** 조회수 ÷ 구독자수. 예전 떡상지수 — 분모가 불안정해 참고값으로 강등. */
  subscriberRatio: number | null;
}

export type VideoWithMetrics = VideoData & { metrics: VideoMetrics };

/** 한 번의 검색이 실제로 쓴 호출 수와 할당량. UI에 노출해 소진을 예측 가능하게 한다. */
export interface SearchUsage {
  calls: number;
  quotaUnits: number;
}

export interface SearchSuccess {
  videos: VideoData[];
  usage: SearchUsage;
}

export interface SearchFailure {
  error: {
    code: string;
    message: string;
  };
}
