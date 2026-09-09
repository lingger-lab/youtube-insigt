import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { VideoData } from '../../types/youtube.ts';
import { withMetrics } from './metrics.ts';
import {
  selectCohort,
  buildMarketAnalysisPrompt,
  buildSingleVideoPrompt,
  TRANSCRIPT_MAX_CHARS,
} from './analysisPrompt.ts';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const DAY_MS = 86_400_000;

function makeVideo(id: string, multiple: number, overrides: Partial<VideoData> = {}): VideoData {
  const averageViews = 100_000;
  return {
    id,
    title: `영상 ${id}`,
    description: '설명',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    thumbnailHighUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    viewCount: Math.round(averageViews * multiple),
    likeCount: 1_000,
    commentCount: 100,
    publishedAt: new Date(NOW - 10 * DAY_MS).toISOString(),
    channelId: 'ch1',
    channelTitle: '채널',
    duration: 'PT10M',
    tags: ['태그A', '태그B'],
    categoryId: '22',
    hasCaption: true,
    liveStatus: 'none',
    channel: {
      channelId: 'ch1',
      subscriberCount: 50_000,
      hiddenSubscriberCount: false,
      videoCount: 100,
      totalViewCount: averageViews * 100,
      uploadsPlaylistId: null,
      recentUploads: null,
    },
    ...overrides,
  };
}

/** 같은 포맷 동료 3편(각 100,000회)이 있어 기준선이 format-median이 되는 채널 */
function reliableChannel(): VideoData['channel'] {
  const base = makeVideo('_', 1).channel;
  return {
    ...base,
    uploadsPlaylistId: 'UUch1',
    recentUploads: ['p1', 'p2', 'p3'].map((id) => ({
      id,
      title: `동료 ${id}`,
      viewCount: 100_000,
      duration: 'PT10M',
      publishedAt: new Date(NOW - 30 * DAY_MS).toISOString(),
      liveStatus: 'none' as const,
    })),
  };
}

/** multiple이 큰 것부터 작은 것까지 n개 */
function makeSet(n: number) {
  return withMetrics(
    Array.from({ length: n }, (_, i) => makeVideo(`v${i}`, n - i)),
    NOW,
  );
}

describe('selectCohort', () => {
  test('성과배수 기준 상위군과 하위군을 나눈다', () => {
    const { top, bottom } = selectCohort(makeSet(40), 10);
    assert.equal(top.length, 10);
    assert.equal(bottom.length, 10);
    assert.equal(top[0].id, 'v0'); // 배수 40
    assert.equal(bottom[bottom.length - 1].id, 'v39'); // 배수 1
  });

  // 같은 영상이 양쪽에 들어가면 대조가 성립하지 않는다.
  test('두 군이 겹치지 않는다', () => {
    const { top, bottom } = selectCohort(makeSet(12), 10);
    const topIds = new Set(top.map((v) => v.id));
    assert.equal(bottom.some((v) => topIds.has(v.id)), false);
    assert.equal(top.length, 6);
    assert.equal(bottom.length, 6);
  });

  test('표본이 1건이면 대조군을 만들지 않는다', () => {
    const { top, bottom } = selectCohort(makeSet(1), 10);
    assert.deepEqual([top.length, bottom.length], [0, 0]);
  });

  // 실측: 하위군 10건 중 3건이 305만 구독 채널의 롱폼인데 기준선이 Shorts 섞인 채널 평균이라
  // 0.08~0.18배로 나왔다. 신뢰도 낮은 기준선이 대조군을 오염시키면 시안 근거가 틀어진다.
  test('포맷 중앙값 영상이 충분하면 채널 전체 평균(lifetime-mean) 영상은 대조군에서 뺀다', () => {
    const reliable = withMetrics(
      Array.from({ length: 30 }, (_, i) => makeVideo(`r${i}`, 30 - i, { channel: reliableChannel() })),
      NOW,
    );
    const fallback = withMetrics([makeVideo('f-low', 0.1), makeVideo('f-mid', 15)], NOW);
    assert.equal(fallback[0].metrics.baselineSource, 'lifetime-mean');

    const { top, bottom } = selectCohort([...reliable, ...fallback], 10);
    const ids = [...top, ...bottom].map((v) => v.id);
    assert.equal(ids.includes('f-low'), false, '0.1배 lifetime-mean 영상이 하위군에 들어갔다');
    assert.equal(ids.includes('f-mid'), false);
    assert.equal(bottom[bottom.length - 1].id, 'r29');
  });

  test('포맷 중앙값 영상이 모자라면 lifetime-mean 영상으로 채운다', () => {
    const reliable = withMetrics(
      Array.from({ length: 4 }, (_, i) => makeVideo(`r${i}`, 20 - i, { channel: reliableChannel() })),
      NOW,
    );
    const fallback = withMetrics(
      Array.from({ length: 6 }, (_, i) => makeVideo(`f${i}`, 6 - i)),
      NOW,
    );
    const { top, bottom } = selectCohort([...reliable, ...fallback], 10);
    assert.equal(top.length + bottom.length, 10);
    assert.ok(bottom.some((v) => v.id.startsWith('f')));
    assert.equal(top[0].id, 'r0');
  });

  test('성과배수를 계산할 수 없는 항목은 제외한다', () => {
    const measurable = makeSet(4);
    // 영상이 1편뿐인 채널 — 비교할 나머지가 없어 성과배수를 낼 수 없다
    const unmeasurable = withMetrics(
      [makeVideo('x', 1, { channel: { ...makeVideo('x', 1).channel, videoCount: 1 } })],
      NOW,
    );
    const { top, bottom } = selectCohort([...measurable, ...unmeasurable], 10);
    const ids = [...top, ...bottom].map((v) => v.id);
    assert.equal(ids.includes('x'), false);
  });
});

describe('buildMarketAnalysisPrompt', () => {
  const prompt = buildMarketAnalysisPrompt('테스트 키워드', selectCohort(makeSet(20), 5));

  test('상위군과 하위군을 모두 싣는다', () => {
    assert.ok(prompt.includes('## 상위군'));
    assert.ok(prompt.includes('## 하위군'));
  });

  test('성과배수가 채널 크기를 이미 제거했음을 설명한다', () => {
    assert.ok(prompt.includes('채널 규모 효과는 이미 나눠서 제거'));
  });

  test('성과배수 정의가 현행(같은 포맷 최근 영상 중앙값)이다 — 옛 "채널 평균" 정의 금지', () => {
    assert.ok(prompt.includes('같은 포맷'));
    assert.ok(prompt.includes('중앙값'));
    assert.ok(!prompt.includes('÷ 그 채널의 평균 조회수'));
  });

  test('하위군을 "미달"로 부르지 않는다 — 검색 결과는 승자 집합이라 하위군도 대개 기준선 이상', () => {
    assert.ok(!prompt.includes('채널 평소 대비 미달'));
    assert.ok(prompt.includes('결과 안에서 상대적으로 낮'));
    assert.ok(prompt.includes('검색에 아예 안 뜬 영상'));
  });

  test('표본 크기를 명시한다', () => {
    assert.ok(prompt.includes('총 10건'));
  });

  test('행 번호 근거와 건수 세기를 요구한다', () => {
    assert.ok(prompt.includes('행 번호'));
    assert.ok(prompt.includes('상위군 n건 / 하위군 n건'));
  });
});

describe('프롬프트가 지어내기를 허가하지 않는다', () => {
  const prompts = [
    buildMarketAnalysisPrompt('키워드', selectCohort(makeSet(20), 5)),
    buildSingleVideoPrompt(makeSet(20)[0], selectCohort(makeSet(20), 5), '키워드'),
  ];

  // 회귀 방지: 예전 프롬프트에 있던 두 줄. 이 둘이 함께 있으면 모델이 지어낸
  // 결과를 근거 있는 분석처럼 내놓고, 사용자는 구분할 수 없다.
  test('"부족하면 가정하고 진행" 지시가 없다', () => {
    for (const p of prompts) {
      assert.equal(p.includes('합리적 가정을 명시하고 진행'), false);
      assert.equal(p.includes('가정을 명시하고 진행'), false);
    }
  });

  test('내부 사고를 숨기라는 지시가 없다', () => {
    for (const p of prompts) {
      assert.equal(p.includes('내부 사고는 숨기고'), false);
      assert.equal(p.includes('최종안만'), false);
      assert.equal(p.includes('트리 오브 생각'), false);
    }
  });

  test('데이터에 없으면 "데이터 없음"이라고 쓰도록 못 박는다', () => {
    for (const p of prompts) {
      assert.ok(p.includes('"데이터 없음"'));
      assert.ok(p.includes('합리적 가정으로 메우지 않는다'));
    }
  });

  test('없는 입력을 명시적으로 나열한다', () => {
    for (const p of prompts) {
      assert.ok(p.includes('썸네일 이미지'));
      assert.ok(p.includes('소유자 OAuth 필요'));
      assert.ok(p.includes('시청 지속률'));
    }
  });

  test('썸네일은 URL이 아니라 시트 붙여넣기 또는 직접 첨부로 안내한다', () => {
    for (const p of prompts) {
      assert.ok(p.includes('썸네일 시트 복사'));
      assert.ok(p.includes('직접 열어'));
      assert.ok(p.includes('maxresdefault'));
    }
  });

  // 시트의 #라벨과 표의 행 번호가 어긋나면 LLM이 엉뚱한 썸네일을 본다.
  test('시장 분석의 썸네일 번호는 하위군에서 상위군 뒤부터 이어진다', () => {
    const p = buildMarketAnalysisPrompt('키워드', selectCohort(makeSet(20), 5));
    assert.ok(p.includes('#1. https://i.ytimg.com/vi/v0/'));
    assert.ok(p.includes('## 하위군 썸네일'));
    assert.ok(p.includes('#6. https://i.ytimg.com/vi/'));
    assert.equal(p.includes('#11.'), false);
  });
});

describe('buildSingleVideoPrompt', () => {
  test('대조군을 함께 싣는다', () => {
    const set = makeSet(20);
    const prompt = buildSingleVideoPrompt(set[0], selectCohort(set, 5), '키워드');
    assert.ok(prompt.includes('## 대조군'));
    assert.ok(prompt.includes('같은 방식으로 하고 묻힌 영상들이 보이지 않습니다'));
  });

  test('대조군을 만들 수 없으면 인과 진단이 불가능하다고 밝힌다', () => {
    const single = makeSet(1);
    const prompt = buildSingleVideoPrompt(single[0], { top: [], bottom: [] }, '키워드');
    assert.ok(prompt.includes('대조군 없음'));
    assert.ok(prompt.includes('단일 사례이므로 인과 진단은 불가능'));
  });

  test('대상 영상 자신은 대조군에 넣지 않는다', () => {
    const set = makeSet(4);
    const cohort = selectCohort(set, 10);
    const target = cohort.bottom[0];
    const prompt = buildSingleVideoPrompt(target, cohort, '키워드');
    const contrastBlock = prompt.slice(prompt.indexOf('## 대조군'), prompt.indexOf('## 이 데이터에 없는 것'));
    assert.equal(contrastBlock.includes(`| ${target.title} |`), false);
  });

  test('가설마다 검증 방법을 요구한다', () => {
    const set = makeSet(20);
    const prompt = buildSingleVideoPrompt(set[0], selectCohort(set, 5), '키워드');
    assert.ok(prompt.includes('무엇을 추가로 보면 검증되는지'));
  });
});

describe('자막 붙여넣기', () => {
  const set = makeSet(20);
  const cohort = selectCohort(set, 5);
  const transcript = '안녕하세요 오늘은 세 가지를 말씀드립니다. 첫째… 둘째… 셋째… 구독 부탁드립니다.';

  test('자막이 없으면 대본 구조 분석을 요청하지 않고 "없는 것"에 남긴다', () => {
    const p = buildSingleVideoPrompt(set[0], cohort, '키워드');
    assert.equal(p.includes('## 자막'), false);
    assert.equal(p.includes('대본 구조 (자막 근거)'), false);
    assert.ok(p.includes('자막을 직접 붙여넣기 전까지 분석 대상이 아니다'));
  });

  test('자막이 있으면 그대로 싣고 대본 구조를 자막 인용 근거로 요청한다', () => {
    const p = buildSingleVideoPrompt(set[0], cohort, '키워드', { transcript });
    assert.ok(p.includes('## 자막 (사용자가 YouTube에서 복사해 붙여넣음)'));
    assert.ok(p.includes(transcript));
    assert.ok(p.includes('대본 구조 (자막 근거)'));
    assert.ok(p.includes('어느 문장이 근거인지 그대로 인용'));
    // 자막이 있으니 "없는 것" 목록에서 자막 항목은 빠진다
    assert.equal(p.includes('자막을 직접 붙여넣기 전까지 분석 대상이 아니다'), false);
  });

  test('공백뿐인 자막은 없는 것으로 본다', () => {
    const p = buildSingleVideoPrompt(set[0], cohort, '키워드', { transcript: '   \n  ' });
    assert.equal(p.includes('## 자막'), false);
  });

  // 조용히 자르면 모델은 뒷부분이 없는 줄 모르고 "결말이 약하다"고 쓴다.
  test('상한을 넘는 자막은 앞부분만 싣고 그 사실을 적는다', () => {
    const long = '가'.repeat(TRANSCRIPT_MAX_CHARS + 500);
    const p = buildSingleVideoPrompt(set[0], cohort, '키워드', { transcript: long });
    assert.ok(p.includes(`앞 ${TRANSCRIPT_MAX_CHARS.toLocaleString()}자만 포함`));
    assert.equal(p.includes('가'.repeat(TRANSCRIPT_MAX_CHARS + 1)), false);
  });

  test('시장 분석 프롬프트는 자막과 무관하게 자막 항목을 "없는 것"에 둔다', () => {
    const p = buildMarketAnalysisPrompt('키워드', cohort);
    assert.ok(p.includes('자막을 직접 붙여넣기 전까지 분석 대상이 아니다'));
  });
});

describe('표 형식', () => {
  test('제목의 파이프 문자가 표를 깨뜨리지 않는다', () => {
    const video = withMetrics([makeVideo('v0', 5, { title: 'A | B | C' })], NOW);
    const prompt = buildMarketAnalysisPrompt('키워드', { top: video, bottom: video });
    assert.ok(prompt.includes('A \\| B \\| C'));
  });

  test('제목의 줄바꿈이 표를 깨뜨리지 않는다', () => {
    const video = withMetrics([makeVideo('v0', 5, { title: '첫 줄\n둘째 줄' })], NOW);
    const prompt = buildMarketAnalysisPrompt('키워드', { top: video, bottom: video });
    assert.equal(prompt.includes('첫 줄\n둘째 줄'), false);
    assert.ok(prompt.includes('첫 줄 둘째 줄'));
  });

  test('태그가 없으면 빈칸이 아니라 (없음)으로 표시한다', () => {
    const video = withMetrics([makeVideo('v0', 5, { tags: [] })], NOW);
    const prompt = buildMarketAnalysisPrompt('키워드', { top: video, bottom: video });
    assert.ok(prompt.includes('(없음)'));
  });
});

describe('시안 절 — 관찰·원칙·가정 중 하나를 근거로', () => {
  const longSet = withMetrics(
    Array.from({ length: 20 }, (_, i) => makeVideo(`L${i}`, 20 - i, { channel: reliableChannel() })),
    NOW,
  );
  const cohort = selectCohort(longSet, 5);
  const prompt = buildMarketAnalysisPrompt('테스트 키워드', cohort, { topic: '홈베이킹 입문' });

  test('원본 기획의 5부 구조를 되살린다: 트리거 → 세트 5개 → 구조 → 매핑표 → 복사용 요약', () => {
    for (const heading of ['클릭 트리거', '세트 5개', '구조 설계', '매핑표', '복사용 요약']) {
      assert.ok(prompt.includes(heading), heading);
    }
  });

  test('모든 시안 문장에 [행 n] / [원칙 ID] / [가정] 중 하나를 달게 한다', () => {
    assert.ok(prompt.includes('[행 n]'));
    assert.ok(prompt.includes('[원칙 '));
    assert.ok(prompt.includes('[가정]'));
  });

  test('플레이북을 신뢰도·출처와 함께 싣고, 데이터가 원칙보다 우선한다고 적는다', () => {
    assert.ok(prompt.includes('일반 원칙 (플레이북'));
    assert.ok(prompt.includes('[원칙 T2 · 중간]'));
    assert.ok(prompt.includes('데이터가 우선'));
  });

  test('내 주제가 시안 절에 실린다', () => {
    assert.ok(prompt.includes('홈베이킹 입문'));
  });

  test('내 주제가 없으면 입력 칸을 남기고, 비우면 검색어와 같은 주제로 가정한다고 적는다', () => {
    const p = buildMarketAnalysisPrompt('테스트 키워드', cohort);
    assert.ok(p.includes('[여기에 내 주제 입력]'));
    assert.ok(p.includes('같은 주제로 가정'));
  });

  test('상위군이 롱폼이면 롱폼 원칙(S1·K2)만, Shorts면 Shorts 원칙(S2·K1)만 싣는다', () => {
    assert.ok(prompt.includes('[원칙 S1') && !prompt.includes('[원칙 S2'));
    const shortsSet = withMetrics(
      Array.from({ length: 20 }, (_, i) =>
        makeVideo(`S${i}`, 20 - i, { duration: 'PT30S', channel: { ...reliableChannel(), recentUploads: reliableChannel().recentUploads!.map((u) => ({ ...u, duration: 'PT30S' })) } }),
      ),
      NOW,
    );
    const p = buildMarketAnalysisPrompt('테스트 키워드', selectCohort(shortsSet, 5));
    assert.ok(p.includes('[원칙 S2') && !p.includes('[원칙 S1'));
  });

  test('상위 영상마다 그 채널 평소 제목(같은 포맷 동료)을 대조 표로 싣는다 — 할당량 0인 가장 통제된 신호', () => {
    assert.ok(prompt.includes('채널 평소 제목'));
    assert.ok(prompt.includes('동료 p1'));
  });

  test('평소 제목이 저장되지 않은 이력(2026-09-09 이전)이면 표 대신 그 사실을 적는다', () => {
    const p = buildMarketAnalysisPrompt('테스트 키워드', selectCohort(makeSet(20), 5));
    assert.ok(p.includes('평소 제목') && p.includes('저장되지 않'));
    assert.ok(!p.includes('동료 p1'));
  });

  test('썸네일 구성 근거는 시트가 첨부됐을 때만 #번호를 쓰고, 아니면 원칙만 쓰게 한다', () => {
    assert.ok(prompt.includes('시트가 첨부'));
  });

  test('오해 유발 자기점검과 Test & Compare 검증 절차를 요구한다', () => {
    assert.ok(prompt.includes('지킬 수 있는가'));
    assert.ok(prompt.includes('Test & Compare'));
  });

  test('상위군 제목을 베끼지 말고 형태만 가져오게 한다', () => {
    assert.ok(prompt.includes('베끼지'));
  });

  test('단건 프롬프트에도 같은 시안 절이 붙고 주제가 실린다', () => {
    const p = buildSingleVideoPrompt(cohort.top[0], cohort, '테스트 키워드', { topic: '홈베이킹 입문' });
    assert.ok(p.includes('클릭 트리거') && p.includes('복사용 요약'));
    assert.ok(p.includes('홈베이킹 입문'));
    assert.ok(p.includes('[원칙 S1'));
  });
});
