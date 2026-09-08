export function formatViewCount(count: number): string {
  if (count >= 1000000000) {
    return (count / 1000000000).toFixed(1) + 'B';
  }
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
}

/** 구독자수를 숨긴 채널은 null로 온다. 0으로 표시하면 '구독자 0명'과 구분되지 않는다. */
export function formatSubscriberCount(count: number | null): string {
  if (count === null) return '비공개';
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K';
  }
  return count.toString();
}

export function formatViralScore(score: number): string {
  if (score >= 1000) {
    return (score / 1000).toFixed(1) + 'K';
  } else if (score >= 100) {
    return score.toFixed(0);
  } else if (score >= 10) {
    return score.toFixed(1);
  } else {
    return score.toFixed(2);
  }
}

export function formatPublishedDate(dateString: string): string {
  // 경과 시간은 내림해야 한다. 올림하면 "1일 하고 1밀리초 전"이 "2일 전"이 되어
  // 모든 날짜가 하루씩 부풀려진다.
  const diffMs = Date.now() - new Date(dateString).getTime();

  // 미래 시각(시계 오차/타임존 오류)은 과거로 뒤집지 않고 '방금 전'으로 처리한다.
  if (Number.isNaN(diffMs) || diffMs < 0) return '방금 전';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/** 배수 지표. 계산 불가는 숫자로 위장하지 않고 그대로 말한다. */
export function formatMultiple(value: number | null): string {
  if (value === null) return '측정불가';
  return formatViralScore(value) + '배';
}

/** 비율 지표(참여율 등). 계산 불가는 빈 값이 아니라 물결표로 구분한다. */
export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  if (value >= 0.1) return (value * 100).toFixed(0) + '%';
  return (value * 100).toFixed(2) + '%';
}

/**
 * 표시용 강조 기준 — 두 조건을 모두 만족할 때만 강조한다.
 *
 * 1. 이 검색 결과 안에서 성과배수 상위 OUTPERFORM_TOP_SHARE 안에 든다
 * 2. 절대값이 OUTPERFORM_FLOOR 배 이상이다
 *
 * 절대 임계값 하나(예전 2배)는 실측에서 무의미했다. 검색 결과는 이미 YouTube가
 * 고른 승자 집합이라 성과배수 중앙값이 키워드에 따라 12~29배였고, 2배 기준으로는
 * 78~94%에 불꽃이 붙었다. 분포가 키워드마다 달라 절대값 하나로는 맞출 수 없으므로
 * 결과 집합 안의 상대 위치를 쓰되, 전부 평범한 검색에서도 20%가 강조되는 일을
 * 막기 위해 절대 하한을 둔다. 통계적 의미는 없고 눈에 띄게 하기 위한 눈금이다.
 */
export const OUTPERFORM_TOP_SHARE = 0.2;
export const OUTPERFORM_FLOOR = 5;

/** 결과 집합의 성과배수 목록에서 강조 컷오프를 구한다. 계산 불가(null)는 뺀다. */
export function outperformCutoff(multiples: (number | null)[]): number {
  const xs = multiples.filter((m): m is number => m !== null).sort((a, b) => a - b);
  if (xs.length === 0) return OUTPERFORM_FLOOR;
  // 오름차순에서 index floor(n·0.8) 이상이 상위 20%다. 예: n=10 -> xs[8], 즉 9·10번째.
  const idx = Math.min(xs.length - 1, Math.floor(xs.length * (1 - OUTPERFORM_TOP_SHARE)));
  return Math.max(OUTPERFORM_FLOOR, xs[idx]);
}

export function isOutperforming(performanceMultiple: number | null, cutoff: number): boolean {
  return performanceMultiple !== null && performanceMultiple >= cutoff;
}