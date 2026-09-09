'use client';

import { useState, useMemo, useEffect } from 'react';
import { VideoData, SearchFilters, searchYouTube } from './utils/youtubeApi';
import type { SearchDepth, SearchUsage } from '../types/youtube';
import { filterVideosByType } from './utils/videoUtils';
import { withMetrics, compareByMetric, type SortKey } from './utils/metrics';
import { outperformCutoff } from './utils/helpers';
import { selectCohort, buildMarketAnalysisPrompt } from './utils/analysisPrompt';
import SearchDepthPicker from './components/SearchDepthPicker';
import CopyButton from './components/CopyButton';
import ThumbnailSheetButton from './components/ThumbnailSheetButton';
import AnalyzeButton from './components/AnalyzeButton';
import { getLlmStatus, type LlmStatus, type AnalysisResult } from './utils/llmClient';
import { getObserveStatus, type ObserveStatus, type VideoObservation } from './utils/observeClient';
import ObserveButton from './components/ObserveButton';
import { getVideoDurationInSeconds, getVideoType } from './utils/videoUtils';
import { browserHistoryStore, type HistoryStore, type NewOutputRecord } from './utils/history';
import Header from './components/Header';
import Sidebar, { MobileNavDrawer, type VideoFilter } from './components/Sidebar';
import SearchInput from './components/SearchInput';
import Filters from './components/Filters';
import SortBar from './components/SortBar';
import DisplayModeToggle from './components/DisplayModeToggle';
import VideoCard from './components/VideoCard';

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
  // 기본 정렬을 성과배수로 둔다. 조회수 순은 큰 채널만 위로 올라와,
  // "작은 채널이 크게 터뜨린 영상"이라는 이 도구의 목적과 어긋난다.
  const [sortBy, setSortBy] = useState<SortKey>('performanceMultiple');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchDepth, setSearchDepth] = useState<SearchDepth>(50);
  const [usage, setUsage] = useState<SearchUsage | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grid');
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('home');
  // 데스크톱 레일의 접힘과 모바일 드로어의 열림은 서로 다른 상태다.
  // 하나로 겸직시키면 뷰포트를 넘나들 때 화면이 상태와 어긋난다.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // 입력 중인 값과 "실제로 검색된 값"은 다른 사실이다.
  const [queryInput, setQueryInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // "검색어가 있는가"와 "검색을 했는가"를 한 변수로 겸직시키면, 초기화 때
  // 히어로·결과·빈 상태가 동시에 렌더된다. 분리해서 각자 한 가지만 답하게 한다.
  const [hasSearched, setHasSearched] = useState(false);
  // 앱 내 LLM 분석은 서버에 키가 있을 때만. 한 번만 물어보고 버튼 표시를 정한다.
  const [llm, setLlm] = useState<LlmStatus>({ enabled: false, model: null });
  useEffect(() => {
    let cancelled = false;
    getLlmStatus().then((status) => {
      if (!cancelled) setLlm(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 영상 관찰(Gemini)도 서버에 키가 있을 때만.
  const [observe, setObserve] = useState<ObserveStatus>({ enabled: false, model: null });
  useEffect(() => {
    let cancelled = false;
    getObserveStatus().then((status) => {
      if (!cancelled) setObserve(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 브라우저 로컬 보관함. SSR·차단 환경이면 null이고 저장만 빠진다.
  const [history, setHistory] = useState<HistoryStore | null>(null);
  // 현재 결과 영상들의 관찰. 출처는 보관함(videoId 키)이고 이 상태는 그 조회 결과다 —
  // 검색·복원 시 보관함에서 읽어 채우고, 새 관찰은 보관함에 먼저 쓴 뒤 여기에 반영한다.
  const [observations, setObservations] = useState<Record<string, VideoObservation>>({});
  const keepObservation = (observation: VideoObservation) => {
    if (!history) return;
    try {
      history.saveObservation(observation);
      setObservations((prev) => ({ ...prev, [observation.videoId]: observation }));
      setHistoryError(null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '관찰 저장에 실패했습니다.');
    }
  };
  // 저장된 검색을 열어 보고 있는가. null이면 방금 API로 받은 결과.
  const [restoredFrom, setRestoredFrom] = useState<{ id: string; savedAt: string } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // 시안용 "내 주제/채널". 브라우저에 남겨 다음 검색에서도 다시 안 치게 한다.
  const [topic, setTopic] = useState('');
  const handleTopicChange = (value: string) => {
    setTopic(value);
    history?.setTopic(value);
  };

  const keepOutput = (output: NewOutputRecord) => {
    if (!history) return;
    try {
      history.saveOutput(output);
      setHistoryError(null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '보관함 저장에 실패했습니다.');
    }
  };

  /**
   * URL의 ?h=<id>로 저장된 검색을 복원한다. 할당량을 쓰지 않는다.
   * 새로고침 한 번에 검색(할당량 1회)이 날아가던 문제의 답이다.
   */
  useEffect(() => {
    const store = browserHistoryStore();
    setHistory(store);
    if (!store) return;
    setTopic(store.getTopic());
    const id = new URLSearchParams(window.location.search).get('h');
    if (!id) return;
    const record = store.getSearch(id);
    if (!record) {
      setHistoryError('저장된 검색을 찾지 못했습니다. 이 브라우저에서 지워졌거나 다른 기기의 링크입니다.');
      window.history.replaceState(null, '', '/');
      return;
    }
    setSearchTerm(record.term);
    setQueryInput(record.term);
    setSearchDepth(record.depth);
    setFilters(record.filters);
    setVideos(record.videos);
    setUsage(record.usage);
    setHasSearched(true);
    setObservations(store.getObservations(record.videos.map((v) => v.id)));
    setRestoredFrom({ id: record.id, savedAt: record.savedAt });
  }, []);

  // 파생 지표는 저장하지 않고 여기 한 곳에서만 만든다.
  // 원본과 파생값을 둘 다 들고 있으면 언젠가 어긋난다.
  const videosWithMetrics = useMemo(() => withMetrics(videos), [videos]);

  const filteredVideos = useMemo(
    () => filterVideosByType(videosWithMetrics, videoFilter),
    [videosWithMetrics, videoFilter],
  );

  const sortedVideos = useMemo(
    () => [...filteredVideos].sort((a, b) => compareByMetric(a, b, sortBy, sortOrder)),
    [filteredVideos, sortBy, sortOrder],
  );

  // 대조군은 정렬 방식과 무관하게 성과배수 기준으로 뽑는다.
  // 잘된 영상만 보고 성공 요인을 지목하면, 같은 방식으로 하고 묻힌 영상이 보이지 않는다.
  const cohort = useMemo(() => selectCohort(filteredVideos), [filteredVideos]);

  const cohortObserveItems = useMemo(
    () =>
      [...cohort.top, ...cohort.bottom]
        .filter((v) => getVideoType(v.duration, v.liveStatus) !== 'live')
        .map((v) => ({ videoId: v.id, title: v.title, durationSec: getVideoDurationInSeconds(v.duration) })),
    [cohort],
  );

  // 강조 기준은 절대값이 아니라 이 결과 집합 안의 상대 위치(+절대 하한)다.
  // 실측에서 절대 2배 기준은 78~94%를 강조해 아무 정보도 주지 못했다.
  const highlightCutoff = useMemo(
    () => outperformCutoff(filteredVideos.map((v) => v.metrics.performanceMultiple)),
    [filteredVideos],
  );

  const handleSearch = async (term: string) => {
    setIsLoading(true);
    setError(null);
    setSearchTerm(term);
    setQueryInput(term);
    setHasSearched(true);
    setVideos([]); // 새로운 검색 시작 시 이전 결과 완전히 초기화
    setUsage(null);
    setRestoredFrom(null);

    try {
      const { videos: results, usage: spent } = await searchYouTube(term, filters, searchDepth);
      setVideos(results);
      setUsage(spent);
      setObservations(history ? history.getObservations(results.map((v) => v.id)) : {});
      // 성공한 검색은 자동으로 남긴다. URL에 id를 실어 새로고침·뒤로가기가 복원되게 한다.
      if (history) {
        try {
          const saved = history.saveSearch({ term, depth: searchDepth, filters, usage: spent, videos: results });
          window.history.replaceState(null, '', `/?h=${encodeURIComponent(saved.id)}`);
          setHistoryError(null);
        } catch (e) {
          setHistoryError(e instanceof Error ? e.message : '검색 이력 저장에 실패했습니다.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색에 실패했습니다.');
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSortChange = (newSortBy: SortKey, newSortOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  };

  const handleVideoFilterChange = (filter: VideoFilter) => {
    setVideoFilter(filter);
  };

  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  /**
   * 첫 화면으로 되돌린다.
   *
   * 예전 '초기화'는 searchTerm만 비우고 결과는 남겨, 히어로 검색창과 결과
   * 목록과 "InSigt를 발굴하세요" 빈 상태가 한 화면에 겹쳐 나왔다. 되돌리는
   * 동작은 자기가 소유한 상태를 **전부** 되돌려야 한다.
   */
  const resetToHome = () => {
    setQueryInput('');
    setSearchTerm('');
    setHasSearched(false);
    setVideos([]);
    setError(null);
    setUsage(null);
    setObservations({});
    setRestoredFrom(null);
    setHistoryError(null);
    window.history.replaceState(null, '', '/');
    setVideoFilter('home');
    setSortBy('performanceMultiple');
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
        onLogoClick={resetToHome}
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
          {!hasSearched && (
            <div className="max-w-4xl mx-auto text-center mb-12">
              <div className="mb-8">
                <h1 className="text-3xl sm:text-5xl font-bold mb-4 bg-linear-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                  YouTube Insight
                </h1>
                <p className="text-lg sm:text-xl text-gray-400">
                  채널 평소 대비 얼마나 터졌는지로 영상을 찾습니다
                </p>
              </div>

              <SearchInput
                value={queryInput}
                onChange={setQueryInput}
                onSearch={handleSearch}
                isLoading={isLoading}
              />
              <SearchDepthPicker
                value={searchDepth}
                onChange={setSearchDepth}
                lastUsage={usage}
                disabled={isLoading}
              />
              <Filters filters={filters} onFiltersChange={setFilters} />
            </div>
          )}

          {/* Compact Search - Show after first search */}
          {hasSearched && (
            <div className="mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 max-w-2xl">
                  <SearchInput
                    value={queryInput}
                    onChange={setQueryInput}
                    onSearch={handleSearch}
                    isLoading={isLoading}
                  />
                </div>
                <button
                  type="button"
                  onClick={resetToHome}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  초기화
                </button>
              </div>
              <SearchDepthPicker
                value={searchDepth}
                onChange={setSearchDepth}
                lastUsage={usage}
                disabled={isLoading}
              />
              <Filters filters={filters} onFiltersChange={setFilters} />
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg mb-6">
              <strong>오류:</strong> {error}
            </div>
          )}
          {historyError && (
            <div role="alert" className="bg-amber-900/60 border border-amber-700 text-amber-100 px-4 py-3 rounded-lg mb-6 text-sm">
              보관함: {historyError}
            </div>
          )}
          {restoredFrom && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-800 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg mb-6 text-sm">
              <span>
                저장된 결과 ({new Date(restoredFrom.savedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })})
                — 할당량 소비 없음. 지표는 지금 정의로 다시 계산했습니다.
              </span>
              <button
                type="button"
                onClick={() => handleSearch(searchTerm)}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                다시 검색 (검색 1회)
              </button>
            </div>
          )}

          {/* Results Section */}
          {sortedVideos.length > 0 && (
            <>
              {/* Current Filter Display */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
                <h2 className="text-xl sm:text-2xl font-bold">
                  {videoFilter === 'home' && '모든 영상'}
                  {videoFilter === 'shorts' && 'Shorts (3분 이하)'}
                  {videoFilter === 'long' && 'Long Videos (3분 초과)'}
                </h2>
                <span className="text-gray-400 text-sm">
                  &ldquo;{searchTerm}&rdquo; 검색 결과
                </span>
              </div>

              {/*
                상위군 vs 하위군 비교. 이 도구에서 가장 값이 큰 출력이라 주 동작으로 둔다.
                영상 하나만 분석하면 사후 서사밖에 안 나오지만, 같은 검색어의 두 집단을
                비교하면 셀 수 있는 진술이 나온다.
              */}
              {cohort.top.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold">키워드 시장 분석</h3>
                    <p className="text-sm text-gray-400 mt-0.5">
                      성과배수 상위 <span className="tabular-nums">{cohort.top.length}</span>건과 하위{' '}
                      <span className="tabular-nums">{cohort.bottom.length}</span>건을 대조군으로 묶어
                      LLM에 붙여넣을 프롬프트를 만듭니다.
                    </p>
                  </div>
                  {/* 시안 절의 "내 주제". 비우면 프롬프트가 입력 칸을 남기고 검색어와 같은 주제로 가정하게 한다. */}
                  <div className="w-full">
                    <label htmlFor="topic-input" className="block text-xs text-gray-400 mb-1">
                      내 주제/채널 (시안용, 선택) — 프롬프트 끝의 제목·썸네일·구조 시안이 이 주제로 나옵니다
                    </label>
                    <input
                      id="topic-input"
                      type="text"
                      value={topic}
                      onChange={(e) => handleTopicChange(e.target.value)}
                      placeholder={`비우면 "${searchTerm}"와 같은 주제로 가정`}
                      maxLength={120}
                      className="w-full max-w-xl px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton
                      getText={() => buildMarketAnalysisPrompt(searchTerm, cohort, { topic, observations })}
                      onCopied={() =>
                        keepOutput({
                          kind: 'market-prompt',
                          term: searchTerm,
                          title: `"${searchTerm}" 시장 분석`,
                          text: buildMarketAnalysisPrompt(searchTerm, cohort, { topic, observations }),
                        })
                      }
                      label="시장 분석 복사"
                      variant="primary"
                      title="상위군·하위군 비교 프롬프트를 복사합니다"
                    />
                    {/* 시트의 #번호 = 프롬프트 표의 행 번호. 상위군 1..N, 하위군 N+1.. */}
                    <ThumbnailSheetButton
                      items={[...cohort.top, ...cohort.bottom].map((v, i) => ({
                        videoId: v.id,
                        label: `#${i + 1}`,
                      }))}
                      filename={`thumbnails-${searchTerm.replace(/[^\w가-힣]+/g, '_').slice(0, 40) || 'sheet'}.png`}
                    />
                  </div>
                  {/* 영상 관찰: Gemini가 대조군 영상을 직접 본다. 키 없으면 잠김. 결과는 프롬프트 표에 실린다. */}
                  {observe.enabled && history && (
                    <ObserveButton
                      enabled={observe.enabled}
                      model={observe.model}
                      items={cohortObserveItems}
                      existing={observations}
                      onObserved={keepObservation}
                      label="영상 관찰 수집 (상위·하위군)"
                    />
                  )}
                  {/* 앱 내 분석: 썸네일이 자동 첨부된다. 순서 = 프롬프트 표 행 번호. */}
                  <AnalyzeButton
                    enabled={llm.enabled}
                    model={llm.model}
                    getPrompt={() => buildMarketAnalysisPrompt(searchTerm, cohort, { topic, observations })}
                    thumbnailVideoIds={[...cohort.top, ...cohort.bottom].map((v) => v.id)}
                    label="앱에서 시장 분석"
                    onResult={(result: AnalysisResult) =>
                      keepOutput({
                        kind: 'market-analysis',
                        term: searchTerm,
                        title: `"${searchTerm}" 시장 분석 결과`,
                        text: result.text,
                        llm: {
                          model: result.model,
                          inputTokens: result.usage.inputTokens,
                          outputTokens: result.usage.outputTokens,
                          estimatedCostUsd: result.estimatedCostUsd,
                        },
                      })
                    }
                  />
                </div>
              ) : (
                <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700 text-sm text-gray-400">
                  성과배수를 계산할 수 있는 영상이 둘 이상 있어야 상위군·하위군 비교가 가능합니다.
                  검색 깊이를 늘리거나 다른 키워드를 시도해 보세요.
                </div>
              )}

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
                {sortedVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    displayMode={displayMode}
                    cohort={cohort}
                    searchTerm={searchTerm}
                    llm={llm}
                    highlightCutoff={highlightCutoff}
                    onOutput={history ? keepOutput : undefined}
                    topic={topic}
                    observe={observe}
                    observations={observations}
                    onObserved={history ? keepObservation : undefined}
                  />
                ))}
              </div>
            </>
          )}

          {/* 필터 때문에 비었을 때 — 검색은 됐지만 이 유형만 없다 */}
          {!isLoading && hasSearched && videos.length > 0 && sortedVideos.length === 0 && (
            <div className="text-center text-gray-400 mt-12">
              <p className="text-xl">
                {videoFilter === 'shorts' ? 'Shorts 영상이 없습니다' : 'Long 영상이 없습니다'}
              </p>
              <p className="text-sm mt-2">왼쪽 메뉴에서 &lsquo;홈&rsquo;을 선택하면 전체를 볼 수 있습니다.</p>
              <button
                type="button"
                onClick={() => setVideoFilter('home')}
                className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                전체 보기
              </button>
            </div>
          )}

          {/* 검색은 됐는데 결과가 아예 없을 때 — 예전에는 아무것도 안 나왔다 */}
          {!isLoading && hasSearched && !error && videos.length === 0 && (
            <div className="text-center text-gray-400 mt-12">
              <p className="text-xl">검색 결과가 없습니다</p>
              <p className="text-sm mt-2">
                필터(업로드 시기·영상 길이)를 넓히거나 다른 키워드를 시도해 보세요.
              </p>
            </div>
          )}

          {/* 첫 화면 */}
          {!isLoading && !hasSearched && (
            <div className="text-center text-gray-400 mt-12">
              <p className="text-xl">InSigt를 발굴하세요</p>
              <p className="text-sm mt-2">키워드를 입력하고 검색 버튼을 눌러주세요.</p>
            </div>
          )}

          {/* 로딩 */}
          {isLoading && (
            <div className="text-center mt-12" role="status" aria-live="polite">
              <div className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-4 border-gray-600 border-t-red-500 mx-auto mb-4" aria-hidden="true"></div>
              <p className="text-gray-400">YouTube에서 검색 중...</p>
              <p className="text-sm text-gray-500 mt-2">
                최대 <span className="tabular-nums">{searchDepth}</span>개의 결과를 가져오고 있습니다.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}