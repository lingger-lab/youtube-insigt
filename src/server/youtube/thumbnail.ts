/**
 * i.ytimg.com 썸네일을 서버에서 받는다.
 *
 * 두 곳이 쓴다: 브라우저용 프록시(/api/thumbnail — CORS 우회)와 앱 내 LLM
 * 분석(이미지 블록 첨부). Data API가 아니므로 할당량을 쓰지 않는다.
 */

export const THUMBNAIL_VARIANTS = ['maxresdefault', 'hqdefault', 'mqdefault'] as const;
export type ThumbnailVariant = (typeof THUMBNAIL_VARIANTS)[number];

export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const TIMEOUT_MS = 8_000;

export interface FetchedThumbnail {
  bytes: ArrayBuffer;
  contentType: string;
  variant: ThumbnailVariant;
}

/**
 * 후보 순서대로 시도해 처음 성공한 것을 돌려준다. maxres는 없는 영상이 많다(404).
 * 전부 실패하면 null — 호출자가 "없음"을 어떻게 다룰지 정한다.
 */
export async function fetchThumbnail(
  videoId: string,
  candidates: readonly ThumbnailVariant[] = THUMBNAIL_VARIANTS,
): Promise<FetchedThumbnail | null> {
  if (!VIDEO_ID_PATTERN.test(videoId)) return null;

  for (const variant of candidates) {
    let upstream: Response;
    try {
      upstream = await fetch(`https://i.ytimg.com/vi/${videoId}/${variant}.jpg`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      continue;
    }
    if (!upstream.ok) continue;

    return {
      bytes: await upstream.arrayBuffer(),
      contentType: upstream.headers.get('content-type') ?? 'image/jpeg',
      variant,
    };
  }
  return null;
}
