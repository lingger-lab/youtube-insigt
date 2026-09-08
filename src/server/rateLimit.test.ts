import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SlidingWindowLimiter, clientKey } from './rateLimit.ts';

/** 시계를 주입해 시간 경과를 결정적으로 만든다. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('SlidingWindowLimiter', () => {
  test('max회까지 허용하고 그 다음은 거부한다', () => {
    const c = clock();
    const l = new SlidingWindowLimiter(3, 60_000, c.now);
    assert.equal(l.check('a').allowed, true);
    assert.equal(l.check('a').allowed, true);
    const third = l.check('a');
    assert.equal(third.allowed, true);
    assert.equal(third.remaining, 0);
    const fourth = l.check('a');
    assert.equal(fourth.allowed, false);
    assert.ok(fourth.retryAfterSec >= 1);
  });

  test('거부 시 retryAfterSec은 가장 오래된 호출이 창 밖으로 나가는 시점이다', () => {
    const c = clock();
    const l = new SlidingWindowLimiter(1, 60_000, c.now);
    l.check('a');
    c.advance(20_000);
    const d = l.check('a');
    assert.equal(d.allowed, false);
    assert.equal(d.retryAfterSec, 40); // 60초 창에서 20초 지남
  });

  test('창이 지나면 다시 허용한다 (슬라이딩)', () => {
    const c = clock();
    const l = new SlidingWindowLimiter(1, 60_000, c.now);
    assert.equal(l.check('a').allowed, true);
    assert.equal(l.check('a').allowed, false);
    c.advance(60_001);
    assert.equal(l.check('a').allowed, true);
  });

  test('키(IP)별로 따로 센다', () => {
    const l = new SlidingWindowLimiter(1, 60_000, clock().now);
    assert.equal(l.check('a').allowed, true);
    assert.equal(l.check('b').allowed, true);
    assert.equal(l.check('a').allowed, false);
  });

  test('잘못된 설정은 즉시 던진다', () => {
    assert.throws(() => new SlidingWindowLimiter(0, 1000));
    assert.throws(() => new SlidingWindowLimiter(1, 0));
  });
});

describe('clientKey', () => {
  test('x-forwarded-for의 첫 IP를 쓴다 (Vercel이 실제 IP를 첫 항목에 둔다)', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } });
    assert.equal(clientKey(req), '203.0.113.7');
  });

  test('x-forwarded-for가 없으면 x-real-ip, 그것도 없으면 unknown', () => {
    assert.equal(clientKey(new Request('http://x', { headers: { 'x-real-ip': '198.51.100.2' } })), '198.51.100.2');
    assert.equal(clientKey(new Request('http://x')), 'unknown');
  });
});
