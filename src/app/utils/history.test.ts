import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoryStore,
  HistoryError,
  SEARCHES_KEY,
  OUTPUTS_KEY,
  OBSERVATIONS_KEY,
  type StorageLike,
  type NewSearchRecord,
  type NewOutputRecord,
} from './history.ts';
import type { VideoData } from '../../types/youtube';
import type { VideoObservation } from '../../types/observation';

function observation(videoId: string, overrides: Partial<VideoObservation> = {}): VideoObservation {
  return {
    videoId,
    observedAt: '2026-09-09T00:00:00.000Z',
    model: 'gemini-3.8-flash',
    processing: 'static',
    language: 'ko',
    hook: { first3s: { visual: '완성품', spoken: null, onScreenText: null }, firstLine: { quote: '이거 쉬워요', at: '00:00' }, promiseStatedAt: '00:02' },
    structure: [],
    patternInterrupts: [],
    thumbnailPromise: { kept: 'yes', evidence: '00:18 완성품', at: '00:18' },
    cta: { present: false, at: null, text: null },
    faceOnCamera: 'no',
    textOverlay: 'light',
    notes: [],
    usage: { inputTokens: 4000, outputTokens: 800, estimatedCostUsd: 0.006, elapsedMs: 9000 },
    ...overrides,
  };
}

/** localStorage 흉내. quota를 주면 그보다 큰 setItem은 브라우저처럼 던진다. */
function makeStorage(quota = Infinity): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem(key, value) {
      if (value.length > quota) throw new DOMExceptionLike('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key) => void map.delete(key),
  };
}

class DOMExceptionLike extends Error {
  constructor(name: string) {
    super(name);
    this.name = name;
  }
}

function video(id: string): VideoData {
  return {
    id,
    title: `영상 ${id}`,
    description: '',
    thumbnailUrl: '',
    thumbnailHighUrl: '',
    channelTitle: 'ch',
    channelId: 'c1',
    publishedAt: '2026-01-01T00:00:00Z',
    viewCount: 100,
    likeCount: null,
    commentCount: null,
    duration: 'PT1M',
    tags: [],
    categoryId: '',
    hasCaption: false,
    liveStatus: 'none',
    channel: {
      channelId: 'c1',
      subscriberCount: null,
      hiddenSubscriberCount: false,
      videoCount: null,
      totalViewCount: null,
      uploadsPlaylistId: null,
      recentUploads: null,
    },
  };
}

function search(term: string, n = 2): NewSearchRecord {
  return {
    term,
    depth: 50,
    filters: { order: 'relevance', videoDuration: 'any' },
    usage: { searchCalls: 1, otherUnits: 10, calls: 11 },
    videos: Array.from({ length: n }, (_, i) => video(`${term}-${i}`)),
  };
}

function output(overrides: Partial<NewOutputRecord> = {}): NewOutputRecord {
  return { kind: 'market-prompt', term: '키워드', title: '시장 분석', text: '프롬프트 본문', ...overrides };
}

function clock() {
  let t = 0;
  return () => new Date(Date.UTC(2026, 8, 8, 0, 0, t++));
}

// YouTube API 개발자 정책 III.E.4.b: 채널 소유자 인가 없이 받은 통계(조회수·구독자수)는 30일 넘게 저장 금지.
describe('30일 만료 (YouTube 정책 III.E.4.b)', () => {
  const DAY = 86_400_000;
  const base = Date.UTC(2026, 8, 9);

  test('30일이 지난 검색 이력은 읽을 때 지워지고, 지우지 않은 것만 남는다', () => {
    const storage = makeStorage();
    let t = base;
    const store = createHistoryStore(storage, { now: () => new Date(t) });
    store.saveSearch(search('old'));
    t = base + 5 * DAY;
    store.saveSearch(search('fresh'));

    t = base + 31 * DAY; // old는 31일, fresh는 26일 경과
    assert.deepEqual(store.listSearches().map((r) => r.term), ['fresh']);
    assert.ok(!storage.map.get(SEARCHES_KEY)!.includes('"old"'), '저장소에서도 지워져야 한다');
    assert.equal(store.getSearch(store.listSearches()[0].id)?.term, 'fresh');
  });

  test('출력(프롬프트·LLM 결과)도 통계를 인용하므로 같이 만료된다', () => {
    let t = base;
    const store = createHistoryStore(makeStorage(), { now: () => new Date(t) });
    store.saveOutput(output({ text: 'old' }));
    t = base + 31 * DAY;
    assert.deepEqual(store.listOutputs(), []);
  });

  test('정확히 30일은 아직 산다 (경계)', () => {
    let t = base;
    const store = createHistoryStore(makeStorage(), { now: () => new Date(t) });
    store.saveSearch(search('edge'));
    t = base + 30 * DAY;
    assert.equal(store.listSearches().length, 1);
  });
});

describe('검색 이력', () => {
  test('저장 후 최신 순으로 나열되고 id로 다시 꺼낼 수 있다', () => {
    const store = createHistoryStore(makeStorage(), { now: clock() });
    const a = store.saveSearch(search('a'));
    const b = store.saveSearch(search('b'));

    assert.deepEqual(store.listSearches().map((r) => r.id), [b.id, a.id]);
    assert.equal(store.getSearch(a.id)?.term, 'a');
    assert.equal(store.getSearch('없음'), null);
  });

  test('원본만 저장한다 — 파생 지표(metrics)는 들어가지 않는다', () => {
    const storage = makeStorage();
    const store = createHistoryStore(storage);
    store.saveSearch(search('a'));
    assert.ok(!storage.map.get(SEARCHES_KEY)!.includes('"metrics"'));
  });

  test('삭제하면 목록에서 빠진다', () => {
    const store = createHistoryStore(makeStorage());
    const a = store.saveSearch(search('a'));
    store.saveSearch(search('b'));
    store.deleteSearch(a.id);
    assert.deepEqual(store.listSearches().map((r) => r.term), ['b']);
  });

  test('문자 예산을 넘으면 오래된 것부터 버린다', () => {
    const store = createHistoryStore(makeStorage(), { searchBudget: 1_500, now: clock() });
    store.saveSearch(search('old', 1));
    store.saveSearch(search('mid', 1));
    store.saveSearch(search('new', 1));
    const terms = store.listSearches().map((r) => r.term);
    assert.ok(terms.length < 3, `예산 안에 3건이 다 들어가면 테스트가 무의미: ${terms}`);
    assert.equal(terms[0], 'new');
    assert.ok(!terms.includes('old'));
  });

  test('항목 하나가 예산보다 크면 조용히 버리지 않고 던진다', () => {
    const store = createHistoryStore(makeStorage(), { searchBudget: 100 });
    assert.throws(() => store.saveSearch(search('big', 3)), HistoryError);
  });

  test('저장소가 QuotaExceeded를 던지면 오래된 것을 빼고 재시도한다', () => {
    const storage = makeStorage(1_500);
    const store = createHistoryStore(storage, { now: clock() });
    store.saveSearch(search('old', 1));
    store.saveSearch(search('mid', 1));
    store.saveSearch(search('new', 1));
    const terms = store.listSearches().map((r) => r.term);
    assert.equal(terms[0], 'new');
    assert.ok(terms.length < 3);
  });

  test('JSON이 깨져 있으면 비우고 경고한다', () => {
    const storage = makeStorage();
    storage.map.set(SEARCHES_KEY, '{not json');
    const warnings: string[] = [];
    const store = createHistoryStore(storage, { warn: (m) => warnings.push(m) });

    assert.deepEqual(store.listSearches(), []);
    assert.equal(warnings.length, 1);
    assert.equal(storage.map.has(SEARCHES_KEY), false);
  });

  test('모양이 다른 항목만 골라 버리고 나머지는 살린다', () => {
    const storage = makeStorage();
    const store = createHistoryStore(storage, { warn: () => {} });
    const good = store.saveSearch(search('good'));
    const list = JSON.parse(storage.map.get(SEARCHES_KEY)!);
    storage.map.set(SEARCHES_KEY, JSON.stringify([{ id: 'x' }, ...list, 42]));

    assert.deepEqual(store.listSearches().map((r) => r.id), [good.id]);
  });
});

describe('내 주제', () => {
  test('저장·조회, 없으면 빈 문자열, 공백은 지운다', () => {
    const store = createHistoryStore(makeStorage());
    assert.equal(store.getTopic(), '');
    store.setTopic('  홈베이킹 입문  ');
    assert.equal(store.getTopic(), '홈베이킹 입문');
    store.setTopic('   ');
    assert.equal(store.getTopic(), '');
  });

  test('clearAll이 주제도 지운다', () => {
    const storage = makeStorage();
    const store = createHistoryStore(storage);
    store.setTopic('x');
    store.clearAll();
    assert.equal(store.getTopic(), '');
  });
});

describe('영상 관찰 보관', () => {
  test('videoId로 저장·조회하고, 요청한 것만 돌려준다', () => {
    const store = createHistoryStore(makeStorage());
    store.saveObservation(observation('a'));
    store.saveObservation(observation('b'));
    const got = store.getObservations(['a', 'zzz']);
    assert.deepEqual(Object.keys(got), ['a']);
    assert.equal(got.a.hook.firstLine?.quote, '이거 쉬워요');
  });

  test('같은 영상은 덮어쓴다 (재관찰이 옛 것과 공존하지 않는다)', () => {
    const store = createHistoryStore(makeStorage());
    store.saveObservation(observation('a', { language: 'ko' }));
    store.saveObservation(observation('a', { language: 'en' }));
    assert.equal(store.getObservations(['a']).a.language, 'en');
    assert.equal(JSON.parse(makeStorage().getItem(OBSERVATIONS_KEY) ?? '[]').length, 0);
  });

  test('30일이 지나면 같이 만료된다', () => {
    const DAY = 86_400_000;
    let t = Date.UTC(2026, 8, 9);
    const store = createHistoryStore(makeStorage(), { now: () => new Date(t) });
    store.saveObservation(observation('a'));
    t += 31 * DAY;
    assert.deepEqual(store.getObservations(['a']), {});
  });

  test('clearAll이 관찰도 지운다', () => {
    const storage = makeStorage();
    const store = createHistoryStore(storage);
    store.saveObservation(observation('a'));
    store.clearAll();
    assert.equal(storage.map.has(OBSERVATIONS_KEY), false);
  });
});

describe('출력 보관함', () => {
  test('저장·나열·삭제', () => {
    const store = createHistoryStore(makeStorage(), { now: clock() });
    const a = store.saveOutput(output({ text: 'A' }));
    const b = store.saveOutput(output({ text: 'B', kind: 'video-prompt', videoId: 'v1', title: '영상' }));

    assert.deepEqual(store.listOutputs().map((r) => r.id), [b.id, a.id]);
    store.deleteOutput(b.id);
    assert.deepEqual(store.listOutputs().map((r) => r.id), [a.id]);
  });

  test('같은 종류·검색어·영상·본문은 중복 저장하지 않는다 (복사 버튼 두 번 눌러도 1건)', () => {
    const store = createHistoryStore(makeStorage());
    const first = store.saveOutput(output());
    const second = store.saveOutput(output());
    assert.equal(second.id, first.id);
    assert.equal(store.listOutputs().length, 1);
  });

  test('본문이 다르면 별개 항목이다', () => {
    const store = createHistoryStore(makeStorage());
    store.saveOutput(output({ text: '1' }));
    store.saveOutput(output({ text: '2' }));
    assert.equal(store.listOutputs().length, 2);
  });

  test('LLM 결과는 모델·토큰·비용을 함께 남긴다', () => {
    const store = createHistoryStore(makeStorage());
    const saved = store.saveOutput(
      output({
        kind: 'market-analysis',
        text: '분석',
        llm: { model: 'claude-opus-5', inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.0525 },
      }),
    );
    assert.equal(store.listOutputs()[0].llm?.estimatedCostUsd, saved.llm?.estimatedCostUsd);
  });

  test('clearAll은 두 저장소 키를 모두 지운다', () => {
    const storage = makeStorage();
    const store = createHistoryStore(storage);
    store.saveSearch(search('a'));
    store.saveOutput(output());
    store.clearAll();
    assert.equal(storage.map.has(SEARCHES_KEY), false);
    assert.equal(storage.map.has(OUTPUTS_KEY), false);
  });
});
