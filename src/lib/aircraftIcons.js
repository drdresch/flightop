const ICON_BASE = "/icons/aircraft";

const SMALL_PROP = new Set(["C172", "C152", "C182", "PA28", "PA32", "SR20", "SR22", "DA40", "DA42"]);
const TURBOPROP = new Set(["PC12", "C208", "B350", "BE20", "DH8A", "DH8B", "DH8C", "DH8D", "AT43", "AT45", "AT72", "SF34", "SW4"]);
const BUSINESS_JET = new Set(["GLF4", "GLF5", "GLF6", "C25A", "C25B", "C25C", "C56X", "C680", "C700", "CL30", "CL35", "CL60", "LJ35", "LJ45", "LJ60", "FA50", "FA7X"]);
const AIRLINER = new Set(["A319", "A320", "A321", "B712", "B721", "B722", "B731", "B732", "B733", "B734", "B735", "B736", "B737", "B738", "B739", "B38M", "B39M", "E170", "E175", "E190", "E195", "CRJ2", "CRJ7", "CRJ9"]);
const HEAVY = new Set(["A330", "A332", "A333", "A340", "A350", "A359", "A35K", "A380", "B744", "B748", "B752", "B753", "B762", "B763", "B764", "B772", "B773", "B77L", "B77W", "B788", "B789", "B78X", "MD11", "DC10"]);
const HELICOPTER = new Set(["H60", "UH60", "R22", "R44", "B06", "B407", "EC35", "EC45", "A109", "S76"]);
const MILITARY_JET = new Set(["F15", "F16", "F18", "F22", "F35", "A10", "T38", "EA18", "AV8"]);

function normalizedType(aircraft) {
  return String(aircraft?.typeCode || aircraft?.icaoType || aircraft?.aircraftType || aircraft?.t || "").trim().toUpperCase();
}

function normalizedDescription(aircraft) {
  return String(aircraft?.description || aircraft?.aircraftDescription || aircraft?.model || aircraft?.desc || "").trim().toUpperCase();
}

function normalizedCategory(aircraft) {
  return String(aircraft?.category || aircraft?.adsbCategory || aircraft?.emitterCategory || "").trim().toUpperCase();
}

function matchesType(type, codes, prefixes = []) {
  return codes.has(type) || prefixes.some((prefix) => type.startsWith(prefix));
}

export function getAircraftIconName(aircraft = {}) {
  const type = normalizedType(aircraft);
  const description = normalizedDescription(aircraft);
  const category = normalizedCategory(aircraft);

  if (matchesType(type, HELICOPTER) || /HELICOPTER|ROTORCRAFT/.test(description)) return "helicopter";
  if (matchesType(type, MILITARY_JET) || /FIGHTER|MILITARY JET/.test(description)) return "military-jet";
  if (matchesType(type, BUSINESS_JET, ["GLF", "C25", "C56", "C68", "C70", "CL", "LJ", "FA"]) || /BUSINESS JET|GULFSTREAM|LEARJET|CITATION|CHALLENGER|FALCON/.test(description)) return "business-jet";
  if (matchesType(type, TURBOPROP, ["DH8", "AT4", "AT7"]) || /TURBOPROP/.test(description)) return "turboprop";
  if (matchesType(type, HEAVY) || /WIDEBODY|HEAVY/.test(description)) return "heavy";
  if (matchesType(type, AIRLINER) || /PASSENGER JET|AIRLINER/.test(description)) return "airliner";
  if (matchesType(type, SMALL_PROP, ["M20"]) || /PROP|PISTON|SINGLE ENGINE/.test(description)) return "small-prop";

  // ADS-B emitter category is deliberately a late fallback: it is broad and
  // should never override a known ICAO type or model description.
  if (category === "A7") return "helicopter";
  if (category === "A5") return "heavy";
  if (["A3", "A4"].includes(category)) return "airliner";
  if (["A1", "A2"].includes(category)) return "small-prop";
  return "unknown";
}

export function getAircraftIconPath(aircraft) {
  return `${ICON_BASE}/${getAircraftIconName(aircraft)}-64.png`;
}

export function getAircraftIconLabel(aircraft) {
  return {
    "small-prop": "Small prop",
    turboprop: "Turboprop",
    "business-jet": "Business jet",
    airliner: "Airliner",
    heavy: "Heavy aircraft",
    helicopter: "Helicopter",
    "military-jet": "Military jet",
    unknown: "Unknown aircraft",
  }[getAircraftIconName(aircraft)];
}
