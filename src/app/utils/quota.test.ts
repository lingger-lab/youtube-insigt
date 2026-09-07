import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { estimateQuota, SEARCH_DAILY_LIMIT, GENERAL_DAILY_UNITS, SEARCH_DEPTHS } from './quota.ts';

describe('estimateQuota (2026-06-01 버킷 분리 기준)', () => {
  // README와 UI에 그대로 노출되는 숫자다. 조용히 어긋나면 사용자가
  // 하루에 몇 번 쓸 수 있는지 잘못 알게 된다.
  test('검색 깊이별 소비량과 하루 가능 횟수', () => {
    assert.deepEqual(estimateQuota(50), { searchCalls: 1, otherUnits: 2, searchesPerDay: 100, pages: 1 });
    assert.deepEqual(estimateQuota(100), { searchCalls: 2, otherUnits: 4, searchesPerDay: 50, pages: 2 });
    assert.deepEqual(estimateQuota(200), { searchCalls: 4, otherUnits: 8, searchesPerDay: 25, pages: 4 });
  });

  // 검색 버킷(100회)이 공용 버킷(10,000)보다 훨씬 먼저 닿는다.
  // 부가 호출을 아껴도 검색 횟수는 늘지 않는다는 뜻이다.
  test('하루 가능 횟수는 검색 전용 버킷이 결정한다', () => {
    for (const depth of SEARCH_DEPTHS) {
      const { searchCalls, otherUnits, searchesPerDay } = estimateQuota(depth);
      assert.equal(searchesPerDay, Math.floor(SEARCH_DAILY_LIMIT / searchCalls));
      assert.ok(Math.floor(GENERAL_DAILY_UNITS / otherUnits) > searchesPerDay);
    }
  });

  test('50개 미만도 최소 한 페이지는 부른다', () => {
    assert.equal(estimateQuota(1).pages, 1);
    assert.equal(estimateQuota(0).pages, 1);
  });

  test('50의 배수가 아닌 값은 페이지를 올림한다', () => {
    assert.equal(estimateQuota(51).pages, 2);
  });

  test('제공하는 모든 깊이가 하루 한 번 이상은 가능하다', () => {
    for (const depth of SEARCH_DEPTHS) {
      assert.ok(estimateQuota(depth).searchesPerDay >= 1);
    }
  });
});
