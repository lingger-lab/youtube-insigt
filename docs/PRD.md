# PRD — 요구사항 정의서 (Product Requirements Document)

## 프로젝트명
YouTube Native + High-End Insight Ver 3.0 (Next.js 리팩토링)

## 프로젝트 개요
YouTube 검색을 API 네이티브 수준에서 제어하고, 조회수/구독자수 기반의 Viral Score(떡상지수)를 분석하는 React/Next.js 기반 통합 분석 웹앱.

## 핵심 타겟
- YouTube 크리에이터 및 콘텐츠 분석가
- 콘텐츠 마케팅 담당자
- 초보 사용자 (UI 단순화)

## 주요 기능 (MVP Scope)
1. YouTube API 필터 완전 매핑 (order, publishedAfter, videoDuration)
2. Deep Search (최대 200개)
3. 클라이언트 정렬 기능 (조회수, 구독자, 떡상지수, 최신순)
4. Viral Score 계산 및 시각화
5. 카드형/리스트형 전환 UI
6. Dark Mode + YouTube 감성 디자인

## 사용자 흐름
사용자 접속 → 필터 선택 + 검색어 입력 → Deep Search 실행 → 결과 정렬/시각화 → Viral Score 표시 → YouTube 원본 이동
