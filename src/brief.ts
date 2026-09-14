import type { Scene } from "./mpc";
import type { ChangeMeasure, Signal } from "./measure";
import type { Sweep } from "./sweep";
import { formatScene } from "./mpc";

/** The Vercel build talks to itself; the Pages build and local dev talk to the Vercel deployment. */
const API_BASE = location.hostname.endsWith("vercel.app") ? "" : "https://aravalli-watch.vercel.app";

export interface Brief {
  finding: string;
  trajectory: string;
  complaint: string;
  next: string;
  model: string;
}

export interface BriefInput {
  place: string;
  record: { name: string; url: string } | null;
  areaM2: number;
  threshold: number;
  before: Scene;
  after: Scene;
  measure: ChangeMeasure;
  signal: Signal;
  ratio: number;
  sweep: Sweep | null;
}

const ha = (m2: number) => Math.round(m2 / 100) / 100;

export async function writeBrief(input: BriefInput): Promise<Brief> {
  const scene = (s: Scene) => ({ id: s.id, date: formatScene(s), cloud: s.cloud });
  const pts = input.sweep?.points ?? [];
  const worst = pts.reduce<(typeof pts)[number] | null>((a, b) => (!a || b.lossM2 > a.lossM2 ? b : a), null);
  let step: { from: number; to: number; deltaHa: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].lossM2 - pts[i - 1].lossM2;
    if (!step || d > step.deltaHa * 10000) step = { from: pts[i - 1].year, to: pts[i].year, deltaHa: ha(d) };
  }
  // Superlatives are computed here, not by the model — it only has to phrase them.
  const summary = worst
    ? { worstYear: worst.year, worstLossHa: ha(worst.lossM2), worstLossPct: Math.round(worst.lossPct * 10) / 10, biggestStep: step }
    : null;

  const facts = {
    place: input.place,
    summary,
    record: input.record && input.record.url ? { name: input.record.name } : null,
    areaHa: ha(input.areaM2),
    threshold: input.threshold,
    baseline: scene(input.before),
    current: scene(input.after),
    lossHa: ha(input.measure.lossM2),
    lossPct: Math.round(input.measure.lossPct * 10) / 10,
    gainHa: ha(input.measure.gainM2),
    ratio: input.ratio === Infinity ? null : Math.round(input.ratio * 10) / 10,
    signal: input.signal,
    series: (input.sweep?.points ?? []).map((p) => ({
      year: p.year,
      date: formatScene(p.scene),
      id: p.scene.id,
      lossHa: ha(p.lossM2),
      lossPct: Math.round(p.lossPct * 10) / 10,
      gainHa: ha(p.gainM2),
      ratio: p.ratio === Infinity ? null : Math.round(p.ratio * 10) / 10,
    })),
  };

  const res = await fetch(`${API_BASE}/api/brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `brief failed (${res.status})`);
  return data as Brief;
}

/** The Hindi version is a second call, made only when someone asks for it. */
export async function translateComplaint(complaint: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "hindi", complaint }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `translation failed (${res.status})`);
  return String(data.complaintHindi ?? "");
}
