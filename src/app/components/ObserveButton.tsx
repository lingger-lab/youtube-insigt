'use client';

import { useState } from 'react';
import { observeMany, type ObserveItem, type ObserveOutcome, type VideoObservation } from '../utils/observeClient';

interface ObserveButtonProps {
  /** 서버에 GEMINI_API_KEY가 있는가. 없으면 버튼을 잠그고 이유를 툴팁으로. */
  enabled: boolean;
  model: string | null;
  /** 관찰할 영상들. 이미 관찰된 것은 건너뛴다. */
  items: ObserveItem[];
  /** 이미 보관함에 있는 관찰 (videoId 키) */
  existing: Record<string, VideoObservation>;
  onObserved: (observation: VideoObservation) => void;
  label?: string;
}

interface RunState {
  done: number;
  total: number;
  failures: { videoId: string; message: string }[];
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  costKnown: boolean;
  videoSeconds: number;
}

const sum = (state: RunState, o: ObserveOutcome, item: ObserveItem | undefined): RunState => {
  if (!o.ok) return { ...state, done: state.done + 1, failures: [...state.failures, { videoId: o.videoId, message: o.message }] };
  const u = o.observation.usage;
  return {
    ...state,
    done: state.done + 1,
    inputTokens: state.inputTokens + u.inputTokens,
    outputTokens: state.outputTokens + u.outputTokens,
    estimatedCostUsd: state.estimatedCostUsd + (u.estimatedCostUsd ?? 0),
    costKnown: state.costKnown && u.estimatedCostUsd !== null,
    videoSeconds: state.videoSeconds + (item?.durationSec ?? 0),
  };
};

/**
 * 영상 관찰 수집 버튼 + 진행·비용 패널.
 *
 * 편당 1요청, 병렬 3. 한 편이 실패해도 나머지는 계속되고 실패 사유는 그대로 보인다.
 * 무료 티어는 하루 8시간분 한도가 있어 "이번 실행이 보낸 영상 분(分)"을 표시한다.
 */
export default function ObserveButton({ enabled, model, items, existing, onObserved, label = '영상 관찰 수집' }: ObserveButtonProps) {
  const [state, setState] = useState<RunState | null>(null);
  const [running, setRunning] = useState(false);

  const pending = items.filter((it) => !existing[it.videoId]);
  const observedCount = items.length - pending.length;

  const run = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!enabled || running || pending.length === 0) return;
    setRunning(true);
    let acc: RunState = { done: 0, total: pending.length, failures: [], inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, costKnown: true, videoSeconds: 0 };
    setState(acc);
    const byId = new Map(pending.map((it) => [it.videoId, it]));
    await observeMany(pending, {
      concurrency: 3,
      onProgress: (outcome) => {
        if (outcome.ok) onObserved(outcome.observation);
        acc = sum(acc, outcome, byId.get(outcome.videoId));
        setState({ ...acc });
      },
    });
    setRunning(false);
  };

  const minutes = state ? Math.round((state.videoSeconds / 60) * 10) / 10 : 0;

  return (
    <div className="relative z-10 w-full">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={!enabled || running || pending.length === 0}
          title={
            enabled
              ? `${model ?? 'Gemini'}가 영상 ${pending.length}편을 직접 보고 훅·구조·썸네일 약속 이행을 기록합니다. 편당 1요청, 프리뷰 무료(하루 8시간분 한도).`
              : '서버에 GEMINI_API_KEY가 없어 비활성입니다.'
          }
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:ring-sky-400 ${
            enabled ? 'bg-sky-700 hover:bg-sky-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          } disabled:opacity-70`}
        >
          {running && state ? `관찰 중… ${state.done}/${state.total}` : pending.length === 0 && items.length > 0 ? `관찰 완료 ${observedCount}/${items.length}` : `${label} (${pending.length}편)`}
        </button>
        {!enabled && <span className="text-xs text-gray-500">키 미설정</span>}
        {enabled && observedCount > 0 && pending.length > 0 && (
          <span className="text-xs text-gray-400">이미 관찰됨 {observedCount}편은 건너뜀</span>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {state && !running ? `관찰 완료: ${state.done - state.failures.length}편 성공, ${state.failures.length}편 실패` : ''}
      </span>

      {state && (
        <div className="mt-2 text-xs text-gray-400 space-y-1">
          <div>
            {state.done - state.failures.length}편 성공 · {state.failures.length}편 실패 · 영상 <span className="tabular-nums">{minutes}</span>분 전송 · 토큰 입력{' '}
            <span className="tabular-nums">{state.inputTokens.toLocaleString()}</span> / 출력 <span className="tabular-nums">{state.outputTokens.toLocaleString()}</span>
            {' · '}
            {state.costKnown ? (
              <>
                유료 전환 시 약 <span className="tabular-nums">${state.estimatedCostUsd.toFixed(4)}</span> (프리뷰 동안 무료)
              </>
            ) : (
              '비용 추정 불가(가격표에 없는 모델)'
            )}
          </div>
          {state.failures.length > 0 && (
            <ul role="alert" className="text-red-300 space-y-0.5">
              {state.failures.map((f) => (
                <li key={f.videoId}>
                  {f.videoId}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
