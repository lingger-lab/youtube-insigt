import type { SearchDepth, SearchFilters, SearchUsage, VideoData } from '../../types/youtube';
import type { VideoObservation } from '../../types/observation';

/**
 * 검색 이력과 출력 보관함 — 브라우저 localStorage.
 *
 * 이 앱은 원래 아무것도 저장하지 않았다. 새로고침 한 번에 검색 결과(할당량 1회)와
 * 복사한 프롬프트, 돈 주고 받은 LLM 분석이 전부 사라졌다. 여기서는 그것들을
 * 브라우저에 남긴다. 서버 저장이 아니므로 기기·브라우저 단위이고, 다른 기기에서는
 * 보이지 않는다 — 그 한계는 UI에 적는다.
 *
 * 검색 이력에는 **원본(VideoData)만** 저장한다. 성과배수 같은 파생 지표는 열 때
 * metrics.ts가 다시 만든다(CLAUDE.md 규칙 3). 지표 정의가 바뀌어도 옛 이력이
 * 옛 숫자를 보여주는 일이 없다.
 */

export interface SearchRecord {
  id: string;
  /** ISO 8601 */
  savedAt: string;
  term: string;
  depth: SearchDepth;
  filters: SearchFilters;
  usage: SearchUsage;
  videos: VideoData[];
}

export type OutputKind = 'market-prompt' | 'video-prompt' | 'market-analysis' | 'video-analysis';

export interface OutputRecord {
  id: string;
  savedAt: string;
  kind: OutputKind;
  term: string;
  /** 목록에 보일 한 줄 (영상 제목 등) */
  title: string;
  text: string;
  videoId?: string;
  /** 앱 내 LLM 분석일 때만. 비용이 보이지 않는 경로를 만들지 않는다. */
  llm?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number | null;
  };
}

/** 영상 관찰(Gemini). videoId가 키다 — 같은 영상은 다시 부르지 않는다. 30일 만료는 공용. */
export interface ObservationRecord {
  savedAt: string;
  observation: VideoObservation;
}

export type NewSearchRecord = Omit<SearchRecord, 'id' | 'savedAt'>;
export type NewOutputRecord = Omit<OutputRecord, 'id' | 'savedAt'>;

/** localStorage의 부분집합. 테스트에서는 Map으로 대체한다. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface HistoryStore {
  listSearches(): SearchRecord[];
  getSearch(id: string): SearchRecord | null;
  saveSearch(input: NewSearchRecord): SearchRecord;
  deleteSearch(id: string): void;
  listOutputs(): OutputRecord[];
  /** 같은 종류·검색어·영상·본문이 이미 있으면 새로 만들지 않고 그것을 돌려준다. */
  saveOutput(input: NewOutputRecord): OutputRecord;
  deleteOutput(id: string): void;
  /** 시안용 "내 주제/채널". 프롬프트에 실린다. 없으면 빈 문자열. */
  getTopic(): string;
  setTopic(topic: string): void;
  /** 영상 관찰. 같은 videoId는 덮어쓴다. */
  getObservations(videoIds: string[]): Record<string, VideoObservation>;
  saveObservation(observation: VideoObservation): void;
  clearAll(): void;
}

export class HistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryError';
  }
}

export const SEARCHES_KEY = 'youtube-insigt:searches:v1';
export const OUTPUTS_KEY = 'youtube-insigt:outputs:v1';
export const TOPIC_KEY = 'youtube-insigt:topic:v1';
export const OBSERVATIONS_KEY = 'youtube-insigt:observations:v1';

/**
 * 문자 수 예산. localStorage는 오리진당 약 5M UTF-16 코드 유닛(Chrome)이 상한이다.
 * 검색 한 건이 45편 기준 약 25만 자(채널당 최근 업로드 50편 포함)라 검색 ~14건,
 * 출력은 프롬프트 5천 자 기준 수백 건이 들어간다.
 */
export const SEARCH_BUDGET_CHARS = 3_500_000;
export const OUTPUT_BUDGET_CHARS = 800_000;
/** 관찰 1건 ≈ 1.5K자. 500건 남짓. */
export const OBSERVATION_BUDGET_CHARS = 800_000;
/**
 * YouTube API 개발자 정책 III.E.4.b — 채널 소유자 인가 없이 받은 통계(조회수·구독자수)는
 * 30일을 넘겨 저장할 수 없다. 검색 이력은 통계 그 자체이고, 출력(프롬프트·LLM 결과)도 통계를
 * 인용하므로 같이 만료한다. 읽을 때 걸러내고 저장소에서도 지운다.
 */
export const RETENTION_DAYS = 30;

interface StoreOptions {
  now?: () => Date;
  makeId?: () => string;
  searchBudget?: number;
  outputBudget?: number;
  /** 손상된 데이터를 버릴 때 알린다. 조용히 버리지 않는다. */
  warn?: (message: string) => void;
}

function defaultId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSearchRecord(value: unknown): value is SearchRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.savedAt === 'string' &&
    typeof value.term === 'string' &&
    typeof value.depth === 'number' &&
    isRecord(value.filters) &&
    isRecord(value.usage) &&
    Array.isArray(value.videos)
  );
}

function isObservationRecord(value: unknown): value is ObservationRecord {
  return (
    isRecord(value) &&
    typeof value.savedAt === 'string' &&
    isRecord(value.observation) &&
    typeof value.observation.videoId === 'string' &&
    isRecord(value.observation.hook)
  );
}

function isOutputRecord(value: unknown): value is OutputRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.savedAt === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.term === 'string' &&
    typeof value.title === 'string' &&
    typeof value.text === 'string'
  );
}

export function createHistoryStore(storage: StorageLike, options: StoreOptions = {}): HistoryStore {
  const now = options.now ?? (() => new Date());
  const makeId = options.makeId ?? defaultId;
  const searchBudget = options.searchBudget ?? SEARCH_BUDGET_CHARS;
  const outputBudget = options.outputBudget ?? OUTPUT_BUDGET_CHARS;
  const warn = options.warn ?? ((message: string) => console.warn(`[history] ${message}`));

  /**
   * 저장된 배열을 읽는다. JSON이 깨졌거나 모양이 다르면 그 항목(또는 전체)을 버리고
   * 알린다 — 이력 하나 때문에 앱이 죽는 것보다 낫지만, 버렸다는 사실은 숨기지 않는다.
   */
  function read<T extends { savedAt: string }>(key: string, guard: (value: unknown) => value is T): T[] {
    const raw = storage.getItem(key);
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warn(`${key}: JSON이 깨져 있어 비웠습니다`);
      storage.removeItem(key);
      return [];
    }
    if (!Array.isArray(parsed)) {
      warn(`${key}: 배열이 아니라 비웠습니다`);
      storage.removeItem(key);
      return [];
    }
    const valid = parsed.filter(guard);
    if (valid.length !== parsed.length) {
      warn(`${key}: 손상된 항목 ${parsed.length - valid.length}건을 버렸습니다`);
    }
    const cutoff = now().getTime() - RETENTION_DAYS * 86_400_000;
    const alive = valid.filter((record) => {
      const t = Date.parse(record.savedAt);
      return Number.isFinite(t) && t >= cutoff;
    });
    if (alive.length !== valid.length) {
      // 만료분은 저장소에서도 지운다 — 정책상 "저장하지 않는 것"이 요건이다.
      storage.setItem(key, JSON.stringify(alive));
    }
    return alive;
  }

  /**
   * 최신 순 배열을 예산 안에 넣는다. 넘치면 오래된 것부터 뺀다.
   * 저장소가 QuotaExceeded를 던지면 마찬가지로 오래된 것부터 빼며 재시도한다.
   */
  function write<T>(key: string, items: T[], budget: number): T[] {
    let kept = [...items];
    let serialized = JSON.stringify(kept);
    while (kept.length > 0 && serialized.length > budget) {
      kept = kept.slice(0, -1);
      serialized = JSON.stringify(kept);
    }
    if (kept.length === 0 && items.length > 0) {
      throw new HistoryError(`항목 하나가 저장 예산(${budget.toLocaleString()}자)보다 큽니다`);
    }

    for (;;) {
      try {
        storage.setItem(key, serialized);
        return kept;
      } catch (error) {
        if (kept.length <= 1) {
          throw new HistoryError(
            `브라우저 저장소가 가득 찼습니다: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        kept = kept.slice(0, -1);
        serialized = JSON.stringify(kept);
      }
    }
  }

  return {
    listSearches: () => read(SEARCHES_KEY, isSearchRecord),

    getSearch(id) {
      return read(SEARCHES_KEY, isSearchRecord).find((record) => record.id === id) ?? null;
    },

    saveSearch(input) {
      const record: SearchRecord = { id: makeId(), savedAt: now().toISOString(), ...input };
      write(SEARCHES_KEY, [record, ...read(SEARCHES_KEY, isSearchRecord)], searchBudget);
      return record;
    },

    deleteSearch(id) {
      const remaining = read(SEARCHES_KEY, isSearchRecord).filter((record) => record.id !== id);
      write(SEARCHES_KEY, remaining, searchBudget);
    },

    listOutputs: () => read(OUTPUTS_KEY, isOutputRecord),

    saveOutput(input) {
      const existing = read(OUTPUTS_KEY, isOutputRecord);
      const duplicate = existing.find(
        (record) =>
          record.kind === input.kind &&
          record.term === input.term &&
          record.videoId === input.videoId &&
          record.text === input.text,
      );
      if (duplicate) return duplicate;

      const record: OutputRecord = { id: makeId(), savedAt: now().toISOString(), ...input };
      write(OUTPUTS_KEY, [record, ...existing], outputBudget);
      return record;
    },

    deleteOutput(id) {
      const remaining = read(OUTPUTS_KEY, isOutputRecord).filter((record) => record.id !== id);
      write(OUTPUTS_KEY, remaining, outputBudget);
    },

    getObservations(videoIds) {
      const wanted = new Set(videoIds);
      const out: Record<string, VideoObservation> = {};
      for (const record of read(OBSERVATIONS_KEY, isObservationRecord)) {
        if (wanted.has(record.observation.videoId)) out[record.observation.videoId] = record.observation;
      }
      return out;
    },

    saveObservation(observation) {
      const others = read(OBSERVATIONS_KEY, isObservationRecord).filter((r) => r.observation.videoId !== observation.videoId);
      const record: ObservationRecord = { savedAt: now().toISOString(), observation };
      write(OBSERVATIONS_KEY, [record, ...others], OBSERVATION_BUDGET_CHARS);
    },

    getTopic() {
      return (storage.getItem(TOPIC_KEY) ?? '').trim();
    },

    setTopic(topic) {
      const trimmed = topic.trim();
      if (trimmed) storage.setItem(TOPIC_KEY, trimmed);
      else storage.removeItem(TOPIC_KEY);
    },

    clearAll() {
      storage.removeItem(SEARCHES_KEY);
      storage.removeItem(OUTPUTS_KEY);
      storage.removeItem(TOPIC_KEY);
      storage.removeItem(OBSERVATIONS_KEY);
    },
  };
}

/**
 * 브라우저의 localStorage 위 저장소. SSR·프라이빗 모드·차단 설정에서는 null —
 * 그때는 저장 기능만 빠지고 검색은 그대로 된다(호출부가 null을 처리한다).
 */
export function browserHistoryStore(): HistoryStore | null {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    // 접근 자체가 던지는 환경(차단 설정)을 여기서 걸러낸다.
    storage.getItem(SEARCHES_KEY);
    return createHistoryStore(storage);
  } catch {
    return null;
  }
}

export const OUTPUT_KIND_LABEL: Record<OutputKind, string> = {
  'market-prompt': '시장 분석 프롬프트',
  'video-prompt': '영상 분석 프롬프트',
  'market-analysis': '시장 분석 결과 (LLM)',
  'video-analysis': '영상 분석 결과 (LLM)',
};
