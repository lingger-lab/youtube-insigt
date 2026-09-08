import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planGrid, thumbnailProxyUrl } from './contactSheet.ts';

describe('planGrid', () => {
  test('12장은 3열 4행', () => {
    const p = planGrid(12, 3, 480);
    assert.equal(p.cols, 3);
    assert.equal(p.rows, 4);
    assert.equal(p.width, 1440);
    assert.equal(p.height, 4 * 270);
  });

  test('칸은 16:9', () => {
    const p = planGrid(6, 3, 480);
    assert.equal(p.cellWidth / p.cellHeight, 480 / 270);
  });

  test('열보다 적으면 열 수를 줄인다 (빈 칸으로 번호가 밀리지 않게)', () => {
    const p = planGrid(2, 3, 480);
    assert.equal(p.cols, 2);
    assert.equal(p.rows, 1);
  });

  test('0장이면 0x0', () => {
    const p = planGrid(0, 3);
    assert.equal(p.rows, 0);
    assert.equal(p.height, 0);
  });

  test('나머지가 생기면 행을 올림한다', () => {
    assert.equal(planGrid(7, 3).rows, 3);
  });
});

describe('thumbnailProxyUrl', () => {
  test('같은 출처 프록시를 가리킨다 (i.ytimg.com 직접 접근은 캔버스를 오염시킨다)', () => {
    const url = thumbnailProxyUrl('dQw4w9WgXcQ');
    assert.ok(url.startsWith('/api/thumbnail?v='));
    assert.equal(url.includes('ytimg'), false);
  });

  test('ID를 URL 인코딩한다', () => {
    assert.ok(thumbnailProxyUrl('a b').includes('a%20b'));
  });
});
