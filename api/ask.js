/**
 * Ask the map. The model never measures anything: it asks the page to run
 * comparisons (stage 1), the page runs them with the same code as the verdict,
 * and the model answers from the returned numbers (stage 2).
 */

const API = "https://api.featherless.ai/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

const ORIGINS = [
  "https://monster13liar.github.io",
  "https://aravalli-watch.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const SYSTEM = `You answer questions about vegetation loss in India's Aravalli hills using ONLY measurements the page makes from Copernicus Sentinel-2 imagery. You cannot see images and you cannot measure anything yourself.

TOOL — the page can run one comparison per action:
{"tool":"compare","site":"<one of the site ids in CONTEXT.sites, or \\"current\\" for the area on screen>","then":<year>,"now":<year or "latest">}
"then" must be earlier than "now". Years available are in CONTEXT.years. Unless the question names a year, use then 2019 and now 2025 — the page's defaults — so your answer matches what is on screen. "latest" means the most recent November–December season and may be used only when the question itself says now, today, latest, current or recent. Every comparison is a November–December pass against another, pinned to one satellite tile, and returns hectares and percent of cover lost and gained, and the loss-to-gain ratio. The control site is untouched ridge forest: if it shows loss too, the loss is season or haze, not clearing.

STAGE 1 (no RESULTS yet): if CONTEXT already holds every number you need, answer. Otherwise reply with the comparisons to run — at most 3 — as
{"actions":[...], "why":"<one short sentence>"}
STAGE 2 (RESULTS present): answer. Never request more comparisons once RESULTS are present; if something is missing, say so inside the answer.

ANSWER FORMAT: {"answer":"<2-4 plain sentences, quoting the figures you rely on with their years>"}

RULES:
- Every number, year and place in your answer must come from CONTEXT or RESULTS. Never invent, estimate or extrapolate.
- Never say who caused a change, and never speculate about intent.
- A higher loss-to-gain ratio means the change ran more one way (more like clearing); a ratio near 1 means loss and gain balanced (more like season). "loss only" means nothing was gained.
- If the question cannot be answered from measurements of vegetation cover, say so in one sentence and suggest what could be measured instead.
- Plain English, no bullet points, no headings, no emoji, no markdown. Output a single JSON object and nothing else.`;

const parse = (raw) => {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("model returned no JSON");
  return JSON.parse(text.slice(start, end + 1));
};

const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : v);

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

  const body = req.body ?? {};
  const question = clip(body.question, 400);
  if (typeof question !== "string" || !question.trim()) return res.status(400).json({ error: "no question" });
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const results = Array.isArray(body.results) ? body.results.slice(0, 3) : null;
  // The page is the only thing that should be talking to this; keep its payload honest in size.
  if (JSON.stringify(context).length > 12000 || JSON.stringify(results ?? []).length > 6000) {
    return res.status(413).json({ error: "context too large" });
  }

  const user =
    `QUESTION: ${question}\n\nCONTEXT:\n${JSON.stringify(context, null, 1)}` +
    (results ? `\n\nRESULTS (the comparisons you asked for are done — answer now, do not request more):\n${JSON.stringify(results, null, 1)}` : "");

  try {
    const model = process.env.FEATHERLESS_MODEL || DEFAULT_MODEL;
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!r.ok) throw new Error(`featherless ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    const out = parse(data.choices?.[0]?.message?.content ?? "");

    if (Array.isArray(out.actions) && !results) {
      // The model is told which years to use; it does not always listen. Enforce it here:
      // "latest" only when the question asks for now, otherwise a year the question names,
      // otherwise the page's default pair.
      const years = Array.isArray(context.years) ? context.years.filter(Number.isFinite) : [];
      const maxYear = years.length ? Math.max(...years) : 2025;
      const named = (question.match(/\b(20[12]\d)\b/g) ?? []).map(Number).filter((y) => years.includes(y));
      const wantsNow = /\b(now|today|latest|current|currently|recent|recently|this year)\b/i.test(question);
      const fix = (a) => {
        if (a.now === "latest" && !wantsNow) {
          const later = named.filter((y) => y > a.then);
          a.now = later.length ? Math.max(...later) : maxYear;
        }
        if (!named.length && !wantsNow) {
          a.then = 2019;
          a.now = maxYear;
        }
        return a;
      };
      const actions = out.actions
        .filter((a) => a && a.tool === "compare")
        .slice(0, 3)
        .map((a) => ({
          tool: "compare",
          site: clip(String(a.site ?? "current"), 40),
          then: Number(a.then),
          now: a.now === "latest" ? "latest" : Number(a.now),
        }))
        .filter((a) => Number.isFinite(a.then) && (a.now === "latest" || Number.isFinite(a.now)))
        .map(fix)
        .filter((a) => a.now === "latest" || a.then < a.now);
      if (actions.length) return res.json({ actions, why: clip(String(out.why ?? ""), 200), model });
    }
    if (typeof out.answer === "string" && out.answer.trim()) {
      return res.json({ answer: out.answer, model });
    }
    throw new Error("model returned neither actions nor an answer");
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
