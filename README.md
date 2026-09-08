# YouTube Native + High-End Insight Ver 3.0

YouTube 검색 결과를 **채널 평소 성과 대비 얼마나 터졌는지**(성과배수)로 정렬하고,
상위군/하위군 대조 프롬프트와 썸네일 시트를 만들어 LLM에 붙여넣는 Next.js 앱입니다.

## 🚀 주요 기능

- **YouTube API 필터 매핑**: order, publishedAfter, videoDuration
- **검색 깊이 선택**: 50 / 100 / 200 — 검색 버킷(하루 100회) 소비량을 UI에 표시
- **성과배수**: 조회수 ÷ 같은 채널·같은 포맷(Shorts/롱폼) 최근 영상의 중앙값. 라이브·예정은 제외
- **일평균 배수·좋아요율·댓글율** 병기. 계산 불가는 0이 아니라 '측정불가'
- **대조군 프롬프트**: 성과배수 상위군/하위군을 표로 묶어 LLM에 붙여넣기 (지어내기 금지 규칙 포함)
- **썸네일 컨택트시트**: 상위·하위군 썸네일을 `#번호` 격자 한 장으로 클립보드에 복사
- **자막 붙여넣기**: 있을 때만 대본 구조 분석 요청
- **앱 내 LLM 분석(선택)**: `ANTHROPIC_API_KEY`가 있을 때만 활성, 응답마다 토큰·추정 비용 표시
- 카드형/리스트형 전환, Dark Mode, 모바일 드로어

## 🛠️ 기술 스택

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **API**: YouTube Data API v3
- **State Management**: React Hooks

## 📦 설치 및 실행

1. **저장소 클론**
   ```bash
   git clone <repository-url>
   cd youtube-insight
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **환경 변수 설정**
   ```bash
   cp .env.sample .env.local
   ```
   
   `.env.local` 파일에서 YouTube API 키를 설정하세요:
   ```
   YT_API_KEY=your_youtube_api_key_here
   ```

   **선택 — 앱 내 LLM 분석.** 기본은 프롬프트를 클립보드로 복사해 외부 LLM에 붙여넣는
   방식이며 비용이 없습니다. 서버에 `ANTHROPIC_API_KEY`를 넣으면 "앱에서 분석" 버튼이
   활성화되어 썸네일을 자동 첨부해 Claude에 보내고 결과를 앱 안에 보여줍니다.
   **토큰 비용이 듭니다** — 결과마다 사용량과 추정 비용을 표시합니다.
   ```
   ANTHROPIC_API_KEY=sk-ant-...   # 없으면 기능 꺼짐. NEXT_PUBLIC_ 금지
   LLM_MODEL=claude-opus-5        # 선택, 기본값
   LLM_EFFORT=high                # 선택: low|medium|high|xhigh|max
   ```

4. **개발 서버 실행**
   ```bash
   npm run dev
   ```

5. **브라우저에서 확인**
   
   [http://localhost:3000](http://localhost:3000)을 열어 애플리케이션을 확인하세요.

## 🔑 YouTube API 키 발급 방법

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. API 및 서비스 → 라이브러리에서 "YouTube Data API v3" 활성화
4. 사용자 인증 정보 → API 키 생성
5. 생성된 API 키를 `.env.local` 파일에 추가

## 📁 프로젝트 구조

```
src/
  types/
    youtube.ts             # 서버·클라이언트 공유 타입의 단일 출처
  server/                  # 서버 전용. API 키는 이 경계 밖으로 나가지 않는다
    youtube/
      client.ts            # fetch 래퍼 (타임아웃·재시도·할당량 집계)
      errors.ts            # 실패 분류 (할당량 소진을 별도로 드러냄)
      search.ts            # 검색·통계 수집
  app/
    api/
      search/route.ts      # 검색 프록시 (POST)
    components/
      Header.tsx           # 상단 바
      Sidebar.tsx          # 영상 유형 필터 사이드바
      Filters.tsx          # 검색 필터 컴포넌트
      SearchInput.tsx      # 검색 입력 컴포넌트
      SortBar.tsx          # 정렬 바 컴포넌트
      DisplayModeToggle.tsx # 표시 모드 토글
      VideoCard.tsx        # 비디오 카드 컴포넌트
    utils/
      youtubeApi.ts        # 클라이언트: /api/search 호출 + 타입 재수출
      videoUtils.ts        # 길이 파싱 / Shorts 판별
      helpers.ts           # 표시용 포맷터
    globals.css            # 글로벌 스타일
    page.tsx               # 메인 페이지
```

테스트는 소스 옆에 둡니다(`helpers.ts` ↔ `helpers.test.ts`).

## 🎯 사용자 흐름

1. 검색어 입력 + 검색 깊이(50/100/200) 선택
2. 결과를 성과배수 순으로 확인 (정렬 기준 변경 가능)
3. "시장 분석 복사" + "썸네일 시트 복사" → LLM 입력창에 둘 다 붙여넣기
4. 개별 영상은 "AI분석" (자막을 붙여넣으면 대본 구조까지)
5. 카드 클릭 → YouTube 원본

## 🔥 성과배수

- **정의**: 조회수 ÷ 같은 채널·같은 포맷 최근 영상(최대 50편, 본 영상 제외)의 **중앙값**.
  구독자수는 비공개·반올림 문제로 분모로 쓰지 않습니다. 상세: `CLAUDE.md` 지표 정의
- **강조(🔥)**: 이 검색 결과 안의 상위 20% **이면서** 5배 이상. 절대값이 아닌 상대 기준입니다 —
  검색 결과는 이미 YouTube가 고른 승자 집합이라 중앙값이 키워드에 따라 12~29배입니다
- **한계**: 검색 결과 영상은 동료보다 수년 오래돼 누적 배수가 유리합니다. 일평균 배수를 함께 보세요

## 🎨 UI/UX 특징

- **Dark Theme**: YouTube 감성에 맞는 어두운 테마
- **반응형 디자인**: 모바일, 태블릿, 데스크톱 지원
- **카드/리스트 모드**: 사용자 선호에 따른 표시 방식 선택
- **로딩 애니메이션**: 검색 중 사용자 경험 향상

## 🚀 Vercel 배포 가이드

이 프로젝트는 Vercel에 배포하기에 최적화되어 있습니다.

### 배포 방법

1. **Vercel 계정 준비**
   - [Vercel](https://vercel.com)에 가입하거나 로그인

2. **GitHub 저장소 연결**
   - Vercel 대시보드에서 "New Project" 클릭
   - GitHub 저장소 `lingger-lab/youtube-insigt` 선택
   - Import 클릭

3. **환경 변수 설정**
   - 프로젝트 설정에서 "Environment Variables" 섹션으로 이동
   - 다음 환경 변수 추가:
     ```
     YT_API_KEY=your_youtube_api_key_here
     ```
   - Google Cloud Console에서 발급받은 YouTube API 키를 입력

4. **배포 실행**
   - "Deploy" 버튼 클릭
   - Vercel이 자동으로 빌드 및 배포 진행
   - 배포 완료 후 제공되는 URL로 접속 가능

### 배포 후 확인사항

- ✅ 환경 변수가 올바르게 설정되었는지 확인
- ✅ 빌드가 성공적으로 완료되었는지 확인
- ✅ YouTube API 키가 유효한지 확인 (할당량 확인)

### 주의사항

**API 키는 절대 클라이언트에 노출하면 안 됩니다.** 이 앱의 모든 YouTube 호출은
서버 라우트(`/api/search`)를 거치며, 키는 `YT_API_KEY`(서버 전용)로만 읽습니다.
`NEXT_PUBLIC_` 접두사가 붙은 환경변수는 클라이언트 번들에 평문으로 박히므로
API 키에 절대 사용하지 마십시오.

**할당량이 이 앱의 실질적 상한입니다.** 2026-06-01부터 버킷이 둘로 갈렸습니다:
`search.list`는 **전용 버킷(하루 100회, 호출당 1)**, 나머지 메서드는 공용 버킷
(하루 10,000 units, 호출당 1). 둘은 서로 경쟁하지 않으며, 실질 상한은 검색 횟수입니다.

| 검색 깊이 | 검색 한도 소비 | 부가 units (최악) | 하루 가능 횟수 |
|---|---|---|---|
| 50개 | 1회 | ≤102 | **98회** |
| 100개 | 2회 | ≤204 | 49회 |
| 200개 (Deep) | 4회 | ≤408 | **24회** |

부가 units에는 채널마다 최근 업로드 50편을 받는 비용(채널당 2)이 포함됩니다 —
Shorts/롱폼을 갈라 같은 포맷끼리 기준선을 세우기 위한 것입니다.

할당량은 구매할 수 없고, 증량은 [심사 기반 확장 신청](https://support.google.com/youtube/contact/yt_api_form)뿐입니다(무료, 수주~수개월).

- 할당량은 태평양 시간 자정(한국 시간 오후 4~5시경)에 초기화됩니다
- 소진 시 앱은 조용히 빈 결과를 보여주지 않고 명시적으로 알립니다
- Google Cloud Console에서 API 키에 HTTP 리퍼러/IP 제한을 거는 것을 권장합니다

## 📝 라이선스

MIT License

## 🤝 기여하기

Pull Request와 Issue를 환영합니다!

---

Made with ❤️ using Next.js and YouTube Data API v3