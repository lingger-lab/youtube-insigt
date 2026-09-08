'use client';

interface SearchInputProps {
  /**
   * 입력값을 부모가 들고 있는다.
   *
   * 컴포넌트 안에 두면 첫 화면과 검색 후 화면이 서로 다른 가지에서 렌더되는
   * 순간 언마운트/리마운트가 일어나 방금 친 검색어가 사라진다.
   */
  value: string;
  onChange: (value: string) => void;
  onSearch: (term: string) => void;
  isLoading: boolean;
}

export default function SearchInput({ value, onChange, onSearch, isLoading }: SearchInputProps) {
  const trimmed = value.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmed) {
      onSearch(trimmed);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mb-6">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <label htmlFor="search-term" className="sr-only">
            검색할 키워드
          </label>
          <input
            id="search-term"
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="YouTube에서 검색할 키워드를 입력하세요..."
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            disabled={isLoading}
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
              <div className="animate-spin motion-reduce:animate-none rounded-full h-5 w-5 border-2 border-gray-400 border-t-red-500"></div>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !trimmed}
          className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? '검색 중...' : '검색'}
        </button>
      </form>
    </div>
  );
}
