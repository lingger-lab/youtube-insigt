# Tasks.md — AI 코딩 착수용 프롬프트

You are a senior Next.js + TypeScript developer and YouTube API integration expert.

Build a full Next.js 14+ App Router project implementing **YouTube Native + High-End Insight Ver 3.0** according to the PRD and TRD documents.

## Requirements
1. Use React + Next.js + Tailwind + TypeScript.
2. Implement YouTube Data API v3 with filters:
   - order: relevance, viewCount, date, rating
   - publishedAfter: RFC3339 timestamps (1H, 24H, 7D, 30D, 1Y)
   - videoDuration: any, short, medium, long
3. Deep Search (max 200 results).
4. Fetch video statistics & channel subscribers.
5. Compute Viral Score = (viewCount / subscriberCount) * 100.
6. Provide sorting (조회수, 구독자수, 떡상지수, 최신순) + asc/desc toggle.
7. Display results in list/card mode.
8. Highlight high Viral Scores visually (100배 이상: red gradient + flame).
9. Use environment variable for API key.
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
