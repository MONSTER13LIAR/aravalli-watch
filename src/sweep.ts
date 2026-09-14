import { bbox, type Ring } from "./geo";
import { findScene, type Scene } from "./mpc";
import { measureChange } from "./measure";
import { classify } from "./measure";

export interface YearPoint {
  year: number;
  scene: Scene;
  lossM2: number;
  gainM2: number;
  lossPct: number;
  ratio: number;
}

export interface Sweep {
  baseline: Scene;
  points: YearPoint[];
  /** Years with no clear pass over the baseline's tile. */
  missing: number[];
}

/**
 * The same measurement, once per year, all against one baseline scene. Every
 * point is a dry-season pass pinned to the baseline's MGRS tile, so the bars
 * are comparable with each other and with the single verdict on screen.
 */
export async function sweepYears(
  ring: Ring,
  baseline: Scene,
  years: number[],
  threshold: number,
  onProgress: (text: string, done: number, total: number) => void,
): Promise<Sweep> {
  const box = bbox(ring);
  const baseYear = new Date(baseline.datetime).getUTCFullYear();
  const todo = years.filter((y) => y > baseYear);
  const points: YearPoint[] = [];
  const missing: number[] = [];

  for (let i = 0; i < todo.length; i++) {
    const y = todo[i];
    onProgress(`Searching Nov–Dec ${y}…`, i, todo.length);
    const scene = await findScene(box, `${y}-11-01`, `${y}-12-31`, 20, baseline.mgrs);
    if (!scene) {
      missing.push(y);
      continue;
    }
    onProgress(`${baseYear} → ${y}: differencing…`, i, todo.length);
    const m = await measureChange(ring, baseline.id, scene.id, threshold);
    const { ratio } = classify(m);
    points.push({ year: y, scene, lossM2: m.lossM2, gainM2: m.gainM2, lossPct: m.lossPct, ratio });
    onProgress(`${baseYear} → ${y}: ${m.lossPct.toFixed(1)}% lost`, i + 1, todo.length);
  }
  return { baseline, points, missing };
}

/** Inline bar chart. Height is loss share; the worst year carries the number. */
export function chartSvg(sweep: Sweep, years: number[]): string {
  const baseYear = new Date(sweep.baseline.datetime).getUTCFullYear();
  const shown = years.filter((y) => y > baseYear);
  const byYear = new Map(sweep.points.map((p) => [p.year, p]));
  const max = Math.max(1, ...sweep.points.map((p) => p.lossPct));
  const worst = sweep.points.reduce<YearPoint | null>((a, b) => (!a || b.lossPct > a.lossPct ? b : a), null);

  const W = 100, H = 46, top = 11, bottom = 10, gap = 1.2;
  const bw = (W - gap * (shown.length - 1)) / shown.length;
  const plotH = H - top - bottom;

  let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Loss by year against ${baseYear}">`;
  out += `<line x1="0" y1="${H - bottom}" x2="${W}" y2="${H - bottom}" class="axis"/>`;
  shown.forEach((y, i) => {
    const x = i * (bw + gap);
    const p = byYear.get(y);
    if (!p) {
      out += `<rect x="${x}" y="${H - bottom - 1.5}" width="${bw}" height="1.5" class="bar missing"/>`;
    } else {
      const h = Math.max(1, (p.lossPct / max) * plotH);
      const cls = p === worst ? "bar worst" : "bar";
      out += `<rect x="${x}" y="${H - bottom - h}" width="${bw}" height="${h}" class="${cls}"/>`;
      if (p === worst || p.lossPct === max) {
        out += `<text x="${x + bw / 2}" y="${H - bottom - h - 3}" class="val">${p.lossPct.toFixed(1)}%</text>`;
      }
    }
    out += `<text x="${x + bw / 2}" y="${H - 3}" class="yr">${String(y).slice(2)}</text>`;
  });
  out += `</svg>`;
  return out;
}
