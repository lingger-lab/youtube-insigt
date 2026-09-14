/**
 * 인메모리 슬라이딩 윈도 레이트리밋.
 *
 * 왜 있나: 검색은 전용 버킷 하루 100회, 앱 내 LLM 분석은 호출당 수십 센트다.
 * 공개 상태에서 제한이 없으면 방문자 몇 명이 하루치를 쓰거나 청구서를 만든다.
 *
 * **한계를 숨기지 않는다.** 서버리스(Vercel)는 인스턴스가 여러 개 뜨고 각자
 * 메모리가 따로라, 이 제한은 "한 인스턴스 안에서" 센다. 콜드 스타트마다
 * 초기화된다. 즉 한 클라이언트의 폭주는 막지만 정확한 전역 상한은 아니다.
 * 전역 상한이 필요해지면 KV(Upstash 등)로 바꿔야 한다 — docs/ISSUES.md A4.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** 이 창에서 앞으로 허용되는 횟수 */
  remaining: number;
  /** 거부됐을 때 몇 초 뒤에 다시 시도할 수 있는지. 허용이면 0. */
  retryAfterSec: number;
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  // 파라미터 프로퍼티(constructor(private x))는 Node 타입 스트리핑이 거부한다 (CLAUDE.md 규칙 5).
  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    if (max < 1 || windowMs < 1) throw new Error('레이트리밋 설정이 잘못됐습니다');
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  check(key: string): RateLimitDecision {
    const t = this.now();
    const from = t - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((x) => x > from);

    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    recent.push(t);
    this.hits.set(key, recent);
    this.evictIfLarge(from);
    return { allowed: true, remaining: this.max - recent.length, retryAfterSec: 0 };
  }

  /** 키가 무한히 쌓이지 않게 창 밖으로 나간 키를 정리한다. */
  private evictIfLarge(from: number): void {
    if (this.hits.size < 5_000) return;
    for (const [key, times] of this.hits) {
      if (!times.some((x) => x > from)) this.hits.delete(key);
    }
  }
}

/**
 * 요청의 클라이언트 식별자. Vercel은 x-forwarded-for 첫 항목에 실제 IP를 준다.
 * 헤더가 없으면(로컬 dev) 'unknown' 하나로 묶인다 — 로컬에서 한도에 걸릴 수 있다.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}

const TEN_MINUTES = 10 * 60_000;

/** IP당 10분에 검색 10회. 사람은 이보다 빨리 검색하지 않는다. */
export const searchLimiter = new SlidingWindowLimiter(10, TEN_MINUTES);
/** IP당 10분에 LLM 분석 3회. 호출당 비용이 있다. */
export const analyzeLimiter = new SlidingWindowLimiter(3, TEN_MINUTES);
/** 영상 관찰(Gemini): 편당 1요청이라 대조군 20편 + 여유. 프리뷰 무료지만 하루 8시간분 한도가 있다. */
export const observeLimiter = new SlidingWindowLimiter(30, TEN_MINUTES);
