# 계획 — Gemini 영상 관찰 경로 (자막·훅·전개·썸네일 약속 이행을 "없음"에서 빼기)

작성 2026-09-09. 상태: **실측 통과(2026-09-14)** — 선행: [RESEARCH-없는것.md](RESEARCH-없는것.md). 결과는 ISSUES V.7·FINDINGS F36~F40.
남은 결정: 기본 모델(3.8 Flash ↔ 3.5 Flash-Lite), 묶음 요청 옵션. 20편 수집·외부 LLM 실효성은 그 뒤.
구현: `server/llm/observe.ts`(SDK 호출·JSON Schema·zod 재검증·오류 분류·비용), `api/observe`, `utils/observeClient.ts`(병렬 3·429 백오프),
보관함 `observations`(30일), 프롬프트 "영상 관찰" 절 + `[영상관찰 #n mm:ss]` 태그, `ObserveButton`(대조군 20편·카드 단건).
키 없이 검증: GET enabled:false·POST 503·버튼 미표시·저장된 관찰이 프롬프트에 실림. 남은 것은 §0 "키 없이는 못 잰 것" = ISSUES V.7.

## 0. 조사 결과 (공식 문서 기준, 2026-09-03~04 갱신본)

| 항목 | 사실 | 출처 |
|---|---|---|
| 입력 방식 | `interactions.create({ model, input: [{type:'video', uri:'https://www.youtube.com/watch?v=…'}, {type:'text', text}] })`. 공개 영상만(비공개·일부공개 불가) | video-understanding |
| 상태 | YouTube URL 입력은 **프리뷰, 무료**. "요금·제한은 바뀔 수 있음" | video-understanding |
| 한도 | 무료 티어 **하루 8시간분**, 요청당 최대 10편. RPM/RPD는 프로젝트별(AI Studio에서만 확인, 문서에서 표 삭제됨) | video-understanding, rate-limits |
| **무료 티어 RPD (2026-09-14 재조사)** | Google이 표를 지워 **비공식 실측만 있음**: 3.8 Flash **≈20 요청/일**(2026-09-02 실측 글 + 공식 포럼의 "20 RPD 너무 적다" 스레드), 3.5 Flash-Lite ≈500/일(별도 버킷, 출처 1). 편당 1요청 설계에선 **8시간보다 이게 먼저 걸린다** — 20편 수집 = 하루 1회. 키 발급 후 AI Studio 값으로 확정 | dev.to/romeroyang, discuss.ai.google.dev/t/180609, github prathame/DG-ERP#505 |
| "YouTube URL 무료"의 범위 | 공식 문구는 "기능이 프리뷰이며 무료(no charge)"까지. **영상 토큰이 유료 티어에서 과금되는지는 공개 문서로 확정 못 함** → 보수적으로 "일반 토큰 요율로 과금"으로 추정. 스파이크의 `usage.total_input_tokens`로 토큰이 세지는지 확인 | video-understanding(문구), 미확정 |
| 토큰(정적 모드) | 초당 약 100(기본/low 해상도, 프레임 70 + 오디오 32) ~ 300(high). 30초 Shorts ≈ 3,000 토큰, 10분 롱폼 ≈ 60,000 | video-understanding, media-resolution, tokens |
| agentic 모드 | 3.8/3.7/3.6 Flash, 3.5 Flash-Lite. 자막·프레임·오디오를 필요한 만큼만 로드. 긴 영상은 최대 88% 절감. 5분 미만 클립은 정적 모드 권장 | video-understanding |
| 요금(유료 전환 시) | 3.8 Flash 입력 $0.75 / 출력 $3.75 per 1M (2026-12-31까지, 이후 2배). 3.5 Flash-Lite 입력 $0.30 / 출력 $2.50 | pricing |
| 1편 추정 비용 | 30초 Shorts: 입력 ~4K(영상 3K + 프롬프트 1K) + 출력 ~0.8K → 3.8 Flash **≈ $0.006**, Flash-Lite ≈ $0.003. 10분 롱폼(정적): ≈ $0.05 / agentic ≈ $0.01 | 계산 |
| 구조화 출력 | `response_format: {type:'text', mime_type:'application/json', schema}` JSON Schema. JS SDK는 zod 변환 지원 | structured-output |
| 타임스탬프 질의 | 프롬프트에 `MM:SS`로 특정 구간 질의 가능 | video-understanding |
| 응답 usage | `usage.total_input_tokens / total_output_tokens / total_tokens` (+ agentic: `total_thought_tokens`, `total_tool_use_tokens`) | tokens, get-started |
| 저장 | Interactions API는 기본 `store=true`(무료 1일, 유료 55일 보관). `store:false`로 끌 수 있음 | interactions |
| 데이터 사용 | 무료 티어: "제품 개선에 사용됨: 예". 유료: 아니오 | pricing |
| SDK | `@google/genai` 2.21.0, Node ≥20, ESM/CJS. Interactions API는 2.3.0+ | npm |
| 타임아웃 | 긴 처리는 `stream:true` 또는 `background:true` 권장(동기 요청은 401/타임아웃 가능) | video-understanding |
| YouTube 정책 | 앱은 URL만 넘기고 영상을 받지 않음 → III.E.1(다운로드·캐시 금지) 비해당. 비문서 API(III.D.7) 미사용 | developer-policies |

### 키 없이는 못 잰 것 — 2026-09-14 실측 결과
1. ~~실제 지연~~ **static: Shorts 3.3~15.7s, 15분 롱폼 9.6s(Lite)·** agentic은 110s(3.8 Flash) → static만 쓴다
2. ~~Shorts URL~~ `watch?v=ID`로 됨
3. ~~관찰 품질~~ 첫 문장 인용이 두 모델 동일 + **실영상 육안 대조 일치**. 단 **agentic(Lite)은 날조**(F41) → 영상 토큰 0 방어
4. 무료 티어 RPM/RPD: 11요청까지 429 없음. 정확한 한도는 미확인
5. 존재하지 않는 ID → 400 `invalid_request`. 비공개·연령제한·라이브는 미확인

→ `scripts/gemini-spike.ts` (REST, 의존성 0). `GEMINI_API_KEY`(AI Studio 무료 키)만 있으면 실행.

## 1. 목표

프롬프트의 "이 데이터에 없는 것"에서 **자막·첫 3초 훅·전개·썸네일 약속 이행**을 실제 관찰로 채운다.
관찰은 API 데이터가 아니라 **모델(Gemini)이 영상을 본 결과**이므로 `[영상관찰 #n mm:ss]` 태그로
`[행 n]`(사실)과 구분한다. 시청지속률·CTR·노출은 여전히 없음(진짜 불가).

## 2. 결정 사항 (권고안 — 반대 없으면 이대로)

| 결정 | 권고 | 이유 |
|---|---|---|
| 모델 기본값 | `gemini-3.8-flash`, `GEMINI_MODEL`로 교체 가능 | 원문 인용·타임스탬프 지시 준수가 핵심. 비용 차이(편당 $0.003)는 무시 가능. Flash-Lite는 스파이크에서 품질 비교 후 기본값 변경 검토 |
| 처리 모드 | ~~<5분 static / ≥5분 agentic~~ → **항상 static, 30분 상한** (2026-09-14 수정) | 실측 F41: Lite agentic이 15분 영상을 날조(영상 토큰 0), 3.8 Flash agentic은 정확하나 110초. static은 Lite 9.6초·85K 토큰·정확 |
| 날조 방어 | `usage`에 video/image 토큰이 0이면 `OBSERVE_NO_VIDEO_EVIDENCE`로 폐기 | 스키마 검증은 날조를 못 잡는다. 토큰 증거가 유일한 신호 |
| 해상도 | 기본(unspecified ≈ low, 70토큰/초) | 훅·구조 관찰엔 충분. 썸네일 대비는 이미 이미지가 있음 |
| 요청 단위 | **영상 1편 = 요청 1개**, 클라이언트가 병렬 3으로 호출 | 부분 실패 격리, Vercel 60초, 편별 캐시, 진행률 표시. 10편 묶음 요청은 한 편이 죽으면 전부 죽는다 |
| 실행 시점 | **버튼**("영상 관찰 수집") — 자동 아님 | 하루 8시간 한도·비용이 보이게. 대상은 대조군(상위 10 + 하위 10), 카드 단건도 가능 |
| 저장 | 보관함에 `observations`(videoId 키), **30일 만료**(기존 정책 규칙과 동일) | 재검색 시 같은 영상은 재호출 안 함 |
| Gemini 측 저장 | `store: false` | 우리가 보관하므로 Google 측 보관 불필요. background 미사용이라 가능 |
| 출력 형식 | JSON Schema(구조화 출력) + 서버 zod 재검증 | 파싱 실패를 조용히 넘기지 않기 위해 |
| 앱 내 Claude 분석과의 관계 | 관찰은 **프롬프트에 실리는 데이터**. Claude 경로는 그대로 | 벤더 역할 분리: Gemini = 영상을 본다, Claude/외부 LLM = 분석·시안 |
| 비용 표시 | 편당·합계 토큰과 추정 USD, "프리뷰 무료" 표기, 이번 실행이 보낸 영상 분(分) | 기존 규칙: 비용이 안 보이는 경로 금지 |

## 3. 관찰 스키마 (모델에게 강제하는 JSON)

```ts
interface VideoObservation {
  videoId: string;
  observedAt: string;              // ISO, 앱이 채움
  model: string;                   // 실제 응답 모델
  language: string | null;         // 음성 언어(ko/en/…), 없으면 null
  hook: {
    first3s: { visual: string; spoken: string | null; onScreenText: string | null };
    firstLine: { quote: string; at: string } | null;   // 원문 그대로, 25단어 이내, "MM:SS"
    promiseStatedAt: string | null;                    // 제목의 약속이 처음 확인되는 시점
  };
  structure: Array<{ start: string; end: string; purpose: string; device: string | null }>; // 블록 ≤ 8
  patternInterrupts: Array<{ at: string; kind: '질문' | '반전' | '전환' | '자막강조' | '기타' }>;
  thumbnailPromise: { kept: 'yes' | 'partly' | 'no' | 'unknown'; evidence: string; at: string | null };
  cta: { present: boolean; at: string | null; text: string | null };
  faceOnCamera: 'yes' | 'no' | 'partial';
  textOverlay: 'none' | 'light' | 'heavy';
  notes: string[];                 // 못 본 것·불확실한 것을 여기 적는다 (숨기지 않기)
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number | null };
}
```

프롬프트 규칙(시스템 지시): 본 것·들은 것만. 인용은 원문 그대로. 모르면 `null`/`unknown`.
평가·추천 금지(그건 다음 단계 LLM의 일). 타임스탬프 없는 관찰 금지.

## 4. 구조

```
src/server/llm/observe.ts        Gemini 호출 (@google/genai interactions.create, store:false, response_format=schema)
                                 · 모드 선택(static/agentic) · zod 재검증 · usage→비용 · 오류 분류
                                 · GEMINI_API_KEY 없으면 네트워크 전에 차단 (isObserveConfigured)
src/server/llm/observe.test.ts   스키마 왕복, 모드 선택, 비용 계산, 오류 분류 (fetch/SDK는 경계에서 모킹)
src/app/api/observe/route.ts     GET {enabled, model} / POST {videoId, durationSec} → 관찰 or 오류. 레이트리밋 30/10분
src/app/utils/observeClient.ts   /api/observe 호출, 병렬 3, 429 백오프
src/app/utils/history.ts         observations 저장·조회 (30일 만료 공용)
src/app/utils/analysisPrompt.ts  "## 영상 관찰" 절 + [영상관찰] 태그 허용 + "없는 것"에서 자막·훅 조건부 제거
src/app/components/ObserveButton.tsx  대조군 20편 수집: 진행 n/20, 편별 상태, 합계 토큰·비용·영상 분
src/app/components/VideoCard.tsx  카드 단건 "이 영상 관찰"
docs/ISSUES.md, CLAUDE.md, README, .env.sample (GEMINI_API_KEY, GEMINI_MODEL)
```

의존성 추가: `@google/genai` (Apache-2.0). Anthropic SDK와 병존. CLAUDE.md "공식 SDK만" 규칙을 Gemini에도 적용.

## 5. 프롬프트 반영

```
## 영상 관찰 (Gemini가 영상을 직접 본 결과 — 모델 관찰이지 API 데이터가 아님. 인용은 원문, 시각은 MM:SS)
| # | 첫 3초(화면/음성/자막) | 첫 문장 인용 | 약속 확인 시점 | 썸네일 약속 이행 | 구조 블록 수 | 패턴 인터럽트 | 얼굴 | 자막 밀도 |
… (관찰 있는 행만. 없는 행은 "미수집")
```
- 시안 규칙의 태그에 `[영상관찰 #n mm:ss]` 추가. C절 훅 3안은 관찰이 있으면 `[가정]` 대신 `[영상관찰]`을 근거로.
- "이 데이터에 없는 것"의 자막·훅 항목은 관찰이 **전부** 있을 때 빠지고, 일부만 있으면 "n/20 관찰됨, 나머지 없음"으로.
- 채널 평소 제목 대조와 나란히 "터진 영상의 첫 3초가 그 채널 평소와 다른가"는 평소 영상을 관찰하지 않으므로 **못 함** — 명시.

## 6. 할당량·비용 회계

- 무료 티어 8시간/일: 대조군 20편 × 30초 = 10분/검색. 롱폼 20편 × 10분 = 200분 → 하루 2회. 롱폼은 agentic이라 토큰은 적지만 **길이 한도는 길이로 센다**.
- **그보다 먼저 걸리는 것: 무료 티어 RPD ≈20(3.8 Flash, 비공식 실측).** 편당 1요청이면 20편 수집이 하루치. 선택지:
  (a) `GEMINI_MODEL=gemini-3.5-flash-lite` — RPD ≈500(비공식), 요금 40%, agentic 지원. 관찰 품질은 스파이크로 비교
  (b) 요청당 최대 10편 묶기 — 요청 수 1/10. 단 한 편 실패가 묶음 전체 실패, 60초 상한 위험 → 스파이크 지연 보고 결정
  (c) 결제 연결(Tier 1) — 한도 대폭 상승, 비용은 아래 표대로 월 $6~70 수준, 10분당 $10 지출 상한 있음
- 비용(보수 가정: 토큰 과금, 정적 102토큰/초, agentic 50% 절감, 지시문 1K·출력 0.8K):
  3.8 Flash — Shorts $0.006/편(20편 $0.12), 3분 롱폼 $0.018, 10분 $0.027 · 2027년부터 2배 · Flash-Lite는 각각 약 45%.
  월 1,800편(하루 3검색×20편): Shorts 위주 $11(Flash) / $6(Lite), 롱폼 위주 $32~69(Flash) / $14~29(Lite).
- 앱은 이번 실행이 보낸 영상 분(分)을 합산해 표시. 전역 일일 합산은 서버가 못 함(인스턴스 단위) → 한도 초과는 429로 드러남, 그대로 표시.
- 프리뷰 무료라 `estimatedCostUsd`는 "유료 전환 시 추정"으로 라벨.

## 7. 오류 처리 (조용한 실패 금지)

| 상황 | 처리 |
|---|---|
| 키 없음 | GET enabled:false, 버튼 잠김, POST 503 |
| 비공개·삭제·연령제한·라이브 진행 중 | 편별 `unavailable`(사유), 나머지 계속. 표에 "관찰 불가: 사유" |
| 429 / 8시간 한도 | 2회 백오프 후 편별 실패로 표시, 합계에 "한도" 표기 |
| JSON 스키마 불일치 | 버리지 않고 `MALFORMED_OBSERVATION`으로 표면화 (원문 보관) |
| 60초 초과 | `stream:true`로 연결 유지 시도 → 그래도 넘기면 편별 `timeout`. 스파이크 결과에 따라 background+poll로 전환 |

## 8. 단계와 검증

| 단계 | 산출 | 완료 조건 |
|---|---|---|
| **0. 스파이크** (키 필요) | `scripts/gemini-spike.ts` 3~5편 실행 | 편당 지연 p95, 토큰, JSON 유효, Shorts watch URL 동작, 한국어 인용 정확도 육안. **p95 < 40초**면 동기 설계 확정, 아니면 background |
| 1. 서버 | observe.ts + route + 테스트 | tsc/lint/test/build. 키 없이 503 |
| 2. 프롬프트·보관함 | 관찰 절, 태그, 만료 | 프롬프트 테스트(관찰 유/무/부분), history 테스트 |
| 3. UI | 버튼·진행·비용, 카드 단건 | Playwright: 키 없이 잠김, 키 있으면 20편 진행→표 반영 |
| 4. 실효성 | 관찰 포함 프롬프트를 외부 LLM에 붙여넣기 | 훅 3안이 `[영상관찰]`을 인용하는가 |

## 9. 하지 않는 것
- 영상 다운로드·프레임 추출(정책 위반). 자막 스크래핑(비문서 API).
- 채널 평소 영상 관찰(비용·한도 20배). "터진 영상 vs 평소"의 영상 차원 비교는 보류.
- Gemini로 분석·시안까지 시키기 — 관찰과 판단을 분리한다. 관찰자가 결론까지 내면 근거 태그가 무의미.
- 배치 API(50% 할인) — 대화형 UX와 안 맞음. 대량 사전 수집이 필요해지면 검토.

## 10. 위험
- **프리뷰 종료 시 유료·제한 변경** — 편당 $0.006 수준이라 유료 전환 자체는 감당 가능. 한도 축소가 더 위험 → 편별 캐시로 재호출 최소화
- 무료 티어는 입력이 Google 제품 개선에 사용됨 — 공개 영상 URL과 지시문뿐이라 민감 정보 없음. 문서에 명시
- 관찰이 틀릴 수 있음(음성 오인식·타임스탬프 오차) — 태그로 "모델 관찰"임을 항상 표기, `notes`에 불확실성 강제
- 벤더 2개 — 키 2개, 가격표 2개, 오류 분류 2벌. 공통 인터페이스로 묶지 않는다(추상화는 3번째 벤더 때)

## 출처
- ai.google.dev/gemini-api/docs/video-understanding (2026-09-03)
- ai.google.dev/gemini-api/docs/interactions, /interactions/get-started, /structured-output, /media-resolution, /tokens, /rate-limits, /pricing
- ai.google.dev/gemini-api/docs/models/gemini-3.8-flash, /gemini-3.5-flash-lite
- registry.npmjs.org/@google/genai (2.21.0)
- developers.google.com/youtube/terms/developer-policies (III.D.7, III.E.1)
