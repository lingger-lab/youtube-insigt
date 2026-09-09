# CLAUDE.md — youtube-insigt

YouTube 검색 결과를 **채널 평소 성과 대비** 얼마나 터졌는지로 정렬하고, 상위군/하위군
대조 프롬프트를 만들어 외부 LLM에 붙여넣는 도구.

## 명령어

```bash
npm run dev        # 개발 서버
npm test           # node --test (타입 스트리핑, 도구 추가 없음)
npm run lint       # eslint
npm run build      # 프로덕션 빌드
node node_modules/typescript/bin/tsc --noEmit   # 타입 검사
npm run measure -- "키워드" ...                 # 실측 1차 (키워드당 검색 1회 소비)
node --env-file=.env.local scripts/measure-isolate.ts "키워드" ...   # 실측 2차: 효과 분리
```

> `npx tsc`는 쓰지 말 것. npm 레지스트리의 무관한 `tsc` 패키지가 잡힌다.

**게이트**: 커밋 전 tsc 0 errors · lint 0 errors · 테스트 전건 통과 · build exit 0.

## 절대 어기면 안 되는 것

1. **API 키에 `NEXT_PUBLIC_` 금지.** 그 접두사는 클라이언트 번들에 평문으로 박힌다.
   서버 전용 `YT_API_KEY`만 쓰고, YouTube 호출은 `src/server/youtube/` 안에서만 한다.
   확인법: `npm run build` 후 `grep -r "AIza" .next/static/` → 0건이어야 한다.

2. **계산 불가는 0이 아니라 `null`.** 구독자를 숨긴 채널을 0이나 1로 메우면
   "측정 못 함"과 "성과 없음"이 구분되지 않는다. 예전에 `subscriberCount || 1`
   때문에 비공개 채널이 정렬 상위를 독식했다.

3. **파생 지표를 `VideoData`에 저장하지 않는다.** `utils/metrics.ts`에서만 만든다.
   원본과 파생값을 둘 다 들고 있으면 언젠가 어긋난다.

4. **조용한 실패 금지.** 할당량 소진·형식 불일치는 빈 결과로 넘기지 않고 던진다.

5. **테스트가 import하는 모듈은 Node 타입 스트리핑(strip-only) 호환이어야 한다.**
   런타임 import에는 `.ts` 확장자(`import type`은 지워지므로 예외), 그리고 **생성자
   파라미터 프로퍼티(`constructor(private x)`)·`enum`·`namespace` 금지** — 스트리핑이
   거부해 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`로 테스트 파일 전체가 죽는다.

## 할당량이 실질 상한이다 (2026-06-01 버킷 분리)

- `search.list`: **전용 버킷, 하루 100회, 호출당 1.** 이 앱의 실질 상한.
- 나머지(videos·channels·playlistItems·commentThreads…): 공용 버킷 10,000 units/일, 호출당 1.
- **두 버킷은 경쟁하지 않는다.** 부가 호출을 아껴도 검색 횟수는 안 늘고, 부가 호출은
  검색 상한과 무관하게 하루 1만 번까지 쓸 수 있다.

| 검색 깊이 | 검색 한도 소비 | 부가 units(최악) | 하루 가능 |
|---|---|---|---|
| 50 (기본) | 1회 | 102 | **98회** |
| 100 | 2회 | 204 | 49회 |
| 200 | 4회 | 408 | **24회** |

부가 units = videos·channels + **채널당 최근 업로드 2 units**(playlistItems 1 + videos 1).
최악(결과마다 다른 채널)일 때 공용 버킷이 검색 버킷과 비슷한 시점에 닿는다.
**검색 호출 수는 페이지 수로 고정한다** — search.list가 페이지당 50개 미만을 주거나 중복을
내도 더 부르지 않는다(결과가 depth보다 적을 수 있음). 개수를 채우려다 50개 검색에 4회를
쓴 실측 사례가 있다.

`part`를 늘려도 비용은 그대로다 → **받을 수 있는 필드는 전부 받는다.**
초기화는 태평양 시간 자정(한국 오후 4~5시경). 할당량은 구매 불가, 증량은 심사 신청뿐.
미해결 이슈와 보류 설계는 [docs/ISSUES.md](docs/ISSUES.md).

## 지표 정의

| 지표 | 정의 |
|---|---|
| **성과배수** (주지표) | 조회수 ÷ 기준선. 기준선 1순위 = 같은 채널 **같은 포맷**(Shorts/롱폼) 최근 영상 **중앙값**(본 영상 제외, 라이브·예정 제외, 동료 ≥3편). 2순위 = 채널 전체 평균(본 영상 제외, 포맷 구분 없음 — `baselineSource`로 드러냄). 라이브·예정 대상은 null |
| 일평균 조회수 | 조회수 ÷ max(1, 경과일) |
| 일평균 배수 | 일평균 조회수 ÷ 같은 채널·같은 포맷 동료의 일평균 중앙값. 누적 배수의 짝 (`viewsPerDayMultiple`) |
| 좋아요율 / 댓글율 | 좋아요(댓글) ÷ 조회수 |
| 구독자 대비 | 조회수 ÷ 구독자수 — **참고값** (원래의 떡상지수. 카드·정렬에 노출, 주지표 아님) |

구독자수를 주 분모로 쓰지 않는 이유: 채널이 숨기면 값이 오지 않고, 1,000명 초과 시
유효숫자 3자리로 반올림된다(123,456 → 123,000).

**분모에서 그 영상 자신을 반드시 빼야 한다.** 채널 평균을 그대로 쓰면 비교 대상이
평균에 섞여 배수가 눌린다. 영상 5편 채널에서 실제 20배인 영상이 4.17배로 나오고
(79% 과소평가), 측정값이 채널 영상 수 N을 구조적으로 넘지 못한다. 이 도구가 찾는
것이 "작은 채널이 크게 터뜨린 영상"이라 편향이 가장 중요한 지점에서 가장 크다.

**강조(🔥)는 절대값이 아니다.** 결과 집합 안의 성과배수 상위 20% **그리고** 5배 이상일 때만
(`outperformCutoff`). 실측(2026-09-08)에서 검색 결과의 성과배수 중앙값이 키워드별 12~29배라
절대 2배 기준은 78~94%를 강조했다. 통계적 의미는 없는 표시 눈금이다.

**누적 배수는 오래된 대상에 유리하다.** 검색 결과 영상은 동료(최근 50편)보다 수년 오래돼
누적 배수가 일평균 배수(`viewsPerDayMultiple`)보다 p50 2~7배 크다. 둘을 나란히 두고 어느
한쪽을 진실로 말하지 않는다. 실측 원본과 해석은 `docs/ISSUES.md` B1·B4·B7.

## 구조

```
src/types/youtube.ts      공유 타입의 단일 출처 (런타임 코드 없음)
src/server/                서버 전용. 키는 이 경계 밖으로 안 나간다
  youtube/client.ts        타임아웃 8s · 429/5xx만 2회 재시도(백오프+지터) · 두 버킷 할당량 집계
  youtube/errors.ts        실패 분류 (검색 버킷/공용 버킷 소진을 따로 드러냄, 404 NOT_FOUND)
  youtube/schema.ts        zod 경계 검증 (search·videos·channels·playlistItems)
  youtube/search.ts        search 페이지 수만큼 순차 → videos 50개씩 병렬 → 채널 통계 + 채널당
                           최근 업로드 50편(playlistItems+videos, 동시성 6) → 관련도 순서 복원
  youtube/thumbnail.ts     i.ytimg.com 수신 (maxres→hq→mq). 프록시와 LLM 첨부가 같이 씀
  llm/analyze.ts           @anthropic-ai/sdk · claude-opus-5 · 스트리밍→finalMessage · refusal fallback
                           · 응답마다 usage + 추정 비용. 키 없으면 네트워크 전에 차단
  rateLimit.ts             인메모리 슬라이딩 윈도 (IP당 10분 검색 10회 / LLM 3회). 인스턴스 단위
src/app/api/
  search/route.ts          POST 프록시 (zod 요청 검증, 레이트리밋, maxDuration 60s)
  thumbnail/route.ts       i.ytimg.com 프록시 (CORS 우회, 하루 캐시, 할당량 0)
  analyze/route.ts         GET 상태 / POST 앱 내 LLM 분석 (키 없으면 503, 레이트리밋)
src/app/utils/
  metrics.ts               파생 지표를 만드는 유일한 곳 (성과배수·일평균 배수·기준선 출처)
  analysisPrompt.ts        관찰(대조 표·채널 평소 제목 대조) → 플레이북 → 시안(원본 5부 구조) 프롬프트
  playbook.ts              시안용 범용 원칙 목록 (ID·신뢰도·출처 필수, 포맷별 선택). 갱신은 커밋으로
  quota.ts                 할당량 산수 (검색 버킷 100회 / 공용 10,000)
  helpers.ts               포맷터 + 강조 컷오프(outperformCutoff: 상위 20% AND 5배)
  videoUtils.ts            길이 파싱, VideoType(shorts/long/live) 판별, 필터
  contactSheet.ts          썸네일 격자 합성(canvas) + 클립보드 이미지/다운로드 폴백
  llmClient.ts             /api/analyze 호출
  youtubeApi.ts            /api/search 호출 + 타입 재수출
  history.ts               브라우저 localStorage 보관함: 검색 이력(원본만) + 출력(프롬프트·LLM 결과)
src/app/history/page.tsx   보관함 화면 (이력 열기 = /?h=<id>, 할당량 0)
src/app/components/
  VideoCard                카드(성과배수·일평균 배수·LIVE 배지·자막 토글·AI분석·앱 내 분석)
  SearchDepthPicker        50/100/200 + 검색 버킷 소비 표시
  ThumbnailSheetButton     컨택트시트 복사     CopyButton  클립보드 텍스트 + aria-live
  AnalyzeButton            앱 내 LLM 분석 + 결과 패널   TranscriptField  자막 붙여넣기
  Sidebar / Header / SortBar / Filters / SearchInput / DisplayModeToggle
scripts/
  measure.ts               실측 1차: 분포·비율·할당량   (npm run measure -- "키워드")
  measure-isolate.ts       실측 2차: 포맷/나이 효과 분리, 검색 페이지 반환 수
  scenario.ts              키워드 1개의 절차·할당량·지표·프롬프트를 단계별로 출력 (원본은 measure-out/에 캐시)
```

**저장은 브라우저 localStorage뿐이다** (`utils/history.ts`). 서버에 DB·파일·캐시가 없다. 검색 성공
시 원본 `VideoData`만 자동 저장하고 URL을 `/?h=<id>`로 바꿔 새로고침·뒤로가기가 할당량 없이
복원된다. 파생 지표는 저장하지 않고 열 때 다시 계산한다(규칙 3). 복사한 프롬프트와 앱 내 LLM
결과는 출력 보관함에 남는다(같은 본문은 1건). 예산(검색 3.5M자·출력 0.8M자)을 넘으면 오래된 것부터
버리고, 손상된 항목은 버리되 `console.warn`으로 알린다. 다른 기기·시크릿 창에서는 안 보인다 — UI에 적혀 있다.
**30일이 지난 이력·출력은 읽을 때 지운다** (`RETENTION_DAYS`) — YouTube API 개발자 정책 III.E.4.b: 소유자
인가 없이 받은 통계(조회수·구독자수)는 30일 초과 보관 금지. 늘리지 말 것. 정책 조사: [docs/RESEARCH-없는것.md](docs/RESEARCH-없는것.md).

테스트는 소스 옆에 co-locate (`foo.ts` ↔ `foo.test.ts`).

## 제품 제약 (해결 불가, 숨기지 말 것)

- **타인 영상의 자막은 공식 API로 못 받는다.** `captions.download`는 소유자 OAuth를
  요구한다. 대본/훅 구조 분석은 사용자가 자막을 직접 붙여넣기 전까지 불가능하다.
- **시청 지속률·CTR·노출수**는 채널 소유자만(Analytics API) 볼 수 있다.
- **썸네일은 텍스트 프롬프트에 실을 수 없다.** 그래서 "썸네일 시트 복사"가 격자 이미지를
  **별도로** 클립보드에 넣고(`#번호` = 표 행 번호), 프롬프트에는 URL만 남긴다. 앱 내 LLM
  경로만 서버가 이미지를 자동 첨부한다.
- **라이브·예정(`liveStatus`≠none, 또는 duration P0D)은 Shorts도 롱폼도 아니다.** 성과배수를
  만들지 않고(null) 기준선 동료에서도 뺀다. 0초를 Shorts로 보면 24시간 스트림이 49,984배로
  상위를 독식한다(실측).
- 프롬프트는 **지어내기를 허가하지 않는다.** "부족하면 가정하고 진행"이나
  "내부 사고는 숨기고 최종안만" 같은 지시를 다시 넣지 말 것. 회귀 테스트가 막고 있다.
- **시안(제목·썸네일·구조)은 만들되, 모든 문장에 `[행 n]` / `[원칙 ID]` / `[가정]` 중 하나를
  달게 한다.** 데이터(`[행]`)가 얇은 자리는 앱이 든 플레이북(`utils/playbook.ts`)의 원칙으로
  메우고, 그것도 없으면 `[가정]`으로 드러낸다. 원칙과 데이터가 충돌하면 데이터 우선.
  플레이북에 출처·신뢰도 없는 항목이나 "n배 CTR" 같은 검증 불가 수치를 넣지 말 것(테스트가 막음).
- **시안의 품질은 앱도 LLM도 판정하지 못한다.** 판정은 YouTube Studio Test & Compare
  (롱폼, 제목·썸네일 3종, 승자 = 노출당 시청시간)뿐이다. 그래서 출력이 "3안 세트"다.
- **대조군은 `format-median` 기준선 영상을 먼저 쓴다.** `lifetime-mean`(Shorts 섞인 채널 평균)은
  모자랄 때만. 실측에서 305만 구독 채널 롱폼이 0.08배로 하위군에 들어가 대조를 오염시켰다.
- `RecentUpload.title`은 이미 부르는 `videos.list?part=snippet`에서 오므로 할당량 0으로 저장한다.
  상위 영상 vs 그 채널 평소 제목 대조가 가장 통제된 신호다. 2026-09-09 이전 보관분에는 없다.

## 배포

Vercel (`icn1`). 환경변수 `YT_API_KEY`(필수), `ANTHROPIC_API_KEY`(선택 — 넣는 순간 돈이 든다).
프로덕션 배포는 **항상 사용자 승인**이 필요하다.

## LLM 연동 규칙
- 모델 ID는 `claude-opus-5` 그대로. 날짜 접미사를 붙이지 말 것. 바꾸려면 `LLM_MODEL` 환경변수
- 공식 SDK만 쓴다. raw fetch로 Messages API를 부르지 않는다
- 비용이 보이지 않는 경로를 만들지 말 것 — 모든 응답에 `usage`와 `estimatedCostUsd`
- Vercel Hobby는 함수 60s. 긴 분석이 잘리면 Fluid compute(300s) 또는 `LLM_EFFORT=medium`
