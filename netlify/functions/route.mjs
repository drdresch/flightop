const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

export default async function handler(request) {
  try {
    const requestUrl = new URL(request.url);
    const callsign = String(requestUrl.searchParams.get("callsign") || "").trim().toUpperCase();
    const hex = String(requestUrl.searchParams.get("hex") || "").trim().toUpperCase();
    const registration = String(requestUrl.searchParams.get("registration") || "").trim().toUpperCase();
    const aircraft = {
      hex,
      registration,
      lat: finiteParam(requestUrl, "lat"),
      lon: finiteParam(requestUrl, "lon"),
      track: finiteParam(requestUrl, "track"),
      altitude: finiteParam(requestUrl, "altitude"),
      speed: finiteParam(requestUrl, "speed"),
      observedAt: finiteParam(requestUrl, "observedAt") || Date.now(),
    };

    if (!/^[A-Z0-9]{3,10}$/.test(callsign)) return json({ ok: true, found: false, confidence: "Route unavailable" });

    // Callsigns are reused. Cache a short-lived result per live aircraft + callsign,
    // never globally by callsign alone.
    const cacheKey = `${hex || registration || "unknown"}:${callsign}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return json(cached.value);

    const response = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Flyover personal aviation display",
      },
    });

    if (response.status === 404) return remember(cacheKey, { ok: true, found: false, confidence: "Route unavailable" });
    if (!response.ok) throw new Error(`Route service returned ${response.status}.`);

    const data = await response.json();
    const route = data.response?.flightroute || data.response || {};
    const origin = route.origin || {};
    const destination = route.destination || {};
    const originCode = origin.iata_code || origin.icao_code || "";
    const destinationCode = destination.iata_code || destination.icao_code || "";

    if (!originCode || !destinationCode) return remember(cacheKey, { ok: true, found: false, confidence: "Route unavailable" });

    const candidate = {
      origin: originCode,
      destination: destinationCode,
      originName: origin.name || "",
      destinationName: destination.name || "",
      originLabel: airportLocation(origin),
      destinationLabel: airportLocation(destination),
      originPosition: airportPosition(origin),
      destinationPosition: airportPosition(destination),
    };

    if (!routeFitsLiveAircraft(candidate, aircraft)) {
      return remember(cacheKey, { ok: true, found: false, confidence: "Route unavailable" });
    }

    return remember(cacheKey, {
      ok: true,
      found: true,
      route: { ...candidate, routeSource: "ADSBDB callsign fallback", routeConfidence: "Likely route" },
    });
  } catch (error) {
    return json({ ok: false, found: false, error: error.message });
  }
}

function airportPosition(airport) {
  const lat = Number(airport.latitude);
  const lon = Number(airport.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function airportLocation(airport) {
  const city = airport.municipality || airport.city || "";
  const rawRegion = airport.state || airport.region_name || airport.region || airport.iso_region || "";
  const region = String(rawRegion).replace(/^US-/, "");
  const country = airport.country_iso_name || airport.country_name || "";
  if (city && region) return `${city}, ${region}`;
  if (city && country && country !== "United States") return `${city}, ${country}`;
  return city || airport.name || "";
}

function remember(cacheKey, value) {
  cache.set(cacheKey, { savedAt: Date.now(), value });
  return json(value);
}

function finiteParam(url, name) {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) ? value : null;
}

function distanceNm(first, second) {
  if (![first?.lat, first?.lon, second?.lat, second?.lon].every(Number.isFinite)) return null;
  const radians = Math.PI / 180;
  const latitudeDelta = (second.lat - first.lat) * radians;
  const longitudeDelta = (second.lon - first.lon) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(first.lat * radians) * Math.cos(second.lat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 3440.1 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(first, second) {
  if (![first?.lat, first?.lon, second?.lat, second?.lon].every(Number.isFinite)) return null;
  const radians = Math.PI / 180;
  const longitudeDelta = (second.lon - first.lon) * radians;
  const y = Math.sin(longitudeDelta) * Math.cos(second.lat * radians);
  const x = Math.cos(first.lat * radians) * Math.sin(second.lat * radians) - Math.sin(first.lat * radians) * Math.cos(second.lat * radians) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleDifference(first, second) {
  return Math.abs((((first - second) % 360) + 540) % 360 - 180);
}

function routeFitsLiveAircraft(route, aircraft) {
  const position = { lat: aircraft.lat, lon: aircraft.lon };
  if (!route.originPosition || !route.destinationPosition || !Number.isFinite(position.lat) || !Number.isFinite(position.lon)) return false;
  const routeLength = distanceNm(route.originPosition, route.destinationPosition);
  const fromOrigin = distanceNm(route.originPosition, position);
  const toDestination = distanceNm(position, route.destinationPosition);
  if (![routeLength, fromOrigin, toDestination].every(Number.isFinite) || routeLength < 10) return false;
  if (fromOrigin + toDestination > routeLength * 1.35 + 80) return false;
  if (Number.isFinite(aircraft.track) && toDestination > 25) {
    const towardDestination = bearing(position, route.destinationPosition);
    if (towardDestination != null && angleDifference(aircraft.track, towardDestination) > 80) return false;
  }
  return true;
}

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
