import type { SearchDepth } from '../../types/youtube';

/**
 * 할당량 산수.
 *
 * 이 앱의 실질적인 상한은 화면이 아니라 할당량이다. 200개 검색 한 번에
 * 408단위가 나가고 하루 한도가 10,000이라 **하루 24번**이 끝이다. 사용자가
 * 이걸 모르면 오전에 다 쓰고 오후 내내 오류만 보게 된다.
 *
 * 단가는 메서드당 정액이다(2026-09 기준). part를 늘려도 비용은 그대로여서,
 * 받아올 수 있는 필드는 전부 받아오는 편이 이득이다.
 */
export const DAILY_QUOTA = 10_000;

export const QUOTA_COST = {
  search: 100,
  videos: 1,
  channels: 1,
} as const;

/** search.list / videos.list / channels.list 모두 한 번에 최대 50건 */
const PAGE_SIZE = 50;

export const SEARCH_DEPTHS: SearchDepth[] = [50, 100, 200];

export interface QuotaEstimate {
  /** 검색 1회가 쓰는 최대 할당량 */
  units: number;
  /** 하루 한도로 가능한 검색 횟수 (내림) */
  searchesPerDay: number;
  pages: number;
}

/**
 * 검색 깊이에 따른 최대 소비량.
 *
 * 채널 조회는 고유 채널 수에 따라 줄 수 있으므로 여기 값은 상한이다.
 * 낙관적으로 낮춰 보여주면 사용자가 실제보다 많이 쓸 수 있다고 오해한다.
 */
export function estimateQuota(depth: number): QuotaEstimate {
  const pages = Math.max(1, Math.ceil(depth / PAGE_SIZE));
  const units = pages * (QUOTA_COST.search + QUOTA_COST.videos + QUOTA_COST.channels);
  return {
    units,
    searchesPerDay: Math.floor(DAILY_QUOTA / units),
    pages,
  };
}
