import type { SearchDepth } from '../../types/youtube';

/**
 * 할당량 산수 (2026-06-01 버킷 분리 기준).
 *
 * 이 앱의 실질적인 상한은 화면이 아니라 **검색 횟수**다. search.list는 전용
 * 버킷에서 하루 100회까지만 부를 수 있고, 200개 검색은 4회를 쓰므로 하루
 * 25번이 끝이다. 사용자가 이걸 모르면 오전에 다 쓰고 오후 내내 오류만 본다.
 *
 * 나머지 메서드(videos·channels·playlistItems…)는 별도의 공용 버킷(하루
 * 10,000 units, 호출당 1)을 쓰며 검색 횟수와 **경쟁하지 않는다.** part를
 * 늘려도 비용은 그대로여서, 받아올 수 있는 필드는 전부 받아오는 편이 이득이다.
 */
export const SEARCH_DAILY_LIMIT = 100;
export const GENERAL_DAILY_UNITS = 10_000;

/** search.list / videos.list / channels.list 모두 한 번에 최대 50건 */
const PAGE_SIZE = 50;

export const SEARCH_DEPTHS: SearchDepth[] = [50, 100, 200];

export interface QuotaEstimate {
  /** search.list 호출 수 (= 페이지 수). 전용 버킷. */
  searchCalls: number;
  /** 부가 호출이 쓰는 최대 units. 공용 버킷. */
  otherUnits: number;
  /** 두 버킷의 하루 한도 중 먼저 닿는 쪽 기준 가능 횟수 (내림) */
  searchesPerDay: number;
  pages: number;
}

/**
 * 검색 깊이에 따른 최대 소비량.
 *
 * 채널 조회는 고유 채널 수에 따라 줄 수 있으므로 otherUnits는 상한이다.
 * 낙관적으로 낮춰 보여주면 사용자가 실제보다 많이 쓸 수 있다고 오해한다.
 */
export function estimateQuota(depth: number): QuotaEstimate {
  const pages = Math.max(1, Math.ceil(depth / PAGE_SIZE));
  const searchCalls = pages;
  // videos.list 50개씩 pages회 + channels.list 최대 pages회
  const otherUnits = pages * 2;
  return {
    searchCalls,
    otherUnits,
    searchesPerDay: Math.min(
      Math.floor(SEARCH_DAILY_LIMIT / searchCalls),
      Math.floor(GENERAL_DAILY_UNITS / otherUnits),
    ),
    pages,
  };
}
