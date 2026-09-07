import Anthropic from '@anthropic-ai/sdk';
import { fetchThumbnail } from '../youtube/thumbnail.ts';

/**
 * 앱 내 LLM 분석 (선택 기능, 기본 꺼짐).
 *
 * 클립보드 경로와 달리 이 경로는 (1) 썸네일을 이미지 블록으로 자동 첨부하고
 * (2) 결과를 앱 안에서 보여준다. 대신 **돈이 든다.** 그래서:
 * - ANTHROPIC_API_KEY가 없으면 기능 전체가 비활성이고 UI 버튼도 잠긴다
 * - 응답마다 토큰 사용량과 추정 비용을 클라이언트에 그대로 돌려준다
 * - 키는 서버 전용이다. NEXT_PUBLIC_ 접두사 금지
 */

/** 스킬 캐시(2026-06-24) 기준 모델 ID. 날짜 접미사를 붙이지 말 것. */
export const DEFAULT_MODEL = 'claude-opus-5';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** 이미지 12장 + 표 20행 + 해설이면 넉넉하다. 스트리밍으로 받으므로 HTTP 타임아웃은 문제 없다. */
const MAX_TOKENS = 16_000;
/** Vercel Hobby 함수 상한(60s) 안에서 끝내기 위한 SDK 타임아웃 (ms). Fluid compute면 300s까지 가능. */
const REQUEST_TIMEOUT_MS = 55_000;
/** 상위·하위군 각 10 = 20장 상한. hqdefault(480×360)는 장당 ≈230 토큰. */
export const MAX_IMAGES = 20;

/**
 * 1M 토큰당 USD. 스킬 캐시(2026-06-24). 표시용 추정치이며 청구 근거가 아니다.
 * 모르는 모델(폴백 등)은 null — 숫자를 지어내지 않는다.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5-1': { input: 10, output: 50 },
};

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AnalysisResult {
  text: string;
  /** 실제로 응답한 모델. 폴백이 걸리면 요청한 모델과 다를 수 있다. */
  model: string;
  stopReason: string | null;
  usage: LlmUsage;
  /** USD. 가격표에 없는 모델이면 null. */
  estimatedCostUsd: number | null;
  attachedImages: number;
}

export type LlmErrorCode =
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_KEY_INVALID'
  | 'LLM_RATE_LIMITED'
  | 'LLM_BAD_REQUEST'
  | 'LLM_TIMEOUT'
  | 'LLM_UPSTREAM'
  | 'LLM_REFUSED'
  | 'LLM_TRUNCATED';

const USER_MESSAGE: Record<LlmErrorCode, string> = {
  LLM_NOT_CONFIGURED: '앱 내 분석이 설정되지 않았습니다 (서버에 ANTHROPIC_API_KEY 없음).',
  LLM_KEY_INVALID: 'LLM API 키가 유효하지 않습니다.',
  LLM_RATE_LIMITED: 'LLM 요청이 제한되었습니다. 잠시 후 다시 시도해 주세요.',
  LLM_BAD_REQUEST: 'LLM 요청 형식이 잘못되었습니다.',
  LLM_TIMEOUT: '분석이 제한 시간(60초) 안에 끝나지 않았습니다. 이미지 수를 줄이거나 다시 시도해 주세요.',
  LLM_UPSTREAM: 'LLM 서비스가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  LLM_REFUSED: 'LLM이 이 요청의 처리를 거부했습니다.',
  LLM_TRUNCATED: '응답이 길이 제한에 걸려 잘렸습니다. 요청을 나눠 다시 시도해 주세요.',
};

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly httpStatus: number;
  constructor(code: LlmErrorCode, detail: string, httpStatus: number) {
    super(detail);
    this.name = 'LlmError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
  get userMessage(): string {
    return USER_MESSAGE[this.code];
  }
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function configuredModel(): string {
  return process.env.LLM_MODEL || DEFAULT_MODEL;
}

function configuredEffort(): Effort {
  const raw = process.env.LLM_EFFORT as Effort | undefined;
  return raw && EFFORTS.includes(raw) ? raw : 'high';
}

/** 순수 함수: 이미지 블록을 텍스트 앞에 둔다 (공식 권장 순서). */
export function buildContent(
  prompt: string,
  images: { data: string; mediaType: 'image/jpeg' | 'image/png' }[],
): Anthropic.Beta.BetaContentBlockParam[] {
  return [
    ...images.map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
    })),
    { type: 'text' as const, text: prompt },
  ];
}

/** 순수 함수: 표시용 비용 추정. 캐시 읽기는 입력의 10%, 캐시 쓰기는 125%로 잡는다. */
export function estimateCostUsd(model: string, usage: LlmUsage): number | null {
  const price = PRICE_PER_MTOK[model];
  if (!price) return null;
  const input =
    (usage.inputTokens * price.input +
      usage.cacheReadTokens * price.input * 0.1 +
      usage.cacheWriteTokens * price.input * 1.25) /
    1_000_000;
  const output = (usage.outputTokens * price.output) / 1_000_000;
  return Math.round((input + output) * 10_000) / 10_000;
}

/**
 * 순수 함수: SDK 오류를 앱 오류로 바꾼다. 가장 구체적인 클래스부터 본다.
 * 문자열 매칭은 하지 않는다 — 타입이 있다.
 */
export function classifyLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new LlmError('LLM_KEY_INVALID', `인증 실패 (${error.status})`, 502);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmError('LLM_RATE_LIMITED', `요청 제한 (${error.status})`, 429);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new LlmError('LLM_BAD_REQUEST', `잘못된 요청: ${error.message}`, 400);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError('LLM_TIMEOUT', '타임아웃', 504);
  }
  if (error instanceof Anthropic.APIError) {
    return new LlmError('LLM_UPSTREAM', `업스트림 ${error.status ?? '?'}: ${error.message}`, 502);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmError('LLM_UPSTREAM', `연결 실패: ${error.message}`, 502);
  }
  return new LlmError('LLM_UPSTREAM', error instanceof Error ? error.message : String(error), 502);
}

async function loadImages(videoIds: string[]): Promise<{ data: string; mediaType: 'image/jpeg' }[]> {
  // LLM에는 maxres가 필요 없다. hq(480×360)가 토큰 대비 충분하다.
  const fetched = await Promise.all(videoIds.slice(0, MAX_IMAGES).map((id) => fetchThumbnail(id, ['hqdefault', 'mqdefault'])));
  return fetched
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({ data: Buffer.from(t.bytes).toString('base64'), mediaType: 'image/jpeg' as const }));
}

const SYSTEM_PROMPT = `당신은 사용자가 준 YouTube 데이터를 분석합니다. 사용자 메시지 안의 '작성 규칙'과 '이 데이터에 없는 것'을 그대로 따르세요. 표에 없는 것을 추측으로 메우지 말고, 첨부된 썸네일 이미지의 #번호는 표의 행 번호와 같습니다.`;

/**
 * 프롬프트(+썸네일)를 Claude에 보내고 텍스트를 받는다.
 *
 * 스트리밍으로 받아 finalMessage()로 모은다 — 긴 출력에서 HTTP 타임아웃을
 * 피하기 위해서다. 클라이언트에는 완성본만 돌려준다 (스트리밍 UI는 보류).
 * Opus 5 기본값대로 thinking은 adaptive(생략), 서버측 refusal fallback을 켠다.
 */
export async function runAnalysis(input: { prompt: string; thumbnailVideoIds: string[] }): Promise<AnalysisResult> {
  if (!isLlmConfigured()) {
    throw new LlmError('LLM_NOT_CONFIGURED', 'ANTHROPIC_API_KEY 없음', 503);
  }

  const images = await loadImages(input.thumbnailVideoIds);
  const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 });
  const model = configuredModel();

  try {
    const response = await client.beta.messages
      .stream({
        model,
        max_tokens: MAX_TOKENS,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: configuredEffort() },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildContent(input.prompt, images) }],
      })
      .finalMessage();

    if (response.stop_reason === 'refusal') {
      throw new LlmError('LLM_REFUSED', `거부: ${response.stop_details?.explanation ?? ''}`, 422);
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const usage: LlmUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };

    if (response.stop_reason === 'max_tokens') {
      // 잘린 결과를 완성본처럼 돌려주지 않는다. 다만 사용량은 기록에 남긴다.
      console.warn('[llm/analyze] max_tokens 도달', { model: response.model, usage });
      throw new LlmError('LLM_TRUNCATED', `max_tokens ${MAX_TOKENS} 도달`, 502);
    }

    return {
      text,
      model: response.model,
      stopReason: response.stop_reason,
      usage,
      estimatedCostUsd: estimateCostUsd(response.model, usage),
      attachedImages: images.length,
    };
  } catch (error) {
    throw classifyLlmError(error);
  }
}
