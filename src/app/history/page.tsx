'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  browserHistoryStore,
  OUTPUT_KIND_LABEL,
  type HistoryStore,
  type SearchRecord,
  type OutputRecord,
} from '../utils/history';
import CopyButton from '../components/CopyButton';

/**
 * 저장소 핸들은 모듈에서 한 번만 만든다. useSyncExternalStore의 스냅샷은 같은 값을
 * 돌려줘야 하고, 서버 스냅샷(undefined)과 클라이언트 스냅샷을 구분해야 하이드레이션이
 * 어긋나지 않는다. effect 안에서 setState로 채우는 방식은 lint(set-state-in-effect)가 막는다.
 */
interface Snapshot {
  store: HistoryStore | null;
  /** 삭제 뒤 목록을 다시 읽게 한다. 스냅샷 객체가 바뀌어야 React가 변화를 안다. */
  version: number;
}
let snapshot: Snapshot | undefined;
const listeners = new Set<() => void>();
function getSnapshot(): Snapshot {
  if (!snapshot) snapshot = { store: browserHistoryStore(), version: 0 };
  return snapshot;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
function bump() {
  snapshot = { ...getSnapshot(), version: getSnapshot().version + 1 };
  listeners.forEach((listener) => listener());
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * 보관함 — 검색 이력과 출력(프롬프트·LLM 분석 결과).
 *
 * 전부 이 브라우저의 localStorage에서 읽는다. 서버에는 아무것도 없다.
 * 그 사실을 화면 위에 적는다. "저장됨"이 어디에 저장됐는지 모르면 다른 기기에서
 * 찾다가 잃어버렸다고 오해한다.
 */
export default function HistoryPage() {
  // 서버 스냅샷은 undefined(아직 모름), 클라이언트는 store가 null(차단)이거나 핸들이다.
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
  const store = snap?.store;
  const [error, setError] = useState<string | null>(null);

  const searches: SearchRecord[] = useMemo(() => snap?.store?.listSearches() ?? [], [snap]);
  const outputs: OutputRecord[] = useMemo(() => snap?.store?.listOutputs() ?? [], [snap]);

  const run = (action: (s: HistoryStore) => void) => {
    if (!store) return;
    try {
      action(store);
      bump();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장소 작업에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="h-16 border-b border-gray-700 bg-gray-900 flex items-center px-4 md:px-6 gap-4">
        <Link
          href="/"
          className="text-gray-300 hover:text-white text-sm rounded-md px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          ← 검색으로
        </Link>
        <h1 className="text-lg font-semibold">보관함</h1>
      </header>

      <main className="container mx-auto px-4 md:px-6 py-6 md:py-8 space-y-10">
        <p className="text-sm text-gray-400">
          이 브라우저의 로컬 저장소(localStorage)에만 있습니다. 서버에는 저장되지 않으며, 다른 기기·브라우저·
          시크릿 창에서는 보이지 않습니다. 저장된 검색을 열면 할당량을 쓰지 않습니다.
        </p>

        {store === null && (
          <div role="alert" className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg">
            이 브라우저에서는 로컬 저장소를 쓸 수 없습니다(차단 설정 또는 시크릿 모드). 검색은 되지만 아무것도 남지 않습니다.
          </div>
        )}
        {error && (
          <div role="alert" className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <section aria-labelledby="searches-heading">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 id="searches-heading" className="text-xl font-bold">
              검색 이력 <span className="text-gray-400 text-base tabular-nums">({searches.length})</span>
            </h2>
          </div>
          {searches.length === 0 ? (
            <p className="text-gray-500 text-sm">아직 없습니다. 검색하면 자동으로 남습니다.</p>
          ) : (
            <div className="relative overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-300">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2">시각</th>
                    <th scope="col" className="text-left px-3 py-2">검색어</th>
                    <th scope="col" className="text-right px-3 py-2 whitespace-nowrap">깊이</th>
                    <th scope="col" className="text-right px-3 py-2 whitespace-nowrap">영상</th>
                    <th scope="col" className="text-right px-3 py-2 whitespace-nowrap">할당량</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">동작</span></th>
                  </tr>
                </thead>
                <tbody>
                  {searches.map((s) => (
                    <tr key={s.id} className="border-t border-gray-800">
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{formatWhen(s.savedAt)}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/?h=${encodeURIComponent(s.id)}`}
                          className="text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                        >
                          {s.term}
                        </Link>
                        <span className="text-gray-500 text-xs ml-2">
                          {s.filters.order}
                          {s.filters.videoDuration !== 'any' ? ` · ${s.filters.videoDuration}` : ''}
                          {s.filters.publishedAfter ? ' · 기간제한' : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.depth}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.videos.length}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-400 whitespace-nowrap">
                        검색 {s.usage.searchCalls} · 공용 {s.usage.otherUnits}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Link
                          href={`/?h=${encodeURIComponent(s.id)}`}
                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        >
                          열기
                        </Link>
                        <button
                          type="button"
                          onClick={() => run((st) => st.deleteSearch(s.id))}
                          className="ml-2 px-2 py-1 text-xs text-red-300 hover:bg-red-900/50 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="outputs-heading">
          <h2 id="outputs-heading" className="text-xl font-bold mb-3">
            출력 <span className="text-gray-400 text-base tabular-nums">({outputs.length})</span>
          </h2>
          {outputs.length === 0 ? (
            <p className="text-gray-500 text-sm">
              아직 없습니다. 프롬프트를 복사하거나 앱에서 분석하면 여기 남습니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {outputs.map((o) => (
                <li key={o.id} className="rounded-lg border border-gray-700 bg-gray-800">
                  <details>
                    <summary className="cursor-pointer px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-lg">
                      <span className="px-2 py-0.5 text-xs rounded bg-purple-900 text-purple-100">{OUTPUT_KIND_LABEL[o.kind]}</span>
                      <span className="text-gray-400 whitespace-nowrap">{formatWhen(o.savedAt)}</span>
                      <span className="text-white">&ldquo;{o.term}&rdquo;</span>
                      {o.kind !== 'market-prompt' && o.kind !== 'market-analysis' && (
                        <span className="text-gray-300 truncate max-w-[40ch]">{o.title}</span>
                      )}
                      <span className="text-gray-500 tabular-nums">{o.text.length.toLocaleString()}자</span>
                      {o.llm && (
                        <span className="text-gray-500 tabular-nums">
                          {o.llm.model} · {o.llm.inputTokens.toLocaleString()}/{o.llm.outputTokens.toLocaleString()} 토큰
                          {o.llm.estimatedCostUsd !== null ? ` · 약 $${o.llm.estimatedCostUsd.toFixed(4)}` : ''}
                        </span>
                      )}
                    </summary>
                    <div className="px-3 pb-3">
                      <div className="flex gap-2 mb-2">
                        <CopyButton getText={() => o.text} label="복사" title="본문을 클립보드에 복사합니다" />
                        <button
                          type="button"
                          onClick={() => run((st) => st.deleteOutput(o.id))}
                          className="px-2 py-1 text-xs text-red-300 hover:bg-red-900/50 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        >
                          삭제
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-100 leading-relaxed max-h-[60vh] overflow-y-auto bg-gray-900 rounded-md p-3">
                        {o.text}
                      </pre>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(searches.length > 0 || outputs.length > 0) && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('검색 이력과 출력을 모두 지웁니다. 되돌릴 수 없습니다.')) run((st) => st.clearAll());
            }}
            className="px-4 py-2 text-sm bg-gray-800 hover:bg-red-900 text-red-200 border border-gray-700 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            전부 삭제
          </button>
        )}
      </main>
    </div>
  );
}
