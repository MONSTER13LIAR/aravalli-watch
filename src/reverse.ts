/** Nearest named place, for labelling a hotspot nobody has named yet. */
export async function reverseGeocode(lon: number, lat: number): Promise<string | null> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon), format: "jsonv2", zoom: "14" });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${q}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const a = (await res.json()).address ?? {};
  return a.village || a.suburb || a.neighbourhood || a.town || a.hamlet || a.city_district || a.city || null;
}

/**
 * Which office a complaint goes to. Read from OpenStreetMap's administrative
 * boundaries, not from a longitude split: Delhi's southern tip reaches down to
 * 28.40° N between the Gurugram and Faridabad hills, so a straight line would
 * send Delhi land to a Haryana office.
 */
export async function districtOf(lon: number, lat: number): Promise<"gurugram" | "faridabad" | "delhi" | "other" | null> {
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon), format: "jsonv2", zoom: "10" });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${q}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const a = (await res.json()).address ?? {};
  const text = [a.state_district, a.county, a.city, a.town].filter(Boolean).join(" ");
  if (/delhi/i.test(a.state ?? "")) return "delhi";
  if (/faridabad/i.test(text)) return "faridabad";
  if (/gurugram|gurgaon/i.test(text)) return "gurugram";
  return "other";
}
