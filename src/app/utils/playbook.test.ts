import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYBOOK, PLAYBOOK_VERSION, selectPrinciples, renderPlaybook } from './playbook.ts';

describe('플레이북 데이터 무결성', () => {
  test('ID가 겹치지 않는다', () => {
    const ids = PLAYBOOK.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('모든 원칙에 신뢰도와 출처가 있다 — 출처 없는 관행은 프롬프트에 싣지 않는다', () => {
    for (const p of PLAYBOOK) {
      assert.ok(['높음', '중간', '낮음'].includes(p.confidence), p.id);
      assert.ok(p.source.trim().length >= 5, `${p.id} 출처 없음`);
      assert.ok(p.statement.trim().length >= 10, `${p.id} 내용 없음`);
    }
  });

  test('검증 불가한 효과 수치("n배 CTR")를 원칙 본문에 넣지 않는다', () => {
    for (const p of PLAYBOOK) {
      assert.ok(!/\d+(\.\d+)?배 (높은 |더 )?CTR/.test(p.statement), `${p.id}: ${p.statement}`);
    }
  });

  test('버전은 날짜 형식이다', () => {
    assert.match(PLAYBOOK_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('selectPrinciples', () => {
  test('Shorts에는 롱폼 전용 원칙(K2·S1)이 빠지고 Shorts 전용(K1·S2)이 들어간다', () => {
    const ids = selectPrinciples('shorts').map((p) => p.id);
    assert.ok(ids.includes('K1') && ids.includes('S2'));
    assert.ok(!ids.includes('K2') && !ids.includes('S1'));
  });

  test('롱폼은 그 반대다', () => {
    const ids = selectPrinciples('long').map((p) => p.id);
    assert.ok(ids.includes('K2') && ids.includes('S1'));
    assert.ok(!ids.includes('K1') && !ids.includes('S2'));
  });

  test('포맷을 모르면(null) 전부 싣는다', () => {
    assert.equal(selectPrinciples(null).length, PLAYBOOK.length);
  });

  test('포맷과 무관한 원칙(T·H·V)은 어느 쪽에도 들어간다', () => {
    for (const f of ['shorts', 'long'] as const) {
      const ids = selectPrinciples(f).map((p) => p.id);
      for (const id of ['T1', 'T2', 'H1', 'V1']) assert.ok(ids.includes(id), `${f}: ${id}`);
    }
  });
});

describe('renderPlaybook', () => {
  const text = renderPlaybook(selectPrinciples('long'));

  test('ID·신뢰도·출처가 인용 가능한 형태로 나온다', () => {
    assert.ok(text.includes('[원칙 T2 · 중간]'));
    assert.ok(text.includes('출처:'));
    assert.ok(text.includes(`v${PLAYBOOK_VERSION}`));
  });

  test('데이터가 원칙보다 우선한다고 명시한다', () => {
    assert.ok(text.includes('데이터가 우선'));
  });
});
