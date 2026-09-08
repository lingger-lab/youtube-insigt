import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { estimateQuota, SEARCH_DAILY_LIMIT, GENERAL_DAILY_UNITS, SEARCH_DEPTHS } from './quota.ts';

describe('estimateQuota (2026-06-01 버킷 분리 기준)', () => {
  // README와 UI에 그대로 노출되는 숫자다. 조용히 어긋나면 사용자가
  // 하루에 몇 번 쓸 수 있는지 잘못 알게 된다.
  test('검색 깊이별 소비량과 하루 가능 횟수', () => {
    // otherUnits는 최악(결과마다 다른 채널) 기준 상한이다.
    assert.deepEqual(estimateQuota(50), { searchCalls: 1, otherUnits: 102, searchesPerDay: 98, pages: 1 });
    assert.deepEqual(estimateQuota(100), { searchCalls: 2, otherUnits: 204, searchesPerDay: 49, pages: 2 });
    assert.deepEqual(estimateQuota(200), { searchCalls: 4, otherUnits: 408, searchesPerDay: 24, pages: 4 });
  });

  // 채널별 업로드 조회가 붙으면서 두 버킷이 비슷한 시점에 닿는다.
  // 어느 쪽이든 먼저 닿는 쪽이 상한이어야 낙관적으로 보이지 않는다.
  test('하루 가능 횟수는 두 버킷 중 먼저 닿는 쪽이 결정한다', () => {
    for (const depth of SEARCH_DEPTHS) {
      const { searchCalls, otherUnits, searchesPerDay } = estimateQuota(depth);
      const bySearch = Math.floor(SEARCH_DAILY_LIMIT / searchCalls);
      const byGeneral = Math.floor(GENERAL_DAILY_UNITS / otherUnits);
      assert.equal(searchesPerDay, Math.min(bySearch, byGeneral));
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
