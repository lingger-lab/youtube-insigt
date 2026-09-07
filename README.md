# YouTube Native + High-End Insight Ver 3.0

YouTube 검색을 API 네이티브 수준에서 제어하고, 조회수/구독자수 기반의 Viral Score(떡상지수)를 분석하는 Next.js 기반 통합 분석 웹앱입니다.

## 🚀 주요 기능

- **YouTube API 필터 완전 매핑**: order, publishedAfter, videoDuration 등
- **Deep Search**: 최대 200개 결과 검색
- **클라이언트 정렬**: 조회수, 구독자, 떡상지수, 최신순
- **Viral Score 계산 및 시각화**: 조회수 ÷ 구독자수
- **카드형/리스트형 전환 UI**
- **Dark Mode + YouTube 감성 디자인**

## 🛠️ 기술 스택

- **Framework**: Next.js 14+ (App Router)
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

1. 사용자 접속
2. 필터 선택 + 검색어 입력
3. Deep Search 실행 (최대 200개)
4. 결과 정렬/시각화
5. Viral Score 표시
6. YouTube 원본 이동

## 🔥 Viral Score 기능

- **계산 공식**: 조회수 ÷ 구독자수
- **시각적 표시**: 1.0 이상일 때 빨간색 그라데이션 + 불꽃 애니메이션
- **정렬 기능**: 떡상지수 기준 오름차순/내림차순 정렬

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

| 검색 깊이 | 검색 한도 소비 | 부가 units | 하루 가능 횟수 |
|---|---|---|---|
| 50개 | 1회 | ≤2 | **100회** |
| 100개 | 2회 | ≤4 | 50회 |
| 200개 (Deep) | 4회 | ≤8 | **25회** |

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