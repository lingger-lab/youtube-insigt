import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistoryStore,
  HistoryError,
  SEARCHES_KEY,
  OUTPUTS_KEY,
  type StorageLike,
  type NewSearchRecord,
  type NewOutputRecord,
} from './history.ts';
import type { VideoData } from '../../types/youtube';

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
