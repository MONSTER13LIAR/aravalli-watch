# Aravalli Watch

**Save the Aravallis.** Watch India's oldest hills disappear from orbit, year by
year, and turn what you see into a dated, citable satellite record.

**[Open Aravalli Watch &rarr;](https://monster13liar.github.io/aravalli-watch/)**

---

## The problem

Construction and demolition debris is dumped into protected land at night, by the
truckload. Residents watch it happen and it changes nothing. From the Aravallis,
between Gurugram and Faridabad:

> "Every day, we see tractors, we hope these have come to clean and clear the debris
> like in 2020, but no, these come every night to dump construction and demolition
> waste. **We make complaints, submit videos, but nobody cares.**"
>
> — Ravinder Dhar, resident of an Aravalli village, [The Tribune](https://www.tribuneindia.com/news/haryana/debris-mounds-in-aravallis-pose-flash-flood-threat-in-gurugram-faridabad-401914)

The gap is not awareness. It is evidence. A phone video is one resident's word and
is dismissed as such. Gurugram generates roughly 300 tonnes of debris a day; 4,643
tonnes were cleared in the whole of 2019.

Aravalli Watch replaces "I saw trucks" with "between these two dates, this much of this
protected land lost vegetation cover, per Sentinel-2 scene `S2A_…`, acquired
`2025-11-26T05:32:51Z`" — a claim with an independent timestamp behind it.

## Why the Aravallis matter

For readers outside India: the Aravalli range is a living barrier holding back the
Thar Desert. The Government of India launched the **Aravalli Green Wall Project** to
green a 5 km buffer along it across Haryana, Rajasthan, Gujarat and Delhi — a
landscape spanning **over 6 million hectares** — with the stated objective of
preventing the *"eastward expansion of Thar Desert"* and the soil erosion,
desertification and dust storms that follow.

Delhi and Gurugram — some 30 million people — sit directly downwind and downslope of
it. Every hectare buried under construction debris is a hectare of that barrier taken
out. That is what this tool measures.

> Source: Ministry of Environment, Forest and Climate Change,
> [Press Information Bureau, 25 March 2023](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1910745)

## What it does

Three taps, no form.

1. **Where.** Four pre-marked areas — three reported sites and one untouched
   control — each a named place with a published record behind it. Or search
   anywhere and outline it by hand.
2. **When.** A timeline of dry-season years, 2016 to today. Pick *then* and *now*
   and it searches the Sentinel-2 archive for the least-cloudy pass in each,
   pinning both to the same MGRS tile so the two images cover identical ground.
   Every year is a November–December window, so the comparison is like for like.
3. **Verdict.** NDVI is computed for both dates and differenced pixel by pixel
   inside the outline, in the browser. Ground that lost cover is reported in
   hectares and painted red on the after image, under a swipe divider.
   A printable evidence packet carries the measurement, both scene ids, both
   acquisition timestamps, the method, and the limits.
4. **Scan the whole belt.** Instead of naming a place, let the satellite look:
   every square kilometre of the Faridabad–Gurugram Aravallis, Bandhwari to
   Tughlakabad, is differenced between two dry-season passes and ranked by what it
   lost. The top twelve are numbered on the map; a hit within a kilometre of a
   pre-marked area is named as that area, anything else is flagged as not on
   record. Each pixel is measured against its own 4 km tile's median change, so a
   November smog blanket over Delhi — which drops NDVI 0.1 across whole tiles —
   cancels out and only what is local survives. Run cold, the scanner finds Ankhir
   on its own.
5. **Ask the map.** A question in plain words — *is Anangpur worse than Bandhwari?*,
   *was 2024 just a dry year?* The model never measures anything: it names the
   comparisons it needs, the page runs them with the verdict's own code, and the
   model answers only from what came back. Every comparison it used is listed
   under the answer. The years it may use are enforced server-side, not left to
   the model.
6. **Track every year & write the brief.** One button runs the same measurement
   for every dry-season year since the baseline, all pinned to the baseline's
   tile, and draws the result as a bar chart with the worst year marked. The
   numbers then go to a language model which writes the finding in plain words,
   reads the trajectory, and drafts a complaint addressed to the Deputy
   Commissioner and District Forest Officer — with both scene ids, the published
   record, and the limits stated — in English and in Hindi, because the residents
   who watch the trucks do not file complaints in English. The model is instructed to use only the numbers
   it is given, and the page says so under the draft: read it before you send it.

### The pre-marked areas

| Area | Place | Record |
|---|---|---|
| 1 | Bandhwari landfill, Gurugram–Faridabad road | [The Tribune](https://www.tribuneindia.com/news/haryana/debris-mounds-in-aravallis-pose-flash-flood-threat-in-gurugram-faridabad-401914) — residents on nightly debris dumping |
| 2 | Anangpur farmhouse belt, Faridabad | [ThePrint, 6 Aug 2025](https://theprint.in/ground-reports/faridabad-farmhouses-vs-aravallis-isnt-over-its-a-war-that-has-just-begun/2714813/) — 6,793 unauthorised structures across 786 acres; demolitions from June 2025 |
| 3 | Ankhir, Faridabad | Same survey; one of the four villages named |
| Control | Ridge forest away from any road | Method check — should read as no loss |

Areas 2 and 3 are roughly 1 km² around the village's gazetteer point, not a
surveyed boundary. Every outline was checked against the imagery before it went in.

### The numbers on the opening screen

| Figure | Source |
|---|---|
| 31 of 128 hills in Rajasthan's Aravallis have vanished | Supreme Court of India, 23 Oct 2018, via [The Tribune](https://www.tribuneindia.com/news/archive/nation/-humans-flying-away-with-hills-like-hanuman-sc-shocked-at-illegal-mining-in-rajasthan-672512) |
| 10,000+ acres of Gurugram's Natural Conservation Zone lost in eight years | Report to the National Green Tribunal, via [Mongabay, Feb 2022](https://india.mongabay.com/2022/02/the-ignorance-of-the-haryana-government-has-cost-the-aravallis-dearly/) |
| 1,200+ acres of Faridabad's Aravalli green cover lost to encroachment | District administration, via [The Tribune, Feb 2023](https://www.tribuneindia.com/news/haryana/over-1-200-acre-green-cover-in-aravallis-lost-to-encroachments-476687) |

## Does it actually work?

The method was tested against a control — a stretch of Aravalli ridge forest that
should read as unchanged over the same period, through the same seasonal shift.

| Area | Lost cover | Share of area | Gained cover | Loss : gain |
|---|---|---|---|---|
| Bandhwari waste site | 14.01 ha | **13.3%** | 1,271 m² | **110 : 1** |
| Ridge forest (control) | 0.52 ha | **0.4%** | 4.89 ha | **0.1 : 1** |

Both from 16 Nov 2019 to 29 Nov 2025, same MGRS tile, same threshold, same seasonal
window. The waste site separates from the control by a factor of 33 on lost area,
and by three orders of magnitude on the loss-to-gain ratio. The control comes back
slightly greener — regrowth, which is what undisturbed forest should do.

That gap is the reason the loss-to-gain ratio is reported everywhere the loss figure
appears. **Roughly balanced loss and gain means the scene simply moved** — season,
sun angle, sampling noise. Loss strongly outrunning gain is what clearing looks
like. Without that test a red map is just a pattern.

## What it does not claim

- **Not who did it.** This records that ground changed, not who changed it.
- **Not small dumping.** Sentinel-2 resolves 10 m. A single truckload will not appear.
- **Not season-proof.** Harvest, die-back and drought also reduce NDVI. Every
  year on the timeline is the same November–December window for that reason.
- **Not a substitute for a site visit.** It is the document you bring to one.

## Data

| Source | Used for | Access |
|---|---|---|
| [Copernicus Sentinel-2 L2A](https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2) | Surface reflectance, both dates | Open |
| [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/) | STAC search, tiling, zonal statistics | No key required |
| [OpenFreeMap](https://openfreemap.org/) / OpenStreetMap | Basemap | Open |
| [Nominatim](https://nominatim.openstreetmap.org/) | Place search | Open |
| [Featherless](https://featherless.ai/) (Qwen3-30B-A3B) | Writing the brief and complaint draft | Key held server-side |

## Running it

```bash
npm install
npm run dev
```

Every measurement goes straight from the browser to a public open-data endpoint — no
key, no backend. The exceptions are the brief and ask-the-map: `api/brief.js` and `api/ask.js` are
small serverless functions (Vercel) that hold the `FEATHERLESS_API_KEY` and forward
already-computed numbers to the model, so the key never reaches the page. The GitHub Pages build calls
the Vercel deployment for it; everything else works without it.

## Implementation notes

The change mask is a **custom map protocol**. Each map tile request fetches the same
`z/x/y` NDVI tile for both dates, differences them on an `OffscreenCanvas`, clips the
result to the drawn outline, and returns a PNG — so the analysis pans and zooms like
any other layer while never leaving the browser.

Pinning both dates to one MGRS tile matters more than it sounds: an unpinned pair
lands on neighbouring tiles with different footprints, which still looks convincing
on screen while comparing different ground.

Areas are converted from pixel counts using the ground resolution at the site's
latitude, so the hectare figures track the actual sampling grid rather than a nominal
10 m.
