import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAnalysis, isLlmConfigured, configuredModel, LlmError, MAX_IMAGES } from '../../../server/llm/analyze.ts';
import { VIDEO_ID_PATTERN } from '../../../server/youtube/thumbnail.ts';

/**
 * 앱 내 LLM 분석 프록시 (선택 기능).
 *
 * GET  -> { enabled, model }  UI가 버튼을 보여줄지 정한다
 * POST -> 프롬프트(+썸네일 ID)를 Claude에 보내고 완성본을 돌려준다
 *
 * 돈이 드는 경로다. ANTHROPIC_API_KEY가 없으면 POST는 503이고 GET은 enabled:false.
 * 키는 서버 전용. 응답에는 토큰 사용량과 추정 비용을 항상 싣는다.
 */

// 스트리밍으로 받아도 벽시계는 Vercel 함수 상한에 걸린다. Hobby 60s, Fluid compute면 300s.
export const maxDuration = 60;
export const runtime = 'nodejs';

const AnalyzeRequestSchema = z.object({
  prompt: z.string().trim().min(1, '프롬프트가 비었습니다').max(80_000, '프롬프트가 너무 깁니다'),
  thumbnailVideoIds: z.array(z.string().regex(VIDEO_ID_PATTERN)).max(MAX_IMAGES).default([]),
});

export async function GET() {
  const enabled = isLlmConfigured();
  return NextResponse.json({ enabled, model: enabled ? configuredModel() : null });
}

export async function POST(request: Request) {
  if (!isLlmConfigured()) {
    return NextResponse.json(
      { error: { code: 'LLM_NOT_CONFIGURED', message: '앱 내 분석이 설정되지 않았습니다.' } },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: '요청 본문을 읽을 수 없습니다.' } }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? '요청이 올바르지 않습니다.' } },
      { status: 400 },
    );
  }

  try {
    const result = await runAnalysis(parsed.data);
    // 프롬프트 본문은 남기지 않는다. 비용 추적에 필요한 것은 사용량뿐이다.
    console.info('[api/analyze] 완료', {
      model: result.model,
      usage: result.usage,
      estimatedCostUsd: result.estimatedCostUsd,
      images: result.attachedImages,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LlmError) {
      console.error('[api/analyze] LLM 실패', { code: error.code, detail: error.message });
      return NextResponse.json({ error: { code: error.code, message: error.userMessage } }, { status: error.httpStatus });
    }
    console.error('[api/analyze] 처리되지 않은 오류', error);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '분석 처리 중 오류가 발생했습니다.' } }, { status: 500 });
  }
}
