'use client';

interface HeaderProps {
  /** 모바일: 드로어 열기 */
  onMobileMenuOpen: () => void;
  isMobileMenuOpen: boolean;
  /** 데스크톱: 고정 레일 접기/펼치기 */
  onSidebarCollapseToggle: () => void;
  isSidebarCollapsed: boolean;
  onLogoClick: () => void;
}

const MENU_ICON = (
  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export default function Header({
  onMobileMenuOpen,
  isMobileMenuOpen,
  onSidebarCollapseToggle,
  isSidebarCollapsed,
  onLogoClick,
}: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-gray-900 border-b border-gray-700 flex items-center px-4 z-50">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/*
          모바일과 데스크톱은 같은 아이콘이지만 다른 동작이다(드로어 열기 vs 레일 접기).
          하나의 버튼으로 뷰포트에 따라 분기하면 화면 크기를 JS로 알아야 하고
          하이드레이션이 어긋난다. CSS로 가르는 편이 정확하다.
        */}
        <button
          type="button"
          onClick={onMobileMenuOpen}
          className="md:hidden p-2 hover:bg-gray-800 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          aria-label="메뉴 열기"
          aria-expanded={isMobileMenuOpen}
        >
          {MENU_ICON}
        </button>
        <button
          type="button"
          onClick={onSidebarCollapseToggle}
          className="hidden md:inline-flex p-2 hover:bg-gray-800 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          aria-label={isSidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-expanded={!isSidebarCollapsed}
        >
          {MENU_ICON}
        </button>

        {/* 로고: 누르면 첫 화면으로 돌아간다 */}
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="처음 화면으로"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-md"
        >
          <svg className="w-8 h-8 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          {/* 줄바꿈되면 헤더 높이를 넘어 본문 위로 흘러내린다 */}
          <span className="text-lg sm:text-xl font-bold text-white whitespace-nowrap">
            YouTube Insight
          </span>
        </button>
      </div>
    </header>
  );
}