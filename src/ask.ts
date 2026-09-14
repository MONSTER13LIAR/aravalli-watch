import { formatScene, type Scene } from "./mpc";
import type { ChangeMeasure } from "./measure";
import type { Sweep } from "./sweep";
import type { Scan } from "./scan";
import type { Site } from "./presets";

const API_BASE = location.hostname.endsWith("vercel.app") ? "" : "https://aravalli-watch.vercel.app";

export interface Action {
  tool: "compare";
  site: string;
  then: number;
  now: number | "latest";
}

export interface Comparison {
  before: Scene;
  after: Scene;
  measure: ChangeMeasure;
  ratio: number;
}

export interface AskContext {
  sites: Site[];
  years: number[];
  current: { place: string; then: number; now: number | "latest"; comparison: Comparison } | null;
  sweep: Sweep | null;
  scan: Scan | null;
}

export interface Answer {
  answer: string;
  ran: { action: Action; place: string; result: string }[];
}

const ha = (m2: number) => Math.round(m2 / 100) / 100;

const summarise = (c: Comparison) => ({
  before: formatScene(c.before),
  after: formatScene(c.after),
  lossHa: ha(c.measure.lossM2),
  lossPct: Math.round(c.measure.lossPct * 10) / 10,
  gainHa: ha(c.measure.gainM2),
  ratio: c.ratio === Infinity ? "loss only" : Math.round(c.ratio * 10) / 10,
});

function contextJson(ctx: AskContext) {
  return {
    sites: ctx.sites.map((s) => ({ id: s.id, place: s.place, kind: s.kind })),
    years: ctx.years,
    current: ctx.current
      ? { place: ctx.current.place, then: ctx.current.then, now: ctx.current.now, ...summarise(ctx.current.comparison) }
      : null,
    series: ctx.sweep
      ? ctx.sweep.points.map((p) => ({ year: p.year, lossHa: ha(p.lossM2), lossPct: Math.round(p.lossPct * 10) / 10 }))
      : null,
    hotspots: ctx.scan
      ? ctx.scan.hotspots.slice(0, 6).map((c, i) => ({
          rank: i + 1,
          lat: Number(c.centre[1].toFixed(4)),
          lon: Number(c.centre[0].toFixed(4)),
          lossPct: Math.round(c.lossPct),
        }))
      : null,
  };
}

async function call(body: unknown) {
  const res = await fetch(`${API_BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `ask failed (${res.status})`);
  return data as { answer?: string; actions?: Action[]; why?: string };
}

/**
 * Two round trips at most. The model asks for comparisons, `run` performs
 * them with the verdict's own code, and the model answers from what came back.
 */
export async function askMap(
  question: string,
  ctx: AskContext,
  run: (a: Action) => Promise<{ place: string; comparison: Comparison | null; error?: string }>,
  onProgress: (text: string) => void,
): Promise<Answer> {
  const context = contextJson(ctx);
  onProgress("Reading the question…");
  const first = await call({ question, context });
  if (first.answer) return { answer: first.answer, ran: [] };

  const actions = first.actions ?? [];
  const ran: Answer["ran"] = [];
  const results: unknown[] = [];
  onProgress(
    `Comparing ${actions.map((a) => `${a.site === "current" ? "the area on screen" : a.site} ${a.then} → ${a.now}`).join(", ")}…`,
  );
  // Side by side, not one after another: each comparison is mostly waiting on the tiler.
  const outcomes = await Promise.all(actions.map((a) => run(a)));
  for (const [i, r] of outcomes.entries()) {
    const a = actions[i];
    if (r.comparison) {
      const s = summarise(r.comparison);
      results.push({ site: a.site, place: r.place, then: a.then, now: a.now, ...s });
      ran.push({ action: a, place: r.place, result: `${s.lossHa} ha lost (${s.lossPct}%), loss:gain ${s.ratio}` });
    } else {
      results.push({ site: a.site, place: r.place, then: a.then, now: a.now, error: r.error ?? "no clear pass" });
      ran.push({ action: a, place: r.place, result: r.error ?? "no clear pass" });
    }
  }

  onProgress("Answering from the numbers…");
  const second = await call({ question, context, results });
  if (!second.answer) throw new Error("no answer came back");
  return { answer: second.answer, ran };
}
