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
