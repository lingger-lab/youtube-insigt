import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHttpError, YouTubeApiError } from './errors.ts';

/** YouTube 오류 응답 본문 형태를 만든다. */
function errorBody(reason: string, code = 403) {
  return { error: { code, message: '...', errors: [{ reason, domain: 'youtube.quota' }] } };
}

describe('classifyHttpError', () => {
  test('할당량 소진은 QUOTA_EXCEEDED로 분류하고 재시도하지 않는다', () => {
    const error = classifyHttpError(403, errorBody('quotaExceeded'));
    assert.equal(error.code, 'QUOTA_EXCEEDED');
    assert.equal(error.retryable, false);
  });

  // 2026-06-01부터 search.list는 전용 버킷(하루 100회)이다. 이 앱의 실질 상한이므로
  // 공용 버킷 소진과 구분해 알려야 사용자가 원인을 안다.
  test('search 엔드포인트의 할당량 소진은 검색 전용 버킷으로 분류한다', () => {
    const error = classifyHttpError(403, errorBody('quotaExceeded'), 'search');
    assert.equal(error.code, 'SEARCH_QUOTA_EXCEEDED');
    assert.equal(error.retryable, false);
    assert.ok(error.userMessage.includes('검색 한도'));
  });

  test('videos 엔드포인트의 할당량 소진은 공용 버킷이다', () => {
    assert.equal(classifyHttpError(403, errorBody('quotaExceeded'), 'videos').code, 'QUOTA_EXCEEDED');
  });

  test('dailyLimitExceeded도 할당량 소진으로 본다', () => {
    assert.equal(classifyHttpError(403, errorBody('dailyLimitExceeded')).code, 'QUOTA_EXCEEDED');
  });

  test('403 요청 제한은 재시도 대상이다', () => {
    const error = classifyHttpError(403, errorBody('rateLimitExceeded'));
    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.retryable, true);
  });

  test('그 밖의 403은 키/권한 문제로 본다', () => {
    assert.equal(classifyHttpError(403, errorBody('accessNotConfigured')).code, 'API_KEY_INVALID');
  });

  // 키가 잘못되면 YouTube는 400 keyInvalid를 돌려준다. 이를 일반 BAD_REQUEST로
  // 묶으면 "검색 조건이 올바르지 않습니다"라는 엉뚱한 안내가 나간다.
  test('400 keyInvalid는 키 문제로 분류한다', () => {
    assert.equal(classifyHttpError(400, errorBody('keyInvalid', 400)).code, 'API_KEY_INVALID');
  });

  test('그 밖의 400은 잘못된 요청이다', () => {
    const error = classifyHttpError(400, errorBody('invalidSearchFilter', 400));
    assert.equal(error.code, 'BAD_REQUEST');
    assert.equal(error.retryable, false);
  });

  test('429는 재시도 대상이다', () => {
    const error = classifyHttpError(429, null);
    assert.equal(error.code, 'RATE_LIMITED');
    assert.equal(error.retryable, true);
  });

  test('5xx는 업스트림 오류이며 재시도 대상이다', () => {
    for (const status of [500, 502, 503]) {
      const error = classifyHttpError(status, null);
      assert.equal(error.code, 'UPSTREAM_ERROR');
      assert.equal(error.retryable, true);
    }
  });

  test('404는 NOT_FOUND이며 재시도하지 않는다', () => {
    const error = classifyHttpError(404, errorBody('playlistNotFound', 404));
    assert.equal(error.code, 'NOT_FOUND');
    assert.equal(error.retryable, false);
  });

  test('본문이 비어 있어도 상태 코드만으로 분류한다', () => {
    assert.equal(classifyHttpError(403, null).code, 'API_KEY_INVALID');
    assert.equal(classifyHttpError(500, 'not json').code, 'UPSTREAM_ERROR');
  });
});

describe('YouTubeApiError', () => {
  test('사용자 메시지에 내부 상세를 담지 않는다', () => {
    const error = new YouTubeApiError('QUOTA_EXCEEDED', '내부 상세: key=AIzaSecret reason=quotaExceeded');
    assert.equal(error.userMessage.includes('AIzaSecret'), false);
    assert.equal(error.userMessage.includes('할당량'), true);
  });

  test('상세 메시지는 Error.message로 서버 로그에만 남는다', () => {
    const error = new YouTubeApiError('UPSTREAM_ERROR', '업스트림 503');
    assert.equal(error.message, '업스트림 503');
  });

  test('할당량 소진은 429로 응답한다', () => {
    assert.equal(classifyHttpError(403, errorBody('quotaExceeded')).httpStatus, 429);
  });
});
