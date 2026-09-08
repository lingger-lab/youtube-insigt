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

/** 채널의 최근 업로드 한 편. 기준선 계산용 최소 사실만. */
export interface RecentUpload {
  id: string;
  viewCount: number;
  /** ISO 8601 (PT#M#S). 포맷(Shorts/롱폼) 판별은 metrics에서 한다. */
  duration: string;
  publishedAt: string;
}

/**
 * 채널 통계 스냅샷. API가 준 값만 담는다.
 *
 * subscriberCount는 두 가지 이유로 지표의 분모로 쓰기 나쁘다.
 * 1. 채널이 숨기면 아예 오지 않는다 (hiddenSubscriberCount)
 * 2. 1,000명을 넘으면 유효숫자 3자리로 반올림된다 (123,456 -> 123,000)
 *
 * 채널 전체 통계(총조회수 ÷ 총영상수)도 분모로 나쁘다. Shorts와 롱폼이 섞인
 * 채널에서는 두 포맷의 조회수 분포가 전혀 달라 평균이 의미를 잃는다. 그래서
 * 최근 업로드 목록을 함께 받아 **같은 포맷끼리** 기준선을 세운다
 * (metrics.baselineFor). 목록을 못 받은 채널은 채널 전체 통계로 내려간다.
 */
export interface ChannelSnapshot {
  channelId: string;
  /** 비공개면 null. 0으로 채우거나 1로 추정하지 않는다. */
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean;
  videoCount: number | null;
  totalViewCount: number | null;
  /** 업로드 재생목록 ID. channels.list contentDetails에서 옴. 없으면 null. */
  uploadsPlaylistId: string | null;
  /**
   * 최근 업로드(최대 50편). 못 받았으면 null — 빈 배열([])과 구분한다.
   * playlistItems 1 unit + videos 1 unit, 검색 버킷과 무관.
   */
  recentUploads: RecentUpload[] | null;
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
/**
 * 성과배수의 분모가 어디서 왔는지.
 * - format-median: 같은 채널·같은 포맷 최근 영상들의 중앙값 (본 영상 제외)
 * - lifetime-mean: 채널 총조회수 기반 평균 (본 영상 제외). 포맷 구분 없음 — 열등한 기준
 * - null: 계산 불가
 */
export type BaselineSource = 'format-median' | 'lifetime-mean' | null;

export interface VideoMetrics {
  /** 조회수 ÷ 기준선. "평소 대비 몇 배" — 주지표. 기준선의 출처는 baselineSource. */
  performanceMultiple: number | null;
  baselineSource: BaselineSource;
  /** 기준선을 만든 동료 영상 수. lifetime-mean이면 videoCount-1. */
  baselinePeerCount: number;
  /** 업로드 후 하루당 조회수. 오래된 영상의 상위 독식을 교정한다. */
  viewsPerDay: number;
  /**
   * 일평균 조회수 ÷ 같은 채널·같은 포맷 동료들의 일평균 중앙값.
   * 실측에서 검색 결과 영상은 동료보다 수년 오래돼 누적 배수(performanceMultiple)가
   * 이 값보다 p50 기준 2~7배 컸다. 어느 쪽도 단독 진실이 아니라 둘을 나란히 둔다.
   */
  viewsPerDayMultiple: number | null;
  daysSincePublish: number;
  /** 좋아요 ÷ 조회수 */
  likeRate: number | null;
  /** 댓글 ÷ 조회수 */
  commentRate: number | null;
  /** 조회수 ÷ 구독자수. 예전 떡상지수 — 분모가 불안정해 참고값으로 강등. */
  subscriberRatio: number | null;
}

export type VideoWithMetrics = VideoData & { metrics: VideoMetrics };

/**
 * 한 번의 검색이 실제로 쓴 할당량. UI에 노출해 소진을 예측 가능하게 한다.
 *
 * 2026-06-01부터 할당량 버킷이 둘로 갈렸다. search.list는 전용 버킷(하루 100회,
 * 호출당 1)이고 나머지 메서드는 공용 버킷(하루 10,000 units)이다. 둘은 서로
 * 경쟁하지 않으므로 한 숫자로 합치면 의미가 없어진다.
 */
export interface SearchUsage {
  /** search.list 호출 수 — 전용 버킷. 이 앱의 실질 상한이다. */
  searchCalls: number;
  /** 그 외 메서드(videos·channels…)가 쓴 units — 공용 버킷. */
  otherUnits: number;
  /** 총 호출 수 (두 버킷 합) */
  calls: number;
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
