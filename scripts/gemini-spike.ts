/**
 * 스파이크 — Gemini API가 공개 YouTube URL을 직접 관찰하는 경로의 실측.
 *
 * 설계(docs/PLAN-영상관찰.md)에서 키 없이는 못 잰 것만 잰다:
 *   편당 지연 · 토큰 · 구조화 출력 유효성 · Shorts를 watch URL로 넘겨도 되는지 · 한국어 인용 품질
 *
 * 의존성 없이 REST로 부른다(설계 확정 전이라 @google/genai를 아직 넣지 않는다).
 *
 *   GEMINI_API_KEY=... node --env-file=.env.local scripts/gemini-spike.ts <videoId> [<videoId> ...]
 *   옵션: GEMINI_MODEL(기본 gemini-3.8-flash) · GEMINI_PROCESSING(static|agentic, 기본 static)
 *
 * 비용: 프리뷰 동안 YouTube URL 입력은 무료. 무료 티어 하루 8시간분 한도를 쓴다.
 * 결과는 measure-out/gemini-spike-<시각>.json 에 남긴다 (관찰 원문 + usage + 지연).
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
const PROCESSING = process.env.GEMINI_PROCESSING ?? 'static';
const ids = process.argv.slice(2);

if (!KEY) {
  console.error('GEMINI_API_KEY 가 없습니다. AI Studio에서 무료 키를 만들어 .env.local 에 넣으세요.');
  process.exit(1);
}
if (ids.length === 0) {
  console.log('사용법: node --env-file=.env.local scripts/gemini-spike.ts <videoId> [...]  (하루 8시간분 무료 한도 소비)');
  process.exit(0);
}

/** 설계 §3의 스키마를 그대로. 모델이 이 모양으로만 답하게 한다. */
const schema = {
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
};

const INSTRUCTION = `당신은 영상을 본 그대로만 기록하는 관찰자입니다. 평가·추천·추측은 하지 않습니다.
규칙:
- 화면에 보이거나 소리로 들리는 것만 적는다. 모르면 null 또는 "unknown".
- 인용(quote)은 실제로 말한 문장을 원문 그대로, 25단어 이내. 없으면 null.
- 모든 시각은 MM:SS. 시각 없는 관찰은 적지 않는다.
- thumbnailPromise: 제목/썸네일이 약속한 것이 본편에서 실제로 보이는지. 근거(evidence)에 시각을 적는다.
- structure: 최대 8블록. purpose는 "무엇을 하는 구간인지"만(좋다/나쁘다 금지).
- notes: 못 본 것, 불확실한 것, 음성이 안 들리는 구간 등을 숨기지 말고 적는다.
제목: "{TITLE}"`;

interface Result {
  videoId: string;
  url: string;
  ok: boolean;
  status: number;
  elapsedMs: number;
  usage?: Record<string, unknown>;
  parsed?: unknown;
  schemaOk?: boolean;
  error?: string;
  rawText?: string;
}

async function observe(videoId: string): Promise<Result> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const body = {
    model: MODEL,
    store: false,
    input: [
      { type: 'video', uri: url, processing: PROCESSING },
      { type: 'text', text: INSTRUCTION.replace('{TITLE}', '(제목 미제공 — 영상에서 확인)') },
    ],
    response_format: { type: 'text', mime_type: 'application/json', schema },
    generation_config: { thinking_level: 'low' },
  };
  const t0 = Date.now();
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY as string, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  }).catch((e: unknown) => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
  const elapsedMs = Date.now() - t0;
  const text = await res.text();

  if (!res.ok) return { videoId, url, ok: false, status: res.status, elapsedMs, error: text.slice(0, 600) };

  const json = JSON.parse(text) as { usage?: Record<string, unknown>; steps?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };
  const out = json.steps?.find((s) => s.type === 'model_output')?.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed: unknown;
  let schemaOk = false;
  try {
    parsed = JSON.parse(out);
    const p = parsed as Record<string, unknown>;
    schemaOk = typeof p === 'object' && p !== null && 'hook' in p && 'structure' in p && 'thumbnailPromise' in p && Array.isArray(p.notes);
  } catch {
    parsed = undefined;
  }
  return { videoId, url, ok: true, status: res.status, elapsedMs, usage: json.usage, parsed, schemaOk, rawText: schemaOk ? undefined : out.slice(0, 600) };
}

const results: Result[] = [];
console.log(`모델 ${MODEL} · 모드 ${PROCESSING} · ${ids.length}편 순차 실행\n`);
for (const id of ids) {
  const r = await observe(id);
  results.push(r);
  const hook = (r.parsed as { hook?: { firstLine?: { quote: string; at: string } | null; first3s?: { visual: string } } } | undefined)?.hook;
  console.log(
    `${r.ok ? 'OK ' : 'ERR'} ${id} ${String(r.elapsedMs).padStart(6)}ms status=${r.status} schema=${r.schemaOk ?? '-'} usage=${JSON.stringify(r.usage ?? {})}`,
  );
  if (hook) console.log(`     첫3초: ${hook.first3s?.visual?.slice(0, 80)} | 첫 문장: ${hook.firstLine ? `"${hook.firstLine.quote}" @${hook.firstLine.at}` : 'null'}`);
  if (r.error) console.log(`     ${r.error.slice(0, 200)}`);
}

const okRuns = results.filter((r) => r.ok);
const lat = okRuns.map((r) => r.elapsedMs).sort((a, b) => a - b);
const p = (q: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] : null);
console.log(`\n성공 ${okRuns.length}/${results.length} · 스키마 유효 ${okRuns.filter((r) => r.schemaOk).length} · 지연 p50 ${p(0.5)}ms p95 ${p(0.95)}ms · 판정: ${p(0.95) !== null && (p(0.95) as number) < 40_000 ? '동기 설계 OK' : 'background/poll 검토'}`);

mkdirSync('measure-out', { recursive: true });
const file = `measure-out/gemini-spike-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ model: MODEL, processing: PROCESSING, results }, null, 2));
console.log(`원본 → ${file}`);
