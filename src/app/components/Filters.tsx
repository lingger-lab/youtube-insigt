'use client';

import { SearchFilters, getTimeFilterValue } from '../utils/youtubeApi';

interface FiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

export default function Filters({ filters, onFiltersChange }: FiltersProps) {
  const handleOrderChange = (order: SearchFilters['order']) => {
    onFiltersChange({ ...filters, order });
  };

  const handleTimeFilterChange = (period: string) => {
    const publishedAfter = period === 'any' ? undefined : getTimeFilterValue(period);
    onFiltersChange({ ...filters, publishedAfter });
  };

  const handleDurationChange = (videoDuration: SearchFilters['videoDuration']) => {
    onFiltersChange({ ...filters, videoDuration });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-white mb-4">검색 필터</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Order Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            정렬 기준
          </label>
          <select
            value={filters.order}
            onChange={(e) => handleOrderChange(e.target.value as SearchFilters['order'])}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="relevance">관련도</option>
            <option value="viewCount">조회수</option>
            <option value="date">최신순</option>
            <option value="rating">평점</option>
          </select>
        </div>

        {/* Time Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            업로드 시기
          </label>
          <select
            value={filters.publishedAfter ? 
              (['1H', '24H', '7D', '30D', '1Y'].find(period => 
                getTimeFilterValue(period) === filters.publishedAfter
              ) || 'custom') : 'any'
            }
            onChange={(e) => handleTimeFilterChange(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="any">전체</option>
            <option value="1H">1시간 이내</option>
            <option value="24H">24시간 이내</option>
            <option value="7D">1주일 이내</option>
            <option value="30D">1개월 이내</option>
            <option value="1Y">1년 이내</option>
          </select>
        </div>

        {/* Duration Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            영상 길이
          </label>
          <select
            value={filters.videoDuration}
            onChange={(e) => handleDurationChange(e.target.value as SearchFilters['videoDuration'])}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="any">전체</option>
            <option value="short">4분 미만</option>
            <option value="medium">4-20분</option>
            <option value="long">20분 초과</option>
          </select>
        </div>
      </div>
    </div>
  );
}