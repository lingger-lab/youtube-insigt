'use client';

import { useState } from 'react';

interface CopyButtonProps {
  /** 눌렀을 때 생성할 텍스트. 미리 만들지 않는 이유는 프롬프트가 길기 때문. */
  getText: () => string;
  label: string;
  title?: string;
  variant?: 'primary' | 'compact';
  onCopied?: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * 클립보드 복사 + 결과 피드백.
 *
 * 피드백을 DOM 직접 조작(button.textContent = ...)으로 하면 두 가지가 깨진다.
 * React가 다시 그릴 때 되돌아가고, 이벤트 타깃이 자식 요소일 때 엉뚱한 곳을
 * 고친다. 상태로 관리하고 결과는 aria-live로 알린다.
 */
export default function CopyButton({
  getText,
  label,
  title,
  variant = 'compact',
  onCopied,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');

  const handleClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(getText());
      setState('copied');
      onCopied?.();
    } catch {
      // 클립보드 권한이 없거나 보안 컨텍스트가 아닐 때. 성공한 척하지 않는다.
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1800);
  };

  const text = state === 'copied' ? '복사됨' : state === 'failed' ? '복사 실패' : label;

  const tone =
    state === 'copied'
      ? 'bg-emerald-600'
      : state === 'failed'
        ? 'bg-red-700'
        : 'bg-purple-600 hover:bg-purple-700';

  const size = variant === 'primary' ? 'px-4 py-2 text-sm' : 'px-2 py-1 text-xs';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={title}
        className={`${size} ${tone} text-white font-medium rounded-md transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:ring-purple-400`}
      >
        {text}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? '클립보드에 복사되었습니다' : state === 'failed' ? '클립보드 복사에 실패했습니다' : ''}
      </span>
    </>
  );
}
