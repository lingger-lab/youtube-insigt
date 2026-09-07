import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { VideoData } from '../../types/youtube.ts';
import { withMetrics } from './metrics.ts';
import { selectCohort, buildMarketAnalysisPrompt, buildSingleVideoPrompt } from './analysisPrompt.ts';

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

  test('썸네일은 URL이 아니라 직접 첨부하도록 안내한다', () => {
    for (const p of prompts) {
      assert.ok(p.includes('직접 열어'));
      assert.ok(p.includes('maxresdefault'));
    }
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
