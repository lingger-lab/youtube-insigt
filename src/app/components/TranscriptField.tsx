'use client';

interface TranscriptFieldProps {
  videoId: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * 자막(스크립트) 붙여넣기 입력란.
 *
 * 타인 영상의 자막은 공식 API로 받을 수 없다(소유자 OAuth 필수). 비공식
 * 엔드포인트는 ToS §5.B 위반 소지가 있어 제품에 넣지 않는다. 대신 사용자가
 * YouTube에서 직접 복사해 붙여넣게 한다 — 깊게 볼 한두 편에만 쓰면 된다.
 * 붙여넣은 자막은 서버로 보내지 않고 프롬프트에만 들어간다.
 */
export default function TranscriptField({ videoId, value, onChange }: TranscriptFieldProps) {
  const inputId = `transcript-${videoId}`;
  const length = value.trim().length;

  return (
    <div className="mt-3 space-y-1">
      <label htmlFor={inputId} className="block text-xs font-medium text-gray-300">
        자막 붙여넣기 <span className="text-gray-500 font-normal">(선택 — 있으면 대본 구조까지 분석 요청)</span>
      </label>
      <textarea
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        rows={5}
        placeholder="YouTube 영상 페이지 → 설명 '…더보기' → '스크립트 표시' → 전체 선택·복사 후 여기에 붙여넣기"
        className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400"
      />
      <p className="text-[11px] text-gray-500">
        {length > 0 ? (
          <>
            <span className="tabular-nums">{length.toLocaleString()}</span>자 — 프롬프트에 포함됩니다. 서버로 전송되지 않습니다.
          </>
        ) : (
          '비워두면 대본 구조 분석은 "데이터 없음"으로 처리됩니다.'
        )}
      </p>
    </div>
  );
}
