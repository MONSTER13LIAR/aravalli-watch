import type { Ring } from "./geo";

export interface Site {
  id: string;
  /** What the button says. Numbered so a first-time visitor has nothing to decide. */
  label: string;
  place: string;
  /** The same place in Hindi, for the Hindi letter. */
  placeHi: string;
  blurb: string;
  source: { name: string; url: string };
  kind: "loss" | "control";
  ring: Ring;
  /** Which district office a complaint goes to. Checked against OpenStreetMap boundaries. */
  district?: "gurugram" | "faridabad" | "delhi";
}

/** About 1 km² centred on a gazetteer point — indicative, not a surveyed boundary. */
const around = (lon: number, lat: number, half = 0.005): Ring => [
  [lon - half, lat + half],
  [lon + half, lat + half],
  [lon + half, lat - half],
  [lon - half, lat - half],
];

/**
 * Pre-marked areas. Every one is a named place with a published record of what
 * happened there, and every outline was checked against the imagery before it
 * went in. The control exists to show the method reporting near-zero loss on
 * ground that did not change — without it, a red map proves nothing.
 */
export const SITES: Site[] = [
  {
    id: "bandhwari",
    label: "Pre-marked area 1",
    place: "Bandhwari landfill",
    placeHi: "बंधवाड़ी लैंडफ़िल, गुरुग्राम",
    blurb:
      "The waste mountain on the Gurugram–Faridabad road. Residents watch trucks dump construction debris into the hills every night.",
    source: {
      name: "The Tribune, Debris mounds in Aravallis",
      url: "https://www.tribuneindia.com/news/haryana/debris-mounds-in-aravallis-pose-flash-flood-threat-in-gurugram-faridabad-401914",
    },
    district: "gurugram",
    kind: "loss",
    ring: [
      [77.1668, 28.4062],
      [77.1782, 28.4062],
      [77.1782, 28.3978],
      [77.1668, 28.3978],
    ],
  },
  {
    id: "anangpur",
    label: "Pre-marked area 2",
    place: "Anangpur farmhouse belt",
    placeHi: "अनंगपुर फ़ार्महाउस क्षेत्र, फरीदाबाद",
    blurb:
      "6,793 unauthorised structures mapped across 786 acres of protected Aravalli land in four Faridabad villages. Bulldozers arrived in June 2025.",
    source: {
      name: "ThePrint, 6 Aug 2025",
      url: "https://theprint.in/ground-reports/faridabad-farmhouses-vs-aravallis-isnt-over-its-a-war-that-has-just-begun/2714813/",
    },
    district: "faridabad",
    kind: "loss",
    ring: around(77.2688, 28.4625),
  },
  {
    id: "ankhir",
    label: "Pre-marked area 3",
    place: "Ankhir, Faridabad",
    placeHi: "अनखीर, फरीदाबाद",
    blurb:
      "One of the same four villages. The settlement edge keeps advancing up the ridge, one plot at a time.",
    source: {
      name: "ThePrint, 6 Aug 2025",
      url: "https://theprint.in/ground-reports/faridabad-farmhouses-vs-aravallis-isnt-over-its-a-war-that-has-just-begun/2714813/",
    },
    district: "faridabad",
    kind: "loss",
    ring: around(77.2867, 28.4235),
  },
  {
    id: "control",
    label: "Control area",
    place: "Ridge forest, untouched",
    placeHi: "रिज वन क्षेत्र (नियंत्रण क्षेत्र)",
    blurb:
      "Aravalli ridge away from any road. If the method is honest, this one comes back green.",
    source: { name: "Method check", url: "" },
    district: "gurugram",
    kind: "control",
    ring: [
      [77.1451, 28.3621],
      [77.1578, 28.3621],
      [77.1578, 28.3531],
      [77.1451, 28.3531],
    ],
  },
];

/** Years with a Sentinel-2 dry-season pass on record over the Aravallis. */
export const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
