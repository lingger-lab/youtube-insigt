import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchYouTube, MAX_DEEP_SEARCH } from '../../../server/youtube/search.ts';
import { YouTubeApiError } from '../../../server/youtube/errors.ts';
import { searchLimiter, clientKey } from '../../../server/rateLimit.ts';

/**
 * YouTube 검색 프록시.
 *
 * 이 라우트가 존재하는 이유는 API 키를 브라우저에서 떼어내기 위해서다.
 * NEXT_PUBLIC_ 접두사가 붙은 값은 클라이언트 번들에 평문으로 박히므로,
 * 키를 쓰는 코드는 전부 서버에만 있어야 한다.
 */

// Deep Search 200개는 search.list 4회를 순차로 돌아야 해서 수 초가 걸린다.
// Vercel Hobby 플랜 상한이 60초이므로 그 안에서 재시도까지 마치도록 잡는다.
export const maxDuration = 60;
export const runtime = 'nodejs';

const SearchRequestSchema = z.object({
  term: z.string().trim().min(1, '검색어를 입력해 주세요').max(200),
  filters: z.object({
    order: z.enum(['relevance', 'viewCount', 'date', 'rating']),
    publishedAfter: z.iso.datetime().optional(),
    videoDuration: z.enum(['any', 'short', 'medium', 'long']),
  }),
  maxResults: z.number().int().min(1).max(MAX_DEEP_SEARCH),
});

export async function POST(request: Request) {
  // 검색 버킷은 하루 100회가 전부다. IP당 10분에 10회 (인스턴스 단위 — rateLimit.ts 주석 참조).
  const limit = searchLimiter.check(clientKey(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: '요청 본문을 읽을 수 없습니다.' } },
      { status: 400 },
    );
  }

  const parsed = SearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: parsed.error.issues[0]?.message ?? '검색 조건이 올바르지 않습니다.',
        },
      },
      { status: 400 },
    );
  }

  const { term, filters, maxResults } = parsed.data;

  try {
    const { videos, stats } = await searchYouTube(term, filters, maxResults);
    return NextResponse.json({
      videos,
      usage: { searchCalls: stats.searchCalls, otherUnits: stats.otherUnits, calls: stats.calls },
    });
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      // 검색어는 남기지 않는다. 실패 원인 판별에 필요한 것은 코드와 상세뿐이다.
      console.error('[api/search] YouTube API 실패', {
        code: error.code,
        detail: error.message,
        order: filters.order,
        maxResults,
      });
      return NextResponse.json(
        { error: { code: error.code, message: error.userMessage } },
        { status: error.httpStatus },
      );
    }

    console.error('[api/search] 처리되지 않은 오류', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '검색 처리 중 오류가 발생했습니다.' } },
      { status: 500 },
    );
  }
}
