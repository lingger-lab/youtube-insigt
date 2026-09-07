'use client';

import type { SearchDepth, SearchUsage } from '../../types/youtube';
import { SEARCH_DEPTHS, estimateQuota } from '../utils/quota';

interface SearchDepthPickerProps {
  value: SearchDepth;
  onChange: (depth: SearchDepth) => void;
  /** 직전 검색이 실제로 쓴 양. 아직 검색 전이면 null. */
  lastUsage: SearchUsage | null;
  disabled?: boolean;
}

/**
 * 검색 깊이 선택.
 *
 * 비용을 숨기지 않는다. 검색은 전용 버킷에서 하루 100회가 상한이고 200개
 * 검색은 4회를 쓰므로 하루 25번밖에 못 한다. 그 사실을 모르면 오전에 다 쓰고
 * 남은 하루는 오류만 보게 된다.
 */
export default function SearchDepthPicker({
  value,
  onChange,
  lastUsage,
  disabled = false,
}: SearchDepthPickerProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-6">
      <div className="flex items-center gap-2">
        <span id="search-depth-label" className="text-sm text-gray-400">
          검색 깊이:
        </span>
        <div className="flex gap-1 bg-gray-700 rounded-lg p-1" role="group" aria-labelledby="search-depth-label">
          {SEARCH_DEPTHS.map((depth) => {
            const { searchCalls, searchesPerDay } = estimateQuota(depth);
            const active = value === depth;
            return (
              <button
                key={depth}
                type="button"
                onClick={() => onChange(depth)}
                disabled={disabled}
                aria-pressed={active}
                title={`검색 한도 ${searchCalls}회 소비 — 하루 ${searchesPerDay}회 가능`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors tabular-nums disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                  active ? 'bg-red-600 text-white' : 'text-gray-300 hover:text-white'
                }`}
              >
                {depth}개
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        검색 한도 <span className="tabular-nums">{estimateQuota(value).searchCalls}</span>회 소비 (하루 100회 중) · 하루{' '}
        <span className="tabular-nums">{estimateQuota(value).searchesPerDay}</span>회 가능
        {lastUsage && (
          <>
            {' · '}직전 검색: 검색{' '}
            <span className="tabular-nums text-gray-400">{lastUsage.searchCalls}</span>회 + 부가{' '}
            <span className="tabular-nums text-gray-400">{lastUsage.otherUnits}</span> units
          </>
        )}
      </p>
    </div>
  );
}
