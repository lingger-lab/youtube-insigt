export interface VideoData {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  viewCount: number;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  viralScore: number;
  duration?: string;
}

export interface SearchFilters {
  order: 'relevance' | 'viewCount' | 'date' | 'rating';
  publishedAfter?: string;
  videoDuration: 'any' | 'short' | 'medium' | 'long';
}

const API_BASE = 'https://www.googleapis.com/youtube/v3';

export async function searchYouTube(
  term: string,
  filters: SearchFilters,
  maxResults: number = 50
): Promise<VideoData[]> {
  const apiKey = process.env.NEXT_PUBLIC_YT_API_KEY;
  if (!apiKey) {
    throw new Error('YouTube API key not found');
  }

  const videos: VideoData[] = [];
  let nextPageToken = '';
  const totalResults = Math.min(maxResults, 200); // Deep search max 200
  
  while (videos.length < totalResults) {
    const resultsPerPage = Math.min(50, totalResults - videos.length);
    
    const searchParams = new URLSearchParams({
      key: apiKey,
      part: 'snippet',
      type: 'video',
      q: term,
      order: filters.order,
      videoDuration: filters.videoDuration,
      maxResults: resultsPerPage.toString(),
    });

    if (filters.publishedAfter) {
      searchParams.append('publishedAfter', filters.publishedAfter);
    }

    if (nextPageToken) {
      searchParams.append('pageToken', nextPageToken);
    }

    const searchResponse = await fetch(`${API_BASE}/search?${searchParams}`);
    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    const videoIds = searchData.items?.map((item: any) => item.id.videoId) || [];
    
    if (videoIds.length === 0) break;

    // Get video statistics
    const videoDetails = await getVideoDetails(videoIds);
    
    // Get channel statistics for subscriber counts
    const channelIds = [...new Set(videoDetails.map(v => v.channelId))];
    const channelStats = await getChannelStats(channelIds);
    
    // Combine data and calculate viral scores
    const processedVideos = videoDetails.map(video => {
      const channel = channelStats.find(c => c.channelId === video.channelId);
      const subscriberCount = channel?.subscriberCount || 1;
      const viralScore = calcViralScore(video.viewCount, subscriberCount);
      
      return {
        ...video,
        subscriberCount,
        viralScore
      };
    });

    // Remove duplicates before adding to videos array
    const newVideos = processedVideos.filter(newVideo => 
      !videos.some(existingVideo => existingVideo.id === newVideo.id)
    );
    
    videos.push(...newVideos);
    nextPageToken = searchData.nextPageToken;
    
    if (!nextPageToken) break;
  }

  return videos.slice(0, totalResults);
}

export async function getVideoDetails(videoIds: string[]): Promise<Omit<VideoData, 'subscriberCount' | 'viralScore'>[]> {
  const apiKey = process.env.NEXT_PUBLIC_YT_API_KEY;
  if (!apiKey) {
    throw new Error('YouTube API key not found');
  }

  const params = new URLSearchParams({
    key: apiKey,
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(',')
  });

  const response = await fetch(`${API_BASE}/videos?${params}`);
  if (!response.ok) {
    throw new Error(`Video details fetch failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  return data.items?.map((item: any) => ({
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url || '',
    viewCount: parseInt(item.statistics?.viewCount || '0'),
    publishedAt: item.snippet.publishedAt,
    channelId: item.snippet.channelId,
    channelTitle: item.snippet.channelTitle,
    duration: item.contentDetails?.duration || 'PT0S',
  })) || [];
}

export async function getChannelStats(channelIds: string[]): Promise<{ channelId: string; subscriberCount: number }[]> {
  const apiKey = process.env.NEXT_PUBLIC_YT_API_KEY;
  if (!apiKey) {
    throw new Error('YouTube API key not found');
  }

  const params = new URLSearchParams({
    key: apiKey,
    part: 'statistics',
    id: channelIds.join(',')
  });

  const response = await fetch(`${API_BASE}/channels?${params}`);
  if (!response.ok) {
    throw new Error(`Channel stats fetch failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  return data.items?.map((item: any) => ({
    channelId: item.id,
    subscriberCount: parseInt(item.statistics?.subscriberCount || '1')
  })) || [];
}

export function calcViralScore(viewCount: number, subscriberCount: number): number {
  if (subscriberCount === 0) return 0;
  return viewCount / subscriberCount;
}

export function getTimeFilterValue(period: string): string {
  const now = new Date();
  
  switch (period) {
    case '1H':
      return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    case '24H':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case '7D':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30D':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case '1Y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return '';
  }
}