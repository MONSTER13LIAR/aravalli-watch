import { Map as MLMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./style.css";
import { PolygonDraw } from "./draw";
import { bbox, formatArea, ringArea, type Ring } from "./geo";
import { findScene, formatScene, ndviStats, trueColourTiles, type Scene, type Stats } from "./mpc";
import { maskTiles, registerChangeProtocol } from "./changemask";
import { classify, measureChange, type ChangeMeasure } from "./measure";
import { packetHtml } from "./packet";
import { SITES, YEARS, type Site } from "./presets";
import { geocode } from "./geocode";
import { chartSvg, sweepYears, type Sweep } from "./sweep";
import { writeBrief } from "./brief";

// maplibre resolves its worker filename by string concatenation, which no
// bundler can follow, so the file is never emitted and vector tiles die
// silently — the basemap renders blank. Point it at the emitted asset.
setWorkerUrl(workerUrl);

registerChangeProtocol();

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const STYLE = "https://tiles.openfreemap.org/styles/positron";
/** The Faridabad–Gurugram stretch of the Aravallis, where every pre-marked area sits. */
const START: [number, number] = [77.21, 28.415];
const PANEL_W = 460;

const mapBefore = new MLMap({
  container: "map-before",
  style: STYLE,
  center: START,
  zoom: 11.6,
  attributionControl: false,
  canvasContextAttributes: { preserveDrawingBuffer: true },
});
const mapAfter = new MLMap({
  container: "map-after",
  style: STYLE,
  center: START,
  zoom: 11.6,
  attributionControl: { compact: true },
  canvasContextAttributes: { preserveDrawingBuffer: true },
});
mapAfter.addControl(new NavigationControl({ showCompass: false }), "top-right");

// ---------- keep the two maps locked together ----------

let syncing = false;
const sync = (from: MLMap, to: MLMap) => {
  from.on("move", () => {
    if (syncing) return;
    syncing = true;
    to.jumpTo({
      center: from.getCenter(),
      zoom: from.getZoom(),
      bearing: from.getBearing(),
      pitch: from.getPitch(),
    });
    syncing = false;
  });
};
sync(mapBefore, mapAfter);
sync(mapAfter, mapBefore);

// ---------- swipe divider ----------

let split = 50;
const applySplit = () => {
  $("map-after").style.clipPath = `inset(0 0 0 ${split}%)`;
  $("swipe").style.left = `${split}%`;
};

const startDrag = (ev: PointerEvent) => {
  ev.preventDefault();
  const move = (e: PointerEvent) => {
    split = Math.min(96, Math.max(4, (e.clientX / window.innerWidth) * 100));
    applySplit();
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
};
$("swipe-handle").addEventListener("pointerdown", startDrag);
applySplit();

// ---------- screens ----------

type Screen = "intro" | "where" | "draw" | "when" | "verdict";
let screen: Screen = "intro";

/** One screen at a time. The crumbs track where the visitor is in the story. */
function show(next: Screen) {
  screen = next;
  for (const el of document.querySelectorAll<HTMLElement>(".screen")) {
    const on = el.dataset.screen === next;
    if (on) {
      el.hidden = false;
      el.classList.remove("rise");
      void el.offsetWidth; // restart the animation
      el.classList.add("rise");
    } else {
      el.hidden = true;
    }
  }
  const order: Screen[] = ["where", "when", "verdict"];
  const idx = order.indexOf(next === "draw" ? "where" : next);
  for (const c of document.querySelectorAll<HTMLElement>(".crumbs span")) {
    const i = order.indexOf(c.dataset.screen as Screen);
    c.dataset.state = i < idx ? "done" : i === idx ? "active" : "";
  }
  $("crumbs").hidden = next === "intro";
  $("panel").scrollTo({ top: 0, behavior: "smooth" });
}

const settle = () => $("panel").classList.remove("wide");
// Two seconds from when the page is actually on screen, not from script start.
window.addEventListener("load", () => window.setTimeout(settle, 2200));

$("btn-start").addEventListener("click", () => {
  settle();
  show("where");
});

// ---------- framing ----------

/**
 * The panel covers the left of the screen on desktop and the bottom on mobile.
 * A symmetric padding therefore centres the site under the panel, and on a
 * narrow screen a fixed inset overshoots the zoom entirely.
 */
const fitPadding = () =>
  window.innerWidth <= 720
    ? { top: 56, bottom: Math.round(window.innerHeight * 0.64) + 24, left: 24, right: 24 }
    : { top: 60, bottom: 60, left: PANEL_W + 32, right: 60 };

const fitBox = (box: [number, number, number, number], maxZoom?: number) => {
  const [w, s_, e, n] = box;
  // maplibre copies an explicit `maxZoom: undefined` over its own default and
  // then takes Math.min against it, giving NaN and a camera that never moves.
  mapAfter.fitBounds([[w, s_], [e, n]], {
    padding: fitPadding(),
    duration: 900,
    ...(maxZoom === undefined ? {} : { maxZoom }),
  });
};

// ---------- state ----------

let ring: Ring = [];
let site: Site | null = null;
let scenes: { before: Scene; after: Scene } | null = null;
let stats: { before: Stats; after: Stats } | null = null;
let measured: ChangeMeasure | null = null;

let sweep: Sweep | null = null;
let sweepKey = "";

let thenYear = 2019;
let nowYear: number | "latest" = 2025;

const threshold = () => Number($<HTMLInputElement>("threshold").value) / 100;

/** Drop every layer a run added, so nothing outlives the outline it describes. */
const dropLayer = (map: MLMap, id: string) => {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
};

const MASK = "change-mask";

function resetMap() {
  scenes = null;
  stats = null;
  measured = null;
  dropLayer(mapAfter, MASK);
  dropLayer(mapBefore, "img-before");
  dropLayer(mapAfter, "img-after");
  $("swipe").hidden = true;
  $("stamp-before").hidden = true;
  $("stamp-after").hidden = true;
  $("legend").hidden = true;
  $("run-status").hidden = true;
}

// ---------- where: pre-marked areas ----------

const sitesEl = $("sites");
for (const s of SITES) {
  const b = document.createElement("button");
  b.className = "site";
  b.dataset.kind = s.kind;
  b.innerHTML =
    `<span class="site-label">${s.label}</span>` +
    `<span class="site-place">${s.place}</span>` +
    `<span class="site-blurb">${s.blurb}</span>`;
  b.addEventListener("click", () => pickSite(s));
  sitesEl.appendChild(b);
}

function pickSite(s: Site) {
  site = s;
  draw.set(s.ring);
  fitBox(bbox(s.ring));
  $("when-place").textContent = s.place;
  show("when");
  void run();
}

$("btn-back-where").addEventListener("click", () => {
  resetMap();
  show("where");
});

// ---------- drawing ----------

const draw = new PolygonDraw([mapBefore, mapAfter], (next, drawing) => {
  ring = next;
  $("draw-count").textContent =
    ring.length === 0
      ? "Click the map to place the first corner"
      : `${ring.length} corner${ring.length === 1 ? "" : "s"} placed${ring.length >= 3 ? ` · ${formatArea(ringArea(ring))}` : ""}`;
  $<HTMLButtonElement>("btn-done").disabled = ring.length < 3;

  if (screen !== "draw") return;
  if (!drawing && ring.length >= 3) {
    site = null;
    $("when-place").textContent = `your outline, ${formatArea(ringArea(ring))}`;
    show("when");
    void run();
  } else if (!drawing && ring.length === 0) {
    show("where"); // Escape
  }
});

const beginDrawing = () => {
  resetMap();
  show("draw");
  draw.start();
};

$("btn-draw").addEventListener("click", beginDrawing);
$("btn-done").addEventListener("click", () => draw.close());
$("btn-cancel").addEventListener("click", () => draw.clear());

// ---------- when: timeline ----------

const chip = (label: string, on: () => void, extra = "") => {
  const b = document.createElement("button");
  b.className = `chip ${extra}`.trim();
  b.textContent = label;
  b.addEventListener("click", on);
  return b;
};

const rowThen = $("row-then");
const rowNow = $("row-now");
const thenChips = new Map<number, HTMLButtonElement>();
const nowChips = new Map<number | "latest", HTMLButtonElement>();

for (const y of YEARS) {
  thenChips.set(y, chip(String(y), () => { thenYear = y; paintChips(); void run(); }));
  nowChips.set(y, chip(String(y), () => { nowYear = y; paintChips(); void run(); }));
}
nowChips.set("latest", chip("Latest pass", () => { nowYear = "latest"; paintChips(); void run(); }, "latest"));

for (const b of thenChips.values()) rowThen.appendChild(b);
for (const b of nowChips.values()) rowNow.appendChild(b);

/** "Then" must come before "now"; the impossible chips are greyed, not hidden. */
function paintChips() {
  const nowNum = nowYear === "latest" ? Infinity : nowYear;
  for (const [y, b] of thenChips) {
    b.dataset.on = String(y === thenYear);
    b.disabled = y >= nowNum;
  }
  for (const [y, b] of nowChips) {
    b.dataset.on = String(y === nowYear);
    b.disabled = y !== "latest" && y <= thenYear;
  }
}
paintChips();

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Walk back from today in 45-day windows until a clear pass turns up. */
async function latestScene(box: [number, number, number, number]): Promise<Scene | null> {
  const day = 864e5;
  for (let back = 0; back < 420; back += 45) {
    const to = new Date(Date.now() - back * day);
    const from = new Date(to.getTime() - 45 * day);
    const s = await findScene(box, isoDay(from), isoDay(to));
    if (s) return s;
  }
  return null;
}

// ---------- imagery ----------

const showScene = (map: MLMap, key: string, scene: Scene) => {
  dropLayer(map, key);
  map.addSource(key, {
    type: "raster",
    tiles: [trueColourTiles(scene.id)],
    tileSize: 256,
    attribution: "Copernicus Sentinel-2, Microsoft Planetary Computer",
  });
  map.addLayer({ id: key, type: "raster", source: key });
  // Keep the outline above the imagery regardless of insertion order.
  for (const id of ["draw-fill", "draw-line", "draw-verts"]) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
};

const stamp = (id: string, label: string, scene: Scene) => {
  const el = $(id);
  el.innerHTML = `<b>${label}</b>${formatScene(scene)} &middot; ${scene.cloud.toFixed(1)}% cloud`;
  el.hidden = false;
};

// ---------- the run: search, show, measure ----------

let runId = 0;

const say = (text: string, tone: "" | "busy" | "error" = "busy") => {
  const el = $("run-status");
  el.hidden = false;
  el.dataset.tone = tone;
  el.textContent = text;
};

/**
 * One click does the whole job. The visitor picked a place and two years;
 * everything from here to the verdict is the tool's problem, not theirs.
 */
async function run() {
  if (ring.length < 3) return;
  const id = ++runId;
  const box = bbox(ring);
  const nowLabel = nowYear === "latest" ? "the most recent clear pass" : `Nov–Dec ${nowYear}`;

  try {
    say(`Searching the Sentinel-2 archive for ${nowLabel}…`);
    // Pin both dates to one MGRS tile, otherwise the two scenes cover
    // different ground and the comparison is meaningless.
    const after = nowYear === "latest"
      ? await latestScene(box)
      : await findScene(box, `${nowYear}-11-01`, `${nowYear}-12-31`);
    if (id !== runId) return;
    if (!after) {
      say(`No pass under 20% cloud in ${nowLabel}. Monsoon, most likely — try a neighbouring year.`, "error");
      return;
    }

    say(`Found ${formatScene(after)} at ${after.cloud.toFixed(1)}% cloud. Matching it against ${thenYear}…`);
    const before = await findScene(box, `${thenYear}-11-01`, `${thenYear}-12-31`, 20, after.mgrs);
    if (id !== runId) return;
    if (!before) {
      say(`No clear pass over tile ${after.mgrs} in Nov–Dec ${thenYear}. Try a neighbouring year.`, "error");
      return;
    }

    showScene(mapBefore, "img-before", before);
    showScene(mapAfter, "img-after", after);
    stamp("stamp-before", "Before", before);
    stamp("stamp-after", "After", after);
    $("swipe").hidden = false;
    split = 50;
    applySplit();
    scenes = { before, after };

    say("Both passes on screen. Differencing every pixel inside the outline…");
    const [m, sb, sa] = await Promise.all([
      measureChange(ring, before.id, after.id, threshold()),
      ndviStats(before.id, ring),
      ndviStats(after.id, ring),
    ]);
    if (id !== runId) return;
    measured = m;
    stats = { before: sb, after: sa };

    applyMask();
    $("legend").hidden = false;
    $<HTMLInputElement>("mask-on").checked = true;
    fillVerdict();
    resetBrief();
    $("run-status").hidden = true;
    show("verdict");
  } catch (err) {
    if (id === runId) say(`Something broke: ${(err as Error).message}`, "error");
  }
}

// ---------- change mask ----------

/**
 * The mask belongs on the after map only: it describes what the ground lost
 * by that date, so painting it over the before image would misread as
 * evidence that already existed then.
 */
function applyMask() {
  if (!scenes) return;
  dropLayer(mapAfter, MASK);
  mapAfter.addSource(MASK, {
    type: "raster",
    tiles: [maskTiles(scenes.before.id, scenes.after.id, threshold(), ring)],
    tileSize: 256,
  });
  mapAfter.addLayer({ id: MASK, type: "raster", source: MASK });
  for (const id of ["draw-fill", "draw-line", "draw-verts"]) {
    if (mapAfter.getLayer(id)) mapAfter.moveLayer(id);
  }
}

$("mask-on").addEventListener("change", (e) => {
  const on = (e.target as HTMLInputElement).checked;
  if (mapAfter.getLayer(MASK)) {
    mapAfter.setLayoutProperty(MASK, "visibility", on ? "visible" : "none");
  }
  $("legend").hidden = !on;
});

const thresholdEl = $<HTMLInputElement>("threshold");
thresholdEl.addEventListener("input", () => {
  $("threshold-val").textContent = threshold().toFixed(2);
  if (scenes) applyMask();
});
// Re-measure on release, not on every tick — each measure pulls tiles.
thresholdEl.addEventListener("change", async () => {
  if (!scenes) return;
  measured = await measureChange(ring, scenes.before.id, scenes.after.id, threshold());
  fillVerdict();
});

// ---------- verdict ----------

function fillVerdict() {
  if (!scenes || !stats || !measured) return;
  const { before, after } = scenes;

  const fill = (sel: string, scene: Scene, st: Stats) => {
    const card = $(sel);
    card.querySelector(".date")!.textContent = formatScene(scene);
    card.querySelector(".cloud")!.textContent = `${scene.cloud.toFixed(1)}% cloud · ${scene.platform}`;
    card.querySelector(".ndvi")!.textContent = `NDVI ${st.mean.toFixed(3)} mean · ${st.std.toFixed(3)} sd`;
    card.querySelector(".id")!.textContent = scene.id;
  };
  fill("scene-before", before, stats.before);
  fill("scene-after", after, stats.after);

  const head = $("headline");
  const { signal, ratio } = classify(measured);
  head.dataset.tone = signal === "directional" ? "" : "quiet";

  const where = site ? site.place : "this outline";
  const span = `${formatScene(before)} → ${formatScene(after)}`;
  head.innerHTML =
    signal === "none"
      ? `<span class="big">${measured.lossPct.toFixed(1)}%</span>` +
        `No meaningful loss at <b>${where}</b>, ${span}. This is what ground that was left alone looks like.`
      : signal === "noise"
        ? `<span class="big">${measured.lossPct.toFixed(1)}%</span>` +
          `lost cover at <b>${where}</b>, but gains almost match it. Symmetric change is season and sampling, not clearing.`
        : `<span class="big">${formatArea(measured.lossM2)}</span>` +
          `of <b>${where}</b> lost vegetation cover, ${span} — <b>${measured.lossPct.toFixed(1)}%</b> of the area, ` +
          `with losses outrunning gains <b>${ratio === Infinity ? "entirely" : `${ratio.toFixed(1)} : 1`}</b>.`;

  $("m-loss").textContent = formatArea(measured.lossM2);
  $("m-pct").textContent = `${measured.lossPct.toFixed(1)}%`;
  $("m-px").textContent = ratio === Infinity ? "loss only" : `${ratio.toFixed(1)} : 1`;

  const [w, s_, e, n] = bbox(ring);
  $("packet-coords").innerHTML =
    `Outline ${ring.length} corners · ${formatArea(ringArea(ring))}<br />` +
    `bbox ${w.toFixed(5)}, ${s_.toFixed(5)} → ${e.toFixed(5)}, ${n.toFixed(5)}` +
    (site && site.source.url
      ? `<br />Record: <a href="${site.source.url}" target="_blank" rel="noopener">${site.source.name}</a>`
      : "");
}

// ---------- track every year + brief ----------

const briefKey = () => (scenes ? `${JSON.stringify(ring)}|${scenes.before.id}|${threshold()}` : "");

/** A new verdict makes the old chart and letter wrong; take them down. */
function resetBrief() {
  $("brief-out").hidden = true;
  $("brief-status").hidden = true;
  if (sweepKey !== briefKey()) {
    $("chart-wrap").hidden = true;
  }
}

function renderChart() {
  if (!sweep) return;
  const worst = sweep.points.reduce<(typeof sweep.points)[number] | null>(
    (a, b) => (!a || b.lossPct > a.lossPct ? b : a),
    null,
  );
  $("chart").innerHTML = chartSvg(sweep, YEARS);
  $("chart-cap").innerHTML =
    `Lost cover each year against <b>${formatScene(sweep.baseline)}</b>` +
    (worst ? ` · worst <b>${worst.year}</b> at <b>${worst.lossPct.toFixed(1)}%</b>` : "") +
    (sweep.missing.length ? ` · no clear pass in ${sweep.missing.join(", ")}` : "");
  $("chart-wrap").hidden = false;
}

$("btn-brief").addEventListener("click", async () => {
  if (!scenes || !measured) return;
  const btn = $<HTMLButtonElement>("btn-brief");
  const status = $("brief-status");
  btn.disabled = true;
  status.hidden = false;
  status.dataset.tone = "busy";

  try {
    const key = briefKey();
    if (!sweep || sweepKey !== key) {
      sweep = await sweepYears(ring, scenes.before, YEARS, threshold(), (text, done, total) => {
        status.textContent = `${text} (${done}/${total})`;
      });
      sweepKey = key;
      renderChart();
    }

    status.textContent = "Writing the brief from these numbers…";
    const { signal, ratio } = classify(measured);
    const b = await writeBrief({
      place: site ? site.place : "the outlined area",
      record: site ? site.source : null,
      areaM2: ringArea(ring),
      threshold: threshold(),
      before: scenes.before,
      after: scenes.after,
      measure: measured,
      signal,
      ratio,
      sweep,
    });

    $("brief-finding").textContent = b.finding;
    $("brief-traj").textContent = b.trajectory;
    $("brief-next").textContent = b.next ? `Next: ${b.next}` : "";
    $<HTMLTextAreaElement>("complaint").value = b.complaint;
    $("brief-model").textContent = `Written by ${b.model} from the numbers above only. Read it before you send it.`;
    $("brief-out").hidden = false;
    status.hidden = true;
  } catch (err) {
    status.dataset.tone = "error";
    status.textContent = `Brief failed: ${(err as Error).message}`;
  } finally {
    btn.disabled = false;
  }
});

$("btn-copy").addEventListener("click", async () => {
  const text = $<HTMLTextAreaElement>("complaint").value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    $("btn-copy").textContent = "Copied";
    window.setTimeout(() => ($("btn-copy").textContent = "Copy"), 1600);
  } catch {
    $<HTMLTextAreaElement>("complaint").select();
  }
});

$("btn-again-year").addEventListener("click", () => show("when"));
$("btn-again-place").addEventListener("click", () => {
  resetMap();
  show("where");
});

// ---------- export ----------

$("btn-export").addEventListener("click", () => {
  if (!scenes || !stats || !measured) return;

  mapBefore.redraw();
  mapAfter.redraw();

  const html = packetHtml({
    ring,
    areaM2: ringArea(ring),
    before: scenes.before,
    after: scenes.after,
    beforeStats: stats.before,
    afterStats: stats.after,
    measure: measured,
    threshold: threshold(),
    images: {
      before: mapBefore.getCanvas().toDataURL("image/png"),
      after: mapAfter.getCanvas().toDataURL("image/png"),
    },
  });

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
});

// ---------- place search ----------

const results = $<HTMLUListElement>("results");

$("find").addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = $<HTMLInputElement>("q").value.trim();
  if (!query) return;

  results.hidden = false;
  results.innerHTML = "<li>Searching…</li>";

  try {
    const places = await geocode(query);
    if (!places.length) {
      results.innerHTML = "<li>Nothing found.</li>";
      return;
    }
    results.innerHTML = "";
    for (const place of places) {
      const li = document.createElement("li");
      li.textContent = place.label;
      li.addEventListener("click", () => {
        if (place.bbox) fitBox(place.bbox, 15.5);
        else mapAfter.flyTo({ center: [place.lon, place.lat], zoom: 14.5 });
        results.hidden = true;
        beginDrawing();
      });
      results.appendChild(li);
    }
  } catch (err) {
    results.innerHTML = `<li>${(err as Error).message}</li>`;
  }
});
