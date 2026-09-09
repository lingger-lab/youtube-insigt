import type { VideoWithMetrics } from '../../types/youtube.ts';
// 런타임 import에는 .ts 확장자가 필요하다 (node --test가 이 모듈을 직접 실행한다).
import { formatViewCount, formatPercent, formatMultiple, formatSubscriberCount } from './helpers.ts';
import { formatDuration, getVideoType, type VideoType } from './videoUtils.ts';
import { selectPrinciples, renderPlaybook } from './playbook.ts';

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

  // 기준선이 같은 포맷 중앙값인 영상을 먼저 쓴다. 채널 전체 평균(lifetime-mean)은
  // Shorts가 섞인 대형 채널의 롱폼을 0.1배로 만드는 식으로 배수 자체가 다른 뜻이라,
  // 그런 영상이 하위군에 들어가면 "무엇이 달랐나"의 답이 기준선 차이로 오염된다.
  // 실측(2026-09-08): 하위군 10건 중 3건이 이 경우였다. 모자랄 때만 채운다.
  const reliable = measurable.filter((v) => v.metrics.baselineSource === 'format-median');
  const fallback = measurable.filter((v) => v.metrics.baselineSource !== 'format-median');

  // 두 목록 모두 내림차순이다. 상위군은 앞에서, 하위군은 남은 것의 뒤에서(=오름차순 앞에서) 뽑는다.
  const top = [...reliable, ...fallback].slice(0, half);
  const taken = new Set(top.map((v) => v.id));
  const remaining = (list: VideoWithMetrics[]) => list.filter((v) => !taken.has(v.id)).reverse();
  const bottom = [...remaining(reliable), ...remaining(fallback)].slice(0, half).reverse();

  return { top, bottom };
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

function formatLabel(v: VideoWithMetrics): string {
  const t = getVideoType(v.duration, v.liveStatus);
  return t === 'shorts' ? 'Shorts' : t === 'long' ? '롱폼' : 'LIVE';
}

function median(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function secondsOf(v: VideoWithMetrics): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(v.duration);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function clockOf(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 군 요약 — 중앙값은 앱이 계산한다. 실측(V.5, GPT)에서 모델이 표를 보고 손으로 중앙값을
 * 냈는데, 산수는 결정적 작업이라 모델에게 맡길 이유가 없다.
 */
function cohortSummary(videos: VideoWithMetrics[]): string {
  const shorts = videos.filter((v) => getVideoType(v.duration, v.liveStatus) === 'shorts').length;
  const long = videos.filter((v) => getVideoType(v.duration, v.liveStatus) === 'long').length;
  const live = videos.length - shorts - long;
  const len = median(videos.filter((v) => v.liveStatus === 'none').map(secondsOf));
  const days = median(videos.map((v) => v.metrics.daysSincePublish));
  const like = median(videos.map((v) => v.metrics.likeRate).filter((x): x is number => x !== null));
  const mult = median(videos.map((v) => v.metrics.performanceMultiple).filter((x): x is number => x !== null));
  const chars = median(videos.map((v) => [...v.title].length));
  return `요약: n=${videos.length} · Shorts ${shorts} / 롱폼 ${long}${live ? ` / 라이브 ${live}` : ''} · 길이 중앙값 ${len === null ? '—' : clockOf(len)} · 경과일 중앙값 ${days === null ? '—' : Math.round(days).toLocaleString()}일 · 좋아요율 중앙값 ${formatPercent(like)} · 성과배수 중앙값 ${formatMultiple(mult)} · 제목 글자수 중앙값 ${chars === null ? '—' : Math.round(chars)} · 주제: ${topicDistribution(videos)} · 음성: ${audioDistribution(videos)}`;
}

function tableRows(videos: VideoWithMetrics[], startIndex: number): string {
  return videos
    .map((v, i) =>
      [
        `${startIndex + i}`,
        cell(v.title),
        // 글자 수는 앱이 센다. 모델에게 세라고 하면 기준이 없다며 거부하거나(실측) 틀리게 센다.
        `${[...v.title].length}`,
        formatLabel(v),
        formatMultiple(v.metrics.performanceMultiple),
        formatViewCount(v.viewCount),
        v.liveStatus === 'none' ? formatDuration(v.duration) : 'LIVE',
        formatPercent(v.metrics.likeRate),
        daysLabel(v),
        pplLabel(v),
        cell(tagsLabel(v)),
      ].join(' | '),
    )
    .map((row) => `| ${row} |`)
    .join('\n');
}

/** 유료 PPL 표시. 옛 이력(필드 없음)은 —. */
function pplLabel(v: VideoWithMetrics): string {
  if (v.hasPaidProductPlacement === undefined) return '—';
  return v.hasPaidProductPlacement ? 'Y' : 'N';
}

/** "Food 4, Lifestyle (sociology) 2" 처럼 빈도순. 필드 없는 옛 이력만이면 —. */
function topicDistribution(videos: VideoWithMetrics[]): string {
  const counts = new Map<string, number>();
  let known = 0;
  for (const v of videos) {
    if (!v.topicCategories) continue;
    known += 1;
    for (const t of v.topicCategories) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (known === 0) return '—';
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return top.length ? top.map(([t, n]) => `${t} ${n}`).join(', ') : '(없음)';
}

function audioDistribution(videos: VideoWithMetrics[]): string {
  const counts = new Map<string, number>();
  let known = 0;
  for (const v of videos) {
    if (v.audioLanguage === undefined) continue;
    known += 1;
    const key = v.audioLanguage ?? '미지정';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (known === 0) return '—';
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(', ');
}

const TABLE_HEADER = `| # | 제목 | 글자수 | 포맷 | 성과배수 | 조회수 | 길이 | 좋아요율 | 경과 | PPL | 태그 |
|---|---|---|---|---|---|---|---|---|---|---|`;

const TABLE_LEGEND = `범례: 글자수 = 공백·기호·해시태그 포함 유니코드 문자 수(앱이 셈) · 태그 (없음) = 업로더가 태그를 달지 않음(데이터 없음이 아님) · 포맷은 길이·liveBroadcastContent로 판별 · PPL = 업로더가 표시한 유료 광고 포함 여부(Y/N, — 는 이 필드가 없던 옛 이력).
**포맷이 다른 행끼리 길이·구조·훅을 비교하지 말 것** — 포맷별로 나눠 세고, 한쪽 포맷만 있으면 그렇게 적는다.`;

/** 사용자가 붙여넣은 자막에서 프롬프트에 싣는 최대 길이. 넘치면 앞부분만 싣고 그 사실을 적는다. */
export const TRANSCRIPT_MAX_CHARS = 12_000;

/**
 * 데이터로 확인할 수 없는 것을 매번 명시한다. 숨기면 모델이 채워 넣는다.
 * 자막을 사용자가 붙여넣었으면 그 항목만 목록에서 빠진다.
 */
function dataLimits(hasTranscript: boolean): string {
  const transcriptLine = hasTranscript
    ? ''
    : `\n- **영상 내용/자막**: YouTube 공식 API는 타인 영상의 자막을 제공하지 않는다(소유자 OAuth 필요). 대본 구조·훅·전개는 자막을 직접 붙여넣기 전까지 분석 대상이 아니다.`;
  return `## 이 데이터에 없는 것 (추측하지 말 것)
- **썸네일 이미지 — 텍스트로는 못 실음** (없는 게 아니라 첨부 방법의 문제): 앱의 "썸네일 시트 복사"로 만든 격자 이미지(각 칸의 #번호 = 아래 표의 행 번호)를 이 대화에 붙여넣거나, 아래 링크를 직접 열어 첨부하면 그때 분석 가능. 첨부 전에는 썸네일 구성·색·표정에 대해 쓰지 말 것.${transcriptLine}
- **시청 지속률·CTR·노출수**: 채널 소유자만 볼 수 있다. 이탈 구간 추정 금지.
- **알고리즘 노출량**: 조회수에는 추천 노출 효과가 섞여 있고, 그 비중은 알 수 없다.
- **조회수 집계 기준 변경**: 2026-08-27부터 모든 포맷에서 재생 시작 즉시(자동재생·호버 포함) 조회수로 센다. 그 이전 영상과 이후 영상의 조회수·일평균은 같은 기준이 아니다.`;
}

/** 자막 섹션. 사용자가 준 텍스트 그대로 싣되, 상한을 넘으면 앞부분만 싣고 밝힌다. */
function transcriptSection(transcript: string): string {
  const trimmed = transcript.trim();
  const truncated = trimmed.length > TRANSCRIPT_MAX_CHARS;
  const body = truncated ? trimmed.slice(0, TRANSCRIPT_MAX_CHARS) : trimmed;
  const note = truncated
    ? `\n\n(전체 ${trimmed.length.toLocaleString()}자 중 앞 ${TRANSCRIPT_MAX_CHARS.toLocaleString()}자만 포함. 뒷부분은 분석 대상이 아니다.)`
    : '';
  return `## 자막 (사용자가 YouTube에서 복사해 붙여넣음)
\`\`\`
${body}
\`\`\`${note}
`;
}

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

/** 시안 대상 포맷. 라이브는 시안 대상이 아니다. 섞여 있으면 null(원칙 전부 싣고 표기). */
function proposalFormat(videos: VideoWithMetrics[]): Exclude<VideoType, 'live'> | null {
  const kinds = new Set(videos.map((v) => getVideoType(v.duration, v.liveStatus)).filter((t) => t !== 'live'));
  if (kinds.size === 1) return [...kinds][0] as Exclude<VideoType, 'live'>;
  return null;
}

/**
 * 상위 영상 vs 그 채널의 평소 제목. 채널·주제·구독자가 같으니 가장 통제된 대조다.
 * 같은 포맷 동료를 조회수순으로 세워 중앙값 주변 3편을 고른다 (평소 = 중간쯤 한 영상).
 * 제목은 이미 부르는 videos.list 응답에 있어 할당량 0. 2026-09-09 이전 보관분에는 없다.
 */
function channelContrastSection(top: VideoWithMetrics[], startIndex: number): string {
  const rows = top
    .map((v, i) => {
      const uploads = v.channel.recentUploads ?? [];
      const format = getVideoType(v.duration, v.liveStatus);
      const peers = uploads
        .filter((u) => u.id !== v.id && u.title && getVideoType(u.duration, u.liveStatus) === format)
        .sort((a, b) => a.viewCount - b.viewCount);
      if (peers.length === 0) return null;
      const mid = Math.floor(peers.length / 2);
      const around = peers.slice(Math.max(0, mid - 1), mid + 2).map((u) => cell(u.title ?? ''));
      return `| ${startIndex + i} | ${cell(v.title)} | ${around.join(' / ')} |`;
    })
    .filter((row): row is string => row !== null);

  if (rows.length === 0) {
    return `## 채널 평소 제목 대조
이 이력에는 채널 평소 제목이 저장되지 않았습니다 (2026-09-09 이전 저장분). 다시 검색하면 포함됩니다.`;
  }
  return `## 채널 평소 제목 대조 (상위 영상 vs 같은 채널·같은 포맷의 중앙값 근처 3편)
같은 채널이라 주제·구독자·스타일이 통제된다. **터진 영상의 제목이 그 채널 평소와 무엇이 달랐는지**가 여기서 보인다.
| # | 상위 영상 제목 | 그 채널 평소 제목 (중앙값 근처 3편) |
|---|---|---|
${rows.join('\n')}`;
}

export interface ProposalOptions {
  /** 사용자가 적은 "내 주제/채널". 없으면 입력 칸을 남기고 검색어와 같은 주제로 가정하게 한다. */
  topic?: string;
}

/**
 * 시안 절 — 원본 기획(2025-12)의 5부 구조를 되살리되, 모든 문장에 근거 표기를 강제한다.
 * 관찰(표) → 원칙(플레이북) → 시안 순서여야 "[행 n]"과 "[원칙 ID]" 인용이 성립한다.
 */
function proposalSection(searchTerm: string, format: Exclude<VideoType, 'live'> | null, options: ProposalOptions): string {
  const topic = (options.topic ?? '').trim();
  const topicBlock = topic
    ? `**내 주제/채널**: ${topic}`
    : `**👇 내 주제/채널을 여기에 입력하세요.** 비워 두면 검색어 **"${searchTerm}"**와 같은 주제로 가정하고, 그 가정을 시안 첫 줄에 적으세요.
\`\`\`
[여기에 내 주제 입력]
\`\`\``;
  const formatLabel = format === 'shorts' ? 'Shorts' : format === 'long' ? '롱폼' : '혼합 (상위군에 Shorts와 롱폼이 섞여 있음 — 시안마다 포맷을 명시)';
  const hookPrinciple = format === 'shorts' ? 'K1' : format === 'long' ? 'K2' : 'K1/K2';
  const structurePrinciple = format === 'shorts' ? 'S2' : format === 'long' ? 'S1' : 'S1/S2';

  return `${renderPlaybook(selectPrinciples(format))}

# 시안 — 위 관찰과 일반 원칙에 근거해서만
${topicBlock}

시안 대상 포맷: **${formatLabel}**

### A. 클릭 트리거 (상위군에서 실제로 작동한 것)
- [원칙 G1]의 후보 중 상위군에서 세어진 트리거 TOP 3~5. 각 트리거마다: 근거 [행 n] (상위군 n건 / 하위군 n건) / 내 주제 적용 카피 1줄 / 기대 효과(CTR·시청지속·완시율 중 하나).
- 채널 평소 제목 대조 표가 있으면, 터진 영상이 그 채널 평소와 **무엇을 바꿨는지**를 먼저 적는다.

### B. 제목·썸네일 세트 5개 ([원칙 G2] 유형: 직설형 · 호기심형 · 숫자형 · 반전형 · 권위/사회적증거형)
각 세트에:
- 제목 (글자 수 표기 [원칙 T2·T4]) — 상위군 제목을 **베끼지 말고** 약속의 형태만 가져온다
- 썸네일 텍스트 (4단어 이하 [원칙 H1]) — 제목과 중복 금지 [원칙 T5]
- 썸네일 구성 (피사체 / 앵글 / 대비 / 여백 [원칙 H2·H3]) — 상위군 썸네일 #번호는 **시트가 첨부됐을 때만** 근거로 쓴다. 미첨부면 [원칙]만.
- 근거: [행 n] 또는 [원칙 ID]
- 금지 요소 (작은 글자, 저해상도, 본편이 못 지키는 약속 [원칙 T6])
- 기대 KPI (CTR / 평균 시청시간 / 완시율 중 하나) — 수치 예측은 쓰지 않는다

### C. 구조 설계 (포맷: ${formatLabel})
- 길이: 상위군 길이 분포에서 [행 n]
- 훅 3안 → 최적 1안 [원칙 ${hookPrinciple}]. 자막이 없으면 첫 문장은 [가정]으로 표기
- 타임라인 [원칙 ${structurePrinciple}] — 블록별 **목적과 장치**만. 대사 전문은 쓰지 않는다
- 이탈 위험 구간 & 회수 장치 표 (구간 / 위험 신호 / 개입) — 시청지속률 데이터가 없으므로 전부 [가정] 또는 [원칙]
- 톤 & 보이스 3줄, 금지 리스트 3개

### D. 벤치마킹 → 적용 매핑표
| 원본 요소 [행 n] | 내 영상 적용 | 근거 ([행] / [원칙]) | 기대 KPI |
|---|---|---|---|

### E. 자기점검과 검증
- 세트마다: 제목·썸네일의 약속을 본편이 **지킬 수 있는가** Y/N + 이유 [원칙 T6]
- 서로 다른 유형 3안을 골라 **YouTube Studio Test & Compare** 후보로 표기 [원칙 V1]. 이 앱도 이 답변도 승자를 판정하지 못한다 — 판정은 Test & Compare(롱폼) 또는 수동 비교(Shorts)뿐이다.

### F. 복사용 요약
- 제목 5개 리스트 / 썸네일 텍스트 5개 리스트 / 1문장 전략 요약(TL;DR)

## 시안 작성 규칙
- 시안의 **모든 문장**에 [행 n] / [원칙 ID] / [가정] / [데이터 없음] 중 하나를 단다. 넷 다 달 수 없는 문장은 쓰지 않는다.
- 답변 **맨 끝에 체크표**: A~F 각 절이 있는가(Y/N), 세트가 5개인가, 태그 없는 시안 문장이 0개인가, 관찰의 중앙값을 표의 요약 줄과 대조했는가. N이 있으면 그 자리에서 채운다.
- [가정]은 숨기지 않고 그대로 드러낸다. "부족하면 가정하고 진행"이 아니라 **가정임을 표기하고 진행**이다.
- 원칙과 이 검색어의 데이터가 충돌하면 데이터를 따르고, 충돌을 그대로 적는다.
- 근거 없는 효과 수치("CTR 30% 상승")는 쓰지 않는다.`;
}

/**
 * 키워드 시장 분석: 상위군 vs 하위군 비교.
 *
 * 이 도구에서 가장 값이 큰 출력이다. N=1은 사후 서사밖에 안 나오지만,
 * 같은 주제의 두 집단을 비교하면 셀 수 있는 진술이 나온다.
 */
export function buildMarketAnalysisPrompt(searchTerm: string, cohort: Cohort, options: ProposalOptions = {}): string {
  const { top, bottom } = cohort;
  const bottomStart = top.length + 1;

  return `# 분석 과제
검색어 **"${searchTerm}"** 결과에서, 상위군과 하위군을 가르는 요인을 찾아주세요.

## 먼저 읽을 것 — 이 데이터의 성격
- 두 군은 **같은 검색어 결과**에서 나왔습니다. 주제는 통제되어 있습니다.
- **성과배수 = 조회수 ÷ 같은 채널·같은 포맷(Shorts/롱폼) 최근 영상의 중앙값**(본 영상 제외)입니다.
  채널 규모 효과는 이미 나눠서 제거했습니다. 따라서 두 군의 차이는 "채널이 커서"가 아니라
  "자기 채널 기준으로 잘 됐는가"의 차이입니다. (최근 목록이 없는 채널은 채널 전체 평균으로 대체 — 표에 표시)
- **하위군도 대개 1배를 넘습니다.** 검색 결과는 YouTube가 이미 고른 승자 집합이라, 하위군은
  "실패작"이 아니라 이 결과 안에서 상대적으로 낮은 쪽입니다. 검색에 아예 안 뜬 영상은 여기 없습니다.
- 표본은 상위 ${top.length}건 / 하위 ${bottom.length}건, 총 ${top.length + bottom.length}건입니다.

## 상위군 (성과배수 상위)
${cohortSummary(top)}
${TABLE_HEADER}
${tableRows(top, 1)}

## 하위군 (성과배수 하위 — 결과 안에서 상대적으로 낮은 쪽)
${cohortSummary(bottom)}
${TABLE_HEADER}
${tableRows(bottom, bottomStart)}

${TABLE_LEGEND}

${channelContrastSection(top, 1)}

${dataLimits(false)}
${thumbnailSection(top, '상위군', 1)}${thumbnailSection(bottom, '하위군', bottomStart)}
## 요청
1. **제목 언어의 차이**: 상위군에만 반복되는 표현/구조 패턴을 찾고, 각 패턴이 상위군 몇 건·하위군 몇 건에 나타나는지 세어 표로 제시.
2. **길이 분포**: 두 군의 영상 길이에 차이가 있는지. 있으면 구간별로, 없으면 "차이 없음".
3. **업로드 시점**: 경과일 분포에 차이가 있는지. (오래된 영상일수록 조회수가 누적된다는 점을 감안할 것)
4. **태그 사용**: 상위군에만 나타나는 태그, 두 군 공통 태그를 구분.
5. **좋아요율**: 성과배수와 좋아요율이 같이 움직이는지, 아니면 무관한지.
6. **설명되지 않는 부분**: 위 관찰로 설명이 안 되는 상위군 항목을 짚고, 무엇을 더 봐야 하는지.

${OUTPUT_RULES}

${proposalSection(searchTerm, proposalFormat(top), options)}`;
}

/**
 * 영상 1건 분석. 같은 검색 결과의 하위군을 대조군으로 함께 싣는다.
 *
 * 대조군 없이 잘된 영상 하나만 주면 무엇이 원인인지 원리적으로 가릴 수 없다.
 */
export interface SingleVideoPromptOptions extends ProposalOptions {
  /** 사용자가 YouTube에서 복사해 붙여넣은 자막. 있을 때만 대본 구조 분석을 요청한다. */
  transcript?: string;
}

export function buildSingleVideoPrompt(
  video: VideoWithMetrics,
  cohort: Cohort,
  searchTerm: string,
  options: SingleVideoPromptOptions = {},
): string {
  const contrast = cohort.bottom.filter((v) => v.id !== video.id).slice(0, 5);
  const hasTranscript = (options.transcript ?? '').trim().length > 0;

  const contrastSection =
    contrast.length > 0
      ? `## 대조군 — 같은 검색어에서 채널 평소에 못 미친 영상
${cohortSummary(contrast)}
${TABLE_HEADER}
${tableRows(contrast, 1)}

${TABLE_LEGEND}

이 영상들과 **무엇이 달랐는지**를 기준으로 보세요. 대상 영상만 보고 성공 요인을 지목하면, 같은 방식으로 하고 묻힌 영상들이 보이지 않습니다.`
      : `## 대조군 없음
검색 결과가 적어 비교할 하위군을 만들지 못했습니다. **단일 사례이므로 인과 진단은 불가능합니다.**
아래 분석은 "이 영상에서 관찰되는 것"까지만 쓰고, "이래서 성공했다"는 단정은 하지 마세요.`;

  return `# 분석 대상
- **제목**: ${video.title}
- **채널**: ${video.channelTitle} (구독자 ${formatSubscriberCount(video.channel.subscriberCount)})
- **성과배수(채널 평소 대비, 누적)**: ${formatMultiple(video.metrics.performanceMultiple)} — 기준선: ${describeBaseline(video)}
- **일평균 배수**: ${formatMultiple(video.metrics.viewsPerDayMultiple)} — 일평균 조회수 ÷ 같은 채널·같은 포맷 동료의 일평균 중앙값. 누적 배수는 오래된 영상에 유리하고 일평균은 신작에 유리하므로 둘을 함께 볼 것.
- **조회수**: ${formatViewCount(video.viewCount)} (일평균 ${formatViewCount(Math.round(video.metrics.viewsPerDay))})
- **좋아요율**: ${formatPercent(video.metrics.likeRate)} / **댓글율**: ${formatPercent(video.metrics.commentRate)}
- **구독자 대비**: ${formatMultiple(video.metrics.subscriberRatio)} — 조회수 ÷ 구독자수. 참고값(구독자 비공개·반올림 때문에 주지표가 아님)
- **길이**: ${formatDuration(video.duration)}
- **업로드**: ${video.metrics.daysSincePublish}일 전
- **태그**: ${tagsLabel(video)}
- **자막 트랙**: ${video.hasCaption ? '있음 (내용은 API로 받을 수 없음)' : '없음'}
- **유료 PPL 표시**: ${pplLabel(video)} / **주제 분류**: ${video.topicCategories ? video.topicCategories.join(', ') || '(없음)' : '—'} / **음성 언어**: ${video.audioLanguage === undefined ? '—' : (video.audioLanguage ?? '미지정')}
- **검색어**: "${searchTerm}"
- **링크**: https://www.youtube.com/watch?v=${video.id}

${contrastSection}

${dataLimits(hasTranscript)}
${thumbnailSection([video], '대상 영상', 1)}
${hasTranscript ? transcriptSection(options.transcript as string) : ''}
## 요청
1. **제목 분석**: 대상 영상의 제목이 대조군 제목들과 구조적으로 무엇이 다른지. 다르지 않으면 "차이 없음".
2. **관찰 가능한 성과 신호**: 성과배수·좋아요율·댓글율·일평균 조회수에서 읽을 수 있는 것. 각 수치가 무엇을 시사하고 무엇을 시사하지 **않는지** 함께.
3. **가설과 확인 방법**: 성공 요인 가설 3개. 각 가설마다 **무엇을 추가로 보면 검증되는지**를 적을 것 (예: "썸네일 첨부"${hasTranscript ? '' : ', "자막 붙여넣기"'}).
${
  hasTranscript
    ? `4. **대본 구조 (자막 근거)**: 훅(첫 15초 안에 무엇을 약속/제기하는지), 전개 순서, 패턴 인터럽트(질문·반전·전환)가 나오는 지점, 마무리/CTA. **각 항목마다 자막의 어느 문장이 근거인지 그대로 인용**할 것. 자막에 없는 시각 요소(자막·B-roll·표정)는 "자막으로는 알 수 없음"이라고 쓸 것.
`
    : ''
}
${OUTPUT_RULES}

${channelContrastSection([video], 0).replace('| 0 |', '| 대상 |')}

${proposalSection(searchTerm, proposalFormat([video]), options)}`;
}
