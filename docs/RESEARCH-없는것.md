# 조사 — 프롬프트의 "이 데이터에 없는 것"은 정말 없는가 (2026-09-09)

질문: 프롬프트가 "없음"이라 선언하는 항목이 너무 많다. 항목별로 **진짜 불가 / 정식 우회 있음 / 비정식만 있음**을 가른다.
기준: YouTube API Services Developer Policies(III.D.7 "문서화되지 않은 API 사용 금지", III.E.1 "영상 다운로드·캐시 금지")를
지키는 범위에서만 "가능"으로 친다. 이 앱은 YouTube API 클라이언트라 그 정책의 적용 대상이다.

## 결론표

| 항목 | 지금 프롬프트 | 조사 결과 | 판정 |
|---|---|---|---|
| 썸네일 이미지 | 시트 붙여넣기 / 앱 내 자동 첨부 | 이미 있음. 텍스트에 못 실을 뿐 | **없음 아님** (표현만 정정) |
| 영상 내용 · 자막 · 대본 | 소유자 OAuth 없이는 불가 | `captions.download`는 여전히 소유자 전용. **그러나 Gemini API가 공개 YouTube URL을 직접 입력받아 영상(프레임+오디오+자막)을 분석한다** — Google 공식 기능, 프리뷰 무료, 무료 티어 하루 8시간, 요청당 10편, 공개 영상만. 타임스탬프(MM:SS) 질의 가능, agentic 모드는 자막·프레임을 필요한 만큼만 읽음 | **정식 우회 있음 (Gemini)** |
| 첫 3초 훅 · 전개 · 패턴 인터럽트 | 자막 붙여넣기 전엔 불가 | 위와 같음. "00:00~00:03에 무엇이 보이고 들리는가"를 직접 물을 수 있다 | **정식 우회 있음 (Gemini)** |
| 시청 지속률 · CTR · 노출수 · 유입 경로 | 소유자만 | Analytics API는 소유자·콘텐츠 오너 전용. 대안 없음. 공개 페이지의 "가장 많이 다시 본 구간"(heatmap)은 비공개 플레이어 응답을 긁어야 해 **III.D.7 위반** | **진짜 불가** |
| 알고리즘 노출 비중 | 불가 | 동일 | **진짜 불가** |
| 댓글 (시청자 반응) | 목록에 없음(수집 안 함) | `commentThreads.list` 공용 버킷 1 unit, 공식. 댓글 꺼진 영상은 `commentsDisabled` 에러 → 처리 필요. 20편 = 20 units | **정식으로 가능, 사용자 보류(D절)** |
| 유료 PPL 여부 | 없음 | `videos.list part=paidProductPlacementDetails` 공개, 추가 비용 0 | **가능 (0 unit)** |
| 주제 분류 | 없음 | `topicDetails.topicCategories` (Wikipedia URL) 공개, 0 unit | **가능 (0 unit)** |
| 음성 언어 | 없음 | `snippet.defaultAudioLanguage` 공개, 0 unit | **가능 (0 unit)** |
| 커스텀 썸네일 여부 | 없음 | `contentDetails.hasCustomThumbnail`은 소유자만 (문서) | 불가 |
| 자막 트랙 유무 | 있음(B8) | `contentDetails.caption` — 의미 검증은 여전히 OAuth 필요 | 유지 |
| 조회수 집계 기준 변경 | 주의 문구 | 사실(2026-08-24부터) — 데이터가 아니라 해석 규칙 | 유지 |

## Gemini 경로 상세 (핵심 발견)

- 입력: `{"type":"video","uri":"https://www.youtube.com/watch?v=…"}` + 텍스트. 모델 `gemini-3.8-flash` 등.
- 제한: 공개 영상만(비공개·일부공개 불가). 무료 티어 **하루 8시간분**, 요청당 최대 10편. 프리뷰라 "요금·제한은 바뀔 수 있음".
- 토큰(정적 모드): 초당 약 100(기본 해상도)~300(고해상도) 토큰. 30초 Shorts ≈ 3,000~9,000 토큰.
  유료 시 3.8 Flash 입력 $0.75/1M → **30초 Shorts 1편 ≈ $0.002~0.007**, 20편 ≈ $0.05~0.15. 프리뷰 동안은 무료.
- agentic 모드: 모델이 자막/프레임/오디오를 필요한 만큼만 로드. 긴 영상에 유리. 스트리밍 권장(타임아웃).
- 이 경로의 출력은 **모델의 관찰**이지 API 데이터가 아니다. 프롬프트 태그를 `[영상관찰 mm:ss]`로 분리해야
  `[행 n]`(사실)과 섞이지 않는다. Gemini가 자막 문장을 인용하면 그 인용은 검증 가능(타임스탬프).
- 정책: Gemini 쪽은 "공개 영상만" 제약뿐. YouTube 정책 III.E.1(다운로드·캐시 금지)은 Google이 내부에서 처리하므로
  앱이 영상을 받지 않는다 — 앱은 URL만 넘긴다. 앱이 **결과 텍스트를 저장**하는 것은 영상 캐시가 아니다.
- 의존성: `@google/genai` SDK 추가(현재 Anthropic SDK만). 키 `GEMINI_API_KEY`. 벤더 둘이 된다.

## 비정식 경로 — 채택하지 않음 (이유 기록)

| 경로 | 상태 | 이유 |
|---|---|---|
| `youtube-transcript-api` 류 timedtext 스크래핑 | 2025~26 클라우드 IP 차단, 백엔드 변경으로 수시 중단 | 문서화되지 않은 API(III.D.7). 배포 환경(Vercel)에서 사실상 안 됨 |
| 유료 트랜스크립트 API(Supadata 등) | 동작 | 그들이 대신 긁는 것. 정책 위험을 외주한 형태. Gemini가 있으니 불필요 |
| yt-dlp로 오디오 받아 Whisper | 동작 | III.E.1 다운로드 금지 정면 위반 |
| "가장 많이 다시 본 구간" heatmap 스크래핑 | 동작(Apify 등) | 플레이어 응답 파싱 = 비문서 API. 시청지속률의 유일한 공개 대리지표라 아깝지만 불가 |

## 덤으로 발견한 정책 이슈 (앱에 해당)

1. **III.E.4.b — 비인가 통계는 30일 넘게 저장 금지.** "조회수·구독자수 같은 통계를 채널 소유자 인가 없이
   30일 이상 저장하면 안 된다." 보관함(localStorage)이 검색 결과 원본을 무기한 저장한다 → **30일 자동 만료 필요**.
   프롬프트·LLM 결과 텍스트(통계 인용 포함)는 통계 자체가 아니지만 보수적으로 같이 만료.
2. **III.E.2 — 데이터 집계 제한.** 서로 다른 콘텐츠 오너의 API 데이터를 결합·집계해 인사이트를 만드는 것을 제한.
   이 앱의 상위/하위 대조 표는 검색 1회의 결과를 나란히 보여주는 것이고 저장·누적 집계는 아니다. 그러나
   여러 검색을 모아 통계를 내는 기능(실측 스크립트가 하는 일)은 회색이다. **공개 서비스 전환 시 검토 항목.**
3. **III.D.7** — 위 비정식 경로 전부 금지. 이미 채택하지 않았음.

## 권고 (우선순위)

1. ~~보관함 30일 만료~~ **완료(2026-09-09, `4910525`)** — 읽을 때 걸러내고 저장소에서도 삭제.
2. ~~0 unit 필드 3개 추가~~ **완료(2026-09-09)** — 표에 PPL 열, 군 요약에 주제·음성 분포, 단건 프롬프트에 3줄.
3. **Gemini 영상 관찰 경로** — "없음" 목록의 자막·훅·전개를 실제로 채우는 유일한 정식 방법. 앱 내 LLM처럼
   선택 기능(키 없으면 잠김). 설계 결정 필요: (a) 상위군 10편만 볼지, (b) 무엇을 물을지(첫 3초·훅 문장·구조·썸네일 대비
   본편 약속 이행 여부), (c) 결과를 `[영상관찰]` 태그로 프롬프트에 실을지 / 앱 내 분석에 합칠지, (d) 비용 표시.
4. **댓글** — 사용자 결정 대기(D절). 정식·저렴.
5. ~~프롬프트 "없는 것" 문구 정정~~ **썸네일 문구 완료(2026-09-09)**. 자막 문구는 Gemini 경로가 붙을 때 같이.

## 출처
- Gemini video understanding (2026-09-03 갱신): ai.google.dev/gemini-api/docs/video-understanding — YouTube URL 프리뷰 무료, 8시간/일, 10편/요청, 공개만, 토큰 100~300/초
- Gemini pricing: ai.google.dev/gemini-api/docs/pricing — 3.8 Flash $0.75/$3.75 per 1M (2026-12-31까지)
- YouTube Developer Policies: developers.google.com/youtube/terms/developer-policies — III.D.7, III.E.1, III.E.2, III.E.4.b
- videos 리소스: developers.google.com/youtube/v3/docs/videos — paidProductPlacementDetails, topicCategories, fileDetails/hasCustomThumbnail 소유자 전용
- commentThreads.list: 1 unit, commentsDisabled
- 트랜스크립트 스크래핑 차단: github.com/jdepoix/youtube-transcript-api/issues/593, supadata.ai, transcriptapi.com (2025-12~2026-01 중단 사례)
- heatmap: github.com/yt-dlp/yt-dlp/issues/3888, apify.com (비문서 파싱)
