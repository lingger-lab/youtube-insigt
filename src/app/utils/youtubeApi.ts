import type { SearchFilters, SearchSuccess } from '../../types/youtube.ts';

// 기존 import 경로를 유지하기 위한 재수출. 정의는 src/types/youtube.ts 한 곳뿐이다.
export type {
  SearchFilters,
  SearchOrder,
  VideoData,
  VideoDuration,
  SearchUsage,
} from '../../types/youtube.ts';

/**
 * 검색을 서버 프록시에 위임한다.
 *
 * 예전에는 브라우저가 googleapis.com을 직접 불렀고, 그러려면 API 키를
 * NEXT_PUBLIC_ 으로 노출해야 했다. 이제 키는 서버에만 있다.
 */
export async function searchYouTube(
  term: string,
  filters: SearchFilters,
  maxResults: number = 200,
): Promise<SearchSuccess> {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ term, filters, maxResults }),
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null
        ? ((payload as { error?: { message?: unknown } }).error?.message ?? null)
        : null;
    throw new Error(typeof message === 'string' ? message : '검색에 실패했습니다.');
  }

  return payload as SearchSuccess;
}

export function getTimeFilterValue(period: string): string {
  const now = new Date();

  switch (period) {
    case '1H':
      return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    case '24H':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case '7D':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30D':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case '1Y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return '';
  }
}
