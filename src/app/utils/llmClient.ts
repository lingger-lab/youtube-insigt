import type { AnalysisResult } from '../../server/llm/analyze';

export type { AnalysisResult };

export interface LlmStatus {
  enabled: boolean;
  model: string | null;
}

/** 서버에 키가 있는지. 없으면 버튼을 잠근다 — 눌러서 503을 보게 하지 않는다. */
export async function getLlmStatus(): Promise<LlmStatus> {
  try {
    const res = await fetch('/api/analyze', { method: 'GET' });
    if (!res.ok) return { enabled: false, model: null };
    return (await res.json()) as LlmStatus;
  } catch {
    return { enabled: false, model: null };
  }
}

export async function requestAnalysis(input: {
  prompt: string;
  thumbnailVideoIds: string[];
}): Promise<AnalysisResult> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      typeof payload === 'object' && payload !== null
        ? ((payload as { error?: { message?: unknown } }).error?.message ?? null)
        : null;
    throw new Error(typeof message === 'string' ? message : '분석에 실패했습니다.');
  }
  return payload as AnalysisResult;
}
