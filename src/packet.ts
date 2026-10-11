import { formatArea, type Ring } from "./geo";
import { formatScene, type Scene, type Stats } from "./mpc";
import { classify, type ChangeMeasure } from "./measure";

export interface PacketInput {
  ring: Ring;
  areaM2: number;
  before: Scene;
  after: Scene;
  beforeStats: Stats;
  afterStats: Stats;
  measure: ChangeMeasure;
  threshold: number;
  images: { before: string; after: string };
  /** The letter as the visitor left it, so the packet is the whole record. */
  complaint?: { lang: "en" | "hi"; text: string };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const iso = (s: string) => new Date(s).toISOString().replace(".000Z", "Z");

/**
 * A printable one-pager. Every number on it is traceable to a scene id and an
 * acquisition timestamp, which is the whole point of the tool.
 */
export function packetHtml(p: PacketInput): string {
  const { signal, ratio } = classify(p.measure);
  const ratioText = ratio === Infinity ? "loss only" : `${ratio.toFixed(1)} : 1`;
  const reading =
    signal === "directional"
      ? "Losses outrun gains, which is the pattern left by clearing or dumping rather than by season."
      : signal === "noise" && ratio < 0.67
        ? "More ground gained cover than lost it. Change in both directions is the signature of seasonal or sampling variation, not directional change — this outline should not be read as evidence of clearing."
      : signal === "noise"
        ? "Losses and gains are close to balanced. That is the signature of seasonal or sampling variation, not directional change — this outline should not be read as evidence of clearing."
        : "No meaningful loss of cover was measured inside this outline.";

  const coords = p.ring
    .map(([lon, lat], i) => `${i + 1}. ${lat.toFixed(6)}, ${lon.toFixed(6)}`)
    .join("<br />");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Aravalli Watch — evidence packet</title>
<style>
  @page { margin: 18mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.6 -apple-system, "Segoe UI", Inter, sans-serif; color: #14171c; margin: 0; }
  h1 { font-size: 19px; margin: 0; letter-spacing: -0.02em; }
  .sub { color: #6b7280; font-size: 12px; margin: 4px 0 0; }
  .rule { height: 2px; background: #c6431f; width: 44px; margin: 14px 0 20px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #9aa0a8;
       margin: 24px 0 8px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  figure { margin: 0; }
  figure img { width: 100%; border: 1px solid #e6e5e0; border-radius: 6px; display: block; }
  figcaption { font-size: 10.5px; color: #6b7280; margin-top: 5px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; border-bottom: 1px solid #eeeeea; vertical-align: top; }
  td:first-child { color: #6b7280; width: 42%; }
  code, .mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 10.5px; word-break: break-all; }
  .big { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
  .note { border-left: 2px solid #c6431f; padding-left: 11px; color: #14171c; font-size: 11.5px; }
  .letter { white-space: pre-wrap; font: 11.5px/1.6 -apple-system, "Segoe UI", Inter, "Noto Sans Devanagari", sans-serif;
            border: 1px solid #e6e5e0; border-radius: 6px; padding: 12px 14px; margin: 0; }
  footer { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e6e5e0;
           font-size: 10px; color: #9aa0a8; }
</style></head><body>

<h1>Evidence packet</h1>
<p class="sub">Surface change inside a defined outline, measured from Copernicus Sentinel&#8209;2.</p>
<div class="rule"></div>

<div class="grid">
  <figure><img src="${p.images.before}" alt="Before" />
    <figcaption><b>Before</b> — ${formatScene(p.before)}, ${p.before.cloud.toFixed(1)}% cloud</figcaption></figure>
  <figure><img src="${p.images.after}" alt="After" />
    <figcaption><b>After</b> — ${formatScene(p.after)}, ${p.after.cloud.toFixed(1)}% cloud</figcaption></figure>
</div>

<h2>Measured change</h2>
<p class="big">${formatArea(p.measure.lossM2)} lost vegetation cover</p>
<table>
  <tr><td>Share of outlined site</td><td>${p.measure.lossPct.toFixed(1)}%</td></tr>
  <tr><td>Ground that gained cover</td><td>${formatArea(p.measure.gainM2)}</td></tr>
  <tr><td>Outlined area</td><td>${formatArea(p.areaM2)}</td></tr>
  <tr><td>Pixels sampled</td><td>${p.measure.sampled.toLocaleString("en-IN")} at ${p.measure.pixelM.toFixed(1)} m</td></tr>
  <tr><td>Pixels unreadable on one date</td><td>${p.measure.missing.toLocaleString("en-IN")}</td></tr>
  <tr><td>NDVI change threshold</td><td>${p.threshold.toFixed(2)}</td></tr>
  <tr><td>Loss to gain</td><td>${ratioText}</td></tr>
</table>
<p class="note" style="border-color:#9aa0a8">${reading}</p>

<h2>Source scenes</h2>
<table>
  <tr><td>Before scene</td><td><code>${p.before.id}</code></td></tr>
  <tr><td>Acquired</td><td class="mono">${iso(p.before.datetime)}</td></tr>
  <tr><td>Mean NDVI in outline</td><td>${p.beforeStats.mean.toFixed(4)} (median ${p.beforeStats.median.toFixed(4)}, sd ${p.beforeStats.std.toFixed(4)})</td></tr>
  <tr><td>After scene</td><td><code>${p.after.id}</code></td></tr>
  <tr><td>Acquired</td><td class="mono">${iso(p.after.datetime)}</td></tr>
  <tr><td>Mean NDVI in outline</td><td>${p.afterStats.mean.toFixed(4)} (median ${p.afterStats.median.toFixed(4)}, sd ${p.afterStats.std.toFixed(4)})</td></tr>
  <tr><td>MGRS tile</td><td>${p.after.mgrs} (both dates)</td></tr>
</table>

<h2>Outline</h2>
<p class="mono">${coords}</p>

<h2>Method</h2>
<p>NDVI, (B08&nbsp;&minus;&nbsp;B04)&nbsp;/&nbsp;(B08&nbsp;+&nbsp;B04), was computed for both dates from
Sentinel&#8209;2 L2A surface reflectance and differenced pixel by pixel at ${p.measure.pixelM.toFixed(1)}&nbsp;m.
Pixels where NDVI fell by more than ${p.threshold.toFixed(2)} are counted as lost cover.
Both dates are drawn from the same MGRS tile, so the two grids align without resampling.
Statistics come from the Planetary Computer statistics endpoint over the same outline.</p>

<p class="note">This records that the ground changed, not who changed it. Sentinel&#8209;2
resolves 10&nbsp;m, so a single truckload will not appear. Seasonal die-back, harvest and
drought also reduce NDVI &mdash; a like-for-like season comparison is the honest one.</p>

${p.complaint && p.complaint.text.trim()
  ? `<h2>Complaint letter</h2>
<pre class="letter" lang="${p.complaint.lang}">${esc(p.complaint.text)}</pre>`
  : ""}

<footer>
  Generated ${new Date().toISOString().replace(".000Z", "Z")} ·
  Imagery: Copernicus Sentinel&#8209;2 L2A, processed by ESA, accessed via Microsoft Planetary Computer.
</footer>
</body></html>`;
}
