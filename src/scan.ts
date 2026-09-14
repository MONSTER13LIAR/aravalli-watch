import { findScene, ndviTiles, type Scene } from "./mpc";
import { grey } from "./measure";
import type { Ring } from "./geo";

/**
 * The Faridabad–Gurugram stretch of the Aravallis, Bandhwari to Tughlakabad.
 * Every pre-marked area sits inside it. West, south, east, north.
 */
export const BELT: [number, number, number, number] = [77.06, 28.3, 77.34, 28.54];
export const SCAN_THEN = 2019;
export const SCAN_NOW = 2025;

const Z = 13; // 256 px tile ≈ 4.3 km here, so a 64 px cell ≈ 1.1 km
const TILE = 256;
const CELL = 64;
const POOL = 6;

export interface Cell {
  ring: Ring;
  centre: [number, number];
  lossPct: number;
  gainPct: number;
  ratio: number;
  /** Share of the cell the satellite could read on both dates. */
  valid: number;
  /** The whole 4 km tile's median NDVI change — haze, season, processing. Removed before counting. */
  shift: number;
}

export interface Scan {
  before: Scene;
  after: Scene;
  cells: Cell[];
  hotspots: Cell[];
  tiles: number;
}

const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat: number, z: number) =>
  ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const x2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const y2lat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

/** What counts as a hotspot. Loss alone is not enough — the control forest loses a little every year too. */
const MIN_VALID = 0.6;
const MIN_LOSS = 6;
const MIN_RATIO = 3;
const TOP = 12;

/**
 * Differences every square kilometre of the belt between two dry-season
 * passes and ranks the cells that lost the most cover. Same arithmetic as the
 * single-site measurement, just run everywhere at once.
 */
export async function scanBelt(
  threshold: number,
  onProgress: (text: string, done: number, total: number) => void,
): Promise<Scan> {
  onProgress(`Finding a clear pass over the belt, Nov–Dec ${SCAN_NOW}…`, 0, 1);
  // The tile that covers Bandhwari covers the whole belt; prefer it so nothing is cut off.
  const after =
    (await findScene(BELT, `${SCAN_NOW}-11-01`, `${SCAN_NOW}-12-31`, 20, "43RGM")) ??
    (await findScene(BELT, `${SCAN_NOW}-11-01`, `${SCAN_NOW}-12-31`));
  if (!after) throw new Error(`no clear pass over the belt in Nov–Dec ${SCAN_NOW}`);
  const before = await findScene(BELT, `${SCAN_THEN}-11-01`, `${SCAN_THEN}-12-31`, 20, after.mgrs);
  if (!before) throw new Error(`no clear pass over tile ${after.mgrs} in Nov–Dec ${SCAN_THEN}`);

  const [w, s, e, n] = BELT;
  const x0 = Math.floor(lon2x(w, Z)), x1 = Math.floor(lon2x(e, Z));
  const y0 = Math.floor(lat2y(n, Z)), y1 = Math.floor(lat2y(s, Z));
  const jobs: [number, number][] = [];
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) jobs.push([tx, ty]);

  const cells: Cell[] = [];
  let done = 0;

  const work = async ([tx, ty]: [number, number]) => {
    const [a, b] = await Promise.all([
      grey(ndviTiles(before.id, String(Z), String(tx), String(ty))),
      grey(ndviTiles(after.id, String(Z), String(tx), String(ty))),
    ]);

    // Two passes over the same 4 km tile is 2.5 s from the tiler and 20 ms from
    // the CPU, so afford it: nudge only after finding the tile's own shift.
    // A November smog blanket over Delhi drops NDVI 0.1 across whole tiles;
    // measuring against the tile median leaves only what is local — a site.
    const deltas = new Float32Array(TILE * TILE).fill(NaN);
    let shift = 0;
    if (a && b) {
      const seen: number[] = [];
      for (let i = 0, p = 0; i < TILE * TILE; i++, p += 4) {
        if (a.data[p + 3] === 0 || b.data[p + 3] === 0) continue;
        const d = (b.data[p] / 255) * 2 - (a.data[p] / 255) * 2;
        deltas[i] = d;
        seen.push(d);
      }
      if (seen.length) {
        seen.sort((p, q) => p - q);
        shift = seen[seen.length >> 1];
      }
    }

    for (let cy = 0; cy < TILE; cy += CELL) {
      for (let cx = 0; cx < TILE; cx += CELL) {
        let loss = 0, gain = 0, valid = 0;
        for (let py = cy; py < cy + CELL; py++) {
          for (let px = cx; px < cx + CELL; px++) {
            const d = deltas[py * TILE + px];
            if (Number.isNaN(d)) continue;
            valid++;
            const local = d - shift;
            if (local <= -threshold) loss++;
            else if (local >= threshold) gain++;
          }
        }
        const cw = x2lon(tx + cx / TILE, Z), ce = x2lon(tx + (cx + CELL) / TILE, Z);
        const cn = y2lat(ty + cy / TILE, Z), cs = y2lat(ty + (cy + CELL) / TILE, Z);
        // Tiles overhang the belt; a cell whose centre is outside it is Delhi or Sohna, not the belt.
        const mx = (cw + ce) / 2, my = (cn + cs) / 2;
        if (mx < w || mx > e || my < s || my > n) continue;
        cells.push({
          ring: [[cw, cn], [ce, cn], [ce, cs], [cw, cs]],
          centre: [(cw + ce) / 2, (cn + cs) / 2],
          lossPct: valid ? (loss / valid) * 100 : 0,
          gainPct: valid ? (gain / valid) * 100 : 0,
          ratio: gain > 0 ? loss / gain : loss > 0 ? Infinity : 0,
          valid: valid / (CELL * CELL),
          shift,
        });
      }
    }
    done++;
    onProgress(`Differencing the belt… ${done} of ${jobs.length} tiles`, done, jobs.length);
  };

  // A small pool: the tiler renders every tile on demand, so be a polite client.
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: POOL }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) await work(j);
    }),
  );

  const hotspots = cells
    .filter((c) => c.valid >= MIN_VALID && c.lossPct >= MIN_LOSS && c.ratio >= MIN_RATIO)
    .sort((p, q) => q.lossPct - p.lossPct)
    .slice(0, TOP);

  return { before, after, cells, hotspots, tiles: jobs.length };
}

/** Straight-line distance in km, good enough to say "this is that landfill". */
export function kmBetween(a: [number, number], b: [number, number]): number {
  const R = 6371, d = Math.PI / 180;
  const dLat = (b[1] - a[1]) * d, dLon = (b[0] - a[0]) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * d) * Math.cos(b[1] * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
