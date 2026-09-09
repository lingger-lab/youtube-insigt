/**
 * 영상 관찰 — Gemini가 공개 YouTube 영상을 직접 보고 기록한 결과.
 *
 * API 데이터(VideoData)가 아니라 **모델의 관찰**이다. 프롬프트에서는 `[영상관찰 #n mm:ss]` 태그로
 * `[행 n]`(사실)과 구분한다. 평가·추천은 여기 없다 — 관찰자는 본 것만 적는다.
 * 설계: docs/PLAN-영상관찰.md §3
 */

export type ThumbnailPromiseKept = 'yes' | 'partly' | 'no' | 'unknown';
export type PatternInterruptKind = '질문' | '반전' | '전환' | '자막강조' | '기타';

/** 모델이 JSON 스키마대로 돌려주는 부분. videoId·시각·usage는 앱이 붙인다. */
export interface ObservationPayload {
  /** 음성 언어(ko/en/…). 음성이 없거나 모르면 null */
  language: string | null;
  hook: {
    first3s: { visual: string; spoken: string | null; onScreenText: string | null };
    /** 실제로 말한 첫 문장 원문(25단어 이내)과 시각 "MM:SS". 없으면 null */
    firstLine: { quote: string; at: string } | null;
    /** 제목의 약속이 처음 확인되는 시각. 못 찾으면 null */
    promiseStatedAt: string | null;
  };
  /** 최대 8블록. purpose는 "무엇을 하는 구간인지"만 */
  structure: Array<{ start: string; end: string; purpose: string; device: string | null }>;
  patternInterrupts: Array<{ at: string; kind: PatternInterruptKind }>;
  thumbnailPromise: { kept: ThumbnailPromiseKept; evidence: string; at: string | null };
  cta: { present: boolean; at: string | null; text: string | null };
  faceOnCamera: 'yes' | 'no' | 'partial';
  textOverlay: 'none' | 'light' | 'heavy';
  /** 못 본 것·불확실한 것. 숨기지 않는다 */
  notes: string[];
}

export interface ObservationUsage {
  inputTokens: number;
  outputTokens: number;
  /** USD 추정. 프리뷰 동안 YouTube URL 입력은 무료이므로 "유료 전환 시" 값. 모르는 모델이면 null */
  estimatedCostUsd: number | null;
  elapsedMs: number;
}

export interface VideoObservation extends ObservationPayload {
  videoId: string;
  /** ISO 8601 */
  observedAt: string;
  /** 실제 응답 모델 */
  model: string;
  /** 정적/agentic */
  processing: 'static' | 'agentic';
  usage: ObservationUsage;
}
