/**
 * 시나리오 스크립트 — 검색어 하나를 앱과 같은 절차로 돌려 단계별 호출·할당량·지표·프롬프트를 찍는다.
 *
 *   node --env-file=.env.local scripts/scenario.ts "키워드"
 *
 * 첫 실행은 검색 버킷 1회를 쓰고 원본을 measure-out/scenario-<키워드>-raw.json에 남긴다.
 * 그 파일이 있으면 다음부터는 재사용해 할당량을 쓰지 않는다 (지우면 다시 검색).
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { searchYouTube } from '../src/server/youtube/search.ts';
import { withMetrics, compareByMetric } from '../src/app/utils/metrics.ts';
import { outperformCutoff, isOutperforming, formatMultiple } from '../src/app/utils/helpers.ts';
import { getVideoType } from '../src/app/utils/videoUtils.ts';
import { selectCohort, buildMarketAnalysisPrompt } from '../src/app/utils/analysisPrompt.ts';
import { estimateQuota } from '../src/app/utils/quota.ts';
import type { VideoData, SearchUsage } from '../src/types/youtube.ts';

const TERM = process.argv[2];
if (!TERM) {
  console.log('사용법: node --env-file=.env.local scripts/scenario.ts "키워드"  (검색 버킷 1회 소비)');
  process.exit(0);
}
const DEPTH = 50;
const slug = TERM.replace(/[^\w가-힣]+/g, '_').slice(0, 40);
mkdirSync('measure-out', { recursive: true });
const rawPath = `measure-out/scenario-${slug}-raw.json`;
const promptPath = `measure-out/scenario-${slug}-market-prompt.md`;

console.log(`\n=== 1. 입력: "${TERM}", 깊이 ${DEPTH}, order=relevance, duration=any ===`);
const est = estimateQuota(DEPTH);
console.log(`사전 견적: 검색 버킷 ${est.searchCalls}회, 공용 최악 ${est.otherUnits} units, 하루 가능 ${est.searchesPerDay}회`);

const t0 = Date.now();
let videos: VideoData[];
let stats: SearchUsage;
if (existsSync(rawPath)) {
  console.log(`(${rawPath} 재사용 — 할당량 소비 없음)`);
  ({ videos, stats } = JSON.parse(readFileSync(rawPath, 'utf8')) as { videos: VideoData[]; stats: SearchUsage });
} else {
  ({ videos, stats } = await searchYouTube(TERM, { order: 'relevance', videoDuration: 'any' }, DEPTH));
  writeFileSync(rawPath, JSON.stringify({ videos, stats }, null, 1), 'utf8');
}
const ms = Date.now() - t0;

console.log(`\n=== 2. 서버 호출 결과 (${ms} ms) ===`);
console.log(`영상 ${videos.length}편, 고유 채널 ${new Set(videos.map((v) => v.channelId)).size}개`);
console.log(`실소비: 검색 버킷 ${stats.searchCalls}회, 공용 ${stats.otherUnits} units, 총 호출 ${stats.calls}회`);

const withM = withMetrics(videos);
const sorted = [...withM].sort((a, b) => compareByMetric(a, b, 'performanceMultiple', 'desc'));
const cutoff = outperformCutoff(withM.map((v) => v.metrics.performanceMultiple));

console.log(`\n=== 3. 지표 요약 ===`);
const src: Record<string, number> = {};
for (const v of withM) src[v.metrics.baselineSource ?? 'null'] = (src[v.metrics.baselineSource ?? 'null'] ?? 0) + 1;
console.log('기준선 출처:', src);
const types: Record<string, number> = {};
for (const v of withM) {
  const t = getVideoType(v.duration, v.liveStatus);
  types[t] = (types[t] ?? 0) + 1;
}
console.log('포맷:', types);
const hot = withM.filter((v) => isOutperforming(v.metrics.performanceMultiple, cutoff)).length;
console.log(`강조 컷오프(상위 20% AND ≥5배): ${cutoff.toFixed(2)}배 → 강조 ${hot}편`);

console.log(`\n=== 4. 화면(성과배수 내림차순) 상위 12 + 하위 3 ===`);
const row = (v: (typeof sorted)[number], i: number) => {
  const m = v.metrics;
  const mark = isOutperforming(m.performanceMultiple, cutoff) ? '🔥' : '  ';
  const t = getVideoType(v.duration, v.liveStatus);
  return `${String(i + 1).padStart(2)} ${mark} ${formatMultiple(m.performanceMultiple).padStart(9)} | 일평균배수 ${formatMultiple(m.viewsPerDayMultiple).padStart(8)} | ${String(v.viewCount).padStart(10)}회 | ${t.padEnd(6)} | ${m.daysSincePublish}일 | 기준 ${m.baselineSource ?? 'null'}(${m.baselinePeerCount ?? '-'}) | 구독 ${v.channel.subscriberCount ?? '비공개'} | ${v.title.slice(0, 34)}`;
};
sorted.slice(0, 12).forEach((v, i) => console.log(row(v, i)));
console.log('   ...');
sorted.slice(-3).forEach((v, i) => console.log(row(v, sorted.length - 3 + i)));

const cohort = selectCohort(sorted);
const prompt = buildMarketAnalysisPrompt(TERM, cohort);
writeFileSync(promptPath, prompt, 'utf8');
console.log(`\n=== 5. "시장 분석 복사" 프롬프트: 상위 ${cohort.top.length} / 하위 ${cohort.bottom.length}, ${prompt.length}자 → ${promptPath} ===`);
console.log(prompt.slice(0, 1200));
console.log('... (이하 생략)');
