import type { VideoWithMetrics } from '../../types/youtube.ts';
// 런타임 import에는 .ts 확장자가 필요하다 (node --test가 이 모듈을 직접 실행한다).
import { formatViewCount, formatPercent, formatMultiple, formatSubscriberCount } from './helpers.ts';
import { formatDuration } from './videoUtils.ts';

/**
 * LLM에 붙여넣을 분석 프롬프트를 만든다.
 *
 * 설계 의도가 하나 있다: **지어내기를 막는 것**.
 *
 * 이전 프롬프트는 제목 한 줄과 숫자 네 개만 주고 썸네일 구성과 대본 구조를
 * 설계하라고 요구했다. 그러면서 "데이터가 부족해 보이면 합리적 가정을 명시하고
 * 진행"과 "내부 사고는 숨기고 최종안만" 두 줄을 함께 지시했다. 두 줄이 겹치면
 * 모델이 지어낸 결과를 근거 있는 분석처럼 내놓고, 사용자는 그게 추측인지
 * 관찰인지 알 수 없다. 두 지시를 모두 걷어내고 반대로 못 박았다.
 *
 * 두 번째 의도는 **생존자 편향을 깨는 것**이다. 잘된 영상 하나만 보고
 * "이래서 떡상했다"를 뽑으면, 똑같이 하고 묻힌 영상들이 보이지 않는다.
 * 같은 검색어에서 나온 하위군을 대조군으로 함께 넣는다.
 */

/** 대조군 한쪽의 최대 크기 */
export const COHORT_SIZE = 10;

export interface Cohort {
  top: VideoWithMetrics[];
  bottom: VideoWithMetrics[];
}

/**
 * 성과배수 기준 상위군/하위군을 고른다.
 *
 * 성과배수는 이미 채널 크기로 나눈 값이라, 두 군의 차이는 "채널이 커서"가
 * 아니라 "그 채널 기준으로 잘 됐는가"의 차이다. 같은 검색어에서 왔으므로
 * 주제도 통제되어 있다.
 */
export function selectCohort(videos: VideoWithMetrics[], size: number = COHORT_SIZE): Cohort {
  const measurable = videos
    .filter((v) => v.metrics.performanceMultiple !== null)
    .sort((a, b) => (b.metrics.performanceMultiple ?? 0) - (a.metrics.performanceMultiple ?? 0));

  // 표본이 적으면 같은 영상이 양쪽에 들어갈 수 있다. 그러면 대조가 성립하지
  // 않으므로 겹치지 않는 만큼만 자른다.
  const half = Math.min(size, Math.floor(measurable.length / 2));
  if (half === 0) return { top: [], bottom: [] };

  return {
    top: measurable.slice(0, half),
    bottom: measurable.slice(-half),
  };
}

function describeBaseline(video: VideoWithMetrics): string {
  const { baselineSource, baselinePeerCount } = video.metrics;
  if (baselineSource === 'format-median') {
    return `같은 채널 같은 포맷 최근 ${baselinePeerCount}편의 중앙값`;
  }
  if (baselineSource === 'lifetime-mean') {
    return '채널 전체 평균 (최근 목록 없음, Shorts/롱폼 구분 안 됨 — 신뢰도 낮음)';
  }
  return '계산 불가';
}

function daysLabel(video: VideoWithMetrics): string {
  return `${video.metrics.daysSincePublish}일`;
}

function tagsLabel(video: VideoWithMetrics): string {
  if (video.tags.length === 0) return '(없음)';
  return video.tags.slice(0, 6).join(', ');
}

/** 표의 셀에서 |와 줄바꿈이 표를 깨뜨리지 않게 한다. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function tableRows(videos: VideoWithMetrics[], startIndex: number): string {
  return videos
    .map((v, i) =>
      [
        `${startIndex + i}`,
        cell(v.title),
        formatMultiple(v.metrics.performanceMultiple),
        formatViewCount(v.viewCount),
        formatDuration(v.duration),
        formatPercent(v.metrics.likeRate),
        daysLabel(v),
        cell(tagsLabel(v)),
      ].join(' | '),
    )
    .map((row) => `| ${row} |`)
    .join('\n');
}

const TABLE_HEADER = `| # | 제목 | 성과배수 | 조회수 | 길이 | 좋아요율 | 경과 | 태그 |
|---|---|---|---|---|---|---|---|`;

/** 데이터로 확인할 수 없는 것을 매번 명시한다. 숨기면 모델이 채워 넣는다. */
const DATA_LIMITS = `## 이 데이터에 없는 것 (추측하지 말 것)
- **썸네일 이미지**: 앱의 "썸네일 시트 복사"로 만든 격자 이미지(각 칸의 #번호 = 아래 표의 행 번호)를 이 대화에 붙여넣거나, 아래 링크를 직접 열어 첨부하면 그때 분석 가능. 첨부 전에는 썸네일 구성·색·표정에 대해 쓰지 말 것.
- **영상 내용/자막**: YouTube 공식 API는 타인 영상의 자막을 제공하지 않는다(소유자 OAuth 필요). 대본 구조·훅·전개는 자막을 직접 붙여넣기 전까지 분석 대상이 아니다.
- **시청 지속률·CTR·노출수**: 채널 소유자만 볼 수 있다. 이탈 구간 추정 금지.
- **알고리즘 노출량**: 조회수에는 추천 노출 효과가 섞여 있고, 그 비중은 알 수 없다.
- **조회수 집계 기준 변경**: 2026-08-27부터 모든 포맷에서 재생 시작 즉시(자동재생·호버 포함) 조회수로 센다. 그 이전 영상과 이후 영상의 조회수·일평균은 같은 기준이 아니다.`;

const OUTPUT_RULES = `## 작성 규칙
- 모든 주장에 **표의 행 번호**를 근거로 붙인다 (예: "상위군 #1,#3,#7").
- 패턴을 제시할 때는 **상위군 n건 / 하위군 n건**을 세어서 함께 적는다. 세어보지 않은 인상은 쓰지 않는다.
- 표에 없는 항목은 반드시 **"데이터 없음"**이라고 명시한다. 합리적 가정으로 메우지 않는다.
- 두 군의 차이가 보이지 않으면 **"차이 없음"**이라고 쓴다. 억지로 만들지 않는다.
- 표본 크기를 감안해 단정하지 않는다. 이 표본으로 말할 수 있는 범위를 넘지 않는다.
- 출력은 Markdown.`;

/** 번호는 표의 행 번호(startIndex부터)와 같아야 썸네일 시트의 #라벨과 맞는다. */
function thumbnailSection(videos: VideoWithMetrics[], label: string, startIndex: number): string {
  const links = videos
    .map((v, i) => (v.thumbnailHighUrl ? `#${startIndex + i}. ${v.thumbnailHighUrl}` : null))
    .filter((line): line is string => line !== null)
    .join('\n');
  if (!links) return '';
  return `\n## ${label} 썸네일 링크 (시트를 못 붙였을 때 직접 열어 첨부)\n${links}\n`;
}

/**
 * 키워드 시장 분석: 상위군 vs 하위군 비교.
 *
 * 이 도구에서 가장 값이 큰 출력이다. N=1은 사후 서사밖에 안 나오지만,
 * 같은 주제의 두 집단을 비교하면 셀 수 있는 진술이 나온다.
 */
export function buildMarketAnalysisPrompt(searchTerm: string, cohort: Cohort): string {
  const { top, bottom } = cohort;
  const bottomStart = top.length + 1;

  return `# 분석 과제
검색어 **"${searchTerm}"** 결과에서, 상위군과 하위군을 가르는 요인을 찾아주세요.

## 먼저 읽을 것 — 이 데이터의 성격
- 두 군은 **같은 검색어 결과**에서 나왔습니다. 주제는 통제되어 있습니다.
- **성과배수 = 조회수 ÷ 그 채널의 평균 조회수**입니다. 채널 규모 효과는 이미 나눠서 제거했습니다.
  따라서 두 군의 차이는 "채널이 커서"가 아니라 "자기 채널 기준으로 잘 됐는가"의 차이입니다.
- 표본은 상위 ${top.length}건 / 하위 ${bottom.length}건, 총 ${top.length + bottom.length}건입니다.

## 상위군 (채널 평소 대비 크게 초과)
${TABLE_HEADER}
${tableRows(top, 1)}

## 하위군 (채널 평소 대비 미달)
${TABLE_HEADER}
${tableRows(bottom, bottomStart)}

${DATA_LIMITS}
${thumbnailSection(top, '상위군', 1)}${thumbnailSection(bottom, '하위군', bottomStart)}
## 요청
1. **제목 언어의 차이**: 상위군에만 반복되는 표현/구조 패턴을 찾고, 각 패턴이 상위군 몇 건·하위군 몇 건에 나타나는지 세어 표로 제시.
2. **길이 분포**: 두 군의 영상 길이에 차이가 있는지. 있으면 구간별로, 없으면 "차이 없음".
3. **업로드 시점**: 경과일 분포에 차이가 있는지. (오래된 영상일수록 조회수가 누적된다는 점을 감안할 것)
4. **태그 사용**: 상위군에만 나타나는 태그, 두 군 공통 태그를 구분.
5. **좋아요율**: 성과배수와 좋아요율이 같이 움직이는지, 아니면 무관한지.
6. **설명되지 않는 부분**: 위 관찰로 설명이 안 되는 상위군 항목을 짚고, 무엇을 더 봐야 하는지.

${OUTPUT_RULES}`;
}

/**
 * 영상 1건 분석. 같은 검색 결과의 하위군을 대조군으로 함께 싣는다.
 *
 * 대조군 없이 잘된 영상 하나만 주면 무엇이 원인인지 원리적으로 가릴 수 없다.
 */
export function buildSingleVideoPrompt(
  video: VideoWithMetrics,
  cohort: Cohort,
  searchTerm: string,
): string {
  const contrast = cohort.bottom.filter((v) => v.id !== video.id).slice(0, 5);

  const contrastSection =
    contrast.length > 0
      ? `## 대조군 — 같은 검색어에서 채널 평소에 못 미친 영상
${TABLE_HEADER}
${tableRows(contrast, 1)}

이 영상들과 **무엇이 달랐는지**를 기준으로 보세요. 대상 영상만 보고 성공 요인을 지목하면, 같은 방식으로 하고 묻힌 영상들이 보이지 않습니다.`
      : `## 대조군 없음
검색 결과가 적어 비교할 하위군을 만들지 못했습니다. **단일 사례이므로 인과 진단은 불가능합니다.**
아래 분석은 "이 영상에서 관찰되는 것"까지만 쓰고, "이래서 성공했다"는 단정은 하지 마세요.`;

  return `# 분석 대상
- **제목**: ${video.title}
- **채널**: ${video.channelTitle} (구독자 ${formatSubscriberCount(video.channel.subscriberCount)})
- **성과배수(채널 평소 대비)**: ${formatMultiple(video.metrics.performanceMultiple)} — 기준선: ${describeBaseline(video)}
- **조회수**: ${formatViewCount(video.viewCount)} (일평균 ${formatViewCount(Math.round(video.metrics.viewsPerDay))})
- **좋아요율**: ${formatPercent(video.metrics.likeRate)} / **댓글율**: ${formatPercent(video.metrics.commentRate)}
- **길이**: ${formatDuration(video.duration)}
- **업로드**: ${video.metrics.daysSincePublish}일 전
- **태그**: ${tagsLabel(video)}
- **자막 트랙**: ${video.hasCaption ? '있음 (내용은 API로 받을 수 없음)' : '없음'}
- **검색어**: "${searchTerm}"
- **링크**: https://www.youtube.com/watch?v=${video.id}

${contrastSection}

${DATA_LIMITS}
${thumbnailSection([video], '대상 영상', 1)}
## 요청
1. **제목 분석**: 대상 영상의 제목이 대조군 제목들과 구조적으로 무엇이 다른지. 다르지 않으면 "차이 없음".
2. **관찰 가능한 성과 신호**: 성과배수·좋아요율·댓글율·일평균 조회수에서 읽을 수 있는 것. 각 수치가 무엇을 시사하고 무엇을 시사하지 **않는지** 함께.
3. **가설과 확인 방법**: 성공 요인 가설 3개. 각 가설마다 **무엇을 추가로 보면 검증되는지**를 적을 것 (예: "썸네일 첨부", "자막 붙여넣기").
4. **내 주제 적용**: 아래 주제로 제목 5안. 각 안이 위 관찰 중 무엇에 근거하는지 표시.

**👇 내 주제를 여기에 입력하세요 (비워두면 4번은 건너뛰세요):**
\`\`\`
[여기에 내 주제 입력]
\`\`\`

${OUTPUT_RULES}`;
}
