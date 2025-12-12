import { VideoData } from './youtubeApi';

export type VideoType = 'shorts' | 'long';

export function getVideoDurationInSeconds(duration: string): number {
  // YouTube API returns duration in ISO 8601 format (PT#M#S or PT#H#M#S)
  // Example: PT4M13S = 4 minutes 13 seconds = 253 seconds
  // Example: PT1H30M = 1 hour 30 minutes = 5400 seconds
  // Example: PT59S = 59 seconds
  
  if (!duration || duration === 'PT0S') {
    return 0;
  }
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }
  
  const [, hours, minutes, seconds] = match;
  
  const hoursInSeconds = hours ? parseInt(hours) * 3600 : 0;
  const minutesInSeconds = minutes ? parseInt(minutes) * 60 : 0;
  const secondsValue = seconds ? parseInt(seconds) : 0;
  
  const totalSeconds = hoursInSeconds + minutesInSeconds + secondsValue;
  
  return totalSeconds;
}

export function getVideoType(duration: string): VideoType {
  const durationInSeconds = getVideoDurationInSeconds(duration);
  
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

export function filterVideosByType(videos: VideoData[], type: 'home' | 'shorts' | 'long'): VideoData[] {
  if (type === 'home') {
    return videos;
  }
  
  return videos.filter(video => {
    const duration = video.duration || 'PT0S';
    const videoType = getVideoType(duration);
    return videoType === type;
  });
}

export function isShorts(duration: string): boolean {
  return getVideoType(duration) === 'shorts';
}

export function addVideoTypeToData(videos: VideoData[]): (VideoData & { videoType: VideoType; durationFormatted: string })[] {
  return videos.map(video => {
    const duration = video.duration || 'PT0S';
    const videoType = getVideoType(duration);
    const durationFormatted = formatDuration(duration);
    
    return {
      ...video,
      videoType,
      durationFormatted
    };
  });
}