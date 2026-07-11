const cache = new Map();

export default async function handler(request) {
  try {
    const requestUrl = new URL(request.url);
    const callsign = String(requestUrl.searchParams.get("callsign") || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(callsign)) return json({ ok: true, found: false });

    const cached = cache.get(callsign);
    if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) return json(cached.value);

    const response = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Flyover personal aviation display",
      },
    });

    if (response.status === 404) return remember(callsign, { ok: true, found: false });
    if (!response.ok) throw new Error(`Route service returned ${response.status}.`);

    const data = await response.json();
    const route = data.response?.flightroute || data.response || {};
    const origin = route.origin || {};
    const destination = route.destination || {};
    const originCode = origin.iata_code || origin.icao_code || "";
    const destinationCode = destination.iata_code || destination.icao_code || "";

    if (!originCode || !destinationCode) return remember(callsign, { ok: true, found: false });

    return remember(callsign, {
      ok: true,
      found: true,
      route: {
        origin: originCode,
        destination: destinationCode,
        originName: origin.name || "",
        destinationName: destination.name || "",
        routeSource: "ADSBDB callsign route",
        routeConfidence: "Candidate",
      },
    });
  } catch (error) {
    return json({ ok: false, found: false, error: error.message });
  }
}

function remember(callsign, value) {
  cache.set(callsign, { savedAt: Date.now(), value });
  return json(value);
}

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
