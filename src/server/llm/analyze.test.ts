import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildContent,
  estimateCostUsd,
  classifyLlmError,
  isLlmConfigured,
  configuredModel,
  runAnalysis,
  LlmError,
  DEFAULT_MODEL,
} from './analyze.ts';

/** SDK가 실제로 만드는 방식 그대로 타입 있는 오류를 만든다. */
function sdkError(status: number, type: string) {
  return Anthropic.APIError.generate(status, { error: { type, message: 'x' } }, 'x', new Headers());
}

const savedKey = process.env.ANTHROPIC_API_KEY;
const savedModel = process.env.LLM_MODEL;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.LLM_MODEL;
});
afterEach(() => {
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  else delete process.env.ANTHROPIC_API_KEY;
  if (savedModel !== undefined) process.env.LLM_MODEL = savedModel;
  else delete process.env.LLM_MODEL;
});

describe('설정', () => {
  test('ANTHROPIC_API_KEY가 없으면 비활성이다', () => {
    assert.equal(isLlmConfigured(), false);
  });

  test('키가 있으면 활성이다', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    assert.equal(isLlmConfigured(), true);
  });

  test('모델은 기본 claude-opus-5이며 LLM_MODEL로 바꿀 수 있다', () => {
    assert.equal(configuredModel(), DEFAULT_MODEL);
    assert.equal(DEFAULT_MODEL, 'claude-opus-5');
    process.env.LLM_MODEL = 'claude-sonnet-5';
    assert.equal(configuredModel(), 'claude-sonnet-5');
  });

  // 돈이 드는 기능이라, 키 없이 호출되면 네트워크에 나가기 전에 막혀야 한다.
  test('키 없이 runAnalysis를 부르면 즉시 LLM_NOT_CONFIGURED(503)', async () => {
    await assert.rejects(
      () => runAnalysis({ prompt: 'x', thumbnailVideoIds: [] }),
      (e: unknown) => e instanceof LlmError && e.code === 'LLM_NOT_CONFIGURED' && e.httpStatus === 503,
    );
  });
});

describe('buildContent', () => {
  test('이미지 블록이 텍스트보다 앞에 온다', () => {
    const blocks = buildContent('질문', [
      { data: 'AAA', mediaType: 'image/jpeg' },
      { data: 'BBB', mediaType: 'image/jpeg' },
    ]);
    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].type, 'image');
    assert.equal(blocks[1].type, 'image');
    assert.equal(blocks[2].type, 'text');
  });

  test('이미지가 없으면 텍스트 블록 하나뿐이다', () => {
    const blocks = buildContent('질문', []);
    assert.deepEqual(blocks, [{ type: 'text', text: '질문' }]);
  });

  test('base64 이미지 블록 형식', () => {
    const [img] = buildContent('q', [{ data: 'ZZ', mediaType: 'image/jpeg' }]);
    assert.deepEqual(img, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'ZZ' } });
  });
});

describe('estimateCostUsd', () => {
  const usage = { inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 0, cacheWriteTokens: 0 };

  test('claude-opus-5: 입력 $5/M, 출력 $25/M', () => {
    // 10k*5/1M = 0.05 ; 2k*25/1M = 0.05
    assert.equal(estimateCostUsd('claude-opus-5', usage), 0.1);
  });

  test('캐시 읽기는 입력 단가의 10%', () => {
    const cached = { ...usage, inputTokens: 0, cacheReadTokens: 100_000 };
    // 100k * 5 * 0.1 / 1M = 0.05 ; 출력 0.05
    assert.equal(estimateCostUsd('claude-opus-5', cached), 0.1);
  });

  // 폴백으로 모르는 모델이 응답하면 숫자를 지어내지 않는다.
  test('가격표에 없는 모델은 null', () => {
    assert.equal(estimateCostUsd('claude-unknown-9', usage), null);
  });
});

describe('classifyLlmError — SDK 타입 오류를 앱 코드로', () => {
  test('401 -> LLM_KEY_INVALID (502)', () => {
    const e = classifyLlmError(sdkError(401, 'authentication_error'));
    assert.equal(e.code, 'LLM_KEY_INVALID');
    assert.equal(e.httpStatus, 502);
  });

  test('429 -> LLM_RATE_LIMITED (429)', () => {
    assert.equal(classifyLlmError(sdkError(429, 'rate_limit_error')).code, 'LLM_RATE_LIMITED');
  });

  test('400 -> LLM_BAD_REQUEST', () => {
    assert.equal(classifyLlmError(sdkError(400, 'invalid_request_error')).code, 'LLM_BAD_REQUEST');
  });

  test('529/500 -> LLM_UPSTREAM', () => {
    assert.equal(classifyLlmError(sdkError(529, 'overloaded_error')).code, 'LLM_UPSTREAM');
    assert.equal(classifyLlmError(sdkError(500, 'api_error')).code, 'LLM_UPSTREAM');
  });

  test('이미 LlmError면 그대로 통과한다', () => {
    const original = new LlmError('LLM_REFUSED', 'x', 422);
    assert.equal(classifyLlmError(original), original);
  });

  test('알 수 없는 오류도 삼키지 않고 LLM_UPSTREAM으로 표면화한다', () => {
    const e = classifyLlmError(new Error('boom'));
    assert.equal(e.code, 'LLM_UPSTREAM');
    assert.equal(e.message, 'boom');
  });

  test('사용자 메시지에 내부 상세를 담지 않는다', () => {
    const e = classifyLlmError(sdkError(401, 'authentication_error'));
    assert.equal(e.userMessage.includes('401'), false);
    assert.ok(e.userMessage.includes('키'));
  });
});
