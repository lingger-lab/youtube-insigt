import { fetchThumbnail, VIDEO_ID_PATTERN } from '../../../server/youtube/thumbnail.ts';

/**
 * YouTube 썸네일 프록시.
 *
 * 왜 필요한가: `i.ytimg.com`은 CORS 헤더를 주지 않는다. 브라우저가 그 이미지를
 * 캔버스에 그리면 캔버스가 오염(tainted)되어 `toBlob()`이 막히고, 컨택트시트를
 * 만들어 클립보드에 넣을 수 없다. 같은 출처(우리 서버)를 거치면 오염되지 않는다.
 *
 * Data API 호출이 아니므로 할당량을 쓰지 않는다. 대신 Vercel 대역폭을 쓴다
 * (썸네일 1장 ≈ 50~150KB). 하루 캐시로 반복 비용을 줄인다.
 */

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('v') ?? '';
  if (!VIDEO_ID_PATTERN.test(id)) {
    return new Response('invalid video id', { status: 400 });
  }

  const thumb = await fetchThumbnail(id);
  if (!thumb) {
    return new Response('thumbnail not found', { status: 404 });
  }

  return new Response(thumb.bytes, {
    status: 200,
    headers: {
      'Content-Type': thumb.contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'X-Thumbnail-Variant': thumb.variant,
    },
  });
}
