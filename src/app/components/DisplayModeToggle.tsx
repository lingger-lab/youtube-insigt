'use client';

type DisplayMode = 'grid' | 'list';

interface DisplayModeToggleProps {
  mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

export default function DisplayModeToggle({ mode, onModeChange }: DisplayModeToggleProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-sm text-gray-400">표시 방식:</span>
      <div className="flex bg-gray-700 rounded-lg p-1">
        <button
          onClick={() => onModeChange('grid')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'grid'
              ? 'bg-red-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          카드
        </button>
        <button
          onClick={() => onModeChange('list')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'list'
              ? 'bg-red-600 text-white'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          리스트
        </button>
      </div>
    </div>
  );
}