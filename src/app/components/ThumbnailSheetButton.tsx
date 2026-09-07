'use client';

import { useState } from 'react';
import { buildContactSheet, copyImage, downloadBlob, type SheetItem } from '../utils/contactSheet';

interface ThumbnailSheetButtonProps {
  items: SheetItem[];
  /** 클립보드를 못 쓸 때 내려받을 파일 이름 */
  filename: string;
}

type State = 'idle' | 'building' | 'copied' | 'downloaded' | 'failed';

const LABEL: Record<State, string> = {
  idle: '썸네일 시트 복사',
  building: '만드는 중…',
  copied: '이미지 복사됨',
  downloaded: '이미지 내려받음',
  failed: '실패',
};

/**
 * 상위군·하위군 썸네일을 한 장으로 합쳐 클립보드에 넣는다.
 *
 * 클립보드 이미지를 지원하지 않는 브라우저에서는 성공한 척하지 않고 PNG를
 * 내려받게 한다. 어느 쪽이 됐는지 버튼 문구와 aria-live로 알린다.
 */
export default function ThumbnailSheetButton({ items, filename }: ThumbnailSheetButtonProps) {
  const [state, setState] = useState<State>('idle');

  const handleClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (state === 'building' || items.length === 0) return;
    setState('building');
    try {
      const blob = await buildContactSheet(items);
      const result = await copyImage(blob);
      if (result === 'copied') {
        setState('copied');
      } else {
        downloadBlob(blob, filename);
        setState('downloaded');
      }
    } catch (error) {
      console.error('[ThumbnailSheetButton] 시트 생성 실패', error);
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2_500);
  };

  const tone =
    state === 'copied' || state === 'downloaded'
      ? 'bg-emerald-600'
      : state === 'failed'
        ? 'bg-red-700'
        : 'bg-gray-700 hover:bg-gray-600';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'building' || items.length === 0}
        title="상위군·하위군 썸네일을 #번호가 찍힌 한 장의 이미지로 만들어 클립보드에 넣습니다. LLM 입력창에 프롬프트와 함께 붙여넣으세요."
        className={`px-4 py-2 text-sm ${tone} text-white font-medium rounded-md transition-colors shrink-0 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:ring-red-500`}
      >
        {LABEL[state]}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === 'copied'
          ? '썸네일 시트가 클립보드에 복사되었습니다'
          : state === 'downloaded'
            ? '이 브라우저는 이미지 복사를 지원하지 않아 파일로 내려받았습니다'
            : state === 'failed'
              ? '썸네일 시트를 만들지 못했습니다'
              : ''}
      </span>
    </>
  );
}
