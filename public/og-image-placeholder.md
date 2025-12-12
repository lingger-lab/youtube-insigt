# Open Graph 이미지 생성 가이드

카카오톡 링크 미리보기에 표시될 이미지를 생성하세요.

## 이미지 요구사항

- **파일명**: `og-image.png` (또는 `og-image.jpg`)
- **위치**: `public/og-image.png`
- **크기**: 1200 x 630 픽셀 (권장)
- **비율**: 1.91:1 (가로:세로)
- **파일 크기**: 1MB 이하 권장

## 이미지 내용 제안

1. **로고/브랜드**: "Youtube InSigt" 로고 또는 텍스트
2. **배경**: YouTube 감성에 맞는 다크 테마 또는 그라데이션
3. **설명 텍스트**: "YouTube 영상 분석 도구" 또는 주요 기능 설명
4. **시각적 요소**: YouTube 아이콘, 차트/그래프 아이콘 등

## 이미지 생성 방법

### 방법 1: 디자인 도구 사용
- Figma, Canva, Photoshop 등 사용
- 1200x630 크기로 디자인
- PNG 또는 JPG로 저장
- `public/og-image.png`로 저장

### 방법 2: 온라인 도구 사용
- [Canva](https://www.canva.com) - 무료 템플릿 사용
- [Bannerbear](https://www.bannerbear.com) - 자동 생성
- [OG Image Generator](https://og-image.vercel.app) - 코드로 생성

### 방법 3: Next.js 동적 OG 이미지 (고급)
- `app/opengraph-image.tsx` 파일 생성
- Next.js가 자동으로 OG 이미지 생성

## 확인 방법

이미지 추가 후:
1. 배포 완료 대기
2. https://youtube-insigt.vercel.app/og-image.png 접속하여 이미지 확인
3. 카카오톡 개발자 도구에서 링크 미리보기 확인
4. 카카오톡에서 실제 공유 테스트

