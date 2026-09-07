/**
 * YouTube Data API 호출 실패를 분류한다.
 *
 * 분류의 목적은 두 가지다.
 * 1. 재시도해도 되는 실패(429/5xx/타임아웃)와 재시도가 무의미한 실패(4xx)를 가른다.
 * 2. 할당량 소진을 다른 실패에 섞이지 않게 드러낸다. 검색은 하루 100회가 상한이라
 *    소진을 조용히 빈 결과로 넘기면 사용자는 "검색 결과가 없다"로
 *    오해한다.
 */
export type YouTubeErrorCode =
  | 'CONFIG_MISSING'
  | 'QUOTA_EXCEEDED'
  | 'SEARCH_QUOTA_EXCEEDED'
  | 'API_KEY_INVALID'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE';

/** 클라이언트로 내보내도 안전한 한국어 메시지. 내부 정보를 담지 않는다. */
const USER_MESSAGE: Record<YouTubeErrorCode, string> = {
  CONFIG_MISSING: '서버에 YouTube API 키가 설정되지 않았습니다.',
  // 할당량은 태평양 시간 자정에 초기화된다. 서머타임 때문에 한국 시간으로는
  // 오후 4시(PDT)와 오후 5시(PST) 사이에서 움직이므로 범위로 안내한다.
  QUOTA_EXCEEDED:
    'YouTube API 일일 할당량(공용 버킷)을 모두 사용했습니다. 한국 시간 기준 오후 4~5시경에 초기화됩니다.',
  // search.list는 2026-06-01부터 전용 버킷(하루 100회)이다. 이 앱의 실질 상한이라 따로 알린다.
  SEARCH_QUOTA_EXCEEDED:
    '오늘의 검색 한도(100회)를 모두 사용했습니다. 한국 시간 기준 오후 4~5시경에 초기화됩니다.',
  API_KEY_INVALID: 'YouTube API 키가 유효하지 않거나 권한이 없습니다.',
  BAD_REQUEST: '검색 조건이 올바르지 않습니다.',
  RATE_LIMITED: 'YouTube API 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.',
  UPSTREAM_ERROR: 'YouTube 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  TIMEOUT: 'YouTube API 응답이 지연되어 요청을 중단했습니다.',
  MALFORMED_RESPONSE: 'YouTube API가 예상과 다른 형식으로 응답했습니다.',
};

const RETRYABLE: ReadonlySet<YouTubeErrorCode> = new Set<YouTubeErrorCode>([
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'TIMEOUT',
]);

export class YouTubeApiError extends Error {
  readonly code: YouTubeErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(code: YouTubeErrorCode, detail: string, httpStatus = 502) {
    super(detail);
    this.name = 'YouTubeApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = RETRYABLE.has(code);
  }

  /** 응답 본문에 실어도 되는 메시지 */
  get userMessage(): string {
    return USER_MESSAGE[this.code];
  }
}

/** YouTube 오류 응답의 첫 번째 reason 값을 꺼낸다. 없으면 빈 문자열. */
function extractReason(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return '';
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return '';
  const reason = (errors[0] as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : '';
}

/**
 * HTTP 상태와 오류 본문으로 실패를 분류한다.
 *
 * 403은 할당량 소진과 키 문제를 모두 포함하므로 reason을 봐야 구분된다.
 * quotaExceeded / dailyLimitExceeded 는 재시도해도 소용없고, 사용자에게
 * 명시적으로 알려야 하는 유일한 실패다.
 */
export function classifyHttpError(status: number, body: unknown, endpoint?: string): YouTubeApiError {
  const reason = extractReason(body);

  if (status === 403) {
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      // 응답 본문은 어느 버킷인지 말해주지 않는다. 어느 엔드포인트가 막혔는지로 가른다.
      const code = endpoint === 'search' ? 'SEARCH_QUOTA_EXCEEDED' : 'QUOTA_EXCEEDED';
      return new YouTubeApiError(code, `할당량 소진 (endpoint=${endpoint ?? '?'}, reason=${reason})`, 429);
    }
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
      return new YouTubeApiError('RATE_LIMITED', `요청 제한 (reason=${reason})`, 429);
    }
    return new YouTubeApiError('API_KEY_INVALID', `접근 거부 (reason=${reason || 'unknown'})`, 502);
  }

  if (status === 429) {
    return new YouTubeApiError('RATE_LIMITED', '429 Too Many Requests', 429);
  }

  if (status === 400) {
    // 키가 잘못되면 YouTube는 403이 아니라 400 keyInvalid를 돌려준다.
    // 검색 조건 문제로 묶으면 사용자가 필터만 계속 고치게 된다.
    if (reason === 'keyInvalid' || reason === 'badRequest') {
      return new YouTubeApiError('API_KEY_INVALID', `키 거부 (reason=${reason})`, 502);
    }
    return new YouTubeApiError('BAD_REQUEST', `잘못된 요청 (reason=${reason || 'unknown'})`, 400);
  }

  if (status >= 500) {
    return new YouTubeApiError('UPSTREAM_ERROR', `업스트림 ${status}`, 502);
  }

  return new YouTubeApiError('UPSTREAM_ERROR', `예상치 못한 상태 코드 ${status}`, 502);
}
