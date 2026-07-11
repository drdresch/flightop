export const AIRLINES = {
  ASA: airline("ASA", "Alaska Airlines", "Alaska", "passenger", "#ffffff"),
  QXE: airline("QXE", "Horizon Air", "Horizon", "regional", "#d7e5f2"),
  SKW: airline("SKW", "SkyWest Airlines", "SkyWest", "regional", "#f0ad3d"),
  UAL: airline("UAL", "United Airlines", "United", "passenger", "#4f8edc"),
  DAL: airline("DAL", "Delta Air Lines", "Delta", "passenger", "#d64252"),
  SWA: airline("SWA", "Southwest Airlines", "Southwest", "passenger", "#4f75c9"),
  NKS: airline("NKS", "Spirit Airlines", "Spirit", "passenger", "#f5df35"),
  FFT: airline("FFT", "Frontier Airlines", "Frontier", "passenger", "#53a86e"),
  ICE: airline("ICE", "Icelandair", "Icelandair", "passenger", "#e4b43f"),
  KLM: airline("KLM", "KLM", "KLM", "passenger", "#55bde6"),
  BAW: airline("BAW", "British Airways", "British Airways", "passenger", "#4f6fab"),
  CFG: airline("CFG", "Condor", "Condor", "passenger", "#e8c73d"),
  AAY: airline("AAY", "Allegiant Air", "Allegiant", "passenger", "#4f7cc5"),
  AAL: airline("AAL", "American Airlines", "American", "passenger", "#a9b8c5"),
  ACA: airline("ACA", "Air Canada", "Air Canada", "passenger", "#d44747"),
  HAL: airline("HAL", "Hawaiian Airlines", "Hawaiian", "passenger", "#9d76b9"),
  SCX: airline("SCX", "Sun Country Airlines", "Sun Country", "passenger", "#e9873d"),
  FDX: airline("FDX", "FedEx Express", "FedEx", "cargo", "#8a63a8"),
  UPS: airline("UPS", "UPS Airlines", "UPS", "cargo", "#b88a4b"),
  JBU: airline("JBU", "JetBlue Airways", "JetBlue", "passenger", "#5b83b5"),
  ENY: airline("ENY", "Envoy Air", "Envoy", "regional", "#9faebc"),
  RPA: airline("RPA", "Republic Airways", "Republic", "regional", "#778795"),
  PDT: airline("PDT", "Piedmont Airlines", "Piedmont", "regional", "#8aa0b1"),
  WJA: airline("WJA", "WestJet", "WestJet", "passenger", "#58a9a0"),
  GTI: airline("GTI", "Atlas Air", "Atlas Air", "cargo", "#4a78ae"),
};

function airline(prefix, displayName, shortName, type, accentColor) {
  return {
    prefix,
    displayName,
    shortName,
    logoPath: `/logos/${prefix.toLowerCase()}.svg`,
    accentColor,
    type,
  };
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

export function getAirlineIdentity(aircraft = {}) {
  const callsign = clean(aircraft.callsign || aircraft.flight).toUpperCase();
  const operator = clean(aircraft.operator || aircraft.ownOp);
  if (/\b(POLICE|SHERIFF|STATE PATROL|LAW ENFORCEMENT)\b/i.test(operator)) {
    return {
      prefix: "",
      displayName: operator,
      shortName: operator,
      logoPath: null,
      accentColor: "#78aee8",
      type: "law-enforcement",
    };
  }

  const letters = callsign.match(/^([A-Z]{2,3})/)?.[1] || "";
  const identity = AIRLINES[letters] || AIRLINES[letters.slice(0, 3)] || AIRLINES[letters.slice(0, 2)];
  if (identity) return identity;

  const fallbackName =
    operator ||
    clean(aircraft.description || aircraft.typeCode || aircraft.t) ||
    "Unknown Operator";

  return {
    prefix: letters,
    displayName: fallbackName,
    shortName: fallbackName,
    logoPath: null,
    accentColor: null,
    type: "unknown",
  };
}
