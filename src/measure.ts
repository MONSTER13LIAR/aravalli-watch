import { ndviTiles } from "./mpc";
import { bbox, type Ring } from "./geo";

const TILE = 256;
const ZOOM = 14; // ~8.4 m per pixel at 28°N, close to Sentinel-2's native 10 m
const MAX_TILES = 30;

const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat: number, z: number) =>
  ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const x2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const y2lat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

/** Ray casting. `ring` is open; the closing edge is handled by the modulo. */
function inside(ring: Ring, lon: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export interface ChangeMeasure {
  lossM2: number;
  gainM2: number;
  insideM2: number;
  lossPct: number;
  pixelM: number;
  sampled: number;
  /** Pixels the satellite could not see on one of the two dates. */
  missing: number;
}

export type Signal = "none" | "noise" | "directional";

/**
 * Loss and gain in similar amounts means the scene simply moved — season,
 * sun angle, sampling. Loss strongly outweighing gain is what clearing or
 * dumping looks like. This is the difference between evidence and a pattern.
 */
export function classify(m: ChangeMeasure): { signal: Signal; ratio: number } {
  const ratio = m.gainM2 > 0 ? m.lossM2 / m.gainM2 : m.lossM2 > 0 ? Infinity : 0;
  if (m.lossPct < 1.5) return { signal: "none", ratio };
  if (ratio < 1.5) return { signal: "noise", ratio };
  return { signal: "directional", ratio };
}

export async function grey(url: string): Promise<ImageData | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tile ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

/**
 * Counts changed pixels inside the outline by differencing the two NDVI
 * tile sets, then converts the count to ground area.
 */
export async function measureChange(
  ring: Ring,
  before: string,
  after: string,
  threshold: number,
): Promise<ChangeMeasure> {
  const [w, s, e, n] = bbox(ring);

  let z = ZOOM;
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  // Step down a zoom level rather than fetch an unbounded number of tiles.
  for (; z > 8; z--) {
    x0 = Math.floor(lon2x(w, z));
    x1 = Math.floor(lon2x(e, z));
    y0 = Math.floor(lat2y(n, z));
    y1 = Math.floor(lat2y(s, z));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILES) break;
  }

  const midLat = (s + n) / 2;
  const pixelM = (156543.03392 * Math.cos((midLat * Math.PI) / 180)) / 2 ** z;
  const pixelArea = pixelM * pixelM;

  let loss = 0, gain = 0, sampled = 0, missing = 0;

  const jobs: Promise<void>[] = [];
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      jobs.push(
        (async (tileX, tileY) => {
          const [a, b] = await Promise.all([
            grey(ndviTiles(before, String(z), String(tileX), String(tileY))),
            grey(ndviTiles(after, String(z), String(tileX), String(tileY))),
          ]);

          for (let py = 0; py < TILE; py++) {
            const lat = y2lat(tileY + py / TILE, z);
            if (lat > n || lat < s) continue;
            for (let px = 0; px < TILE; px++) {
              const lon = x2lon(tileX + px / TILE, z);
              if (lon < w || lon > e) continue;
              if (!inside(ring, lon, lat)) continue;

              sampled++;
              const i = (py * TILE + px) * 4;
              if (!a || !b || a.data[i + 3] === 0 || b.data[i + 3] === 0) {
                missing++;
                continue;
              }
              const delta = (b.data[i] / 255) * 2 - (a.data[i] / 255) * 2;
              if (delta <= -threshold) loss++;
              else if (delta >= threshold) gain++;
            }
          }
        })(tx, ty),
      );
    }
  }
  await Promise.all(jobs);

  const insideM2 = sampled * pixelArea;
  return {
    lossM2: loss * pixelArea,
    gainM2: gain * pixelArea,
    insideM2,
    lossPct: sampled ? (loss / sampled) * 100 : 0,
    pixelM,
    sampled,
    missing,
  };
}
