'use client';

import type { VideoWithMetrics } from '../../types/youtube';
import {
  formatViewCount,
  formatSubscriberCount,
  formatMultiple,
  formatPercent,
  formatPublishedDate,
  truncateText,
  isOutperforming,
} from '../utils/helpers';
import { formatDuration, isShorts } from '../utils/videoUtils';
import { buildSingleVideoPrompt, type Cohort } from '../utils/analysisPrompt';
import CopyButton from './CopyButton';
import TranscriptField from './TranscriptField';
import { useState } from 'react';

interface VideoCardProps {
  video: VideoWithMetrics;
  displayMode: 'grid' | 'list';
  /** 같은 검색 결과에서 뽑은 대조군. 단일 사례로는 인과를 가릴 수 없다. */
  cohort: Cohort;
  searchTerm: string;
}

export default function VideoCard({ video, displayMode, cohort, searchTerm }: VideoCardProps) {
  const { metrics } = video;
  const outperforming = isOutperforming(metrics.performanceMultiple);
  const isShortVideo = isShorts(video.duration);
  const duration = formatDuration(video.duration);

  const watchUrl = `https://www.youtube.com/watch?v=${video.id}`;

  // 붙여넣은 자막은 이 카드에만 속한다. 서버로 보내지 않고 프롬프트에만 들어간다.
  const [transcript, setTranscript] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);

  const analysisPrompt = () => buildSingleVideoPrompt(video, cohort, searchTerm, { transcript });

  const transcriptToggle = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setShowTranscript((v) => !v);
      }}
      aria-expanded={showTranscript}
      aria-controls={`transcript-${video.id}`}
      className={`px-2 py-1 text-xs rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
        transcript.trim() ? 'bg-emerald-800 text-emerald-100' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
      title="YouTube에서 복사한 자막을 붙여넣으면 대본 구조까지 분석을 요청합니다"
    >
      {transcript.trim() ? '자막 첨부됨' : '자막'}
    </button>
  );

  /** 채널 평소 대비 성과. 측정 불가는 숫자로 위장하지 않고 그대로 표시한다. */
  const performanceBadge = (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
        outperforming
          ? 'bg-linear-to-r from-red-600 to-orange-500 text-white'
          : metrics.performanceMultiple === null
            ? 'bg-gray-700 text-gray-400'
            : 'bg-gray-700 text-gray-300'
      }`}
      title={
        metrics.baselineSource === 'format-median'
          ? `같은 채널의 최근 ${isShortVideo ? 'Shorts' : '롱폼'} ${metrics.baselinePeerCount}편 중앙값 대비`
          : metrics.baselineSource === 'lifetime-mean'
            ? '채널 전체 평균 대비 (최근 업로드 목록 없음 — 포맷 구분 안 됨)'
            : '기준선을 계산할 수 없음'
      }
    >
      {outperforming && <span aria-hidden="true">🔥</span>}
      {formatMultiple(metrics.performanceMultiple)}
      {metrics.baselineSource === 'lifetime-mean' && (
        <span className="text-[10px] opacity-70" title="포맷 구분 없는 열등한 기준선">
          *
        </span>
      )}
    </div>
  );

  if (displayMode === 'list') {
    return (
      <article className="relative flex flex-col sm:flex-row gap-4 p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors focus-within:ring-2 focus-within:ring-red-500">
        <div className="relative shrink-0">
          {/*
            next/image를 쓰지 않는다. YouTube 썸네일은 i.ytimg.com CDN이 이미
            최적화해 내보내는 고정 크기 이미지라, Vercel 이미지 최적화를 거치면
            비용과 지연만 늘고 얻는 게 없다.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full sm:w-48 aspect-video object-cover rounded-md"
          />
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
            {duration}
          </div>
          {isShortVideo && (
            <div className="absolute top-2 left-2 bg-white text-black text-xs px-2 py-1 rounded font-bold">
              Shorts
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/*
            카드 전체를 클릭 가능하게 하되 초점 대상은 이 링크 하나만 둔다.
            div+onClick은 키보드로 도달할 수 없다.
          */}
          <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="after:absolute after:inset-0 focus:outline-none"
            >
              {video.title}
            </a>
          </h3>

          <p className="text-gray-300 text-sm mb-3 line-clamp-2">
            {truncateText(video.description, 150)}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
            <span className="text-gray-300 font-medium">{video.channelTitle}</span>
            <span>조회수 {formatViewCount(video.viewCount)}</span>
            <span>구독자 {formatSubscriberCount(video.channel.subscriberCount)}</span>
            <span>{formatPublishedDate(video.publishedAt)}</span>
            <span title="업로드 후 하루당 평균 조회수">
              일평균 {formatViewCount(Math.round(metrics.viewsPerDay))}
            </span>
            <span title="좋아요 ÷ 조회수">좋아요율 {formatPercent(metrics.likeRate)}</span>
            {video.hasCaption && <span className="text-gray-500">자막 있음</span>}
          </div>

          <div className="flex items-center justify-between gap-2 mt-3">
            {performanceBadge}

            {/* 링크 오버레이 위로 올려야 눌린다 */}
            <div className="relative z-10 flex items-center gap-2">
              {transcriptToggle}
              <CopyButton
                getText={analysisPrompt}
                label="AI분석 복사"
                title="대조군을 포함한 분석 프롬프트를 복사합니다"
              />
            </div>
          </div>
          {showTranscript && (
            <div className="relative z-10">
              <TranscriptField videoId={video.id} value={transcript} onChange={setTranscript} />
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="relative bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-700 transition-colors focus-within:ring-2 focus-within:ring-red-500">
      <div className="relative">
        {/* 위와 같은 이유로 next/image를 쓰지 않는다 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={video.thumbnailUrl} alt={video.title} className="w-full aspect-video object-cover" />
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
          {duration}
        </div>
        {isShortVideo && (
          <div className="absolute top-2 left-2 bg-white text-black text-xs px-2 py-1 rounded font-bold">
            Shorts
          </div>
        )}
        {outperforming && (
          <div className="absolute top-2 right-2 bg-linear-to-r from-red-600 to-orange-500 text-white px-2 py-1 rounded-md text-xs font-bold">
            🔥 {formatMultiple(metrics.performanceMultiple)}
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-white font-semibold mb-2 line-clamp-2 text-sm leading-tight">
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="after:absolute after:inset-0 focus:outline-none"
          >
            {video.title}
          </a>
        </h3>

        <div className="text-gray-400 text-xs mb-2">
          <div className="font-medium text-gray-300 mb-1 truncate">{video.channelTitle}</div>
          <div className="flex justify-between">
            <span>조회수 {formatViewCount(video.viewCount)}</span>
            <span>{formatPublishedDate(video.publishedAt)}</span>
          </div>
        </div>

        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span>구독자 {formatSubscriberCount(video.channel.subscriberCount)}</span>
          <span title="좋아요 ÷ 조회수">좋아요율 {formatPercent(metrics.likeRate)}</span>
        </div>

        <div className="flex justify-between items-center gap-2">
          {performanceBadge}

          <div className="relative z-10 flex items-center gap-2">
            {transcriptToggle}
            <CopyButton
              getText={analysisPrompt}
              label="AI분석"
              title="대조군을 포함한 분석 프롬프트를 복사합니다"
            />
          </div>
        </div>
        {showTranscript && (
          <div className="relative z-10">
            <TranscriptField videoId={video.id} value={transcript} onChange={setTranscript} />
          </div>
        )}
      </div>
    </article>
  );
}
