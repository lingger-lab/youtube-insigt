import type { VideoData } from './youtubeApi';
import type { LiveStatus } from '../../types/youtube';

/**
 * 'live'는 진행 중인 라이브와 예정(프리미어)을 모두 뜻한다. duration이 P0D(0초)로
 * 오거나 liveBroadcastContent가 none이 아니면 여기에 든다. 길이가 없으니 Shorts도
 * 롱폼도 아니며, 누적 조회수가 며칠치 방송분이라 다른 포맷과 비교할 수 없다.
 */
export type VideoType = 'shorts' | 'long' | 'live';

export function getVideoDurationInSeconds(duration: string): number {
  // YouTube API returns duration in ISO 8601 format (P#DT#H#M#S)
  // Example: PT4M13S = 4 minutes 13 seconds = 253 seconds
  // Example: PT1H30M = 1 hour 30 minutes = 5400 seconds
  // Example: PT59S = 59 seconds
  // Example: P1DT2H = 1 day 2 hours = 93600 seconds (24시간 넘는 라이브 아카이브 등)

  if (!duration || duration === 'PT0S') {
    return 0;
  }

  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) {
    return 0;
  }

  const [, days, hours, minutes, seconds] = match;

  const daysInSeconds = days ? parseInt(days) * 86400 : 0;
  const hoursInSeconds = hours ? parseInt(hours) * 3600 : 0;
  const minutesInSeconds = minutes ? parseInt(minutes) * 60 : 0;
  const secondsValue = seconds ? parseInt(seconds) : 0;

  const totalSeconds = daysInSeconds + hoursInSeconds + minutesInSeconds + secondsValue;

  return totalSeconds;
}

export function getVideoType(duration: string, liveStatus: LiveStatus = 'none'): VideoType {
  if (liveStatus !== 'none') return 'live';
  const durationInSeconds = getVideoDurationInSeconds(duration);
  // 0초는 길이를 모르는 것이지 짧은 것이 아니다 (진행 중 라이브·예정은 P0D로 온다).
  if (durationInSeconds === 0) return 'live';

  // YouTube Shorts는 보통 3분(180초) 이하로 분류 (실제 Shorts는 60초이지만 더 넓은 범위로 설정)
  return durationInSeconds <= 180 ? 'shorts' : 'long';
}

export function formatDuration(duration: string): string {
  const totalSeconds = getVideoDurationInSeconds(duration);

  if (totalSeconds === 0) return '0:00';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

/**
 * 길이 기준으로 걸러낸다.
 *
 * 제네릭인 이유: 지표가 붙은 목록(VideoWithMetrics)을 넣었을 때 VideoData로
 * 좁혀져 metrics가 사라지면 안 된다.
 */
export function filterVideosByType<T extends Pick<VideoData, 'duration' | 'liveStatus'>>(
  videos: T[],
  type: 'home' | 'shorts' | 'long',
): T[] {
  if (type === 'home') {
    return videos;
  }

  // 라이브·예정은 Shorts에도 롱폼에도 속하지 않는다. '홈'에서만 보인다.
  return videos.filter((video) => getVideoType(video.duration || 'PT0S', video.liveStatus) === type);
}