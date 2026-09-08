/**
 * 실측 2차 — 1차 결과(성과배수 p50 12~29배, 옛/새 기준선 3.6배 차이)의 원인을 분리한다.
 *
 * 1차 측정은 세 효과를 한 숫자에 섞어 "Shorts 오염" 탓으로 귀속했다. 여기서는 같은
 * 동료 집합(최근 업로드, 본 영상 제외) 위에서 한 번에 하나씩만 바꿔 잰다.
 *
 *   (a) 포맷 효과   : 혼합 중앙값 ÷ 같은 포맷 중앙값           (같은 동료, 포맷만 분리)
 *   (b) 나이 효과   : 같은 포맷 중앙값 ÷ 같은 포맷·30일 이상 중앙값 (같은 포맷, 나이만 제한)
 *   (c) 배수 변화   : 현행 배수 ÷ 나이맞춤 배수 / 일평균 기반 배수
 *   (d) 검색 페이지 : search.list가 페이지당 실제로 돌려준 개수와 nextPageToken 유무
 *
 * 비용: 키워드당 검색 1~3회 + 공용 ≈ 60~100 units. 인자 없으면 할당량을 쓰지 않는다.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { searchYouTube } from '../src/server/youtube/search.ts';
import { YouTubeApiError } from '../src/server/youtube/errors.ts';
import { withMetrics, daysSincePublish } from '../src/app/utils/metrics.ts';
import { getVideoType } from '../src/app/utils/videoUtils.ts';
import type { VideoWithMetrics } from '../src/types/youtube.ts';

const DEPTH = 50;
const AGE_FLOOR_DAYS = 30;
const NOW = Date.now();

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))];
}
function dist(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, p10: pct(s, 10), p25: pct(s, 25), p50: pct(s, 50), p75: pct(s, 75), p90: pct(s, 90) };
}
const f = (x: number | null, d = 2) => (x === null ? '—' : x.toFixed(d));

// ---------- (d) search.list 페이지 관측: fetch를 경계에서 감싼다 ----------
interface PageObs { term: string; page: number; requested: number; returned: number; withVideoId: number; hasNext: boolean; totalResults: number | null }
const pageObs: PageObs[] = [];
let currentTerm = '';
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await realFetch(input, init);
  const url = String(input);
  if (url.includes('/youtube/v3/search?') && res.ok) {
    const clone = res.clone();
    const body = (await clone.json()) as { items?: { id?: { videoId?: string } }[]; nextPageToken?: string; pageInfo?: { totalResults?: number } };
    const requested = Number(new URL(url).searchParams.get('maxResults'));
    const page = pageObs.filter((p) => p.term === currentTerm).length + 1;
    pageObs.push({
      term: currentTerm,
      page,
      requested,
      returned: body.items?.length ?? 0,
      withVideoId: body.items?.filter((i) => i.id?.videoId).length ?? 0,
      hasNext: Boolean(body.nextPageToken),
      totalResults: body.pageInfo?.totalResults ?? null,
    });
  }
  return res;
}) as typeof fetch;

// ---------- (a)(b)(c) 영상별 분해 ----------
interface PerVideo {
  id: string;
  format: 'shorts' | 'long' | 'live';
  targetAgeDays: number;
  view: number;
  peersAll: number;
  peersSameFormat: number;
  peersSameFormatOld: number;
  mixedMedian: number | null;
  sameFormatMedian: number | null;
  ageMatchedMedian: number | null;
  peerAgeMedian: number | null;
  peersYoungerThanTargetShare: number | null;
  multipleCurrent: number | null;   // view / sameFormatMedian  (현행)
  multipleAgeMatched: number | null; // view / ageMatchedMedian
  multipleVpd: number | null;        // (view/age) / median(peer view/age) 같은 포맷
}

function decompose(v: VideoWithMetrics): PerVideo | null {
  const ups = v.channel.recentUploads;
  if (!ups) return null;
  const format = getVideoType(v.duration);
  const peers = ups.filter((u) => u.id !== v.id);
  const same = peers.filter((u) => getVideoType(u.duration) === format);
  const sameOld = same.filter((u) => daysSincePublish(u.publishedAt, NOW) >= AGE_FLOOR_DAYS);
  const targetAge = daysSincePublish(v.publishedAt, NOW);
  const peerAges = same.map((u) => daysSincePublish(u.publishedAt, NOW));
  const vpd = (views: number, age: number) => views / Math.max(1, age);

  const mixedMedian = median(peers.map((u) => u.viewCount));
  const sameFormatMedian = same.length >= 3 ? median(same.map((u) => u.viewCount)) : null;
  const ageMatchedMedian = sameOld.length >= 3 ? median(sameOld.map((u) => u.viewCount)) : null;
  const peerVpdMedian = same.length >= 3 ? median(same.map((u) => vpd(u.viewCount, daysSincePublish(u.publishedAt, NOW)))) : null;

  const ratio = (a: number, b: number | null) => (b && b > 0 ? a / b : null);
  return {
    id: v.id,
    format,
    targetAgeDays: targetAge,
    view: v.viewCount,
    peersAll: peers.length,
    peersSameFormat: same.length,
    peersSameFormatOld: sameOld.length,
    mixedMedian,
    sameFormatMedian,
    ageMatchedMedian,
    peerAgeMedian: median(peerAges),
    peersYoungerThanTargetShare: same.length ? peerAges.filter((a) => a < targetAge).length / same.length : null,
    multipleCurrent: ratio(v.viewCount, sameFormatMedian),
    multipleAgeMatched: ratio(v.viewCount, ageMatchedMedian),
    multipleVpd: ratio(vpd(v.viewCount, targetAge), peerVpdMedian),
  };
}

function summarize(term: string, rows: PerVideo[]) {
  const byFormat = (fmt: 'shorts' | 'long' | 'live') => rows.filter((r) => r.format === fmt);
  const ratios = (xs: PerVideo[], num: (r: PerVideo) => number | null, den: (r: PerVideo) => number | null) =>
    xs.map((r) => { const a = num(r), b = den(r); return a && b && b > 0 ? a / b : null; }).filter((x): x is number => x !== null);

  const out = {
    term,
    n: rows.length,
    formatEffect: {
      // 혼합 중앙값 ÷ 같은 포맷 중앙값. 1이면 포맷 분리가 숫자를 안 바꿨다는 뜻.
      all: dist(ratios(rows, (r) => r.mixedMedian, (r) => r.sameFormatMedian)),
      longTargets: dist(ratios(byFormat('long'), (r) => r.mixedMedian, (r) => r.sameFormatMedian)),
      shortsTargets: dist(ratios(byFormat('shorts'), (r) => r.mixedMedian, (r) => r.sameFormatMedian)),
    },
    ageEffect: {
      // 같은 포맷 중앙값 ÷ 같은 포맷·30일 이상 중앙값. <1이면 어린 동료가 분모를 끌어내렸다는 뜻.
      sameFormatOverAgeMatched: dist(ratios(rows, (r) => r.sameFormatMedian, (r) => r.ageMatchedMedian)),
      targetAgeDays: dist(rows.map((r) => r.targetAgeDays)),
      peerAgeMedianDays: dist(rows.map((r) => r.peerAgeMedian).filter((x): x is number => x !== null)),
      peersYoungerThanTargetShare: dist(rows.map((r) => r.peersYoungerThanTargetShare).filter((x): x is number => x !== null)),
      ageMatchedAvailable: rows.filter((r) => r.ageMatchedMedian !== null).length,
    },
    multiples: {
      current: dist(rows.map((r) => r.multipleCurrent).filter((x): x is number => x !== null)),
      ageMatched: dist(rows.map((r) => r.multipleAgeMatched).filter((x): x is number => x !== null)),
      vpd: dist(rows.map((r) => r.multipleVpd).filter((x): x is number => x !== null)),
      currentOverAgeMatched: dist(ratios(rows, (r) => r.multipleCurrent, (r) => r.multipleAgeMatched)),
      currentOverVpd: dist(ratios(rows, (r) => r.multipleCurrent, (r) => r.multipleVpd)),
    },
    pages: pageObs.filter((p) => p.term === term),
  };
  return out;
}

function print(s: ReturnType<typeof summarize>) {
  const d = (x: { p10: number | null; p50: number | null; p90: number | null; n: number }) => `p10 ${f(x.p10)} · p50 ${f(x.p50)} · p90 ${f(x.p90)} (n=${x.n})`;
  console.log(`\n=== "${s.term}" — 분해 대상 ${s.n}편`);
  console.log(`  (a) 포맷 효과  혼합중앙값÷같은포맷중앙값`);
  console.log(`        전체        ${d(s.formatEffect.all)}`);
  console.log(`        롱폼 대상   ${d(s.formatEffect.longTargets)}   (>1 이면 Shorts가 분모를 끌어올리고 있었음)`);
  console.log(`        Shorts 대상 ${d(s.formatEffect.shortsTargets)}   (<1 이면 롱폼이 분모를 끌어내리고 있었음)`);
  console.log(`  (b) 나이 효과  같은포맷중앙값÷같은포맷·30일이상중앙값  ${d(s.ageEffect.sameFormatOverAgeMatched)}   (<1 이면 어린 동료가 배수를 부풀림)`);
  console.log(`        대상 나이(일) ${d(s.ageEffect.targetAgeDays)}  · 동료 나이 중앙값(일) ${d(s.ageEffect.peerAgeMedianDays)}`);
  console.log(`        대상보다 어린 동료 비율 ${d(s.ageEffect.peersYoungerThanTargetShare)}  · 나이맞춤 가능 ${s.ageEffect.ageMatchedAvailable}/${s.n}`);
  console.log(`  (c) 배수      현행 ${d(s.multiples.current)}`);
  console.log(`                나이맞춤 ${d(s.multiples.ageMatched)}`);
  console.log(`                일평균  ${d(s.multiples.vpd)}`);
  console.log(`                현행÷나이맞춤 ${d(s.multiples.currentOverAgeMatched)}  · 현행÷일평균 ${d(s.multiples.currentOverVpd)}`);
  console.log(`  (d) 검색 페이지`);
  for (const p of s.pages) console.log(`        p${p.page}: 요청 ${p.requested} → 반환 ${p.returned} (videoId ${p.withVideoId}) · next ${p.hasNext ? 'O' : 'X'} · totalResults ${p.totalResults ?? '—'}`);
}

async function main() {
  const terms = process.argv.slice(2).map((t) => t.trim()).filter(Boolean);
  if (terms.length === 0) { console.log('사용법: node --env-file=.env.local scripts/measure-isolate.ts "키워드" ...'); process.exit(1); }
  if (!process.env.YT_API_KEY) { console.error('YT_API_KEY 없음'); process.exit(1); }
  const results = [];
  for (const term of terms) {
    currentTerm = term;
    try {
      const { videos, stats } = await searchYouTube(term, { order: 'relevance', videoDuration: 'any' }, DEPTH);
      const rows = withMetrics(videos, NOW).map(decompose).filter((r): r is PerVideo => r !== null);
      const s = { ...summarize(term, rows), usage: stats };
      results.push(s);
      print(s);
      console.log(`  할당량: 검색 ${stats.searchCalls}회 · 공용 ${stats.otherUnits} units`);
    } catch (e) {
      if (e instanceof YouTubeApiError) { console.error(`"${term}" 실패: [${e.code}] ${e.message}`); if (e.code.includes('QUOTA')) break; } else throw e;
    }
  }
  mkdirSync('measure-out', { recursive: true });
  const file = `measure-out/isolate-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`\n원본 저장: ${file}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
