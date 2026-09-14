/**
 * Evidence brief. The browser sends the numbers it already measured; the model
 * turns them into plain language and a complaint draft. The key never leaves
 * this function, and the model is told to use only what it is given.
 */

const API = "https://api.featherless.ai/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

const ORIGINS = [
  "https://monster13liar.github.io",
  "https://aravalli-watch.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const SYSTEM = `You write evidence briefs for residents, journalists and lawyers documenting loss of vegetation cover in India's Aravalli hills. The measurements were made from Copernicus Sentinel-2 imagery and are already computed. You receive them as FACTS.

RULES:
- Every number, date, place name and scene id you write must come from FACTS. Never invent, estimate or round beyond what is given.
- Never say who caused the change, and never speculate about intent. The measurement shows that the ground changed, not who changed it.
- A higher loss-to-gain ratio means the change ran more one way (more like clearing); a ratio near 1 means loss and gain balanced (more like season). "loss only" means nothing was gained.
- Plain English, short sentences. No bullet points, no headings, no emoji, no markdown.
- If "series" is empty or has one entry, say plainly that one comparison cannot show a trend.
- "summary" already names the worst year and the biggest year-on-year step. Take superlatives from it; never work them out yourself. Never call any other year the highest.

OUTPUT: a single JSON object and nothing else:
{"finding": "<2-3 sentences: what changed, where, between which two dates, quoting hectares and the percentage>",
 "trajectory": "<1-2 sentences: from the series, which year the loss stepped up most and how the trend reads, quoting figures>",
 "complaint": "<a formal complaint of 160-230 words. Begin 'To the Deputy Commissioner and the District Forest Officer,'. Name the place. State the measured loss with both dates and both Sentinel-2 scene ids. If a published record is given, cite it by name. Request a site inspection and, where the land is notified under the Punjab Land Preservation Act, 1900, action under it. Close by stating the limits: the measurement records change on the ground at 10 m resolution, not who caused it, and the outline is indicative. Write it as 3-4 short paragraphs separated by blank lines (\\n\\n). End with 'Yours faithfully,' then a blank line for the name.>",
 "next": "<1 sentence: the single most useful next comparison to run, e.g. a neighbouring year or the control area>"}`;

const parse = (raw) => {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("model returned no JSON");
  return JSON.parse(text.slice(start, end + 1));
};

const num = (v) => typeof v === "number" && Number.isFinite(v);

const HINDI = `You translate a formal environmental complaint from English into Hindi (Devanagari script) for a resident to file. Same facts, same structure, same paragraph breaks (blank lines). Keep every number in Western digits exactly as written. Keep Sentinel-2 scene ids, place names and publication names in Latin script exactly as written. Render 'Punjab Land Preservation Act, 1900' as 'पंजाब भूमि संरक्षण अधिनियम, 1900'. Open with 'उपायुक्त एवं जिला वन अधिकारी महोदय,' and end with 'भवदीय,' followed by a blank line. Add nothing, drop nothing. Output a single JSON object and nothing else: {"complaintHindi": "<the translation>"}`;

/** Second, separate call: Devanagari is token-heavy and would push the main brief past the function's time limit. */
async function translate(key, model, complaint) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1400,
      messages: [
        { role: "system", content: HINDI },
        { role: "user", content: complaint },
      ],
    }),
  });
  if (!r.ok) throw new Error(`featherless ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const out = parse((await r.json()).choices?.[0]?.message?.content ?? "");
  if (!out.complaintHindi) throw new Error("no translation came back");
  return String(out.complaintHindi);
}

/** Only the shape the page sends. Anything else is dropped before it reaches the model. */
function facts(body) {
  const f = body?.facts;
  if (!f || typeof f !== "object") return null;
  const scene = (s) =>
    s && typeof s.id === "string" && typeof s.date === "string" && num(s.cloud)
      ? { id: s.id.slice(0, 80), date: s.date.slice(0, 40), cloud: s.cloud }
      : null;
  const point = (p) =>
    p && num(p.lossHa) && num(p.lossPct) && num(p.gainHa)
      ? {
          year: String(p.year).slice(0, 12),
          date: String(p.date ?? "").slice(0, 40),
          id: String(p.id ?? "").slice(0, 80),
          lossHa: p.lossHa,
          lossPct: p.lossPct,
          gainHa: p.gainHa,
          ratio: num(p.ratio) ? p.ratio : null,
        }
      : null;
  const baseline = scene(f.baseline);
  const current = scene(f.current);
  if (!baseline || !current || !num(f.lossHa) || !num(f.lossPct) || !num(f.areaHa)) return null;
  const sm = f.summary;
  const summary =
    sm && num(sm.worstLossHa) && num(sm.worstLossPct)
      ? {
          worstYear: String(sm.worstYear).slice(0, 12),
          worstLossHa: sm.worstLossHa,
          worstLossPct: sm.worstLossPct,
          biggestStep:
            sm.biggestStep && num(sm.biggestStep.deltaHa)
              ? { from: String(sm.biggestStep.from).slice(0, 12), to: String(sm.biggestStep.to).slice(0, 12), deltaHa: sm.biggestStep.deltaHa }
              : null,
        }
      : null;
  return {
    place: String(f.place ?? "the outlined area").slice(0, 120),
    summary,
    record: f.record && typeof f.record.name === "string" ? { name: f.record.name.slice(0, 160) } : null,
    areaHa: f.areaHa,
    threshold: num(f.threshold) ? f.threshold : null,
    baseline,
    current,
    lossHa: f.lossHa,
    lossPct: f.lossPct,
    gainHa: num(f.gainHa) ? f.gainHa : null,
    ratio: num(f.ratio) ? f.ratio : null,
    signal: ["none", "noise", "directional"].includes(f.signal) ? f.signal : "unknown",
    series: Array.isArray(f.series) ? f.series.map(point).filter(Boolean).slice(0, 12) : [],
    resolutionM: 10,
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin ?? "";
  if (ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const key = process.env.FEATHERLESS_API_KEY;
  if (!key) return res.status(500).json({ error: "FEATHERLESS_API_KEY is not set" });

  const model = process.env.FEATHERLESS_MODEL || DEFAULT_MODEL;

  if (req.body?.mode === "hindi") {
    const complaint = typeof req.body.complaint === "string" ? req.body.complaint.slice(0, 2500) : "";
    if (!complaint.trim()) return res.status(400).json({ error: "no complaint to translate" });
    try {
      return res.json({ complaintHindi: await translate(key, model, complaint), model });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  const f = facts(req.body);
  if (!f) return res.status(400).json({ error: "bad facts" });

  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: "FACTS:\n" + JSON.stringify(f, null, 1) },
        ],
      }),
    });
    if (!r.ok) throw new Error(`featherless ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    const out = parse(data.choices?.[0]?.message?.content ?? "");
    if (!out.finding || !out.complaint) throw new Error("incomplete answer");
    res.json({
      finding: String(out.finding),
      trajectory: String(out.trajectory ?? ""),
      complaint: String(out.complaint),
      next: String(out.next ?? ""),
      model,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
