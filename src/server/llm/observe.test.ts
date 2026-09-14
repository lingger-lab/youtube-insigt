import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@google/genai';
import {
  DEFAULT_OBSERVE_MODEL,
  MAX_OBSERVE_SEC,
  videoTokensOf,
  isObserveConfigured,
  configuredObserveModel,
  processingModeFor,
  estimateObserveCostUsd,
  buildObserveRequest,
  parseObservationText,
  classifyObserveError,
  observeVideo,
  ObserveError,
  OBSERVATION_JSON_SCHEMA,
  type ObserveResponse,
} from './observe.ts';
import type { ObservationPayload } from '../../types/observation.ts';

const savedKey = process.env.GEMINI_API_KEY;
const savedModel = process.env.GEMINI_MODEL;
beforeEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
});
afterEach(() => {
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
  else delete process.env.GEMINI_API_KEY;
  if (savedModel !== undefined) process.env.GEMINI_MODEL = savedModel;
  else delete process.env.GEMINI_MODEL;
});

function payload(overrides: Partial<ObservationPayload> = {}): ObservationPayload {
  return {
    language: 'ko',
    hook: {
      first3s: { visual: '완성된 치킨 클로즈업', spoken: '이거 진짜 쉬워요', onScreenText: '10분 완성' },
      firstLine: { quote: '이거 진짜 쉬워요', at: '00:00' },
      promiseStatedAt: '00:02',
    },
    structure: [
      { start: '00:00', end: '00:03', purpose: '결과 먼저 보여줌', device: '클로즈업' },
      { start: '00:03', end: '00:20', purpose: '조리 과정 압축', device: '점프컷' },
    ],
    patternInterrupts: [{ at: '00:10', kind: '전환' }],
    thumbnailPromise: { kept: 'yes', evidence: '00:18에 완성품이 썸네일과 같은 구도로 등장', at: '00:18' },
    cta: { present: false, at: null, text: null },
    faceOnCamera: 'no',
    textOverlay: 'light',
    notes: ['배경음악 때문에 00:12~00:15 음성이 불명확'],
    ...overrides,
  };
}

const INPUT = { videoId: 'dQw4w9WgXcQ', title: '에어프라이어 치킨 10분', durationSec: 24 };

describe('설정', () => {
  test('GEMINI_API_KEY가 없으면 비활성, 있으면 활성', () => {
    assert.equal(isObserveConfigured(), false);
    process.env.GEMINI_API_KEY = 'AIza-test';
    assert.equal(isObserveConfigured(), true);
  });

  test('모델은 기본 gemini-3.8-flash, GEMINI_MODEL로 교체', () => {
    assert.equal(configuredObserveModel(), DEFAULT_OBSERVE_MODEL);
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    assert.equal(configuredObserveModel(), 'gemini-3.5-flash-lite');
  });

  // 돈·한도가 걸린 기능이라, 키 없이 호출되면 네트워크에 나가기 전에 막혀야 한다.
  test('키 없이 observeVideo를 부르면 즉시 OBSERVE_NOT_CONFIGURED(503)이고 create는 호출되지 않는다', async () => {
    let called = false;
    await assert.rejects(
      () => observeVideo(INPUT, async () => { called = true; return {}; }),
      (e: unknown) => e instanceof ObserveError && e.code === 'OBSERVE_NOT_CONFIGURED' && e.httpStatus === 503,
    );
    assert.equal(called, false);
  });
});

describe('처리 모드', () => {
  // 실측(F41): Flash-Lite agentic이 15분 한국어 영상을 영어 영상으로 날조(영상 토큰 0). 3.8 Flash agentic은 110초.
  test('길이와 무관하게 항상 static', () => {
    assert.equal(processingModeFor(24), 'static');
    assert.equal(processingModeFor(15 * 60), 'static');
    assert.equal(processingModeFor(29 * 60), 'static');
  });
});

describe('videoTokensOf — 모델이 영상을 읽었다는 증거', () => {
  test('static: input video 토큰', () => {
    assert.equal(videoTokensOf({ input_tokens_by_modality: [{ modality: 'text', tokens: 207 }, { modality: 'video', tokens: 1630 }] }), 1630);
  });
  test('agentic: tool_use의 image/video 토큰', () => {
    assert.equal(videoTokensOf({ tool_use_tokens_by_modality: [{ modality: 'text', tokens: 6376 }, { modality: 'image', tokens: 7854 }] }), 7854);
  });
  test('텍스트만 있으면 0 — 날조 사례의 usage 모양 그대로', () => {
    assert.equal(videoTokensOf({ input_tokens_by_modality: [{ modality: 'text', tokens: 207 }], tool_use_tokens_by_modality: [{ modality: 'text', tokens: 1176 }] }), 0);
    assert.equal(videoTokensOf(undefined), 0);
  });
});

describe('buildObserveRequest — 우리가 보내는 모양을 고정한다', () => {
  const req = buildObserveRequest(INPUT, 'gemini-3.8-flash');

  test('watch URL·처리 모드·store:false·JSON 스키마·thinking low', () => {
    assert.equal(req.store, false);
    assert.deepEqual(req.input[0], { type: 'video', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', processing: 'static' });
    assert.equal(req.response_format.mime_type, 'application/json');
    assert.equal(req.response_format.schema, OBSERVATION_JSON_SCHEMA);
    assert.equal(req.generation_config.thinking_level, 'low');
  });

  test('영상이 먼저, 텍스트가 뒤에 온다 (문서: 단일 영상은 프롬프트를 영상 뒤에)', () => {
    assert.equal(req.input[0].type, 'video');
    assert.equal(req.input[1].type, 'text');
    assert.ok((req.input[1] as { text: string }).text.includes('썸네일 이미지는 첨부되지 않았다'));
  });

  // 스파이크(2026-09-14): 썸네일 없이 보내면 모델이 thumbnailPromise를 "정보 없음 → unknown"으로 냈다.
  test('썸네일이 있으면 영상 → 이미지(low) → 텍스트 순서로 첨부하고 지시문에 그 사실을 적는다', () => {
    const withThumb = buildObserveRequest(INPUT, 'gemini-3.8-flash', { data: 'AAAA', mimeType: 'image/jpeg' });
    assert.deepEqual(withThumb.input.map((c) => c.type), ['video', 'image', 'text']);
    assert.deepEqual(withThumb.input[1], { type: 'image', data: 'AAAA', mime_type: 'image/jpeg', resolution: 'low' });
    assert.ok((withThumb.input[2] as { text: string }).text.includes('첨부된 이미지는 이 영상의 썸네일'));
  });

  test('지시문은 관찰만 허용하고 평가·추천을 금지하며 제목을 싣는다', () => {
    const text = req.input[1].type === 'text' ? req.input[1].text : '';
    assert.ok(text.includes('평가·추천·추측은 하지 않습니다'));
    assert.ok(text.includes('원문 그대로'));
    assert.ok(text.includes('MM:SS'));
    assert.ok(text.includes('에어프라이어 치킨 10분'));
  });

  test('JSON 스키마의 필수 키가 ObservationPayload와 같다 (미러 고정)', () => {
    const keys = Object.keys(payload()).sort();
    assert.deepEqual([...OBSERVATION_JSON_SCHEMA.required].sort(), keys);
  });
});

describe('parseObservationText — 서버 재검증', () => {
  test('유효한 JSON은 그대로 통과한다', () => {
    const p = parseObservationText(JSON.stringify(payload()));
    assert.equal(p.hook.firstLine?.quote, '이거 진짜 쉬워요');
  });

  test('JSON이 아니면 OBSERVE_MALFORMED', () => {
    assert.throws(() => parseObservationText('not json'), (e: unknown) => e instanceof ObserveError && e.code === 'OBSERVE_MALFORMED');
  });

  test('시각이 MM:SS가 아니면 버린다 — 시각 없는 관찰은 관찰이 아니다', () => {
    const bad = payload({ hook: { ...payload().hook, firstLine: { quote: 'x', at: '3초쯤' } } });
    assert.throws(() => parseObservationText(JSON.stringify(bad)), (e: unknown) => e instanceof ObserveError && e.code === 'OBSERVE_MALFORMED');
  });

  test('구조 블록이 9개 이상이면 버린다', () => {
    const bad = payload({ structure: Array.from({ length: 9 }, () => ({ start: '00:00', end: '00:01', purpose: 'x', device: null })) });
    assert.throws(() => parseObservationText(JSON.stringify(bad)));
  });
});

describe('estimateObserveCostUsd', () => {
  test('gemini-3.8-flash: 입력 $0.75/M, 출력 $3.75/M', () => {
    assert.equal(estimateObserveCostUsd('gemini-3.8-flash', { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 4.5);
  });
  test('30초 Shorts 1편(입력 4K·출력 0.8K)은 1센트 미만', () => {
    const usd = estimateObserveCostUsd('gemini-3.8-flash', { inputTokens: 4_000, outputTokens: 800 });
    assert.ok(usd !== null && usd < 0.01, String(usd));
  });
  test('모르는 모델은 null — 숫자를 지어내지 않는다', () => {
    assert.equal(estimateObserveCostUsd('gemini-9', { inputTokens: 1, outputTokens: 1 }), null);
  });
});

describe('classifyObserveError — SDK ApiError.status로 가른다', () => {
  const api = (status: number) => new ApiError({ message: 'x', status });
  test('401/403 → KEY_INVALID', () => {
    assert.equal(classifyObserveError(api(401)).code, 'OBSERVE_KEY_INVALID');
    assert.equal(classifyObserveError(api(403)).code, 'OBSERVE_KEY_INVALID');
  });
  test('404 → VIDEO_UNAVAILABLE(422), 400 → BAD_REQUEST(422)', () => {
    assert.equal(classifyObserveError(api(404)).code, 'OBSERVE_VIDEO_UNAVAILABLE');
    assert.equal(classifyObserveError(api(404)).httpStatus, 422);
    assert.equal(classifyObserveError(api(400)).code, 'OBSERVE_BAD_REQUEST');
  });
  test('429 → RATE_LIMITED(429), 5xx → UPSTREAM(502)', () => {
    assert.equal(classifyObserveError(api(429)).httpStatus, 429);
    assert.equal(classifyObserveError(api(503)).code, 'OBSERVE_UPSTREAM');
  });
  test('TimeoutError → TIMEOUT(504)', () => {
    const e = new Error('t');
    e.name = 'TimeoutError';
    assert.equal(classifyObserveError(e).code, 'OBSERVE_TIMEOUT');
  });
  test('이미 ObserveError면 그대로', () => {
    const e = new ObserveError('OBSERVE_MALFORMED', 'x', 502);
    assert.equal(classifyObserveError(e), e);
  });
});

describe('observeVideo — 경계(create)를 주입해 파이프라인을 검사한다', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'AIza-test';
  });

  const withVideo = (extra: Partial<NonNullable<ObserveResponse['usage']>> = {}) => ({
    total_input_tokens: 4_000,
    total_output_tokens: 800,
    input_tokens_by_modality: [{ modality: 'text', tokens: 1_000 }, { modality: 'video', tokens: 3_000 }],
    ...extra,
  });

  test('영상 토큰이 0인 응답은 스키마가 맞아도 OBSERVE_NO_VIDEO_EVIDENCE로 버린다 (F41 날조 사례)', async () => {
    const res: ObserveResponse = {
      model: 'gemini-3.5-flash-lite',
      output_text: JSON.stringify(payload()),
      usage: { total_input_tokens: 207, total_output_tokens: 565, input_tokens_by_modality: [{ modality: 'text', tokens: 207 }], tool_use_tokens_by_modality: [{ modality: 'text', tokens: 1176 }] },
    };
    await assert.rejects(
      () => observeVideo(INPUT, async () => res, async () => null),
      (e: unknown) => e instanceof ObserveError && e.code === 'OBSERVE_NO_VIDEO_EVIDENCE',
    );
  });

  test('30분을 넘는 영상은 네트워크 전에 OBSERVE_TOO_LONG(422)', async () => {
    let called = false;
    await assert.rejects(
      () => observeVideo({ ...INPUT, durationSec: MAX_OBSERVE_SEC + 1 }, async () => { called = true; return {}; }, async () => null),
      (e: unknown) => e instanceof ObserveError && e.code === 'OBSERVE_TOO_LONG' && e.httpStatus === 422,
    );
    assert.equal(called, false);
  });

  test('output_text를 파싱해 videoId·모델·usage·비용·소요시간을 붙인다', async () => {
    const res: ObserveResponse = {
      model: 'gemini-3.8-flash',
      output_text: JSON.stringify(payload()),
      usage: withVideo(),
    };
    const obs = await observeVideo(INPUT, async () => res, async () => null);
    assert.equal(obs.videoId, 'dQw4w9WgXcQ');
    assert.equal(obs.model, 'gemini-3.8-flash');
    assert.equal(obs.processing, 'static');
    assert.equal(obs.usage.inputTokens, 4_000);
    assert.ok(obs.usage.estimatedCostUsd !== null && obs.usage.estimatedCostUsd > 0);
    assert.ok(obs.usage.elapsedMs >= 0);
    assert.match(obs.observedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(obs.thumbnailPromise.kept, 'yes');
  });

  test('output_text가 없으면 steps의 model_output에서 읽는다', async () => {
    const res: ObserveResponse = {
      steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(payload()) }] }],
      usage: withVideo({ total_input_tokens: 1, total_output_tokens: 1 }),
    };
    const obs = await observeVideo(INPUT, async () => res, async () => null);
    assert.equal(obs.language, 'ko');
    assert.equal(obs.model, DEFAULT_OBSERVE_MODEL, '응답에 모델이 없으면 요청 모델');
  });

  test('폴백 등으로 다른 모델이 응답하면 그 모델과 그 가격으로 계산한다', async () => {
    const res: ObserveResponse = { model: 'gemini-3.5-flash-lite', output_text: JSON.stringify(payload()), usage: withVideo({ total_input_tokens: 1_000_000, total_output_tokens: 0 }) };
    const obs = await observeVideo(INPUT, async () => res, async () => null);
    assert.equal(obs.model, 'gemini-3.5-flash-lite');
    assert.equal(obs.usage.estimatedCostUsd, 0.3);
  });

  test('스키마에 안 맞는 응답은 조용히 넘기지 않고 OBSERVE_MALFORMED로 던진다', async () => {
    await assert.rejects(
      () => observeVideo(INPUT, async () => ({ output_text: '{"hook":{}}', usage: withVideo() }), async () => null),
      (e: unknown) => e instanceof ObserveError && e.code === 'OBSERVE_MALFORMED',
    );
  });

  test('SDK 오류는 분류되어 나간다', async () => {
    await assert.rejects(
      () => observeVideo(INPUT, async () => { throw new ApiError({ message: 'quota', status: 429 }); }, async () => null),
      (e: unknown) => e instanceof ObserveError && e.code === 'OBSERVE_RATE_LIMITED',
    );
  });

  test('15분 영상도 static으로 보낸다', async () => {
    let sent: unknown;
    await observeVideo({ ...INPUT, durationSec: 900 }, async (req) => { sent = req; return { output_text: JSON.stringify(payload()), usage: withVideo() }; }, async () => null);
    assert.equal((sent as { input: Array<{ processing?: string }> }).input[0].processing, 'static');
  });

  test('썸네일을 받아 이미지로 첨부한다', async () => {
    let sent: { input: Array<{ type: string }> } | undefined;
    await observeVideo(
      INPUT,
      async (req) => { sent = req; return { output_text: JSON.stringify(payload()), usage: withVideo() }; },
      async () => ({ data: 'QUJD', mimeType: 'image/jpeg' }),
    );
    assert.deepEqual(sent?.input.map((c) => c.type), ['video', 'image', 'text']);
  });

  test('썸네일 수신이 실패해도 관찰은 진행한다 (이미지 없이, 지시문에 미첨부 명시)', async () => {
    let sent: { input: Array<{ type: string; text?: string }> } | undefined;
    const obs = await observeVideo(
      INPUT,
      async (req) => { sent = req; return { output_text: JSON.stringify(payload()), usage: withVideo() }; },
      async () => { throw new Error('i.ytimg.com down'); },
    );
    assert.equal(obs.videoId, INPUT.videoId);
    assert.deepEqual(sent?.input.map((c) => c.type), ['video', 'text']);
  });
});
