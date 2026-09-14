import type { VideoObservation } from '../../types/observation';

export type { VideoObservation };

export interface ObserveStatus {
  enabled: boolean;
  model: string | null;
}

export interface ObserveItem {
  videoId: string;
  title: string;
  durationSec: number;
}

export type ObserveOutcome =
  | { videoId: string; ok: true; observation: VideoObservation }
  | { videoId: string; ok: false; code: string; message: string };

/** 서버에 키가 있는지. 없으면 버튼을 잠근다 — 눌러서 503을 보게 하지 않는다. */
export async function getObserveStatus(): Promise<ObserveStatus> {
  try {
    const res = await fetch('/api/observe', { method: 'GET' });
    if (!res.ok) return { enabled: false, model: null };
    return (await res.json()) as ObserveStatus;
  } catch {
    return { enabled: false, model: null };
  }
}

async function postOnce(item: ObserveItem): Promise<{ status: number; payload: unknown; retryAfterSec: number | null }> {
  const res = await fetch('/api/observe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  const payload: unknown = await res.json().catch(() => null);
  const ra = res.headers.get('Retry-After');
  return { status: res.status, payload, retryAfterSec: ra ? Number(ra) : null };
}

function errorOf(payload: unknown): { code: string; message: string } {
  const err = typeof payload === 'object' && payload !== null ? (payload as { error?: { code?: unknown; message?: unknown } }).error : undefined;
  return {
    code: typeof err?.code === 'string' ? err.code : 'UNKNOWN',
    message: typeof err?.message === 'string' ? err.message : '관찰에 실패했습니다.',
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 영상 1편. 429는 Retry-After(없으면 5초)만큼 기다렸다가 최대 2회 더 시도한다.
 * 그 외 실패는 그대로 돌려준다 — 편별 실패는 표에 사유로 남는다.
 */
export async function requestObservation(item: ObserveItem, retries = 2): Promise<ObserveOutcome> {
  for (let attempt = 0; ; attempt += 1) {
    let r: Awaited<ReturnType<typeof postOnce>>;
    try {
      r = await postOnce(item);
    } catch (e) {
      return { videoId: item.videoId, ok: false, code: 'NETWORK', message: e instanceof Error ? e.message : '네트워크 오류' };
    }
    if (r.status === 200) return { videoId: item.videoId, ok: true, observation: r.payload as VideoObservation };
    if (r.status === 429 && attempt < retries) {
      await sleep(Math.min(30_000, (r.retryAfterSec ?? 5) * 1000));
      continue;
    }
    return { videoId: item.videoId, ok: false, ...errorOf(r.payload) };
  }
}

/**
 * 여러 편을 동시성 제한(기본 3)으로 관찰한다. 완료마다 onProgress. 전부 끝나면 결과 배열(입력 순서).
 * 한 편의 실패가 나머지를 막지 않는다.
 */
export async function observeMany(
  items: ObserveItem[],
  options: { concurrency?: number; onProgress?: (outcome: ObserveOutcome, done: number, total: number) => void } = {},
): Promise<ObserveOutcome[]> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const results: ObserveOutcome[] = new Array(items.length);
  let next = 0;
  let done = 0;

  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const outcome = await requestObservation(items[index]);
      results[index] = outcome;
      done += 1;
      options.onProgress?.(outcome, done, items.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
