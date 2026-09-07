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
- 배포 환경: Vercel / Netlify

## 프로젝트 구조
/app
  /components
    Filters.tsx
    SearchInput.tsx
    SortBar.tsx
    DisplayModeToggle.tsx
    VideoCard.tsx
  /utils
    youtubeApi.ts
    helpers.ts
  /styles
    globals.css
  page.tsx
/public
  logo.svg
  favicon.ico
.env.local
next.config.js
package.json

## API 설계

### 서버 (src/server/youtube/)
- `searchYouTube(term, filters, maxResults)` — search.list로 ID 수집(순차) →
  videos.list 50개씩 병렬 → 고유 채널만 channels.list 50개씩 병렬
- 모든 외부 호출: 8초 타임아웃 · 429/5xx/타임아웃만 최대 2회 재시도(지수 백오프+지터)
- 할당량 소진은 QUOTA_EXCEEDED로 분리해 표면화

### 클라이언트 (src/app/utils/)
- `POST /api/search` 호출만 담당
- `computeMetrics(video)` — 파생 지표를 만드는 유일한 곳. VideoData에 저장하지 않는다
- `estimateQuota(depth)` — 검색 깊이별 소비량

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
- 성과배수 2배 이상 시 붉은 강조 (표시용 임계값이며 검증된 모델이 아니다)

## 환경변수
YT_API_KEY=your_youtube_api_key   # 서버 전용. NEXT_PUBLIC_ 금지
