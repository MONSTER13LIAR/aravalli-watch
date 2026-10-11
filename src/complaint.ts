import type { Ring } from "./geo";
import type { Scene } from "./mpc";
import type { ChangeMeasure, Signal } from "./measure";

/**
 * A complaint letter built from a template, not a model. Law text and office
 * addresses must never depend on what a language model felt like writing, and
 * a template works with no network and no API key, in English and Hindi alike.
 *
 * The app never sends anything. It drafts; the visitor reads it and sends it.
 */

export type District = "gurugram" | "faridabad" | "delhi" | "other";
export type Lang = "en" | "hi";

export interface Office {
  district: District;
  name: { en: string; hi: string };
  /** Only where the address was read off the district's own contact page. */
  email: string | null;
  address: string | null;
  source: string | null;
}

/** Both addresses checked on the official contact pages on 11 Oct 2026. */
export const OFFICES: Record<District, Office> = {
  gurugram: {
    district: "gurugram",
    name: { en: "The Deputy Commissioner, Gurugram", hi: "उपायुक्त, गुरुग्राम" },
    email: "dcgrg@hry.nic.in",
    address: "1st Floor, Mini Secretariat, Near Rajeev Chowk, Gurugram-122001",
    source: "https://gurugram.gov.in/contact-us/",
  },
  faridabad: {
    district: "faridabad",
    name: { en: "The Deputy Commissioner, Faridabad", hi: "उपायुक्त, फरीदाबाद" },
    email: "dcfbd@hry.nic.in",
    address: "Deputy Commissioner Office, Block B, Mini Secretariat, First Floor, Sector-12, Faridabad",
    source: "https://faridabad.nic.in/contact-us/",
  },
  delhi: {
    district: "delhi",
    name: { en: "The concerned authority (Delhi), through CPGRAMS", hi: "संबंधित प्राधिकारी (दिल्ली), सीपीग्राम्स के माध्यम से" },
    email: null,
    address: null,
    source: null,
  },
  other: {
    district: "other",
    name: { en: "The Deputy Commissioner of the district", hi: "ज़िले के उपायुक्त" },
    email: null,
    address: null,
    source: null,
  },
};

export const CPGRAMS = "https://pgportal.gov.in/";

export interface Citation {
  en: string;
  hi: string;
  url: string;
  /** PLPA is a Haryana law; it says nothing about land in Delhi. */
  haryanaOnly: boolean;
}

export const CITATIONS: Citation[] = [
  {
    en: "Punjab Land Preservation Act, 1900, Section 4 (as applied in Haryana)",
    hi: "पंजाब भूमि संरक्षण अधिनियम, 1900, धारा 4 (हरियाणा में लागू)",
    url: "https://www.indiacode.nic.in/handle/123456789/21554",
    haryanaOnly: true,
  },
  {
    en: "M.C. Mehta v. Union of India (Kant Enclave), Supreme Court of India, 11 September 2018",
    hi: "एम.सी. मेहता बनाम भारत संघ (कांत एन्क्लेव), सर्वोच्च न्यायालय, 11 सितंबर 2018",
    url: "https://api.sci.gov.in/supremecourt/1985/63996/63996_1985_Judgement_11-Sep-2018.pdf",
    haryanaOnly: true,
  },
  {
    en: "Forest (Conservation) Act, 1980",
    hi: "वन (संरक्षण) अधिनियम, 1980",
    url: "https://www.indiacode.nic.in/handle/123456789/1760",
    haryanaOnly: false,
  },
];

export const citationsFor = (d: District) => CITATIONS.filter((c) => !c.haryanaOnly || d === "gurugram" || d === "faridabad");

export interface LetterInput {
  place: string;
  /** Hindi name of the place, where one is known. */
  placeHi?: string;
  district: District;
  ring: Ring;
  areaM2: number;
  before: Scene;
  after: Scene;
  measure: ChangeMeasure;
  signal: Signal;
  ratio: number;
}

const HI_MONTHS = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const day = (s: Scene, lang: Lang) => {
  const d = new Date(s.datetime);
  const m = (lang === "hi" ? HI_MONTHS : EN_MONTHS)[d.getUTCMonth()];
  return `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}`;
};

const ha = (m2: number) => (m2 / 10_000).toFixed(2);
const ratioText = (r: number) => (r === Infinity ? "loss only" : `${r.toFixed(1)} : 1`);
const ratioHi = (r: number) => (r === Infinity ? "केवल घटत" : `${r.toFixed(1)} : 1`);

export function centreOf(ring: Ring): [number, number] {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

const latLon = ([lon, lat]: [number, number]) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

/** More ground gained cover than lost it: say so, never call that "close to equal". */
const gainsLead = (p: LetterInput) => p.ratio < 0.67;

export function subject(p: LetterInput, lang: Lang): string {
  const place = lang === "hi" ? p.placeHi ?? p.place : p.place;
  if (p.signal === "directional") {
    return lang === "hi"
      ? `${place} में हरियाली घटने की जाँच हेतु अनुरोध (उपग्रह रिकॉर्ड)`
      : `Request to inspect loss of vegetation cover at ${place} (satellite record)`;
  }
  return lang === "hi"
    ? `${place} में हरियाली की ज़मीनी पुष्टि हेतु अनुरोध (उपग्रह रिकॉर्ड)`
    : `Request to verify vegetation cover at ${place} (satellite record)`;
}

/** The full letter. Every number comes from the measurement on screen. */
export function letter(p: LetterInput, lang: Lang): string {
  return lang === "hi" ? letterHi(p) : letterEn(p);
}

function letterEn(p: LetterInput): string {
  const office = OFFICES[p.district];
  const haryana = p.district === "gurugram" || p.district === "faridabad";
  const m = p.measure;
  const corners = p.ring.map((c, i) => `  ${i + 1}. ${latLon(c)}`).join("\n");

  const reading =
    p.signal === "directional"
      ? `Losses are ${ratioText(p.ratio)} against gains. That pattern fits clearing, dumping or construction more than a change of season. The record shows that the ground changed; it does not show who changed it.`
      : p.signal === "noise"
        ? (gainsLead(p)
            ? `More ground gained cover than lost it (loss to gain ${ratioText(p.ratio)}). Change in both directions like this usually comes from season and image differences, not from clearing.`
            : `Losses and gains are close to equal (${ratioText(p.ratio)}). That pattern usually comes from season and image differences, not from clearing.`) +
          " This letter does not allege illegal clearing. It asks only for a check on the ground."
        : `Very little change was measured (${m.lossPct.toFixed(1)}% of the area). This letter asks only for a routine check.`;

  const law = haryana
    ? [
        "Law:",
        "Where the land is notified under Section 4 of the Punjab Land Preservation Act, 1900 (PLPA), the Supreme Court held in M.C. Mehta v. Union of India (Kant Enclave), 11 September 2018, that land notified under the PLPA must be treated as \"forest\" and \"forest land\". The Forest (Conservation) Act, 1980 then governs any non-forest use of it. I do not know whether this parcel is notified; your office's records will show that.",
      ]
    : p.district === "delhi"
      ? [
          "Note:",
          "This area lies in Delhi, not in a Haryana district, so I am filing through CPGRAMS. If the land is recorded as forest land, the Forest (Conservation) Act, 1980 governs any non-forest use of it.",
        ]
      : [];

  const asks =
    p.signal === "directional"
      ? [
          haryana ? "1. Check whether this land is notified under Section 4 PLPA." : "1. Check how this land is recorded (forest or protected land).",
          "2. Inspect the site and record what has changed.",
          "3. If the land is protected and the change was not permitted, act under the law above.",
          "4. Tell me what was found and what was done.",
        ]
      : [
          haryana ? "1. Check whether this land is notified under Section 4 PLPA." : "1. Check how this land is recorded (forest or protected land).",
          "2. Verify on the ground that the cover is intact.",
          "3. Tell me what was found.",
        ];

  const sources = citationsFor(p.district).map((c) => `- ${c.en}: ${c.url}`);

  return [
    `Subject: ${subject(p, "en")}`,
    "",
    "To",
    office.name.en,
    ...(office.address ? [office.address] : []),
    "",
    "Sir/Madam,",
    "",
    p.signal === "directional"
      ? "I am reporting a loss of vegetation cover inside the area below, measured from Copernicus Sentinel-2 satellite images (European Space Agency), and I request an inspection."
      : "I request a check on the ground of the area below. I compared its vegetation cover in two Copernicus Sentinel-2 satellite images (European Space Agency); the numbers are below.",
    "",
    `Place: ${p.place}`,
    `Centre: ${latLon(centreOf(p.ring))}`,
    "Outline corners (latitude, longitude):",
    corners,
    "",
    `Before: ${day(p.before, "en")}, scene ${p.before.id}`,
    `After: ${day(p.after, "en")}, scene ${p.after.id}`,
    "",
    `Measured: ${ha(m.lossM2)} ha of the ${ha(p.areaM2)} ha area lost vegetation cover (${m.lossPct.toFixed(1)}%). ${ha(m.gainM2)} ha gained cover. Loss to gain: ${ratioText(p.ratio)}.`,
    "",
    reading,
    "",
    ...(law.length ? [...law, ""] : []),
    "I request that you:",
    ...asks,
    "",
    "The full record (both images, scene ids, method) is in the attached evidence packet. Anyone can re-check these numbers from the public Sentinel-2 archive.",
    "",
    "Yours faithfully,",
    "[Your name]",
    "[Address and phone]",
    "[Date]",
    "",
    "Sources:",
    ...sources,
  ].join("\n");
}

function letterHi(p: LetterInput): string {
  const office = OFFICES[p.district];
  const haryana = p.district === "gurugram" || p.district === "faridabad";
  const m = p.measure;
  const corners = p.ring.map((c, i) => `  ${i + 1}. ${latLon(c)}`).join("\n");

  const reading =
    p.signal === "directional"
      ? `घटत, बढ़त की तुलना में ${ratioHi(p.ratio)} है। यह स्वरूप मौसम के बदलाव से ज़्यादा कटाई, मलबा डालने या निर्माण से मेल खाता है। यह रिकॉर्ड बताता है कि ज़मीन बदली है, यह नहीं कि किसने बदली।`
      : p.signal === "noise"
        ? (gainsLead(p)
            ? `जितनी ज़मीन पर हरियाली घटी, उससे ज़्यादा पर बढ़ी (घटत और बढ़त का अनुपात ${ratioHi(p.ratio)})। दोनों तरफ़ ऐसा बदलाव आमतौर पर मौसम और तस्वीरों के अंतर से होता है, कटाई से नहीं।`
            : `घटत और बढ़त लगभग बराबर हैं (${ratioHi(p.ratio)})। ऐसा आमतौर पर मौसम और तस्वीरों के अंतर से होता है, कटाई से नहीं।`) +
          " यह पत्र अवैध कटाई का आरोप नहीं है। अनुरोध केवल ज़मीन पर जाँच का है।"
        : `बहुत कम बदलाव मापा गया (क्षेत्र का ${m.lossPct.toFixed(1)}%)। यह पत्र केवल सामान्य जाँच का अनुरोध करता है।`;

  const law = haryana
    ? [
        "क़ानून:",
        "जहाँ यह भूमि पंजाब भूमि संरक्षण अधिनियम, 1900 (PLPA) की धारा 4 के तहत अधिसूचित है, वहाँ सर्वोच्च न्यायालय ने एम.सी. मेहता बनाम भारत संघ (कांत एन्क्लेव), 11 सितंबर 2018 के फ़ैसले में कहा है कि PLPA के तहत अधिसूचित भूमि को \"वन\" और \"वन भूमि\" माना जाएगा। ऐसी भूमि के किसी भी गैर-वन उपयोग पर वन (संरक्षण) अधिनियम, 1980 लागू होता है। यह भूमि अधिसूचित है या नहीं, यह आपके कार्यालय के रिकॉर्ड से पता चलेगा।",
      ]
    : p.district === "delhi"
      ? [
          "टिप्पणी:",
          "यह क्षेत्र दिल्ली में है, हरियाणा के किसी ज़िले में नहीं, इसलिए यह शिकायत सीपीग्राम्स पर दर्ज की जा रही है। यदि यह भूमि वन भूमि के रूप में दर्ज है, तो इसके किसी भी गैर-वन उपयोग पर वन (संरक्षण) अधिनियम, 1980 लागू होता है।",
        ]
      : [];

  const asks =
    p.signal === "directional"
      ? [
          haryana ? "1. जाँच करें कि यह भूमि PLPA की धारा 4 के तहत अधिसूचित है या नहीं।" : "1. जाँच करें कि यह भूमि किस रूप में दर्ज है (वन या संरक्षित भूमि)।",
          "2. स्थल का निरीक्षण करके बदलाव दर्ज करें।",
          "3. यदि भूमि संरक्षित है और बदलाव बिना अनुमति हुआ है, तो ऊपर दिए गए क़ानून के तहत कार्रवाई करें।",
          "4. जाँच में क्या मिला और क्या कार्रवाई हुई, इसकी जानकारी दें।",
        ]
      : [
          haryana ? "1. जाँच करें कि यह भूमि PLPA की धारा 4 के तहत अधिसूचित है या नहीं।" : "1. जाँच करें कि यह भूमि किस रूप में दर्ज है (वन या संरक्षित भूमि)।",
          "2. ज़मीन पर जाकर पुष्टि करें कि हरियाली सुरक्षित है।",
          "3. जाँच में क्या मिला, इसकी जानकारी दें।",
        ];

  const sources = citationsFor(p.district).map((c) => `- ${c.hi}: ${c.url}`);

  return [
    `विषय: ${subject(p, "hi")}`,
    "",
    "सेवा में,",
    office.name.hi,
    ...(office.address ? [office.address] : []),
    "",
    "महोदय/महोदया,",
    "",
    p.signal === "directional"
      ? "इस पत्र द्वारा नीचे दिए गए क्षेत्र में हरियाली (वनस्पति आवरण) घटने की सूचना दी जा रही है और स्थल निरीक्षण का अनुरोध किया जा रहा है। यह माप यूरोपीय अंतरिक्ष एजेंसी के कोपरनिकस सेंटिनल-2 उपग्रह की तस्वीरों से लिया गया है।"
      : "इस पत्र द्वारा नीचे दिए गए क्षेत्र की ज़मीनी जाँच का अनुरोध किया जा रहा है। यूरोपीय अंतरिक्ष एजेंसी के कोपरनिकस सेंटिनल-2 उपग्रह की दो तस्वीरों में इस क्षेत्र की हरियाली की तुलना की गई है; आँकड़े नीचे दिए गए हैं।",
    "",
    `स्थान: ${p.placeHi ?? p.place}`,
    `केंद्र बिंदु: ${latLon(centreOf(p.ring))}`,
    "सीमा के कोने (अक्षांश, देशांतर):",
    corners,
    "",
    `पहले की तस्वीर: ${day(p.before, "hi")}, दृश्य ${p.before.id}`,
    `बाद की तस्वीर: ${day(p.after, "hi")}, दृश्य ${p.after.id}`,
    "",
    `माप: ${ha(p.areaM2)} हेक्टेयर क्षेत्र में से ${ha(m.lossM2)} हेक्टेयर (${m.lossPct.toFixed(1)}%) में हरियाली घटी। ${ha(m.gainM2)} हेक्टेयर में हरियाली बढ़ी। घटत और बढ़त का अनुपात: ${ratioHi(p.ratio)}।`,
    "",
    reading,
    "",
    ...(law.length ? [...law, ""] : []),
    "अनुरोध है कि:",
    ...asks,
    "",
    "पूरा रिकॉर्ड (दोनों तस्वीरें, दृश्य आईडी, तरीका) संलग्न साक्ष्य पैकेट में है। सेंटिनल-2 के सार्वजनिक संग्रह से कोई भी इन आँकड़ों की दोबारा जाँच कर सकता है।",
    "",
    "भवदीय,",
    "[आपका नाम]",
    "[पता और फ़ोन]",
    "[तारीख]",
    "",
    "स्रोत:",
    ...sources,
  ].join("\n");
}

/**
 * The email version. Some mail apps cut a mailto body at about 2,000
 * characters, so this carries only the numbers and the ask; the packet
 * the visitor attaches carries the rest.
 */
export function mailto(p: LetterInput, lang: Lang): string | null {
  const office = OFFICES[p.district];
  if (!office.email) return null;
  const m = p.measure;
  const c = latLon(centreOf(p.ring));
  const body =
    lang === "hi"
      ? [
          // Every Devanagari letter is nine characters once URL-encoded, so the Hindi body is cut harder.
          "महोदय/महोदया,",
          "",
          `${p.placeHi ?? p.place} (${c}) के स्थल निरीक्षण का अनुरोध है। सेंटिनल-2 तस्वीरें: ${day(p.before, "hi")} (${p.before.id}) और ${day(p.after, "hi")} (${p.after.id})। ${ha(p.areaM2)} हे. में से ${ha(m.lossM2)} हे. में हरियाली घटी; घटत:बढ़त ${ratioHi(p.ratio)}।`,
          p.signal === "directional"
            ? "यह मौसम से ज़्यादा कटाई या मलबे जैसा बदलाव है।"
            : "यह अवैध कटाई का आरोप नहीं, केवल पुष्टि का अनुरोध है।",
          "जहाँ भूमि PLPA धारा 4 में अधिसूचित है, वह वन भूमि है (एम.सी. मेहता बनाम भारत संघ, सर्वोच्च न्यायालय, 11.09.2018)।",
          "पूरा रिकॉर्ड संलग्न पैकेट में है।",
          "",
          "भवदीय,",
          "[आपका नाम]",
        ]
      : [
          "Sir/Madam,",
          "",
          `I request an inspection of ${p.place} (${c}). Sentinel-2 satellite images of ${day(p.before, "en")} (${p.before.id}) and ${day(p.after, "en")} (${p.after.id}) show ${ha(m.lossM2)} ha of ${ha(p.areaM2)} ha lost vegetation cover; loss to gain ${ratioText(p.ratio)}.`,
          p.signal === "directional"
            ? "The pattern fits clearing or dumping more than season."
            : gainsLead(p)
              ? "More ground gained cover than lost it; this is not an allegation of illegal clearing, only a request to verify."
              : "Losses and gains are nearly equal; this is not an allegation of illegal clearing, only a request to verify.",
          "Where the land is notified under Section 4 PLPA, it is forest land (M.C. Mehta v. Union of India, Supreme Court, 11 Sep 2018).",
          "The full record is in the attached evidence packet.",
          "",
          "Yours faithfully,",
          "[Your name]",
        ];
  const q = `subject=${encodeURIComponent(subject(p, lang))}&body=${encodeURIComponent(body.join("\n"))}`;
  return `mailto:${office.email}?${q}`;
}

