import { GoogleGenAI, ApiError } from '@google/genai';
import { z } from 'zod';
import type { ObservationPayload, VideoObservation } from '../../types/observation.ts';

/**
 * 영상 관찰 (선택 기능, 기본 꺼짐) — Gemini API에 공개 YouTube URL을 넘겨 영상을 직접 보게 한다.
 *
 * 앱은 영상을 받지 않는다(URL만 넘김) — YouTube 개발자 정책 III.E.1(다운로드·캐시 금지) 비해당.
 * 관찰자는 본 것·들은 것만 적고 평가·추천은 하지 않는다. 그건 다음 단계 LLM의 일이다.
 *
 * - GEMINI_API_KEY 없으면 기능 전체가 비활성 (네트워크 전에 차단)
 * - 편당 1요청. 부분 실패 격리·Vercel 60초·편별 캐시를 위해 묶지 않는다
 * - 응답은 JSON Schema로 강제하고 서버에서 zod로 다시 검증한다. 안 맞으면 조용히 버리지 않고 던진다
 * - store:false — 관찰은 우리 보관함(30일)에 있고 Google 측 보관은 불필요
 * 설계: docs/PLAN-영상관찰.md
 */

export const DEFAULT_OBSERVE_MODEL = 'gemini-3.8-flash';
/** 문서 권고: 5분 미만 클립은 static, 그 이상은 agentic(필요한 구간만 로드, 최대 88% 절감) */
export const AGENTIC_MIN_SEC = 300;
/** Vercel Hobby 함수 상한(60s) 안에서 끝내기 위한 상한 (ms) */
const REQUEST_TIMEOUT_MS = 55_000;

/**
 * 1M 토큰당 USD (ai.google.dev/gemini-api/docs/pricing, 2026-09 기준, 2026-12-31까지 요율).
 * 표시용 추정치. YouTube URL 입력은 프리뷰 동안 무료이므로 "유료 전환 시" 값이다. 모르는 모델은 null.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.7-flash': { input: 0.75, output: 3.75 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
};

export type ObserveErrorCode =
  | 'OBSERVE_NOT_CONFIGURED'
  | 'OBSERVE_KEY_INVALID'
  | 'OBSERVE_VIDEO_UNAVAILABLE'
  | 'OBSERVE_BAD_REQUEST'
  | 'OBSERVE_RATE_LIMITED'
  | 'OBSERVE_TIMEOUT'
  | 'OBSERVE_UPSTREAM'
  | 'OBSERVE_MALFORMED';

const USER_MESSAGE: Record<ObserveErrorCode, string> = {
  OBSERVE_NOT_CONFIGURED: '영상 관찰이 설정되지 않았습니다 (서버에 GEMINI_API_KEY 없음).',
  OBSERVE_KEY_INVALID: 'Gemini API 키가 유효하지 않습니다.',
  OBSERVE_VIDEO_UNAVAILABLE: '이 영상은 관찰할 수 없습니다 (비공개·삭제·일부공개·연령제한 등).',
  OBSERVE_BAD_REQUEST: '관찰 요청이 거부되었습니다. 영상이 공개 상태인지 확인해 주세요.',
  OBSERVE_RATE_LIMITED: 'Gemini 요청이 제한되었습니다 (분당 한도 또는 무료 티어 하루 8시간분). 잠시 후 다시 시도해 주세요.',
  OBSERVE_TIMEOUT: '관찰이 제한 시간(55초) 안에 끝나지 않았습니다. 긴 영상은 나중에 다시 시도해 주세요.',
  OBSERVE_UPSTREAM: 'Gemini 서비스가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  OBSERVE_MALFORMED: '관찰 결과가 정해진 형식이 아니어서 버렸습니다. 다시 시도해 주세요.',
};

export class ObserveError extends Error {
  readonly code: ObserveErrorCode;
  readonly httpStatus: number;
  constructor(code: ObserveErrorCode, detail: string, httpStatus: number) {
    super(detail);
    this.name = 'ObserveError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
  get userMessage(): string {
    return USER_MESSAGE[this.code];
  }
}

export function isObserveConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function configuredObserveModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_OBSERVE_MODEL;
}

export function processingModeFor(durationSec: number): 'static' | 'agentic' {
  return durationSec >= AGENTIC_MIN_SEC ? 'agentic' : 'static';
}

/** 순수 함수: 표시용 비용 추정. 프리뷰 동안은 실제 청구 0. */
export function estimateObserveCostUsd(model: string, usage: { inputTokens: number; outputTokens: number }): number | null {
  const price = PRICE_PER_MTOK[model];
  if (!price) return null;
  const usd = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return Math.round(usd * 10_000) / 10_000;
}

/** 모델에게 강제하는 JSON Schema. types/observation.ts의 ObservationPayload와 같은 모양이어야 한다 (테스트가 고정). */
export const OBSERVATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: ['string', 'null'] },
    hook: {
      type: 'object',
      properties: {
        first3s: {
          type: 'object',
          properties: {
            visual: { type: 'string' },
            spoken: { type: ['string', 'null'] },
            onScreenText: { type: ['string', 'null'] },
          },
          required: ['visual', 'spoken', 'onScreenText'],
        },
        firstLine: {
          type: ['object', 'null'],
          properties: { quote: { type: 'string' }, at: { type: 'string' } },
          required: ['quote', 'at'],
        },
        promiseStatedAt: { type: ['string', 'null'] },
      },
      required: ['first3s', 'firstLine', 'promiseStatedAt'],
    },
    structure: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
          purpose: { type: 'string' },
          device: { type: ['string', 'null'] },
        },
        required: ['start', 'end', 'purpose', 'device'],
      },
    },
    patternInterrupts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { at: { type: 'string' }, kind: { type: 'string', enum: ['질문', '반전', '전환', '자막강조', '기타'] } },
        required: ['at', 'kind'],
      },
    },
    thumbnailPromise: {
      type: 'object',
      properties: {
        kept: { type: 'string', enum: ['yes', 'partly', 'no', 'unknown'] },
        evidence: { type: 'string' },
        at: { type: ['string', 'null'] },
      },
      required: ['kept', 'evidence', 'at'],
    },
    cta: {
      type: 'object',
      properties: { present: { type: 'boolean' }, at: { type: ['string', 'null'] }, text: { type: ['string', 'null'] } },
      required: ['present', 'at', 'text'],
    },
    faceOnCamera: { type: 'string', enum: ['yes', 'no', 'partial'] },
    textOverlay: { type: 'string', enum: ['none', 'light', 'heavy'] },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['language', 'hook', 'structure', 'patternInterrupts', 'thumbnailPromise', 'cta', 'faceOnCamera', 'textOverlay', 'notes'],
} as const;

const Timestamp = z.string().regex(/^\d{1,3}:\d{2}$/, 'MM:SS');

/** 서버 재검증. 모델이 스키마를 지켰다고 믿지 않는다. */
export const ObservationPayloadSchema: z.ZodType<ObservationPayload> = z.object({
  language: z.string().nullable(),
  hook: z.object({
    first3s: z.object({ visual: z.string(), spoken: z.string().nullable(), onScreenText: z.string().nullable() }),
    firstLine: z.object({ quote: z.string().min(1), at: Timestamp }).nullable(),
    promiseStatedAt: Timestamp.nullable(),
  }),
  structure: z.array(z.object({ start: Timestamp, end: Timestamp, purpose: z.string(), device: z.string().nullable() })).max(8),
  patternInterrupts: z.array(z.object({ at: Timestamp, kind: z.enum(['질문', '반전', '전환', '자막강조', '기타']) })),
  thumbnailPromise: z.object({ kept: z.enum(['yes', 'partly', 'no', 'unknown']), evidence: z.string(), at: Timestamp.nullable() }),
  cta: z.object({ present: z.boolean(), at: Timestamp.nullable(), text: z.string().nullable() }),
  faceOnCamera: z.enum(['yes', 'no', 'partial']),
  textOverlay: z.enum(['none', 'light', 'heavy']),
  notes: z.array(z.string()),
});

export interface ObserveInput {
  videoId: string;
  /** 제목. 관찰자가 "제목의 약속"을 확인하는 기준 */
  title: string;
  durationSec: number;
}

export const OBSERVER_INSTRUCTION = `당신은 영상을 본 그대로만 기록하는 관찰자입니다. 평가·추천·추측은 하지 않습니다.
규칙:
- 화면에 보이거나 소리로 들리는 것만 적는다. 모르면 null 또는 "unknown".
- 인용(quote)은 실제로 말한 문장을 원문 그대로, 25단어 이내. 없으면 null.
- 모든 시각은 MM:SS. 시각 없는 관찰은 적지 않는다.
- thumbnailPromise: 제목이 약속한 것이 본편에서 실제로 보이는지. evidence에 시각을 적는다.
- structure: 최대 8블록. purpose는 "무엇을 하는 구간인지"만(좋다/나쁘다 금지).
- notes: 못 본 것, 불확실한 것, 음성이 안 들리는 구간 등을 숨기지 말고 적는다.`;

/** 요청 본문 — SDK 타입을 그대로 쓰지 않고 우리가 보내는 모양을 고정한다 (테스트가 검사). */
export interface ObserveRequest {
  model: string;
  store: false;
  input: Array<
    | { type: 'video'; uri: string; processing: 'static' | 'agentic' }
    | { type: 'text'; text: string }
  >;
  response_format: { type: 'text'; mime_type: 'application/json'; schema: typeof OBSERVATION_JSON_SCHEMA };
  generation_config: { thinking_level: 'low' };
}

/** 순수 함수. YouTube URL은 watch 형식으로 통일한다 (Shorts도 같은 ID로 열린다). */
export function buildObserveRequest(input: ObserveInput, model: string): ObserveRequest {
  return {
    model,
    store: false,
    input: [
      { type: 'video', uri: `https://www.youtube.com/watch?v=${input.videoId}`, processing: processingModeFor(input.durationSec) },
      { type: 'text', text: `${OBSERVER_INSTRUCTION}\n제목: "${input.title.replace(/"/g, "'")}"` },
    ],
    response_format: { type: 'text', mime_type: 'application/json', schema: OBSERVATION_JSON_SCHEMA },
    generation_config: { thinking_level: 'low' },
  };
}

/** 순수 함수: 모델 출력 텍스트 → 검증된 관찰. 스키마 불일치는 던진다. */
export function parseObservationText(text: string): ObservationPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ObserveError('OBSERVE_MALFORMED', `JSON 파싱 실패: ${text.slice(0, 200)}`, 502);
  }
  const result = ObservationPayloadSchema.safeParse(raw);
  if (!result.success) {
    throw new ObserveError('OBSERVE_MALFORMED', `스키마 불일치: ${result.error.issues[0]?.path.join('.')} — ${result.error.issues[0]?.message}`, 502);
  }
  return result.data;
}

/** 순수 함수: SDK 오류를 앱 오류로. 타입(ApiError.status)으로 가르고 문자열 매칭은 최소화한다. */
export function classifyObserveError(error: unknown): ObserveError {
  if (error instanceof ObserveError) return error;
  if (error instanceof ApiError) {
    const s = error.status;
    if (s === 401 || s === 403) return new ObserveError('OBSERVE_KEY_INVALID', `인증 실패 (${s}): ${error.message}`, 502);
    if (s === 404) return new ObserveError('OBSERVE_VIDEO_UNAVAILABLE', `찾을 수 없음 (404): ${error.message}`, 422);
    if (s === 400) return new ObserveError('OBSERVE_BAD_REQUEST', `거부됨 (400): ${error.message}`, 422);
    if (s === 429) return new ObserveError('OBSERVE_RATE_LIMITED', `제한 (429): ${error.message}`, 429);
    if (s >= 500) return new ObserveError('OBSERVE_UPSTREAM', `업스트림 (${s}): ${error.message}`, 502);
    return new ObserveError('OBSERVE_UPSTREAM', `알 수 없는 상태 (${s}): ${error.message}`, 502);
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new ObserveError('OBSERVE_TIMEOUT', error.message, 504);
  }
  return new ObserveError('OBSERVE_UPSTREAM', error instanceof Error ? error.message : String(error), 502);
}

/** 응답에서 우리가 쓰는 부분만. SDK 타입 전체에 결합하지 않는다. */
export interface ObserveResponse {
  model?: string;
  output_text?: string;
  steps?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
}

export type ObserveCreate = (request: ObserveRequest) => Promise<ObserveResponse>;

/** 실제 SDK 호출. 테스트는 이 함수를 주입으로 대체한다. */
const sdkCreate: ObserveCreate = async (request) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // SDK 요청 타입은 넓은 유니온이라 우리 고정 모양을 그대로 넘긴다.
  const interaction = await ai.interactions.create(request as Parameters<typeof ai.interactions.create>[0], {
    timeout: REQUEST_TIMEOUT_MS,
  });
  return interaction as ObserveResponse;
};

function outputTextOf(res: ObserveResponse): string {
  if (res.output_text) return res.output_text;
  const step = res.steps?.find((s) => s.type === 'model_output');
  return step?.content?.find((c) => c.type === 'text')?.text ?? '';
}

/**
 * 영상 1편 관찰. 키가 없으면 네트워크에 나가기 전에 던진다.
 * 반환값에는 usage·추정 비용·소요 시간이 항상 들어간다 (비용이 안 보이는 경로 금지).
 */
export async function observeVideo(input: ObserveInput, create: ObserveCreate = sdkCreate): Promise<VideoObservation> {
  if (!isObserveConfigured()) {
    throw new ObserveError('OBSERVE_NOT_CONFIGURED', 'GEMINI_API_KEY 미설정', 503);
  }
  const model = configuredObserveModel();
  const request = buildObserveRequest(input, model);
  const t0 = Date.now();

  let response: ObserveResponse;
  try {
    response = await create(request);
  } catch (error) {
    throw classifyObserveError(error);
  }
  const elapsedMs = Date.now() - t0;

  const payload = parseObservationText(outputTextOf(response));
  const usage = {
    inputTokens: response.usage?.total_input_tokens ?? 0,
    outputTokens: response.usage?.total_output_tokens ?? 0,
  };
  const respondedModel = response.model ?? model;

  return {
    ...payload,
    videoId: input.videoId,
    observedAt: new Date().toISOString(),
    model: respondedModel,
    processing: request.input[0].type === 'video' ? request.input[0].processing : 'static',
    usage: { ...usage, estimatedCostUsd: estimateObserveCostUsd(respondedModel, usage), elapsedMs },
  };
}
