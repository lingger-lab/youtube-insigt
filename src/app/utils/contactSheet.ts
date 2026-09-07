/**
 * 썸네일 컨택트시트.
 *
 * 프롬프트는 텍스트라 썸네일 이미지를 함께 넘길 수 없었다. 대신 상위군·하위군
 * 썸네일을 한 장의 격자 이미지로 합치고 각 칸에 `#n` 라벨을 찍어 클립보드에
 * 넣는다. 사용자는 붙여넣기 한 번으로 12장을 전달하고, 라벨은 프롬프트 표의
 * 행 번호와 일치한다.
 *
 * 이미지는 `/api/thumbnail` 프록시로 받는다. `i.ytimg.com`을 직접 그리면
 * 캔버스가 오염되어 내보낼 수 없다.
 */

export interface SheetItem {
  videoId: string;
  /** 프롬프트 표의 행 번호와 같아야 한다. 예: "#3" */
  label: string;
}

export interface GridPlan {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
}

/** 격자 계산. 캔버스 없이 검증할 수 있게 순수 함수로 뗀다. */
export function planGrid(count: number, cols = 3, cellWidth = 480): GridPlan {
  const safeCount = Math.max(0, Math.floor(count));
  const safeCols = Math.max(1, Math.min(cols, Math.max(1, safeCount)));
  const rows = Math.ceil(safeCount / safeCols);
  const cellHeight = Math.round((cellWidth * 9) / 16);
  return {
    cols: safeCols,
    rows,
    cellWidth,
    cellHeight,
    width: safeCols * cellWidth,
    height: rows * cellHeight,
  };
}

export function thumbnailProxyUrl(videoId: string): string {
  return `/api/thumbnail?v=${encodeURIComponent(videoId)}`;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, cellWidth: number) {
  const fontSize = Math.round(cellWidth / 12);
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  const padding = Math.round(fontSize * 0.4);
  const textWidth = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x, y, textWidth + padding * 2, fontSize + padding * 2);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + padding, y + padding);
}

/**
 * 격자 이미지를 만든다. 브라우저 전용 (canvas).
 *
 * 못 받은 썸네일은 빈 칸으로 두지 않고 "#n (없음)"이라고 적는다. 빈 칸이면
 * 번호가 밀려 표와 어긋난다.
 */
export async function buildContactSheet(items: SheetItem[], cols = 3): Promise<Blob> {
  const plan = planGrid(items.length, cols);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context를 만들 수 없습니다');

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, plan.width, plan.height);

  const images = await Promise.all(items.map((item) => loadImage(thumbnailProxyUrl(item.videoId))));

  items.forEach((item, i) => {
    const x = (i % plan.cols) * plan.cellWidth;
    const y = Math.floor(i / plan.cols) * plan.cellHeight;
    const img = images[i];
    if (img) {
      ctx.drawImage(img, x, y, plan.cellWidth, plan.cellHeight);
      drawLabel(ctx, x + 8, y + 8, item.label, plan.cellWidth);
    } else {
      ctx.fillStyle = '#374151';
      ctx.fillRect(x, y, plan.cellWidth, plan.cellHeight);
      drawLabel(ctx, x + 8, y + 8, `${item.label} (없음)`, plan.cellWidth);
    }
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 인코딩 실패'))), 'image/png');
  });
}

export type ImageCopyResult = 'copied' | 'unsupported';

/**
 * PNG를 클립보드에 넣는다. ChatGPT/Claude 입력창에 붙여넣으면 이미지로 들어간다.
 *
 * `ClipboardItem.supports`는 2024-06 이후 baseline이지만 정적 메서드가 없는
 * 브라우저도 있어 존재 여부부터 본다. 지원하지 않으면 성공한 척하지 않고
 * 'unsupported'를 돌려준다 — 호출자가 다운로드로 대체한다.
 */
export async function copyImage(blob: Blob): Promise<ImageCopyResult> {
  const Item = globalThis.ClipboardItem as (typeof ClipboardItem & { supports?: (t: string) => boolean }) | undefined;
  if (!Item || !navigator.clipboard?.write) return 'unsupported';
  if (typeof Item.supports === 'function' && !Item.supports('image/png')) return 'unsupported';

  try {
    await navigator.clipboard.write([new Item({ 'image/png': blob })]);
    return 'copied';
  } catch {
    return 'unsupported';
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
