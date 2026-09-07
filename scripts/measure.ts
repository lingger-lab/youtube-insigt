/**
 * 실측 스크립트 — 키 확보 후 가장 먼저 돌리는 것.
 *
 * 이 세션의 모든 설계 판단은 합성 데이터 위에서 이뤄졌다. 실제 분포를 보기
 * 전에는 어느 설계도 옳다고 말할 수 없다. 이 스크립트는 판단에 필요한
 * 숫자만 뽑는다:
 *
 *   - 성과배수 분포 (p10~p90) 와 2배 이상 비율   -> 강조 임계값 검증 (ISSUES B4)
 *   - 기준선 출처 비율 (format-median / lifetime-mean / null)
 *   - 옛 기준선(lifetime) ÷ 새 기준선(format median) 비율 -> Shorts 오염이 실제로 얼마나 컸나 (B1)
 *   - Shorts 비율, 혼합 포맷 채널 비율
 *   - 구독자 비공개 비율, 좋아요 숨김 비율, maxres 썸네일 비율, 자막 트랙 비율
 *   - 영상 10편 이하 소형 채널 비율 (분모 편향 교정이 실제로 걸리는 범위)
 *   - 업로드 재생목록 없음(null) 비율
 *   - 실제 소비 할당량, 소요 시간
 *
 * 사용법:
 *   npm run measure -- "키워드1" "키워드2" ...
 *
 * 비용: 키워드당 검색 1회(전용 버킷 100회/일) + 공용 units 약 100.
 * 기본 키워드 없이 실행하면 할당량을 쓰지 않고 사용법만 출력한다.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { searchYouTube } from '../src/server/youtube/search.ts';
import { YouTubeApiError } from '../src/server/youtube/errors.ts';
import { withMetrics, peerAverageViews, baselineFor } from '../src/app/utils/metrics.ts';
import { getVideoType } from '../src/app/utils/videoUtils.ts';
import type { VideoWithMetrics } from '../src/types/youtube.ts';

const DEPTH = 50;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function fmt(n: number | null, digits = 2): string {
  return n === null ? '—' : n.toFixed(digits);
}

interface KeywordReport {
  term: string;
  elapsedMs: number;
  usage: { searchCalls: number; otherUnits: number; calls: number };
  n: number;
  uniqueChannels: number;
  multiple: { p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null; max: number | null; nullCount: number; outperformShare: number };
  baselineSource: { formatMedian: number; lifetimeMean: number; none: number };
  lifetimeOverFormat: { p50: number | null; over2x: number; under05x: number; comparable: number };
  shortsShare: number;
  mixedFormatChannelShare: number;
  hiddenSubscriberShare: number;
  likeHiddenShare: number;
  maxresShare: number;
  captionShare: number;
  smallChannelShare: number;
  uploadsMissingShare: number;
  avgUploadsFetched: number;
}

function analyze(term: string, videos: VideoWithMetrics[], usage: KeywordReport['usage'], elapsedMs: number): KeywordReport {
  const n = videos.length;
  const channels = new Map(videos.map((v) => [v.channelId, v.channel]));

  const multiples = videos.map((v) => v.metrics.performanceMultiple).filter((m): m is number => m !== null).sort((a, b) => a - b);
  const sources = { formatMedian: 0, lifetimeMean: 0, none: 0 };
  for (const v of videos) {
    if (v.metrics.baselineSource === 'format-median') sources.formatMedian++;
    else if (v.metrics.baselineSource === 'lifetime-mean') sources.lifetimeMean++;
    else sources.none++;
  }

  // 옛 기준선(채널 전체 평균) ÷ 새 기준선(같은 포맷 중앙값). 1에서 멀수록 옛 지표가 틀려 있었다.
  const ratios: number[] = [];
  for (const v of videos) {
    const b = baselineFor(v);
    const lifetime = peerAverageViews(v);
    if (b.source === 'format-median' && b.value && lifetime) ratios.push(lifetime / b.value);
  }
  ratios.sort((a, b) => a - b);

  const mixed = [...channels.values()].filter((c) => {
    if (!c.recentUploads || c.recentUploads.length === 0) return false;
    const types = new Set(c.recentUploads.map((u) => getVideoType(u.duration)));
    return types.size > 1;
  }).length;

  const uploadsLens = [...channels.values()].map((c) => c.recentUploads?.length ?? 0);

  return {
    term,
    elapsedMs,
    usage,
    n,
    uniqueChannels: channels.size,
    multiple: {
      p10: percentile(multiples, 10),
      p25: percentile(multiples, 25),
      p50: percentile(multiples, 50),
      p75: percentile(multiples, 75),
      p90: percentile(multiples, 90),
      max: percentile(multiples, 100),
      nullCount: n - multiples.length,
      outperformShare: multiples.length ? multiples.filter((m) => m >= 2).length / multiples.length : 0,
    },
    baselineSource: sources,
    lifetimeOverFormat: {
      p50: percentile(ratios, 50),
      over2x: ratios.filter((r) => r > 2).length,
      under05x: ratios.filter((r) => r < 0.5).length,
      comparable: ratios.length,
    },
    shortsShare: n ? videos.filter((v) => getVideoType(v.duration) === 'shorts').length / n : 0,
    mixedFormatChannelShare: channels.size ? mixed / channels.size : 0,
    hiddenSubscriberShare: channels.size ? [...channels.values()].filter((c) => c.hiddenSubscriberCount).length / channels.size : 0,
    likeHiddenShare: n ? videos.filter((v) => v.likeCount === null).length / n : 0,
    maxresShare: n ? videos.filter((v) => v.thumbnailHighUrl.includes('maxres')).length / n : 0,
    captionShare: n ? videos.filter((v) => v.hasCaption).length / n : 0,
    smallChannelShare: channels.size ? [...channels.values()].filter((c) => (c.videoCount ?? Infinity) <= 10).length / channels.size : 0,
    uploadsMissingShare: channels.size ? [...channels.values()].filter((c) => c.recentUploads === null).length / channels.size : 0,
    avgUploadsFetched: uploadsLens.length ? uploadsLens.reduce((a, b) => a + b, 0) / uploadsLens.length : 0,
  };
}

function printReport(r: KeywordReport): void {
  const m = r.multiple;
  console.log(`\n=== "${r.term}" — ${r.n}편 / 채널 ${r.uniqueChannels}개 / ${(r.elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  할당량: 검색 ${r.usage.searchCalls}회 + 공용 ${r.usage.otherUnits} units (호출 ${r.usage.calls}회)`);
  console.log(`  성과배수  p10 ${fmt(m.p10)} · p25 ${fmt(m.p25)} · p50 ${fmt(m.p50)} · p75 ${fmt(m.p75)} · p90 ${fmt(m.p90)} · max ${fmt(m.max)}`);
  console.log(`            계산불가 ${m.nullCount}편 · 2배 이상 ${(m.outperformShare * 100).toFixed(0)}%  <- 강조 임계값 2배가 적절한지`);
  console.log(`  기준선    같은포맷 중앙값 ${r.baselineSource.formatMedian} · 채널전체 평균 ${r.baselineSource.lifetimeMean} · 없음 ${r.baselineSource.none}`);
  console.log(`  옛/새 기준선 비율(채널전체평균 ÷ 포맷중앙값) p50 ${fmt(r.lifetimeOverFormat.p50)} · >2배 ${r.lifetimeOverFormat.over2x} · <0.5배 ${r.lifetimeOverFormat.under05x} · 비교가능 ${r.lifetimeOverFormat.comparable}  <- Shorts 오염이 실제로 얼마나 컸나`);
  console.log(`  Shorts 비율 ${(r.shortsShare * 100).toFixed(0)}% · 혼합포맷 채널 ${(r.mixedFormatChannelShare * 100).toFixed(0)}%`);
  console.log(`  구독자 비공개 ${(r.hiddenSubscriberShare * 100).toFixed(0)}% · 좋아요 숨김 ${(r.likeHiddenShare * 100).toFixed(0)}% · maxres 썸네일 ${(r.maxresShare * 100).toFixed(0)}% · 자막 트랙 ${(r.captionShare * 100).toFixed(0)}%`);
  console.log(`  소형 채널(≤10편) ${(r.smallChannelShare * 100).toFixed(0)}% · 업로드 목록 없음 ${(r.uploadsMissingShare * 100).toFixed(0)}% · 채널당 받은 업로드 평균 ${r.avgUploadsFetched.toFixed(1)}편`);
}

async function main(): Promise<void> {
  const terms = process.argv.slice(2).map((t) => t.trim()).filter(Boolean);
  if (terms.length === 0) {
    console.log('사용법: npm run measure -- "키워드1" "키워드2" ...');
    console.log('비용: 키워드당 검색 1회(하루 100회 한도) + 공용 약 100 units. 할당량을 쓰지 않고 종료합니다.');
    process.exit(1);
  }
  if (!process.env.YT_API_KEY) {
    console.error('YT_API_KEY가 없습니다. .env.local에 넣고 `npm run measure -- ...` 로 실행하세요.');
    process.exit(1);
  }

  console.log(`키워드 ${terms.length}개 × 검색 ${DEPTH}개. 검색 버킷 ${terms.length}회 소비 예정.`);
  const reports: KeywordReport[] = [];

  for (const term of terms) {
    const started = Date.now();
    try {
      const { videos, stats } = await searchYouTube(term, { order: 'relevance', videoDuration: 'any' }, DEPTH);
      const report = analyze(term, withMetrics(videos), stats, Date.now() - started);
      reports.push(report);
      printReport(report);
    } catch (error) {
      if (error instanceof YouTubeApiError) {
        console.error(`\n"${term}" 실패: [${error.code}] ${error.message}`);
        if (error.code === 'SEARCH_QUOTA_EXCEEDED' || error.code === 'QUOTA_EXCEEDED') break;
      } else {
        throw error;
      }
    }
  }

  if (reports.length > 0) {
    mkdirSync('measure-out', { recursive: true });
    const file = `measure-out/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(file, JSON.stringify(reports, null, 2));
    console.log(`\n원본 저장: ${file}`);
    console.log(`총 소비: 검색 ${reports.reduce((a, r) => a + r.usage.searchCalls, 0)}회 · 공용 ${reports.reduce((a, r) => a + r.usage.otherUnits, 0)} units`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
