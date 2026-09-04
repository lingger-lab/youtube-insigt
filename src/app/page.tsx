'use client';

import { useState, useMemo } from 'react';
import { VideoData, SearchFilters, searchYouTube } from './utils/youtubeApi';
import { filterVideosByType, addVideoTypeToData } from './utils/videoUtils';
import Header from './components/Header';
import Sidebar, { MobileNavDrawer, type VideoFilter } from './components/Sidebar';
import SearchInput from './components/SearchInput';
import Filters from './components/Filters';
import SortBar from './components/SortBar';
import DisplayModeToggle from './components/DisplayModeToggle';
import VideoCard from './components/VideoCard';

type SortBy = 'viewCount' | 'subscriberCount' | 'viralScore' | 'publishedAt';
type SortOrder = 'asc' | 'desc';
type DisplayMode = 'grid' | 'list';

export default function Home() {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({
    order: 'relevance',
    videoDuration: 'any'
  });
  const [sortBy, setSortBy] = useState<SortBy>('viewCount');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grid');
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('home');
  // 데스크톱 레일의 접힘과 모바일 드로어의 열림은 서로 다른 상태다.
  // 하나로 겸직시키면 뷰포트를 넘나들 때 화면이 상태와 어긋난다.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter videos based on selected type (home/shorts/long)
  const filteredVideos = useMemo(() => {
    const videosWithType = addVideoTypeToData(videos);
    return filterVideosByType(videosWithType, videoFilter);
  }, [videos, videoFilter]);

  const sortedVideos = useMemo(() => {
    if (!filteredVideos.length) return [];
    
    const sorted = [...filteredVideos].sort((a, b) => {
      let aValue: number;
      let bValue: number;
      
      switch (sortBy) {
        case 'viewCount':
          aValue = a.viewCount || 0;
          bValue = b.viewCount || 0;
          break;
        case 'subscriberCount':
          aValue = a.subscriberCount || 0;
          bValue = b.subscriberCount || 0;
          break;
        case 'viralScore':
          aValue = a.viralScore || 0;
          bValue = b.viralScore || 0;
          break;
        case 'publishedAt':
          aValue = new Date(a.publishedAt).getTime();
          bValue = new Date(b.publishedAt).getTime();
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
    
    return sorted;
  }, [filteredVideos, sortBy, sortOrder]);

  const handleSearch = async (searchTerm: string) => {
    setIsLoading(true);
    setError(null);
    setSearchTerm(searchTerm);
    setVideos([]); // 새로운 검색 시작 시 이전 결과 완전히 초기화
    
    try {
      const { videos: results } = await searchYouTube(searchTerm, filters, 200);
      setVideos(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSortChange = (newSortBy: SortBy, newSortOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  };

  const handleVideoFilterChange = (filter: VideoFilter) => {
    setVideoFilter(filter);
  };

  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleLogoClick = () => {
    // 메인화면으로 돌아가기
    setSearchTerm('');
    setVideos([]);
    setError(null);
    setVideoFilter('home');
    setSortBy('viewCount');
    setSortOrder('desc');
    setDisplayMode('grid');
    setFilters({
      order: 'relevance',
      videoDuration: 'any'
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <Header
        onMobileMenuOpen={() => setMobileNavOpen(true)}
        isMobileMenuOpen={mobileNavOpen}
        onSidebarCollapseToggle={handleSidebarToggle}
        isSidebarCollapsed={sidebarCollapsed}
        onLogoClick={handleLogoClick}
      />

      {/* Sidebar: 데스크톱 고정 레일 + 모바일 드로어 */}
      <Sidebar
        activeFilter={videoFilter}
        onFilterChange={handleVideoFilterChange}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={handleSidebarToggle}
      />
      <MobileNavDrawer
        activeFilter={videoFilter}
        onFilterChange={handleVideoFilterChange}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Main Content — 모바일에는 고정 레일이 없으므로 마진도 없다 */}
      <main className={`pt-16 transition-all duration-200 motion-reduce:transition-none ml-0 ${
        sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
      }`}>
        <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
          
          {/* Search Section - Only show if no search has been made yet */}
          {!searchTerm && (
            <div className="max-w-4xl mx-auto text-center mb-12">
              <div className="mb-8">
                <h1 className="text-3xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                  YouTube Insight
                </h1>
                <p className="text-xl text-gray-400">
                  YouTube 검색과 떡상지수 분석을 한번에
                </p>
              </div>
              
              <SearchInput onSearch={handleSearch} isLoading={isLoading} />
              <Filters filters={filters} onFiltersChange={setFilters} />
            </div>
          )}

          {/* Compact Search - Show after first search */}
          {searchTerm && (
            <div className="mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 max-w-2xl">
                  <SearchInput onSearch={handleSearch} isLoading={isLoading} />
                </div>
                <button
                  onClick={() => setSearchTerm('')}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  초기화
                </button>
              </div>
              <Filters filters={filters} onFiltersChange={setFilters} />
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg mb-6">
              <strong>오류:</strong> {error}
            </div>
          )}

          {/* Results Section */}
          {sortedVideos.length > 0 && (
            <>
              {/* Current Filter Display */}
              <div className="flex items-center gap-4 mb-4">
                <h2 className="text-2xl font-bold">
                  {videoFilter === 'home' && '모든 영상'}
                  {videoFilter === 'shorts' && 'Shorts (3분 이하)'}
                  {videoFilter === 'long' && 'Long Videos (3분 초과)'}
                </h2>
                <span className="text-gray-400 text-sm">
                  "{searchTerm}" 검색 결과
                </span>
              </div>

              {/* Sort Controls */}
              <SortBar 
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={handleSortChange}
                resultCount={sortedVideos.length}
              />

              {/* Display Mode Toggle */}
              <DisplayModeToggle mode={displayMode} onModeChange={setDisplayMode} />

              {/* Video Results */}
              <div className={
                displayMode === 'grid' 
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                  : 'space-y-4'
              }>
                {sortedVideos.map((video, index) => (
                  <VideoCard 
                    key={`${video.id}-${index}`} 
                    video={video} 
                    displayMode={displayMode}
                  />
                ))}
              </div>
            </>
          )}

          {/* No Results for Current Filter */}
          {searchTerm && videos.length > 0 && sortedVideos.length === 0 && (
            <div className="text-center text-gray-400 mt-12">
              <div className="text-6xl mb-4">📹</div>
              <p className="text-xl">
                {videoFilter === 'shorts' && 'Shorts 영상이 없습니다'}
                {videoFilter === 'long' && 'Long 영상이 없습니다'}
              </p>
              <p className="text-sm mt-2">다른 필터를 선택해보세요.</p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !searchTerm && (
            <div className="text-center text-gray-400 mt-12">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-xl">InSigt를 발굴하세요!</p>
              <p className="text-sm mt-2">키워드를 입력하고 검색 버튼을 눌러주세요.</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="text-center mt-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-600 border-t-red-500 mx-auto mb-4"></div>
              <p className="text-gray-400">YouTube에서 검색 중...</p>
              <p className="text-sm text-gray-500 mt-2">최대 200개의 결과를 가져오고 있습니다.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}