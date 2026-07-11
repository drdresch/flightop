export default async function handler(request) {
  try {
    const requestUrl = new URL(request.url);
    const lat = clampNumber(requestUrl.searchParams.get("lat"), -90, 90, 45.5898);
    const lon = clampNumber(requestUrl.searchParams.get("lon"), -180, 180, -122.5951);
    const dist = clampNumber(requestUrl.searchParams.get("dist"), 1, 250, 120);
    const url = `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${dist}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Flyover personal aviation display"
      }
    });

    const data = await res.json();

    return new Response(JSON.stringify({
      ok: true,
      aircraft: data.aircraft || [],
      center: { lat, lon },
      radiusNm: dist,
      fetchedAt: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      aircraft: []
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

function clampNumber(value, min, max, fallback) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
