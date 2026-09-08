> **주의**: 이 문서는 최초 구현 착수용 프롬프트다. 현재 사양의 기준은
> PRD.md와 TRD.md이며, 아래 항목은 그에 맞춰 갱신되었다.

# Tasks.md — AI 코딩 착수용 프롬프트

You are a senior Next.js + TypeScript developer and YouTube API integration expert.

Build a full Next.js 16 App Router project implementing **YouTube Native + High-End Insight Ver 3.0** according to the PRD and TRD documents.

## Requirements
1. Use React + Next.js + Tailwind + TypeScript.
2. Implement YouTube Data API v3 with filters:
   - order: relevance, viewCount, date, rating
   - publishedAfter: RFC3339 timestamps (1H, 24H, 7D, 30D, 1Y)
   - videoDuration: any, short, medium, long
3. Deep Search (max 200 results).
4. Fetch video statistics & channel subscribers.
5. Compute 성과배수 = viewCount / median(같은 채널·같은 포맷 최근 업로드의 viewCount, 본 영상·라이브·예정 제외, ≥3편).
   동료가 부족하면 채널 전체 평균(본 영상 제외)으로 내려가되 `baselineSource`로 드러낸다. 라이브·예정 대상은 null.
   일평균 배수(viewsPerDayMultiple)를 함께 계산한다.
6. Provide sorting (성과배수, 조회수, 일평균, 좋아요율, 구독자수, 최신순) + asc/desc toggle.
7. Display results in list/card mode.
8. Highlight: 결과 집합 내 성과배수 상위 20% AND 5배 이상 (red gradient + flame). 절대 2배는 실측에서 폐기.
9. API key는 서버 전용 환경변수(YT_API_KEY)로만. 클라이언트 노출 금지.
10. Follow folder structure from TRD.
11. Deliver full code with Tailwind, Next.js, .env.sample, and build instructions.

## Output
1. Folder structure summary
2. All code files (TSX/TS)
3. Tailwind and Next.js config files
4. .env.sample
5. Run instructions:
   ```
   npm install
   npm run dev
   ```
