/**
 * Microsoft Planetary Computer — STAC search and tile URLs.
 * No account, no key, CORS open. Sentinel-2 L2A, ~1 day latency.
 */

const STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const TILER = "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad";
const STATS = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics";

const COLLECTION = "sentinel-2-l2a";

/** True-colour stretch. Sentinel-2 surface reflectance is dark without it. */
const COLOR_FORMULA = "Gamma RGB 3.2 Saturation 0.8 Sigmoidal RGB 25 0.35";

export interface Scene {
  id: string;
  datetime: string;
  cloud: number;
  platform: string;
  /** MGRS tile, e.g. "43RGM". Both dates must share one or the footprints differ. */
  mgrs: string;
  /** Processing baseline 04.00+ (from 25 Jan 2022) stores reflectance with a +1000 offset. */
  offset: boolean;
}

/**
 * Sentinel-2 L2A from processing baseline 04.00 adds 1000 to every band (BOA_ADD_OFFSET).
 * Planetary Computer serves the raw values, so mixing 2019 and 2025 scenes without removing
 * it biases NDVI and washes out true colour. Remembered per item id when a scene is found.
 * https://sentinels.copernicus.eu/web/sentinel/-/copernicus-sentinel-2-major-products-upgrade-upcoming
 */
const OFFSET = new Map<string, boolean>();
export const hasOffset = (itemId: string) => OFFSET.get(itemId) ?? itemDate(itemId) >= "20220125";
const itemDate = (itemId: string) => itemId.split("_")[2]?.slice(0, 8) ?? "";
const baselineHasOffset = (b: string | undefined) => (b ? parseFloat(b) >= 4 : false);

/**
 * Least-cloudy scene intersecting `bbox` inside the window.
 * Returns null when the window has no usable pass — common in monsoon.
 */
export async function findScene(
  bbox: [number, number, number, number],
  fromISO: string,
  toISO: string,
  maxCloud = 20,
  mgrs?: string,
): Promise<Scene | null> {
  const res = await fetch(STAC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: [COLLECTION],
      bbox,
      datetime: `${fromISO}T00:00:00Z/${toISO}T23:59:59Z`,
      query: {
        "eo:cloud_cover": { lt: maxCloud },
        ...(mgrs ? { "s2:mgrs_tile": { eq: mgrs } } : {}),
      },
      limit: 24,
    }),
  });
  if (!res.ok) throw new Error(`STAC search failed (${res.status})`);

  const { features } = await res.json();
  if (!features?.length) return null;

  const best = features.reduce((a: any, b: any) =>
    a.properties["eo:cloud_cover"] <= b.properties["eo:cloud_cover"] ? a : b,
  );

  const offset = best.properties["s2:processing_baseline"]
    ? baselineHasOffset(best.properties["s2:processing_baseline"])
    : itemDate(best.id) >= "20220125";
  OFFSET.set(best.id, offset);
  return {
    id: best.id,
    datetime: best.properties.datetime,
    cloud: best.properties["eo:cloud_cover"],
    platform: best.properties.platform ?? "sentinel-2",
    mgrs: best.properties["s2:mgrs_tile"],
    offset,
  };
}

export function trueColourTiles(itemId: string): string {
  if (hasOffset(itemId)) {
    const q = new URLSearchParams({
      collection: COLLECTION,
      color_formula: COLOR_FORMULA,
      item: itemId,
      expression: "B04-1000;B03-1000;B02-1000",
      asset_as_band: "True",
      rescale: "0,65535",
      nodata: "0",
    });
    return `${TILER}/{z}/{x}/{y}@1x?${q}`;
  }
  const q = new URLSearchParams({
    collection: COLLECTION,
    color_formula: COLOR_FORMULA,
    item: itemId,
    nodata: "0",
  });
  // assets repeats, so it cannot go through the record above.
  return `${TILER}/{z}/{x}/{y}@1x?${q}&assets=B04&assets=B03&assets=B02`;
}

export function formatScene(s: Scene): string {
  const d = new Date(s.datetime);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const NDVI = "(B08-B04)/(B08+B04)";
/** Same index with the +1000 offset removed from both bands. */
const NDVI_OFFSET = "(B08-B04)/(B08+B04-2000)";
const ndviExpr = (itemId: string) => (hasOffset(itemId) ? NDVI_OFFSET : NDVI);

/** Single NDVI tile, rescaled to an 8-bit grey ramp so it can be differenced. */
export function ndviTiles(itemId: string, z: string, x: string, y: string): string {
  const q = new URLSearchParams({
    collection: COLLECTION,
    item: itemId,
    expression: ndviExpr(itemId),
    asset_as_band: "True",
    rescale: "-1,1",
    colormap_name: "gray",
    format: "png",
  });
  return `${TILER}/${z}/${x}/${y}@1x?${q}`;
}

export interface Stats {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  count: number;
}

/** NDVI statistics for one scene inside the drawn outline. */
export async function ndviStats(itemId: string, ring: [number, number][]): Promise<Stats> {
  const q = new URLSearchParams({
    collection: COLLECTION,
    item: itemId,
    expression: ndviExpr(itemId),
    asset_as_band: "True",
  });
  const res = await fetch(`${STATS}?${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
    }),
  });
  if (!res.ok) throw new Error(`statistics failed (${res.status})`);

  const json = await res.json();
  const band = Object.values(json.properties.statistics)[0] as any;
  return {
    mean: band.mean,
    median: band.median,
    std: band.std,
    min: band.min,
    max: band.max,
    count: band.count,
  };
}
