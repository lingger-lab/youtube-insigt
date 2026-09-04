/**
 * 서버(수집·계산)와 클라이언트(표시)가 함께 쓰는 타입의 단일 출처.
 *
 * 이 파일에는 런타임 코드를 두지 않는다. 타입만 있어야 클라이언트가 서버
 * 모듈을 끌어오는 일이 생기지 않는다.
 */

export type SearchOrder = 'relevance' | 'viewCount' | 'date' | 'rating';
export type VideoDuration = 'any' | 'short' | 'medium' | 'long';

export interface SearchFilters {
  order: SearchOrder;
  publishedAfter?: string;
  videoDuration: VideoDuration;
}

export interface VideoData {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  viewCount: number;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  viralScore: number;
  duration?: string;
}

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
