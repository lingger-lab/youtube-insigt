import { z } from 'zod';
import { YouTubeApiError } from './errors.ts';

/**
 * YouTube API 응답의 경계 검증.
 *
 * 관용과 엄격함을 나눈다.
 * - **관용**: 정당하게 없을 수 있는 값은 optional이다. 좋아요를 숨긴 영상에는
 *   likeCount가 없고, 댓글을 끈 영상에는 commentCount가 없으며, 구독자를 숨긴
 *   채널에는 subscriberCount가 없다. 이건 오류가 아니라 사실이다.
 * - **엄격**: 모양이 어긋나면 조용히 넘기지 않고 던진다. 파싱 실패를 빈 값으로
 *   메우면 "결과가 없다"와 "읽지 못했다"를 구분할 수 없게 된다.
 */

const ThumbnailSchema = z.object({ url: z.string() }).optional();

const SearchItemSchema = z.object({
  id: z.object({ videoId: z.string().optional() }).optional(),
});

export const SearchResponseSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(SearchItemSchema).optional(),
});

export const VideoItemSchema = z.object({
  id: z.string(),
  snippet: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      publishedAt: z.string().optional(),
      channelId: z.string().optional(),
      channelTitle: z.string().optional(),
      tags: z.array(z.string()).optional(),
      categoryId: z.string().optional(),
      // 'none' | 'live' | 'upcoming'. 라이브·예정 영상은 duration이 P0D로 온다.
      liveBroadcastContent: z.string().optional(),
      thumbnails: z
        .object({
          medium: ThumbnailSchema,
          high: ThumbnailSchema,
          maxres: ThumbnailSchema,
        })
        .optional(),
    })
    .optional(),
  statistics: z
    .object({
      viewCount: z.string().optional(),
      likeCount: z.string().optional(),
      commentCount: z.string().optional(),
    })
    .optional(),
  contentDetails: z
    .object({
      duration: z.string().optional(),
      // 문자열 "true"/"false"로 온다. boolean이 아니다.
      caption: z.string().optional(),
    })
    .optional(),
});

export const VideoListResponseSchema = z.object({
  items: z.array(VideoItemSchema).optional(),
});

export const ChannelItemSchema = z.object({
  id: z.string(),
  statistics: z
    .object({
      viewCount: z.string().optional(),
      subscriberCount: z.string().optional(),
      hiddenSubscriberCount: z.boolean().optional(),
      videoCount: z.string().optional(),
    })
    .optional(),
  contentDetails: z
    .object({
      relatedPlaylists: z.object({ uploads: z.string().optional() }).optional(),
    })
    .optional(),
});

export const ChannelListResponseSchema = z.object({
  items: z.array(ChannelItemSchema).optional(),
});

/** playlistItems.list — part=contentDetails 로 videoId만 받는다. */
export const PlaylistItemsResponseSchema = z.object({
  items: z
    .array(
      z.object({
        contentDetails: z.object({ videoId: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});

/** 검증 실패를 MALFORMED_RESPONSE로 바꿔 던진다. 부분 성공으로 위장하지 않는다. */
export function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown, endpoint: string): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new YouTubeApiError(
      'MALFORMED_RESPONSE',
      `${endpoint} 응답 형식 불일치: ${first?.path.join('.') || '(root)'} — ${first?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}

/** "12345" -> 12345. 없거나 숫자가 아니면 null (0으로 메우지 않는다). */
export function toCount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
