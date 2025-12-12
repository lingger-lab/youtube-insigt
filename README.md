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
   NEXT_PUBLIC_YT_API_KEY=your_youtube_api_key_here
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
  app/
    components/
      Filters.tsx           # 검색 필터 컴포넌트
      SearchInput.tsx       # 검색 입력 컴포넌트
      SortBar.tsx          # 정렬 바 컴포넌트
      DisplayModeToggle.tsx # 표시 모드 토글
      VideoCard.tsx        # 비디오 카드 컴포넌트
    utils/
      youtubeApi.ts        # YouTube API 유틸리티
      helpers.ts           # 도우미 함수들
    globals.css            # 글로벌 스타일
    page.tsx              # 메인 페이지
```

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

## 📝 라이선스

MIT License

## 🤝 기여하기

Pull Request와 Issue를 환영합니다!

---

Made with ❤️ using Next.js and YouTube Data API v3