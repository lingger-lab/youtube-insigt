# TRD — 기술 사양서 (Technical Requirements Document)

## 권장 스택
- Framework: Next.js 14+ (App Router)
- Language: TypeScript
- Styling: Tailwind CSS
- Data Fetching: Fetch API / React Query
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
- searchYouTube(term, filters)
- getVideoDetails(ids)
- getChannelStats(channelIds)
- calcViralScore(viewCount, subscriberCount)

## UI 디자인 가이드
- Tailwind 기반 Dark UI
- 반응형 카드 (grid)
- Viral Score ≥ 100배 시 붉은색 + 불꽃 애니메이션

## 환경변수
NEXT_PUBLIC_YT_API_KEY=your_youtube_api_key
