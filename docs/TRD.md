# TRD — 기술 사양서 (Technical Requirements Document)

## 권장 스택
- Framework: Next.js 16 (App Router, Turbopack)
- Language: TypeScript
- Styling: Tailwind CSS
- Data Fetching: 서버 Route Handler 경유 (클라이언트는 API 키를 모른다)
- 경계 검증: zod
- 테스트: Node 내장 test runner (node --test, 타입 스트리핑)
- State Management: React Hooks
- Env 관리: .env.local
- 배포 환경: Vercel (icn1)

## 프로젝트 구조
```
src/types/youtube.ts        공유 타입의 단일 출처
src/server/                 서버 전용 (키는 이 경계 밖으로 안 나감)
  youtube/{client,errors,schema,search,thumbnail}.ts
  llm/analyze.ts            앱 내 LLM 분석 (선택)
  rateLimit.ts              인메모리 레이트리밋
src/app/api/{search,thumbnail,analyze}/route.ts
src/app/history/page.tsx    보관함
src/app/components/         VideoCard · SearchDepthPicker · ThumbnailSheetButton · TranscriptField
                            · AnalyzeButton · CopyButton · Header · Sidebar · Filters · SearchInput
                            · SortBar · DisplayModeToggle
src/app/utils/              metrics · analysisPrompt · contactSheet · quota · helpers · videoUtils
                            · llmClient · youtubeApi
scripts/                    measure.ts · measure-isolate.ts (실측)
docs/ISSUES.md              미해결 이슈 · 검증 체크리스트 · 보류 설계
```
테스트는 소스 옆에 co-locate (`foo.ts` ↔ `foo.test.ts`). 전체 목록은 README 구조 절.

## API 설계

### 서버 (src/server/youtube/)
- `searchYouTube(term, filters, maxResults)` — search.list로 ID 수집(페이지 수만큼만, 순차) →
  videos.list 50개씩 병렬 → 고유 채널만 channels.list 50개씩 병렬 → 채널당 최근 업로드 50편
  (playlistItems 1 + videos 1 unit, 동시성 6; 재생목록 없는 채널은 null로 계속) → 관련도 순서 복원
- `server/rateLimit.ts` — 인메모리 슬라이딩 윈도. IP당 10분 검색 10회 / LLM 3회. 인스턴스 단위(한계 명시)
- `server/llm/analyze.ts` — 앱 내 LLM 분석(선택). `ANTHROPIC_API_KEY` 없으면 네트워크 전에 차단.
  썸네일을 서버가 이미지 블록으로 첨부, 응답마다 usage·추정 비용
- `server/youtube/thumbnail.ts` — i.ytimg.com 수신. `/api/thumbnail` 프록시(CORS 우회)와 LLM 첨부가 공용
- 모든 외부 호출: 8초 타임아웃 · 429/5xx/타임아웃만 최대 2회 재시도(지수 백오프+지터)
- 할당량 소진은 `SEARCH_QUOTA_EXCEEDED`(검색 버킷) / `QUOTA_EXCEEDED`(공용)로 분리해 표면화

### 클라이언트 (src/app/utils/)
- `youtubeApi.ts` — `POST /api/search` 호출만 담당. `llmClient.ts` — `/api/analyze`
- `computeMetrics(video)` — 파생 지표를 만드는 유일한 곳. VideoData에 저장하지 않는다
- `estimateQuota(depth)` — 검색 깊이별 소비량 (두 버킷)
- `buildMarketAnalysisPrompt` / `buildSingleVideoPrompt` — 상위·하위 대조군 포함 프롬프트. 지어내기 금지
- `buildContactSheet` — 썸네일 격자를 canvas로 합성해 `ClipboardItem`(image/png)으로 복사, 미지원 시 다운로드
- `history.ts` — localStorage 보관함. 검색 이력은 원본만(지표는 열 때 재계산), 출력은 본문 중복 제거, 문자 예산 초과 시 오래된 것부터 제거, 손상 항목은 버리되 경고. 서버 저장 없음

### 할당량 (2026-06-01 버킷 분리)
- search.list: 전용 버킷 하루 100회 (호출당 1) — 실질 상한
- 그 외: 공용 버킷 10,000 units/일 (호출당 1). 검색과 경쟁하지 않음

| 깊이 | 검색 한도 소비 | 부가 units(최악) | 하루 가능 |
|---|---|---|---|
| 50 | 1회 | 102 | 98회 |
| 100 | 2회 | 204 | 49회 |
| 200 | 4회 | 408 | 24회 |

### 접근 불가 (설계 제약)
타인 영상의 **자막**은 공식 API로 받을 수 없다. `captions.download`는 영상
소유자 OAuth를 요구한다. 시청 지속률은 채널 소유자만(Analytics API) 볼 수 있다.

## UI 디자인 가이드
- Tailwind v4 기반 Dark UI
- 반응형: 모바일 드로어 ↔ 데스크톱 고정 레일 (md 기준)
- 강조(🔥)는 결과 집합 안의 성과배수 상위 20% **이면서** 5배 이상 (`outperformCutoff`).
  절대값 하나(예전 2배)는 실측에서 78~94%를 강조해 무의미했다. 표시용이며 검증된 모델이 아니다
- 라이브·예정 영상은 LIVE/예정 배지, 성과배수 '측정불가', Shorts/롱폼 필터에서 제외

## 환경변수
```
YT_API_KEY=...          # 필수. 서버 전용. NEXT_PUBLIC_ 금지
ANTHROPIC_API_KEY=...   # 선택. 넣으면 앱 내 LLM 분석 활성(비용 발생). 없으면 기능 잠김
LLM_MODEL=claude-opus-5 # 선택 (기본값)
LLM_EFFORT=high         # 선택: low|medium|high|xhigh|max
```
