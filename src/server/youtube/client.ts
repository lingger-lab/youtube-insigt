import type { SearchUsage } from '../../types/youtube.ts';
import { YouTubeApiError, classifyHttpError } from './errors.ts';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/** p95보다 넉넉하되 Vercel 함수 상한(60s) 안에서 재시도까지 끝낼 수 있는 값 */
const TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 400;

/**
 * 엔드포인트가 속한 할당량 버킷 (2026-06-01 개편 기준).
 *
 * search.list는 전용 버킷(하루 100회, 호출당 1)이고 나머지는 공용 버킷
 * (하루 10,000 units, 호출당 1)이다. 둘은 서로 경쟁하지 않는다. 그래서
 * videos/channels 호출을 아껴도 검색 횟수는 늘지 않고, 반대로 검색 상한과
 * 무관하게 부가 호출은 하루 1만 번까지 쓸 수 있다.
 */
export const QUOTA_BUCKET = {
  search: 'search',
  videos: 'general',
  channels: 'general',
  playlistItems: 'general',
} as const;

export type YouTubeEndpoint = keyof typeof QUOTA_BUCKET;

/** 한 번의 검색이 실제로 소비한 양. 응답에 실어 사용자에게 보여준다. */
export type CallStats = SearchUsage;

export function createStats(): CallStats {
  return { searchCalls: 0, otherUnits: 0, calls: 0 };
}

/**
 * 서버 전용 API 키를 읽는다.
 *
 * NEXT_PUBLIC_ 접두사가 없으므로 클라이언트 번들에는 절대 인라인되지 않는다.
 * 없으면 조용히 넘어가지 않고 즉시 실패한다.
 */
export function getApiKey(): string {
  const key = process.env.YT_API_KEY;
  if (!key) {
    throw new YouTubeApiError('CONFIG_MISSING', 'YT_API_KEY 환경변수가 설정되지 않았습니다', 500);
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 지수 백오프에 지터를 섞는다.
 *
 * 지터가 없으면 동시에 실패한 클라이언트들이 같은 시각에 일제히 재시도해
 * 스파이크를 증폭시킨다. 대기 시간을 [50%, 100%] 구간에서 흩뜨린다.
 */
function backoffDelay(attempt: number): number {
  const base = BACKOFF_BASE_MS * 2 ** attempt;
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * YouTube Data API에 GET 요청을 보낸다.
 *
 * - 모든 호출에 타임아웃을 건다. fetch의 기본값은 무제한이라, 업스트림이 응답을
 *   멈추면 서버리스 함수가 상한까지 매달려 있다가 죽는다.
 * - 재시도는 429/5xx/타임아웃에만, 최대 2회. 4xx는 몇 번을 보내도 같은 답이므로
 *   재시도하지 않는다.
 * - 할당량 소진은 재시도 대상이 아니며 그대로 던져 올린다.
 */
export async function youtubeGet(
  endpoint: YouTubeEndpoint,
  params: URLSearchParams,
  stats: CallStats,
): Promise<unknown> {
  params.set('key', getApiKey());
  const url = `${API_BASE}/${endpoint}?${params}`;

  let lastError: YouTubeApiError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    stats.calls += 1;
    if (QUOTA_BUCKET[endpoint] === 'search') stats.searchCalls += 1;
    else stats.otherUnits += 1;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (cause) {
      const isTimeout = cause instanceof Error && cause.name === 'TimeoutError';
      lastError = new YouTubeApiError(
        isTimeout ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        `${endpoint} 호출 실패: ${cause instanceof Error ? cause.message : String(cause)}`,
        504,
      );
      if (attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new YouTubeApiError('MALFORMED_RESPONSE', `${endpoint} 응답을 JSON으로 읽을 수 없습니다`);
      }
    }

    lastError = classifyHttpError(response.status, await readErrorBody(response), endpoint);

    if (!lastError.retryable || attempt === MAX_RETRIES) {
      throw lastError;
    }
    await sleep(backoffDelay(attempt));
  }

  // 루프는 반드시 return이나 throw로 끝나지만, 타입 좁히기를 위해 남겨둔다.
  throw lastError ?? new YouTubeApiError('UPSTREAM_ERROR', '알 수 없는 오류');
}
