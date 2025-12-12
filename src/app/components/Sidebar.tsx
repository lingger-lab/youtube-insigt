'use client';

interface SidebarProps {
  activeFilter: 'home' | 'shorts' | 'long';
  onFilterChange: (filter: 'home' | 'shorts' | 'long') => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ activeFilter, onFilterChange, isCollapsed, onToggleCollapse }: SidebarProps) {
  const menuItems = [
    {
      id: 'home' as const,
      label: '홈',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      )
    },
    {
      id: 'shorts' as const,
      label: 'Shorts',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 4c-.55 0-1 .45-1 1v14c0 .55.45 1 1 1h2.5c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1H7zM13.5 4c-.55 0-1 .45-1 1v14c0 .55.45 1 1 1H16c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1h-2.5z"/>
        </svg>
      )
    },
    {
      id: 'long' as const,
      label: 'Long Videos',
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7.5v-3l4 1.74-4 1.26z"/>
        </svg>
      )
    }
  ];

  return (
    <div className={`fixed left-0 top-16 h-full bg-gray-900 border-r border-gray-700 transition-all duration-300 z-40 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Toggle Button */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-6 w-6 h-6 bg-gray-800 border border-gray-600 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700"
      >
        <svg 
          className={`w-4 h-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Menu Items */}
      <nav className="pt-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onFilterChange(item.id)}
            className={`w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-800 transition-colors ${
              activeFilter === item.id ? 'bg-gray-800 text-white' : 'text-gray-300'
            }`}
            title={isCollapsed ? item.label : undefined}
          >
            <div className="flex-shrink-0">
              {item.icon}
            </div>
            {!isCollapsed && (
              <span className="text-sm font-medium">{item.label}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Divider */}
      {!isCollapsed && (
        <div className="mt-4 px-4">
          <div className="border-t border-gray-700 pt-4">
            <div className="text-xs text-gray-500 mb-2">필터</div>
            <div className="space-y-1 text-xs text-gray-400">
              <div>• 홈: 모든 영상</div>
              <div>• Shorts: 3분 이하</div>
              <div>• Long: 3분 초과</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}