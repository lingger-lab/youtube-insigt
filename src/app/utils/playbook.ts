import type { VideoType } from './videoUtils.ts';

/**
 * 플레이북 — 시안을 만들 때 LLM이 기대도 되는 "범용 원칙"의 목록.
 *
 * 왜 필요한가. 검색 결과 상위 10 / 하위 10은 통계가 아니다(실측: 제목 길이·숫자·기호
 * 같은 표면 특징은 두 군이 갈리지 않았다). 데이터가 얇은 자리를 LLM이 자기 기억 속
 * 관행으로 메우면 그게 근거 없는 창작이 된다. 그래서 앱이 원칙을 **직접 들고**,
 * 각 원칙에 신뢰도와 출처를 달아 프롬프트에 싣는다. 시안의 모든 문장은
 * `[행 n]`(데이터) / `[원칙 ID]`(여기) / `[가정]` 중 하나를 달아야 한다.
 *
 * 원칙과 데이터가 충돌하면 데이터가 이긴다 — 단, 충돌을 보고하게 한다.
 * 갱신은 커밋으로만 한다. 수치("2.3배") 같은 검증 불가 주장은 싣지 않는다.
 */

export const PLAYBOOK_VERSION = '2026-09-09';

export type PrincipleArea = 'trigger' | 'title' | 'thumbnail' | 'hook' | 'structure' | 'verify';
export type Confidence = '높음' | '중간' | '낮음';

export interface Principle {
  /** T1, H2 처럼 짧은 ID. 프롬프트 인용 표기에 쓴다. */
  id: string;
  area: PrincipleArea;
  statement: string;
  confidence: Confidence;
  source: string;
  /** 비우면 모든 포맷. 라이브는 시안 대상이 아니다. */
  formats?: Exclude<VideoType, 'live'>[];
}

export const PLAYBOOK: readonly Principle[] = [
  // ── 클릭 트리거 (원본 기획의 후보 목록) ──
  {
    id: 'G1',
    area: 'trigger',
    statement:
      '클릭 트리거 후보: 호기심 갭 · 새로움/의외성 · 숫자·구체성 · 사회적 증거/권위 · 손실 회피 · 희소성/긴급성 · 자기정체성 · 논쟁성 · 전/후 대비 · 감정(경외/유머/분노). 상위군에서 실제로 세어진 것만 "작동했다"고 말한다.',
    confidence: '중간',
    source: '원본 기획(2025-12) 분류. 효과 크기는 이 데이터로 검증하지 않음',
  },
  {
    id: 'G2',
    area: 'trigger',
    statement:
      '세트 유형 5가지: 직설형 · 호기심형 · 숫자형 · 반전형 · 권위/사회적증거형. 후보를 낼 때 유형을 섞어 서로 다른 가설을 대표하게 한다.',
    confidence: '중간',
    source: '원본 기획(2025-12) 분류',
  },

  // ── 제목 ──
  {
    id: 'T1',
    area: 'title',
    statement: '제목 하나에 약속 하나. 대상(누구에게)과 결과(무엇이 되는지)를 구체적으로. 모음·에세이형("N가지", "~인 이유")은 약속이 흐려진다.',
    confidence: '중간',
    source: '실측(2026-09-08, 에어프라이어 레시피): 상위군은 한 재료·한 결과, 하위군은 모음·에세이형이 많았다. n=10',
  },
  {
    id: 'T2',
    area: 'title',
    statement: '30~50자가 대체로 유리하고 90자 이상은 일관되게 불리하다. 단 Food·Gaming·Entertainment 니치는 30자 미만도 유효하다.',
    confidence: '중간',
    source: 'AIR Media-Tech, 18,080채널·11니치 조사(2026). 영어권·업체 자체 연구',
  },
  {
    id: 'T3',
    area: 'title',
    statement: '숫자는 Food·Tech·Business·Fitness에서 구체적 약속일 때만 효과가 있고, 다른 니치에서는 거의 없다.',
    confidence: '중간',
    source: 'AIR Media-Tech 같은 조사',
  },
  {
    id: 'T4',
    area: 'title',
    statement: '모바일 피드에서 약 60~70자 이후는 잘린다. 핵심어·약속을 앞에 둔다.',
    confidence: '높음',
    source: 'YouTube 앱 표시 동작',
  },
  {
    id: 'T5',
    area: 'title',
    statement: '제목과 썸네일 글자는 중복하지 않고 서로 보완한다 (썸네일이 갭을 열고 제목이 맥락을 준다).',
    confidence: '중간',
    source: '크리에이터 관행. 통제 실험 없음',
  },
  {
    id: 'T6',
    area: 'title',
    statement: '본편이 지킬 수 없는 약속은 금지. Test & Compare 승자는 CTR이 아니라 노출당 시청시간으로 정해지고, 오해 유발 패키징은 CTR↑ 후 추천↓로 손해다.',
    confidence: '높음',
    source: 'YouTube 공식(Test & Compare 판정 기준)',
  },

  // ── 썸네일 ──
  {
    id: 'H1',
    area: 'thumbnail',
    statement: '썸네일 글자는 4단어 이하. 글자가 설명을 하면 안 되고 제목이 한다.',
    confidence: '낮음',
    source: '크리에이터 관행. "n% CTR" 류 수치는 출처가 검증되지 않아 싣지 않음',
  },
  {
    id: 'H2',
    area: 'thumbnail',
    statement: '얼굴+뚜렷한 감정, 또는 결과물 클로즈업 중 하나를 주피사체로. 둘 다 없으면 무엇을 봐야 할지 모른다.',
    confidence: '낮음',
    source: '크리에이터 관행',
  },
  {
    id: 'H3',
    area: 'thumbnail',
    statement: '피사체와 배경의 대비, 여백. 모바일 축소(약 160px 폭)에서도 판독되는지가 기준.',
    confidence: '중간',
    source: '표시 크기는 플랫폼 사실, 대비 원칙은 관행',
  },
  {
    id: 'H4',
    area: 'thumbnail',
    statement: '1280×720(16:9), 2MB 이하. 가장자리 10%는 UI(재생시간 배지 등)에 가릴 수 있다.',
    confidence: '높음',
    source: 'YouTube 사양',
  },

  // ── 훅 ──
  {
    id: 'K1',
    area: 'hook',
    statement: 'Shorts는 첫 3초에 이탈의 절반이 결정된다. 첫 프레임을 가장 강한 장면으로, 인사·인트로 생략, 첫 문장에서 약속 또는 결과를 보인다.',
    confidence: '중간',
    source: '분석 도구(OpusClip·Shortimize 등) 자체 데이터. 통제 실험 없음',
    formats: ['shorts'],
  },
  {
    id: 'K2',
    area: 'hook',
    statement: '롱폼은 첫 30초 안에 제목의 약속을 화면으로 확인시키고, 왜 끝까지 봐야 하는지(오픈 루프)를 하나 건다.',
    confidence: '중간',
    source: '크리에이터 관행',
    formats: ['long'],
  },

  // ── 구조 (원본 기획의 타임라인 골격) ──
  {
    id: 'S1',
    area: 'structure',
    statement:
      '롱폼 골격: HOOK(0~5s) → 전개(5~45s: 문제 정의→약속→왜 나인가) → 본론(시간 블록별 핵심 포인트, 패턴 인터럽트, 오픈 루프) → 클라이맥스/증거(전·후, 데이터) → 마무리·CTA(강요 없이). 이탈 위험 구간마다 회수 장치를 둔다.',
    confidence: '낮음',
    source: '원본 기획(2025-12) 골격. 자막·시청지속률 없이 검증 불가',
    formats: ['long'],
  },
  {
    id: 'S2',
    area: 'structure',
    statement: 'Shorts 골격: 결과/약속(0~3s) → 과정 압축(중간) → 결과 재확인 또는 반전(끝). 15~35초. 루프 재생을 고려해 끝이 처음과 이어지게.',
    confidence: '낮음',
    source: '크리에이터 관행',
    formats: ['shorts'],
  },

  // ── 검증 ──
  {
    id: 'V1',
    area: 'verify',
    statement:
      '시안의 좋고 나쁨은 이 앱도 LLM도 판정하지 못한다. 롱폼은 YouTube Studio Test & Compare에 제목·썸네일 3종을 올려 판정(변형당 1,000~5,000 노출, 최대 2주, 승자 = 노출당 시청시간). Shorts는 Test & Compare 대상이 아니라 수동 비교뿐이다.',
    confidence: '높음',
    source: 'YouTube 공식 기능 (제목 테스트 2025-12 전 채널 확대)',
  },
];

const AREA_LABEL: Record<PrincipleArea, string> = {
  trigger: '트리거·유형',
  title: '제목',
  thumbnail: '썸네일',
  hook: '훅',
  structure: '구조',
  verify: '검증',
};

/** 포맷에 맞는 원칙만. 라이브는 시안 대상이 아니므로 호출부가 걸러야 한다. */
export function selectPrinciples(format: Exclude<VideoType, 'live'> | null): Principle[] {
  return PLAYBOOK.filter((p) => !p.formats || format === null || p.formats.includes(format));
}

/** 프롬프트에 싣는 형태. ID를 그대로 인용하게 한다. */
export function renderPlaybook(principles: readonly Principle[]): string {
  const byArea = new Map<PrincipleArea, Principle[]>();
  for (const p of principles) byArea.set(p.area, [...(byArea.get(p.area) ?? []), p]);

  const sections = [...byArea.entries()].map(
    ([area, list]) =>
      `**${AREA_LABEL[area]}**\n` +
      list.map((p) => `- **[원칙 ${p.id} · ${p.confidence}]** ${p.statement} _(출처: ${p.source})_`).join('\n'),
  );

  return `## 일반 원칙 (플레이북 v${PLAYBOOK_VERSION})
신뢰도는 높음(플랫폼 사실·공식) / 중간(대규모 조사 또는 실측, 통제 실험 없음) / 낮음(관행)이다.
**이 검색어의 데이터가 원칙과 어긋나면 데이터가 우선**이며, 어긋난 사실을 그대로 적는다.

${sections.join('\n\n')}`;
}
