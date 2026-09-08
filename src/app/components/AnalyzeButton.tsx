'use client';

import { useState } from 'react';
import { requestAnalysis, type AnalysisResult } from '../utils/llmClient';
import CopyButton from './CopyButton';

interface AnalyzeButtonProps {
  /** 서버에 키가 있는가. 없으면 버튼을 잠그고 이유를 툴팁으로. */
  enabled: boolean;
  model: string | null;
  /** 눌렀을 때 만들 프롬프트. 클립보드 경로와 같은 함수를 쓴다. */
  getPrompt: () => string;
  /** 이미지 블록으로 자동 첨부할 썸네일. 순서 = 프롬프트 표 행 번호. */
  thumbnailVideoIds: string[];
  label?: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: AnalysisResult }
  | { kind: 'error'; message: string };

/**
 * 앱 내 LLM 분석 버튼 + 결과 패널.
 *
 * 클립보드 경로와 달리 썸네일이 자동으로 첨부되고 결과가 앱 안에 남는다.
 * 대신 돈이 든다 — 결과마다 토큰 수와 추정 비용을 그대로 보여준다.
 */
export default function AnalyzeButton({
  enabled,
  model,
  getPrompt,
  thumbnailVideoIds,
  label = '앱에서 분석',
}: AnalyzeButtonProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const run = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!enabled || state.kind === 'running') return;
    setState({ kind: 'running' });
    try {
      const result = await requestAnalysis({ prompt: getPrompt(), thumbnailVideoIds });
      setState({ kind: 'done', result });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : '분석에 실패했습니다.' });
    }
  };

  const running = state.kind === 'running';

  return (
    <div className="relative z-10 w-full">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={!enabled || running}
          title={
            enabled
              ? `${model ?? 'LLM'}에 프롬프트와 썸네일 ${thumbnailVideoIds.length}장을 보내 분석합니다. 토큰 비용이 듭니다.`
              : '서버에 ANTHROPIC_API_KEY가 없어 비활성입니다. 클립보드 복사를 이용하세요.'
          }
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:ring-red-500 ${
            enabled ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          } disabled:opacity-70`}
        >
          {running ? '분석 중… (최대 1분)' : label}
        </button>
        {!enabled && <span className="text-xs text-gray-500">키 미설정</span>}
      </div>

      <span aria-live="polite" className="sr-only">
        {state.kind === 'done' ? '분석이 완료되었습니다' : state.kind === 'error' ? `분석 실패: ${state.message}` : ''}
      </span>

      {state.kind === 'error' && (
        <div role="alert" className="mt-3 p-3 bg-red-900/60 border border-red-700 text-red-100 text-sm rounded-md">
          {state.message}
        </div>
      )}

      {state.kind === 'done' && (
        <section className="mt-3 p-4 bg-gray-900 border border-gray-700 rounded-lg" aria-label="분석 결과">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-gray-400">
            <span>
              {state.result.model} · 입력 <span className="tabular-nums">{state.result.usage.inputTokens.toLocaleString()}</span> / 출력{' '}
              <span className="tabular-nums">{state.result.usage.outputTokens.toLocaleString()}</span> 토큰 · 이미지{' '}
              <span className="tabular-nums">{state.result.attachedImages}</span>장 ·{' '}
              {state.result.estimatedCostUsd === null ? (
                '비용 추정 불가'
              ) : (
                <>
                  약 <span className="tabular-nums">${state.result.estimatedCostUsd.toFixed(4)}</span>
                </>
              )}
            </span>
            <div className="flex gap-2">
              <CopyButton getText={() => state.result.text} label="결과 복사" title="분석 결과를 복사합니다" />
              <button
                type="button"
                onClick={() => setState({ kind: 'idle' })}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                닫기
              </button>
            </div>
          </div>
          {/* 마크다운 렌더러는 넣지 않는다 (의존성·XSS 표면). 원문을 그대로 보여준다. */}
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-100 leading-relaxed max-h-[70vh] overflow-y-auto">
            {state.result.text}
          </pre>
        </section>
      )}
    </div>
  );
}
