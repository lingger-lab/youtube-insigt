'use client';

interface HeaderProps {
  onMenuToggle: () => void;
  onLogoClick: () => void;
}

export default function Header({ onMenuToggle, onLogoClick }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-gray-900 border-b border-gray-700 flex items-center px-4 z-50">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/* Menu Button */}
        <button
          onClick={onMenuToggle}
          className="p-2 hover:bg-gray-800 rounded-full transition-colors"
          aria-label="메뉴 토글"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* YouTube Logo */}
        <button 
          onClick={onLogoClick}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span className="text-xl font-bold text-white">YouTube Insight</span>
        </button>
      </div>

      {/* Center Section - Empty for cleaner layout */}
      <div className="flex-1"></div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Create Button */}
        <button className="p-2 hover:bg-gray-800 rounded-full transition-colors" title="만들기">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* Notifications */}
        <button className="p-2 hover:bg-gray-800 rounded-full transition-colors" title="알림">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5-5 5h5zM15 17v0a3 3 0 01-3 3 3 3 0 01-3-3v0" />
          </svg>
        </button>

        {/* Profile */}
        <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
          U
        </div>
      </div>
    </header>
  );
}