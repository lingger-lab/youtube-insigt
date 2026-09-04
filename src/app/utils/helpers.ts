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

export function formatSubscriberCount(count: number): string {
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

export function isHighViralScore(score: number): boolean {
  return score >= 1; // 조회수가 구독자수보다 많으면 바이럴
}