'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export type VideoFilter = 'home' | 'shorts' | 'long';

interface NavListProps {
  activeFilter: VideoFilter;
  onFilterChange: (filter: VideoFilter) => void;
  /** 라벨을 숨기고 아이콘만 남긴다 (데스크톱 접힘 상태) */
  iconOnly?: boolean;
}

const MENU_ITEMS: { id: VideoFilter; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    id: 'home',
    label: '홈',
    hint: '모든 영상',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    ),
  },
  {
    id: 'shorts',
    label: 'Shorts',
    hint: '3분 이하',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4c-.55 0-1 .45-1 1v14c0 .55.45 1 1 1h2.5c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1H7zM13.5 4c-.55 0-1 .45-1 1v14c0 .55.45 1 1 1H16c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1h-2.5z" />
      </svg>
    ),
  },
  {
    id: 'long',
    label: 'Long Videos',
    hint: '3분 초과',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7.5v-3l4 1.74-4 1.26z" />
      </svg>
    ),
  },
];

/** 메뉴 항목의 단일 정의. 데스크톱 레일과 모바일 드로어가 같은 것을 쓴다. */
function NavList({ activeFilter, onFilterChange, iconOnly = false }: NavListProps) {
  return (
    <nav className="pt-4" aria-label="영상 유형 필터">
      {MENU_ITEMS.map((item) => {
        const isActive = activeFilter === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onFilterChange(item.id)}
            aria-current={isActive ? 'page' : undefined}
            title={iconOnly ? item.label : undefined}
            className={`w-full flex items-center gap-4 px-4 py-3 transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 ${
              isActive ? 'bg-gray-800 text-white' : 'text-gray-300'
            }`}
          >
            <span className="shrink-0">{item.icon}</span>
            {!iconOnly && (
              <span className="text-sm font-medium">
                {item.label}
                <span className="sr-only"> — {item.hint}</span>
              </span>
            )}
          </button>
        );
      })}
      {/* 필터가 아니라 페이지 이동. 검색 이력과 복사·분석한 출력이 여기 남는다. */}
      <Link
        href="/history"
        title={iconOnly ? '보관함' : undefined}
        className="w-full flex items-center gap-4 px-4 py-3 mt-2 border-t border-gray-800 text-gray-300 transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500"
      >
        <span className="shrink-0">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
          </svg>
        </span>
        {!iconOnly && (
          <span className="text-sm font-medium">
            보관함
            <span className="sr-only"> — 검색 이력과 저장된 프롬프트·분석 결과</span>
          </span>
        )}
      </Link>
    </nav>
  );
}

function FilterLegend() {
  return (
    <div className="mt-4 px-4">
      <div className="border-t border-gray-700 pt-4">
        <div className="text-xs text-gray-500 mb-2">필터</div>
        <ul className="space-y-1 text-xs text-gray-400">
          {MENU_ITEMS.map((item) => (
            <li key={item.id}>
              • {item.label}: {item.hint}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface DesktopSidebarProps {
  activeFilter: VideoFilter;
  onFilterChange: (filter: VideoFilter) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * 데스크톱 전용 고정 레일.
 *
 * 모바일에서는 display:none이라 DOM에는 있어도 초점이 들어가지 않는다.
 * (화면 밖으로 밀어두기만 하면 키보드 사용자가 보이지 않는 메뉴로 탭 이동하게 된다.)
 */
export default function Sidebar({
  activeFilter,
  onFilterChange,
  isCollapsed,
  onToggleCollapse,
}: DesktopSidebarProps) {
  return (
    <div
      className={`hidden md:block fixed left-0 top-16 h-full bg-gray-900 border-r border-gray-700 transition-all duration-200 motion-reduce:transition-none z-40 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
        aria-expanded={!isCollapsed}
        className="absolute -right-3 top-6 w-6 h-6 bg-gray-800 border border-gray-600 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <svg
          className={`w-4 h-4 transition-transform motion-reduce:transition-none ${isCollapsed ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <NavList activeFilter={activeFilter} onFilterChange={onFilterChange} iconOnly={isCollapsed} />
      {!isCollapsed && <FilterLegend />}
    </div>
  );
}

interface MobileNavDrawerProps {
  activeFilter: VideoFilter;
  onFilterChange: (filter: VideoFilter) => void;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 모바일 드로어.
 *
 * 열렸을 때만 DOM에 존재한다. 닫힌 상태를 화면 밖 이동으로 표현하면 보이지
 * 않는 메뉴가 탭 순서에 남는다.
 */
export function MobileNavDrawer({
  activeFilter,
  onFilterChange,
  isOpen,
  onClose,
}: MobileNavDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // 드로어 뒤의 본문이 같이 스크롤되지 않도록 잠근다.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={onClose}
        aria-label="메뉴 닫기"
        className="fixed inset-0 top-16 z-40 bg-black/60 cursor-default"
      />
      <div className="fixed left-0 top-16 bottom-0 w-64 max-w-[80vw] overflow-y-auto bg-gray-900 border-r border-gray-700 z-50">
        <NavList
          activeFilter={activeFilter}
          onFilterChange={(filter) => {
            onFilterChange(filter);
            onClose();
          }}
        />
        <FilterLegend />
      </div>
    </div>
  );
}
