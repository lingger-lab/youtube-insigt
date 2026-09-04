'use client';

import { VideoData } from '../utils/youtubeApi';
import { 
  formatViewCount, 
  formatSubscriberCount, 
  formatViralScore, 
  formatPublishedDate,
  truncateText,
  isHighViralScore
} from '../utils/helpers';
import { formatDuration, isShorts, getVideoDurationInSeconds } from '../utils/videoUtils';

interface VideoCardProps {
  video: VideoData;
  displayMode: 'grid' | 'list';
}

export default function VideoCard({ video, displayMode }: VideoCardProps) {
  const isViral = isHighViralScore(video.viralScore);
  const isShortVideo = isShorts(video.duration || 'PT0S');
  const duration = formatDuration(video.duration || 'PT0S');

  const handleVideoClick = () => {
    window.open(`https://www.youtube.com/watch?v=${video.id}`, '_blank');
  };

  const handleCopyAnalysisPrompt = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 비디오 클릭 이벤트 방지
    
    // 영상 길이를 분 단위로 계산 (초 단위를 분으로 변환, 최소 1분)
    const durationInSeconds = getVideoDurationInSeconds(video.duration || 'PT0S');
    const durationInMinutes = Math.max(1, Math.round(durationInSeconds / 60));
    const videoLengthHint = durationInSeconds > 0 
      ? `${durationInMinutes}분` 
      : '6분';
    
    const prompt = `# 📌 전제조건: 내 주제 설정
**"내가 적용할 주제는 무엇인가요?"**

아래 분석을 시작하기 전에, 먼저 당신의 주제/분야를 명확히 입력해 주세요.

**예시:**
- "온라인 마케팅 강의"
- "요리 레시피 콘텐츠" 
- "투자/재테크 정보"
- "건강/피트니스 팁"
- "육아/교육 노하우"
- "게임 공략/리뷰"
- "여행 브이로그"

**👇 여기에 당신의 주제를 입력하세요:**
\`\`\`
[여기에 내 주제 입력]
\`\`\`

---

# 영상 분석 대상
- **제목**: ${video.title}
- **채널**: ${video.channelTitle}
- **조회수**: ${formatViewCount(video.viewCount)}
- **구독자수**: ${formatSubscriberCount(video.subscriberCount)}
- **떡상지수**: ${formatViralScore(video.viralScore)}
- **업로드**: ${formatPublishedDate(video.publishedAt)}
- **링크**: https://www.youtube.com/watch?v=${video.id}

---

## 1) 클릭을 부르는 심리적 트리거 분석
- 대상 영상에서 작동한 핵심 트리거 TOP5를 뽑고, 각 트리거를 **내 주제**에 맞게 재해석하세요.
- 트리거 후보: 호기심/갭, 새로운 것/의외성, 숫자·구체성, 사회적 증거·권위, 손실회피, 희소성·긴급성, 자기정체성, 논쟁성, 전·후 대비, 감정(경외/유머/분노) 등.
- 형식:
  - 트리거명 / 대상영상 증거 1줄 / 내 주제 적용 카피 1줄 / 기대효과 1줄

## 2) 내 주제에 맞춘 썸네일/제목 5개 추천 (세트 제안)
- 5세트 = {직설형, 호기심형, 숫자형, 반전형, 권위/사회적증거형}.
- 각 세트에 아래 항목을 포함:
  - 제목(60자 이내, 키워드 선두 배치)
  - 썸네일_텍스트(최대 4단어), 썸네일_구성(피사체/앵글/대비/여백), 추천요소(아이콘·인물·표정)
  - 배경/색 대비(라이트/다크/고대비 중), 금지요소(작은 글자, 저해상도 등)
  - 왜 클릭되는지 한기대 KPI(CTR/AVD/완시율 중)

## 3) 시청지속 시간을 위한 대본 구조 설계
- 총 길이 가정: ${videoLengthHint} (모르면 6분 가정)

- 초반 10초 내 훅 3안 → 최적안 1개 추천.

- 타임라인(초 단위)로 제시:
  - HOOK(0~5s): [대사/자막], 시각 컷, 사운드 제안
  - 전개(5~45s): 문제정의→약속→자격부여(왜 나인가)
  - 본론 파트(시간블럭별): 핵 포인트, B-roll/오버레이, 패턴인터럽트(점프컷/퀴즈/전환), 오픈루프 배치
  - 클라이맥스/증거 제시: 데이터·전/후 비교
  - 마무리 & CTA(구독/다음편 티저): 강요 없이 자연 유도

- "이탈 위험 구간 & 회수 장치"를 표로 정리(구간/위험신호/개입전략).

- 스크립트 톤&보이스 가이드 3줄, 금지 리스트 3개(클릭베이트 과장 등).

## 4) 벤치마킹-적용 매핑표 (간단)
- 원본 요소 → 내 영상 적용 방식 → 기대 KPI(CTR/AVD/완시율 중)

## 5) 최종 복사용 요약
- 제목만 리스트(5개)
- 썸네일 텍스트만 리스트(5개)
- 1문장 전략 요약(TL;DR)

# 작성 규칙
- 벤치마킹요소_원문을 그대로 재탕하지 말고, **의도/원리**를 추출해 재조합.
- 수치/구체성 선호("3단계", "7분 안에" 등). 과장/허위 금지.
- 출력은 **Markdown**으로 섹션/하위목록을 명확히.
- 내가 붙여넣은 데이터가 부족해 보이면, 합리적 가정을 명시하고 진행.

# 품질관리(내부 사고는 숨기고 결과만 제시)
- (내부) "Have a Break…" 3가지 다른 접근을 시도해 가장 일관된 결과만 출력.
- (내부) 트리 오브 생각으로 훅/제목 후보를 탐색하되, **최종안만** 보여줄 것.`;

    try {
      await navigator.clipboard.writeText(prompt);
      
      // 성공 피드백 (간단한 알림)
      const button = e.target as HTMLButtonElement;
      const originalText = button.textContent;
      button.textContent = '복사완료!';
      button.style.backgroundColor = '#10b981'; // green
      
      setTimeout(() => {
        button.textContent = originalText;
        button.style.backgroundColor = '#8b5cf6'; // purple
      }, 1500);
      
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  if (displayMode === 'list') {
    return (
      <div 
        onClick={handleVideoClick}
        className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
      >
        <div className="relative shrink-0">
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full sm:w-48 aspect-video object-cover rounded-md"
          />
          {/* Duration Badge */}
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded">
            {duration}
          </div>
          {/* Shorts Badge */}
          {isShortVideo && (
            <div className="absolute top-2 left-2 bg-white text-black text-xs px-2 py-1 rounded font-bold">
              Shorts
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">
            {video.title}
          </h3>
          
          <p className="text-gray-300 text-sm mb-3 line-clamp-2">
            {truncateText(video.description, 150)}
          </p>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <span className="text-gray-300 font-medium">{video.channelTitle}</span>
            <span>조회수 {formatViewCount(video.viewCount)}</span>
            <span>구독자 {formatSubscriberCount(video.subscriberCount)}</span>
            <span>{formatPublishedDate(video.publishedAt)}</span>
          </div>
          
          <div className="flex items-center justify-between mt-3">
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${
              isViral 
                ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white animate-pulse' 
                : 'bg-gray-700 text-gray-300'
            }`}>
              {isViral && <span>🔥</span>}
              떡상지수 {formatViralScore(video.viralScore)}
            </div>
            
            <button
              onClick={handleCopyAnalysisPrompt}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-md transition-colors"
              title="AI 전략기획 분석 프롬프트 복사"
            >
              AI분석복사
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      onClick={handleVideoClick}
      className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-700 cursor-pointer transition-colors"
    >
      <div className="relative">
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-48 object-cover"
        />
        {/* Duration Badge */}
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded">
          {duration}
        </div>
        {/* Shorts Badge */}
        {isShortVideo && (
          <div className="absolute top-2 left-2 bg-white text-black text-xs px-2 py-1 rounded font-bold">
            Shorts
          </div>
        )}
        {/* Viral Badge */}
        {isViral && (
          <div className="absolute top-2 right-2 bg-gradient-to-r from-red-600 to-orange-500 text-white px-2 py-1 rounded-md text-xs font-bold animate-pulse">
            🔥 VIRAL
          </div>
        )}
      </div>
      
      <div className="p-4">
        <h3 className="text-white font-semibold mb-2 line-clamp-2 text-sm leading-tight">
          {video.title}
        </h3>
        
        <div className="text-gray-400 text-xs mb-2">
          <div className="font-medium text-gray-300 mb-1">{video.channelTitle}</div>
          <div className="flex justify-between">
            <span>조회수 {formatViewCount(video.viewCount)}</span>
            <span>{formatPublishedDate(video.publishedAt)}</span>
          </div>
        </div>
        
        <div className="text-xs text-gray-400 mb-2">
          구독자 {formatSubscriberCount(video.subscriberCount)}
        </div>
        
        <div className="flex justify-between items-center gap-2">
          <div className={`px-2 py-1 rounded-md text-xs font-medium ${
            isViral 
              ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white' 
              : 'bg-gray-700 text-gray-300'
          }`}>
            {isViral && <span className="mr-1">🔥</span>}
            {formatViralScore(video.viralScore)}
          </div>
          
          <button
            onClick={handleCopyAnalysisPrompt}
            className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-md transition-colors flex-shrink-0"
            title="AI 전략기획 분석 프롬프트 복사"
          >
            AI분석
          </button>
        </div>
      </div>
    </div>
  );
}