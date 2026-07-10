const ORIGIN_CODE_KEYS = [
  "origin",
  "orig",
  "from",
  "dep",
  "departure",
  "originAirport",
  "origin_airport",
  "originIata",
  "origin_iata",
  "originIcao",
  "origin_icao",
  "departureAirport",
  "departure_airport",
  "departureIata",
  "departure_iata",
  "departureIcao",
  "departure_icao",
];

const DESTINATION_CODE_KEYS = [
  "destination",
  "dest",
  "to",
  "arr",
  "arrival",
  "destinationAirport",
  "destination_airport",
  "destinationIata",
  "destination_iata",
  "destinationIcao",
  "destination_icao",
  "arrivalAirport",
  "arrival_airport",
  "arrivalIata",
  "arrival_iata",
  "arrivalIcao",
  "arrival_icao",
];

const ORIGIN_NAME_KEYS = [
  "originName",
  "origin_name",
  "fromName",
  "from_name",
  "departureName",
  "departure_name",
  "originAirportName",
  "origin_airport_name",
  "departureAirportName",
  "departure_airport_name",
];

const DESTINATION_NAME_KEYS = [
  "destinationName",
  "destination_name",
  "destName",
  "dest_name",
  "toName",
  "to_name",
  "arrivalName",
  "arrival_name",
  "destinationAirportName",
  "destination_airport_name",
  "arrivalAirportName",
  "arrival_airport_name",
];

const ROUTE_KEYS = ["route", "routeCode", "route_code", "airportRoute", "airport_route"];
const ROUTE_SOURCE_KEYS = ["routeSource", "route_source", "source", "provider"];
const ROUTE_CONFIDENCE_KEYS = ["routeConfidence", "route_confidence", "confidence"];

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function readField(source, keys) {
  for (const key of keys) {
    const value = cleanText(source?.[key]);
    if (value) return value;
  }
  return "";
}

function routeSources(aircraft) {
  const raw = aircraft?.raw || {};
  return [aircraft || {}, raw];
}

function firstRouteField(aircraft, keys) {
  for (const source of routeSources(aircraft)) {
    const value = readField(source, keys);
    if (value) return value;
  }
  return "";
}

function normalizeAirportCode(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (/^[a-z0-9]{3,4}$/i.test(text)) return text.toUpperCase();
  return text;
}

function parseRouteString(value) {
  if (Array.isArray(value) && value.length >= 2) {
    return [normalizeAirportCode(value[0]), normalizeAirportCode(value[value.length - 1])];
  }

  const text = cleanText(value);
  if (!text || /\d+\.\d+/.test(text)) return null;

  const parts = text
    .split(/\s*(?:->|→|-|\/|,|\s+to\s+)\s*/i)
    .map(normalizeAirportCode)
    .filter(Boolean);

  if (parts.length < 2) return null;
  return [parts[0], parts[parts.length - 1]];
}

function readRouteString(aircraft) {
  for (const source of routeSources(aircraft)) {
    for (const key of ROUTE_KEYS) {
      const value = source?.[key];
      if (Array.isArray(value)) return value;
      const text = cleanText(value);
      if (text) return text;
    }
  }
  return "";
}

export function formatAirportName(value) {
  const text = cleanText(value);
  if (!text) return "";
  return normalizeAirportCode(text);
}

export function getRouteForAircraft(aircraft) {
  let origin = formatAirportName(firstRouteField(aircraft, ORIGIN_CODE_KEYS));
  let destination = formatAirportName(firstRouteField(aircraft, DESTINATION_CODE_KEYS));
  const originName = cleanText(firstRouteField(aircraft, ORIGIN_NAME_KEYS));
  const destinationName = cleanText(firstRouteField(aircraft, DESTINATION_NAME_KEYS));
  const sourceRoute = readRouteString(aircraft);
  const parsedRoute = !origin && !destination ? parseRouteString(sourceRoute) : null;

  if (parsedRoute) {
    [origin, destination] = parsedRoute;
  }

  const hasRoute = Boolean(origin || destination || originName || destinationName);

  return {
    origin,
    destination,
    originName,
    destinationName,
    routeSource: hasRoute
      ? firstRouteField(aircraft, ROUTE_SOURCE_KEYS) || "Source-provided aircraft route field"
      : "",
    routeConfidence: hasRoute
      ? firstRouteField(aircraft, ROUTE_CONFIDENCE_KEYS) || "Source-provided"
      : "",
  };
}

export function formatRoute(aircraft) {
  const route =
    aircraft && "origin" in aircraft ? aircraft : getRouteForAircraft(aircraft);
  const origin = route.originName || route.origin;
  const destination = route.destinationName || route.destination;

  if (origin && destination) return `${origin} → ${destination}`;
  return "ROUTE UNAVAILABLE";
}

export function formatRouteDetail(aircraft) {
  const route =
    aircraft && "origin" in aircraft ? aircraft : getRouteForAircraft(aircraft);

  if (route.origin || route.destination || route.originName || route.destinationName) {
    return [route.routeConfidence, route.routeSource].filter(Boolean).join(" · ");
  }

  // ADS-B does not reliably contain origin/destination. Route lookup requires
  // a separate provider such as FlightAware AeroAPI, ADS-B Exchange, OpenSky
  // route data if available, or another approved aviation API.
  return "Origin unknown → Destination unknown";
}
