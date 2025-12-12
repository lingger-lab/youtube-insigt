'use client';

type SortBy = 'viewCount' | 'subscriberCount' | 'viralScore' | 'publishedAt';
type SortOrder = 'asc' | 'desc';

interface SortBarProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortChange: (sortBy: SortBy, sortOrder: SortOrder) => void;
  resultCount: number;
}

export default function SortBar({ sortBy, sortOrder, onSortChange, resultCount }: SortBarProps) {
  const sortOptions = [
    { value: 'viewCount', label: '조회수' },
    { value: 'subscriberCount', label: '구독자수' },
    { value: 'viralScore', label: '떡상지수' },
    { value: 'publishedAt', label: '최신순' },
  ] as const;

  const handleSortChange = (newSortBy: string) => {
    const typedSortBy = newSortBy as SortBy;
    // If same sort field, toggle order
    if (typedSortBy === sortBy) {
      onSortChange(typedSortBy, sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      // Default to desc for most fields, asc for date
      onSortChange(typedSortBy, typedSortBy === 'publishedAt' ? 'desc' : 'desc');
    }
  };

  const getSortIcon = (field: SortBy) => {
    if (sortBy !== field) return '↕️';
    return sortOrder === 'desc' ? '⬇️' : '⬆️';
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 p-4 bg-gray-800 rounded-lg">
      <div className="text-sm text-gray-300">
        총 <span className="text-white font-semibold">{resultCount}</span>개의 결과
      </div>
      
      <div className="flex flex-wrap gap-2">
        {sortOptions.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleSortChange(value)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              sortBy === value
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {label}
            <span className="text-xs">{getSortIcon(value)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}