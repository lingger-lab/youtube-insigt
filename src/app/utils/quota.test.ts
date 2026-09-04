import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { estimateQuota, DAILY_QUOTA, SEARCH_DEPTHS } from './quota.ts';

describe('estimateQuota', () => {
  // README와 UI에 그대로 노출되는 숫자다. 조용히 어긋나면 사용자가
  // 하루에 몇 번 쓸 수 있는지 잘못 알게 된다.
  test('검색 깊이별 소비량과 하루 가능 횟수', () => {
    assert.deepEqual(estimateQuota(50), { units: 102, searchesPerDay: 98, pages: 1 });
    assert.deepEqual(estimateQuota(100), { units: 204, searchesPerDay: 49, pages: 2 });
    assert.deepEqual(estimateQuota(200), { units: 408, searchesPerDay: 24, pages: 4 });
  });

  test('search.list 100단위가 비용의 대부분을 차지한다', () => {
    const { units } = estimateQuota(200);
    assert.equal(Math.round((400 / units) * 100), 98);
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
      assert.ok(estimateQuota(depth).units < DAILY_QUOTA, `${depth}개가 하루 한도를 넘는다`);
      assert.ok(estimateQuota(depth).searchesPerDay >= 1);
    }
  });
});
