'use client';

import type { SortKey } from '../utils/metrics';

type SortOrder = 'asc' | 'desc';

interface SortBarProps {
  sortBy: SortKey;
  sortOrder: SortOrder;
  onSortChange: (sortBy: SortKey, sortOrder: SortOrder) => void;
  resultCount: number;
}

const SORT_OPTIONS: { value: SortKey; label: string; hint: string }[] = [
  { value: 'performanceMultiple', label: '성과배수', hint: '같은 채널·같은 포맷 최근 영상 중앙값 대비 몇 배인지' },
  { value: 'viewCount', label: '조회수', hint: '누적 조회수' },
  { value: 'viewsPerDay', label: '일평균 조회수', hint: '업로드 후 하루당 조회수 (신작에 유리)' },
  { value: 'likeRate', label: '좋아요율', hint: '좋아요 ÷ 조회수' },
  { value: 'subscriberCount', label: '구독자수', hint: '채널 구독자수 (비공개 채널은 뒤로)' },
  { value: 'subscriberRatio', label: '구독자 대비', hint: '조회수 ÷ 구독자수 — 참고값 (비공개·1,000명 초과 반올림 때문에 주지표가 아님)' },
  { value: 'publishedAt', label: '최신순', hint: '업로드 시각' },
];

export default function SortBar({ sortBy, sortOrder, onSortChange, resultCount }: SortBarProps) {
  const handleSortChange = (next: SortKey) => {
    // 같은 기준을 다시 누르면 방향만 뒤집는다. 다른 기준으로 바꾸면 내림차순부터.
    onSortChange(next, next === sortBy && sortOrder === 'desc' ? 'asc' : 'desc');
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 p-4 bg-gray-800 rounded-lg">
      <div className="text-sm text-gray-300">
        총 <span className="text-white font-semibold tabular-nums">{resultCount}</span>개의 결과
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="정렬 기준">
        {SORT_OPTIONS.map(({ value, label, hint }) => {
          const active = sortBy === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleSortChange(value)}
              title={hint}
              aria-pressed={active}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                active ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {label}
              <span aria-hidden="true" className="text-xs">
                {!active ? '↕' : sortOrder === 'desc' ? '↓' : '↑'}
              </span>
              {active && <span className="sr-only">{sortOrder === 'desc' ? '내림차순' : '오름차순'}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
