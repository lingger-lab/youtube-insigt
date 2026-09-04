import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatViewCount,
  formatSubscriberCount,
  formatViralScore,
  formatPublishedDate,
  truncateText,
  formatMultiple,
  formatPercent,
  isOutperforming,
} from './helpers.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 지금으로부터 n일 전의 ISO 문자열 (시계 의존을 테스트 경계에만 둔다) */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

/** 지금으로부터 n분 전의 ISO 문자열. 음수를 넣으면 미래 시각이 된다. */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

describe('formatViewCount', () => {
  test('1000 미만은 그대로 표기한다', () => {
    assert.equal(formatViewCount(0), '0');
    assert.equal(formatViewCount(999), '999');
  });

  test('천/백만/십억 단위를 축약한다', () => {
    assert.equal(formatViewCount(1000), '1.0K');
    assert.equal(formatViewCount(1_500_000), '1.5M');
    assert.equal(formatViewCount(2_300_000_000), '2.3B');
  });

  test('경계값에서 상위 단위를 택한다', () => {
    assert.equal(formatViewCount(1_000_000), '1.0M');
    assert.equal(formatViewCount(999_999), '1000.0K');
  });
});

describe('formatSubscriberCount', () => {
  test('천/백만 단위를 축약한다', () => {
    assert.equal(formatSubscriberCount(999), '999');
    assert.equal(formatSubscriberCount(12_300), '12.3K');
    assert.equal(formatSubscriberCount(4_500_000), '4.5M');
  });

  // 조회수 포맷터와 달리 B(십억) 단계가 없다. 구독자수는 십억에 도달하지
  // 않으므로 의도된 차이이며, 이 테스트가 그 사실을 고정한다.
  test('십억 단위는 M으로 표기한다 (B 단계 없음)', () => {
    assert.equal(formatSubscriberCount(1_000_000_000), '1000.0M');
  });

  // 숨긴 채널을 0으로 표시하면 '구독자가 0명인 채널'과 구분되지 않는다.
  test('비공개(null)와 0명을 구분한다', () => {
    assert.equal(formatSubscriberCount(null), '비공개');
    assert.equal(formatSubscriberCount(0), '0');
  });
});

describe('formatMultiple', () => {
  test('배수를 단위와 함께 표기한다', () => {
    assert.equal(formatMultiple(5), '5.00배');
    assert.equal(formatMultiple(15.55), '15.6배');
    assert.equal(formatMultiple(1500), '1.5K배');
  });

  test('계산 불가는 숫자로 위장하지 않는다', () => {
    assert.equal(formatMultiple(null), '측정불가');
  });
});

describe('formatPercent', () => {
  test('10% 이상은 정수로, 미만은 소수 둘째 자리까지', () => {
    assert.equal(formatPercent(0.25), '25%');
    assert.equal(formatPercent(0.05), '5.00%');
    assert.equal(formatPercent(0.002), '0.20%');
  });

  test('실제 0과 계산 불가를 구분한다', () => {
    assert.equal(formatPercent(0), '0.00%');
    assert.equal(formatPercent(null), '—');
  });
});

describe('isOutperforming', () => {
  test('채널 평소의 2배 이상이면 강조한다', () => {
    assert.equal(isOutperforming(2), true);
    assert.equal(isOutperforming(5.5), true);
  });

  test('2배 미만이거나 측정 불가면 강조하지 않는다', () => {
    assert.equal(isOutperforming(1.9), false);
    assert.equal(isOutperforming(null), false);
  });
});

describe('formatViralScore', () => {
  test('1 미만은 소수 둘째 자리까지', () => {
    assert.equal(formatViralScore(0.5), '0.50');
    assert.equal(formatViralScore(9.99), '9.99');
  });

  test('10 이상 100 미만은 소수 첫째 자리까지', () => {
    assert.equal(formatViralScore(15.55), '15.6');
  });

  test('100 이상 1000 미만은 정수로', () => {
    assert.equal(formatViralScore(150.7), '151');
  });

  test('1000 이상은 K로 축약한다', () => {
    assert.equal(formatViralScore(1500), '1.5K');
  });
});

describe('formatPublishedDate', () => {
  test('1분 미만은 방금 전으로 표기한다', () => {
    assert.equal(formatPublishedDate(new Date().toISOString()), '방금 전');
  });

  // 앱이 "1시간 이내" 검색 필터를 제공하므로 시간 단위 표기가 필요하다.
  test('1시간 미만은 분 단위로 표기한다', () => {
    assert.equal(formatPublishedDate(minutesAgo(30)), '30분 전');
  });

  test('하루 미만은 시간 단위로 표기한다', () => {
    assert.equal(formatPublishedDate(minutesAgo(2 * 60)), '2시간 전');
    assert.equal(formatPublishedDate(minutesAgo(23 * 60)), '23시간 전');
  });

  // 경과 시간을 올림하면 정확히 N일 전이 N+1일 전으로 표시된다.
  test('1일 전을 표기한다 (올림 금지)', () => {
    assert.equal(formatPublishedDate(daysAgo(1)), '1일 전');
  });

  test('일주일 미만은 일 단위로 표기한다', () => {
    assert.equal(formatPublishedDate(daysAgo(3)), '3일 전');
  });

  test('미래 시각은 방금 전으로 처리한다 (시계 오차 방어)', () => {
    assert.equal(formatPublishedDate(minutesAgo(-10)), '방금 전');
  });

  test('한 달 미만은 주 단위로 표기한다', () => {
    assert.equal(formatPublishedDate(daysAgo(14)), '2주 전');
  });

  test('1년 미만은 개월 단위로 표기한다', () => {
    assert.equal(formatPublishedDate(daysAgo(90)), '3개월 전');
  });

  test('1년 이상은 년 단위로 표기한다', () => {
    assert.equal(formatPublishedDate(daysAgo(400)), '1년 전');
  });
});

describe('truncateText', () => {
  test('한도 이내면 그대로 반환한다', () => {
    assert.equal(truncateText('abc', 5), 'abc');
    assert.equal(truncateText('abcde', 5), 'abcde');
  });

  test('한도를 넘으면 잘라내고 말줄임표를 붙인다', () => {
    assert.equal(truncateText('abcdef', 3), 'abc...');
  });
});

