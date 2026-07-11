const cache = new Map();
let lastRequestAt = 0;

export default async function handler(request) {
  try {
    const requestUrl = new URL(request.url);
    const lat = clampNumber(requestUrl.searchParams.get("lat"), -90, 90);
    const lon = clampNumber(requestUrl.searchParams.get("lon"), -180, 180);
    const altitude = Number(requestUrl.searchParams.get("altitude"));
    if (lat == null || lon == null) throw new Error("Valid latitude and longitude are required.");

    const zoom = Number.isFinite(altitude) && altitude < 3000 ? 16 : 12;
    const key = `${lat.toFixed(3)},${lon.toFixed(3)},${zoom}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.savedAt < 60 * 60 * 1000) {
      return json(cached.value);
    }

    const waitMs = Math.max(0, 1050 - (Date.now() - lastRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=${zoom}&addressdetails=1`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "FlightOp/1.0 (https://flightop.netlify.app/)",
        },
      }
    );
    if (!response.ok) throw new Error(`Location service returned ${response.status}.`);

    const data = await response.json();
    const address = data.address || {};
    const local =
      address.neighbourhood || address.suburb || address.quarter || address.city_district ||
      address.city || address.town || address.village || address.hamlet || address.county;
    const region = address.state_code || address.state || address.country;
    const label = [local, region].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join(", ");
    const value = { ok: true, label: label || data.display_name || "Location unavailable" };
    cache.set(key, { savedAt: Date.now(), value });
    return json(value);
  } catch (error) {
    return json({ ok: false, error: error.message, label: "" });
  }
}

function clampNumber(value, min, max) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : null;
}

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
