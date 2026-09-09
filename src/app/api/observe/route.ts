import { NextResponse } from 'next/server';
import { z } from 'zod';
import { observeVideo, isObserveConfigured, configuredObserveModel, ObserveError } from '../../../server/llm/observe.ts';
import { VIDEO_ID_PATTERN } from '../../../server/youtube/thumbnail.ts';
import { observeLimiter, clientKey } from '../../../server/rateLimit.ts';

/**
 * 영상 관찰 프록시 (선택 기능).
 *
 * GET  -> { enabled, model }  UI가 버튼을 보여줄지 정한다
 * POST -> 영상 1편을 Gemini가 보고 기록한 관찰(JSON) + usage + 추정 비용
 *
 * 편당 1요청이다. 대조군 20편은 클라이언트가 병렬 3으로 나눠 부른다 — 부분 실패 격리·60초 상한 때문.
 * 키는 서버 전용. GEMINI_API_KEY가 없으면 POST는 503이고 GET은 enabled:false.
 */

export const maxDuration = 60;
export const runtime = 'nodejs';

const ObserveRequestSchema = z.object({
  videoId: z.string().regex(VIDEO_ID_PATTERN, '영상 ID 형식이 아닙니다'),
  title: z.string().trim().max(200).default(''),
  durationSec: z.number().int().min(0).max(12 * 3600),
});

export async function GET() {
  const enabled = isObserveConfigured();
  return NextResponse.json({ enabled, model: enabled ? configuredObserveModel() : null });
}

export async function POST(request: Request) {
  if (!isObserveConfigured()) {
    return NextResponse.json(
      { error: { code: 'OBSERVE_NOT_CONFIGURED', message: '영상 관찰이 설정되지 않았습니다.' } },
      { status: 503 },
    );
  }

  // 무료 티어 하루 8시간분·RPM이 걸린 경로. IP당 10분 30회 (인스턴스 단위).
  const limit = observeLimiter.check(clientKey(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: `관찰 요청이 너무 잦습니다. ${limit.retryAfterSec}초 뒤 다시 시도해 주세요.` } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: '요청 본문을 읽을 수 없습니다.' } }, { status: 400 });
  }
  const parsed = ObserveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? '요청이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  try {
    const observation = await observeVideo(parsed.data);
    // 관찰 본문은 로그에 남기지 않는다. 비용·한도 추적에 필요한 것은 usage뿐이다.
    console.info('[api/observe] 완료', {
      videoId: observation.videoId,
      model: observation.model,
      processing: observation.processing,
      usage: observation.usage,
    });
    return NextResponse.json(observation);
  } catch (error) {
    if (error instanceof ObserveError) {
      console.error('[api/observe] 실패', { videoId: parsed.data.videoId, code: error.code, detail: error.message });
      return NextResponse.json({ error: { code: error.code, message: error.userMessage } }, { status: error.httpStatus });
    }
    console.error('[api/observe] 처리되지 않은 오류', error);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '관찰 처리 중 오류가 발생했습니다.' } }, { status: 500 });
  }
}
