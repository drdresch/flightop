import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { formatRoute, formatRouteDetail, getRouteForAircraft } from "./lib/routeResolver.js";
import "./styles.css";

const RadarMap = lazy(() => import("./RadarMap.jsx"));

const DEFAULT_CENTER = {
  label: "PDX",
  lat: 45.5898,
  lon: -122.5951,
};

const DEFAULT_RADIUS_NM = 120;
const REFRESH_MS = 15_000;
const ROTATION_MS = 8_000;
const LIVE_ATC_PDX_URL = "https://www.liveatc.net/search/?icao=kpdx";
const HIDE_GROUND_STORAGE_KEY = "flightop.hideGroundAircraft";

const RADIUS_OPTIONS = [20, 40, 80, 120, 180, 250];

const SCAN_MODES = [
  { value: "nearest", label: "Closest / overhead" },
  { value: "lowest", label: "Lowest altitude" },
  { value: "fastest", label: "Fastest" },
  { value: "airliners", label: "Airliners + cargo" },
  { value: "ga", label: "GA / small planes" },
  { value: "helicopters", label: "Helicopters" },
  { value: "business", label: "Business jets" },
];

const TRIP_TRACKERS = [
  {
    id: "donna-europe-flight",
    name: "Donna Europe Flight",
    callsigns: [],
    registrations: [],
  },
];

const ATC_CANDIDATES = {
  tower: {
    facility: "PDX Tower",
    frequencies: ["118.700", "123.775"],
  },
  approach: {
    facility: "Portland Approach / Departure",
    frequencies: ["118.100", "124.350", "126.900", "127.850"],
  },
  seattle: {
    facility: "Seattle Center (PDX area)",
    frequencies: ["128.300", "124.200", "128.150", "125.800", "126.600", "119.650"],
  },
  oakland: {
    facility: "Oakland Center (southbound handoff candidate)",
    frequencies: ["sector varies"],
  },
};

const DIRECTION_WORDS = [
  "north",
  "north-northeast",
  "northeast",
  "east-northeast",
  "east",
  "east-southeast",
  "southeast",
  "south-southeast",
  "south",
  "south-southwest",
  "southwest",
  "west-southwest",
  "west",
  "west-northwest",
  "northwest",
  "north-northwest",
];

const DIRECTION_SHORT = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function titleCase(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\bAtc\b/g, "ATC")
    .replace(/\bPdx\b/g, "PDX");
}

function firstFinite(values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function distanceNm(from, to) {
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lon)) return null;
  const earthRadiusNm = 3440.065;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}

function bearingDegrees(from, to) {
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lon)) return null;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLon = toRadians(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function directionIndex(degrees) {
  const number = Number(degrees);
  if (!Number.isFinite(number)) return null;
  return Math.round((((number % 360) + 360) % 360) / 22.5) % 16;
}

function directionWord(degrees) {
  const index = directionIndex(degrees);
  return index == null ? "" : DIRECTION_WORDS[index];
}

function directionShort(degrees) {
  const index = directionIndex(degrees);
  return index == null ? "" : DIRECTION_SHORT[index];
}

function normalizeAltitude(value) {
  if (value === "ground") return "ground";
  return firstFinite([value]);
}

function sourceMarksGround(plane) {
  const values = [
    plane.altitude,
    plane.alt_baro,
    plane.ground,
    plane.onGround,
    plane.on_ground,
    plane.airground,
    plane.airGround,
    plane.gnd,
  ];

  return values.some((value) => {
    if (value === true) return true;
    const text = cleanText(value).toLowerCase();
    return ["ground", "gnd", "on_ground", "onground", "surface"].includes(text);
  });
}

function isGroundAircraft(plane) {
  return Boolean(plane?.isOnGround || plane?.altitude === "ground");
}

function normalizeAircraft(plane) {
  const lat = firstFinite([plane.lat, plane.latitude]);
  const lon = firstFinite([plane.lon, plane.lng, plane.longitude]);
  const fallbackDistance = distanceNm(DEFAULT_CENTER, { lat, lon });
  const fallbackBearing = bearingDegrees(DEFAULT_CENTER, { lat, lon });
  const distance = firstFinite([plane.distanceNm, plane.dst, fallbackDistance]);
  const bearing = firstFinite([plane.dir, plane.bearing, fallbackBearing]);
  const isOnGround = sourceMarksGround(plane);
  const altitude = isOnGround
    ? "ground"
    : normalizeAltitude(plane.altitude ?? plane.alt_baro ?? plane.alt_geom);
  const route = getRouteForAircraft(plane);

  return {
    raw: plane,
    id: cleanText(plane.hex || plane.icao || plane.flight || `${lat}-${lon}`),
    hex: cleanText(plane.hex || plane.icao),
    callsign: cleanText(plane.flight || plane.callsign),
    registration: cleanText(plane.registration || plane.r || plane.reg),
    typeCode: cleanText(plane.typeCode || plane.t),
    description: titleCase(plane.description || plane.desc),
    operator: titleCase(plane.operator || plane.ownOp),
    category: cleanText(plane.category),
    squawk: cleanText(plane.squawk),
    emergency: cleanText(plane.emergency) && cleanText(plane.emergency) !== "none",
    alert: Boolean(plane.alert),
    lat,
    lon,
    altitude,
    isOnGround: isOnGround || altitude === "ground",
    groundSpeed: firstFinite([plane.groundSpeed, plane.gs, plane.speed]),
    track: firstFinite([plane.track, plane.heading, plane.nav_heading]),
    verticalRate: firstFinite([plane.verticalRate, plane.baro_rate, plane.geom_rate]),
    seen: firstFinite([plane.seenPos, plane.seen_pos, plane.seen]),
    distanceNm: distance,
    bearingFromCenter: bearing,
    origin: route.origin,
    destination: route.destination,
    originName: route.originName,
    destinationName: route.destinationName,
    routeSource: route.routeSource,
    routeConfidence: route.routeConfidence,
  };
}

function formatAlt(altitude) {
  if (altitude == null) return "n/a";
  if (altitude === "ground") return "GROUND";
  return `${Math.round(Number(altitude)).toLocaleString()} ft`;
}

function numericAltitude(plane) {
  if (plane.altitude === "ground") return 0;
  const altitude = Number(plane.altitude);
  return Number.isFinite(altitude) ? altitude : null;
}

function formatSpeed(speed) {
  const number = Number(speed);
  if (!Number.isFinite(number)) return "n/a";
  return `${Math.round(number)} kt`;
}

function formatRate(rate) {
  const number = Number(rate);
  if (!Number.isFinite(number)) return "n/a";
  const sign = number > 0 ? "+" : "";
  return `${sign}${Math.round(number)} fpm`;
}

function formatHeading(heading) {
  const number = Number(heading);
  if (!Number.isFinite(number)) return "n/a";
  return `${Math.round(number)}° ${directionShort(number)}`;
}

function ageText(seconds) {
  const number = Number(seconds);
  if (!Number.isFinite(number)) return "fresh-ish";
  if (number < 1) return "now";
  return `${Math.round(number)}s ago`;
}

function aircraftLabel(plane) {
  return plane.callsign || plane.registration || plane.hex || "UNKNOWN";
}

function aircraftTypeLabel(plane) {
  return plane.description || plane.typeCode || "Aircraft type unavailable";
}

function operatorLabel(plane) {
  return plane.operator || plane.description || plane.typeCode || "Unknown operator";
}

function movementState(plane) {
  if (!plane) return "Unknown";
  if (plane.altitude === "ground") return "Ground";
  const rate = Number(plane.verticalRate);
  if (!Number.isFinite(rate)) return "Level";
  if (rate > 250) return "Climbing";
  if (rate < -250) return "Descending";
  return "Level";
}

function locationText(plane) {
  if (!plane) return "No aircraft selected";
  const distance = Number(plane.distanceNm);
  const bearing = Number(plane.bearingFromCenter);
  if (!Number.isFinite(distance) || !Number.isFinite(bearing)) {
    return `Position near ${DEFAULT_CENTER.label} unavailable`;
  }
  if (distance < 1) return `Over ${DEFAULT_CENTER.label}`;
  return `${Math.round(distance)} NM ${directionWord(bearing)} of ${DEFAULT_CENTER.label}`;
}

function isAirlinerOrCargo(plane) {
  const blob = [
    plane.callsign,
    plane.operator,
    plane.description,
    plane.typeCode,
    plane.category,
  ]
    .join(" ")
    .toUpperCase();
  return (
    /\b(AAL|ASA|DAL|FDX|FFT|GTI|HAL|JBU|QXE|SWA|UAL|UPS|WJA)\b/.test(blob) ||
    /(AIRLINES|AIRWAYS|CARGO|FEDEX|UPS|ATLAS|SOUTHWEST|ALASKA|DELTA|UNITED|AMERICAN|JETBLUE|HAWAIIAN)/.test(blob) ||
    /(AIRBUS|BOEING|EMBRAER|BOMBARDIER|CANADAIR)/.test(blob) ||
    ["A3", "A4", "A5"].includes(plane.category)
  );
}

function isHelicopter(plane) {
  const blob = [plane.description, plane.typeCode, plane.category].join(" ").toUpperCase();
  return (
    plane.category === "A7" ||
    /HELICOPTER|ROTORCRAFT|ROTOR/.test(blob) ||
    /\b(AS50|AS55|B06|B407|EC20|EC30|EC35|H60|R22|R44|R66|S76)\b/.test(blob)
  );
}

function isBusinessJet(plane) {
  const blob = [plane.description, plane.typeCode, plane.operator].join(" ").toUpperCase();
  return /(CITATION|LEARJET|GULFSTREAM|FALCON|GLOBAL|CHALLENGER|PHENOM|HAWKER|BOMBARDIER)/.test(blob) ||
    /\b(C25|C5[256]|C6[58]|C7[056]|CL3|CL6|E5[05]P|F2TH|GLF|LJ|PRM1|BE40)\b/.test(blob);
}

function isGeneralAviation(plane) {
  const altitude = numericAltitude(plane);
  const speed = Number(plane.groundSpeed);
  const blob = [plane.description, plane.typeCode, plane.operator].join(" ").toUpperCase();
  return (
    !isAirlinerOrCargo(plane) &&
    !isBusinessJet(plane) &&
    !isHelicopter(plane) &&
    (["A1", "A2"].includes(plane.category) ||
      /(CESSNA|PIPER|CIRRUS|BEECH|DIAMOND|MOONEY|LANCAIR|VANS|VAN'S|ROBINSON)/.test(blob) ||
      /\b(C1[5782][025]|C20[568]|C30[36]|C40[12]|C82|P28|PA|BE3|BE2|DA4|SR2|RV)\b/.test(blob) ||
      (Number.isFinite(speed) && speed < 260 && (altitude == null || altitude < 18000)))
  );
}

function compareDistance(a, b) {
  return Number(a.distanceNm ?? 999999) - Number(b.distanceNm ?? 999999);
}

function compareAltitude(a, b) {
  return Number(numericAltitude(a) ?? 999999) - Number(numericAltitude(b) ?? 999999);
}

function compareSpeed(a, b) {
  return Number(b.groundSpeed ?? 0) - Number(a.groundSpeed ?? 0);
}

function aircraftForScanMode(aircraft, mode) {
  let candidates = [...aircraft];
  if (mode === "airliners") candidates = candidates.filter(isAirlinerOrCargo);
  if (mode === "ga") candidates = candidates.filter(isGeneralAviation);
  if (mode === "helicopters") candidates = candidates.filter(isHelicopter);
  if (mode === "business") candidates = candidates.filter(isBusinessJet);

  if (mode === "lowest") return candidates.sort(compareAltitude);
  if (mode === "fastest") return candidates.sort(compareSpeed);
  return candidates.sort(compareDistance);
}

function atcCandidateFor(plane) {
  if (!plane) {
    return {
      primary: ATC_CANDIDATES.approach,
      confidence: "Low",
      reason: "No aircraft selected yet.",
      candidates: Object.values(ATC_CANDIDATES),
    };
  }

  const altitude = numericAltitude(plane);
  const distance = Number(plane.distanceNm);
  const heading = Number(plane.track);
  const southbound = Number.isFinite(heading) && heading >= 140 && heading <= 220;
  const closeToPdx = Number.isFinite(distance) && distance <= 8;
  const terminalArea = Number.isFinite(distance) && distance <= 45;
  const highAltitude = altitude != null && altitude >= 18000;

  if (closeToPdx && (altitude == null || altitude < 3500)) {
    return {
      primary: ATC_CANDIDATES.tower,
      confidence: "Medium",
      reason: "Low and very near PDX, so tower is a plausible candidate. ADS-B cannot confirm the assigned frequency.",
      candidates: [ATC_CANDIDATES.tower, ATC_CANDIDATES.approach, ATC_CANDIDATES.seattle],
    };
  }

  if (terminalArea && !highAltitude) {
    return {
      primary: ATC_CANDIDATES.approach,
      confidence: "Medium",
      reason: "Inside the PDX terminal area and below cruise altitude, so Portland Approach / Departure is the strongest candidate.",
      candidates: [ATC_CANDIDATES.approach, ATC_CANDIDATES.tower, ATC_CANDIDATES.seattle],
    };
  }

  if (southbound && highAltitude && Number.isFinite(distance) && distance > 80) {
    return {
      primary: ATC_CANDIDATES.oakland,
      confidence: "Low",
      reason: "High-altitude southbound traffic may later hand off toward Oakland Center. Treat this as a planning hint only.",
      candidates: [ATC_CANDIDATES.seattle, ATC_CANDIDATES.oakland, ATC_CANDIDATES.approach],
    };
  }

  return {
    primary: ATC_CANDIDATES.seattle,
    confidence: "Low",
    reason: "Outside the close PDX terminal picture or at cruise altitude, so a Seattle Center PDX-area sector is a reasonable candidate.",
    candidates: [ATC_CANDIDATES.seattle, ATC_CANDIDATES.approach, ATC_CANDIDATES.oakland],
  };
}

function findTrackedAircraft(tracker, aircraft) {
  const callsigns = tracker.callsigns.map((value) => value.toUpperCase().trim()).filter(Boolean);
  const registrations = tracker.registrations.map((value) => value.toUpperCase().trim()).filter(Boolean);
  if (!callsigns.length && !registrations.length) return null;

  return (
    aircraft.find((plane) => {
      const callsign = plane.callsign.toUpperCase();
      const registration = plane.registration.toUpperCase();
      return callsigns.includes(callsign) || registrations.includes(registration);
    }) || null
  );
}

function SplitFlapTile({ label, value, detail, size = "", tone = "" }) {
  return (
    <div className={`split-flap-tile ${size} ${tone}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function SplitFlapRow({ label, value, detail, size = "", tone = "" }) {
  return (
    <div className={`split-flap-row ${size}`.trim()}>
      <SplitFlapTile label={label} value={value} detail={detail} tone={tone} />
    </div>
  );
}

function SplitFlapBoard({ children }) {
  return <section className="wall-board split-flap-board">{children}</section>;
}

function WallAircraftDisplay({
  activeScanMode,
  displayedAircraftCount,
  hiddenGroundCount,
  lastUpdated,
  selectedAircraft,
  selectedAtc,
  status,
}) {
  const countText =
    hiddenGroundCount > 0
      ? `${displayedAircraftCount.toLocaleString()} airborne / ${hiddenGroundCount.toLocaleString()} ground hidden`
      : `${displayedAircraftCount.toLocaleString()} aircraft`;

  return (
    <SplitFlapBoard>
      <div className="split-topline" aria-label="Wall status">
        <SplitFlapTile label="FLIGHTOP" value={`${DEFAULT_CENTER.label} AREA SCAN`} tone="brand" />
        <SplitFlapTile label="SCAN MODE" value={activeScanMode.label} />
        <SplitFlapTile label="AIRCRAFT COUNT" value={countText} tone="amber-tile" />
        <SplitFlapTile
          label="SYNC"
          value={lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Syncing"}
          detail={status}
        />
      </div>

      {selectedAircraft ? (
        <>
          <div className="split-flap-stack primary-rows">
            <SplitFlapRow
              label="Operator / type"
              value={operatorLabel(selectedAircraft)}
              detail={selectedAircraft.operator ? aircraftTypeLabel(selectedAircraft) : ""}
              size="hero-row"
            />
            <SplitFlapRow
              label="Flight / registration"
              value={aircraftLabel(selectedAircraft)}
              detail={selectedAircraft.registration || selectedAircraft.hex || "No registration"}
              size="large-row"
              tone="amber-tile"
            />
            <SplitFlapRow
              label="Route"
              value={formatRoute(selectedAircraft)}
              detail={formatRouteDetail(selectedAircraft)}
              size="large-row route-row"
              tone={selectedAircraft.origin || selectedAircraft.destination ? "" : "muted-tile"}
            />
            <SplitFlapRow
              label="Location"
              value={locationText(selectedAircraft)}
              size="large-row"
              tone="amber-tile"
            />
          </div>

          <div className="split-metric-grid" aria-label="Aircraft details">
            <SplitFlapTile label="Aircraft type" value={aircraftTypeLabel(selectedAircraft)} />
            <SplitFlapTile label="Altitude" value={formatAlt(selectedAircraft.altitude)} />
            <SplitFlapTile label="Speed" value={formatSpeed(selectedAircraft.groundSpeed)} />
            <SplitFlapTile label="Heading" value={formatHeading(selectedAircraft.track)} />
            <SplitFlapTile
              label="Vertical"
              value={movementState(selectedAircraft)}
              detail={formatRate(selectedAircraft.verticalRate)}
            />
            <SplitFlapTile
              label="Likely ATC"
              value={selectedAtc.primary.facility}
              detail={selectedAtc.primary.frequencies.join(" / ")}
              tone="amber-tile"
            />
          </div>

          <section className="atc-helper" aria-label="Likely ATC candidate">
            <div>
              <span className="kicker amber">ATC candidate</span>
              <p>{selectedAtc.reason}</p>
            </div>
            <div className="confidence">
              <span>Confidence</span>
              <strong>{selectedAtc.confidence}</strong>
            </div>
            <div className="candidate-list" aria-label="ATC candidate frequencies">
              {selectedAtc.candidates.map((candidate) => (
                <span key={candidate.facility}>
                  {candidate.facility}: {candidate.frequencies.join(", ")}
                </span>
              ))}
            </div>
            <a href={LIVE_ATC_PDX_URL} target="_blank" rel="noreferrer">
              Open LiveATC PDX feeds
            </a>
          </section>
        </>
      ) : (
        <div className="empty-board">
          <span className="kicker amber">Awaiting aircraft</span>
          <p>No airborne ADS-B positions match this scan right now.</p>
        </div>
      )}
    </SplitFlapBoard>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState("wall");
  const [presentationMode, setPresentationMode] = useState(false);
  const [aircraft, setAircraft] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState("Loading aircraft...");
  const [query, setQuery] = useState("");
  const [scanMode, setScanMode] = useState("nearest");
  const [radiusNm, setRadiusNm] = useState(DEFAULT_RADIUS_NM);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [rotationPaused, setRotationPaused] = useState(false);
  const [hideGroundAircraft, setHideGroundAircraft] = useState(() => {
    try {
      const saved = window.localStorage.getItem(HIDE_GROUND_STORAGE_KEY);
      return saved == null ? true : saved === "true";
    } catch {
      return true;
    }
  });

  const fetchAircraft = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        lat: DEFAULT_CENTER.lat,
        lon: DEFAULT_CENTER.lon,
        dist: radiusNm,
      });

      const response = await fetch(`/api/aircraft?${params.toString()}`);
      const data = await response.json();

      if (!data.ok) {
        setStatus(data.error || "Aircraft data failed.");
        setAircraft([]);
        setLastUpdated(data.fetchedAt || new Date().toISOString());
        return;
      }

      const normalized = (data.aircraft || [])
        .map(normalizeAircraft)
        .filter((plane) => plane.id && Number.isFinite(plane.lat) && Number.isFinite(plane.lon));

      setAircraft(normalized);
      setLastUpdated(data.fetchedAt || new Date().toISOString());
      setStatus(`${normalized.length} aircraft within ${data.radiusNm || radiusNm} NM`);
    } catch (error) {
      setStatus(`Could not load aircraft: ${error.message}`);
    }
  }, [radiusNm]);

  const visibleAircraft = useMemo(() => {
    if (!hideGroundAircraft) return aircraft;
    return aircraft.filter((plane) => !isGroundAircraft(plane));
  }, [aircraft, hideGroundAircraft]);

  const hiddenGroundCount = aircraft.length - visibleAircraft.length;

  const wallAircraft = useMemo(() => {
    return aircraftForScanMode(visibleAircraft, scanMode);
  }, [visibleAircraft, scanMode]);

  const selectedAircraft = wallAircraft[activeIndex] || wallAircraft[0] || null;
  const selectedAtc = useMemo(() => atcCandidateFor(selectedAircraft), [selectedAircraft]);
  const activeScanMode = SCAN_MODES.find((mode) => mode.value === scanMode) || SCAN_MODES[0];

  const radarAircraft = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searched = q
          ? visibleAircraft.filter((plane) => {
              const blob = [
                plane.callsign,
                plane.registration,
                plane.hex,
                plane.typeCode,
                plane.description,
                plane.operator,
                plane.origin,
                plane.destination,
                plane.originName,
                plane.destinationName,
                plane.squawk,
                plane.category,
              ]
            .join(" ")
            .toLowerCase();
          return blob.includes(q);
        })
      : visibleAircraft;

    return aircraftForScanMode(searched, scanMode);
  }, [visibleAircraft, query, scanMode]);

  const trackedFlights = useMemo(() => {
    return TRIP_TRACKERS.map((tracker) => {
      const trackedAircraft = findTrackedAircraft(tracker, aircraft);
      const hiddenOnGround =
        hideGroundAircraft && trackedAircraft && isGroundAircraft(trackedAircraft);

      return {
        ...tracker,
        aircraft: hiddenOnGround ? null : trackedAircraft,
        hiddenOnGround,
      };
    });
  }, [aircraft, hideGroundAircraft]);

  const stepAircraft = useCallback(
    (direction) => {
      setRotationPaused(true);
      setActiveIndex((index) => {
        if (!wallAircraft.length) return 0;
        return (index + direction + wallAircraft.length) % wallAircraft.length;
      });
    },
    [wallAircraft.length]
  );

  function selectPlane(plane) {
    const index = wallAircraft.findIndex((candidate) => candidate.id === plane.id);
    setActiveIndex(index >= 0 ? index : 0);
    setRotationPaused(true);
  }

  useEffect(() => {
    fetchAircraft();
  }, [fetchAircraft]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(fetchAircraft, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchAircraft]);

  useEffect(() => {
    setActiveIndex(0);
  }, [scanMode, hideGroundAircraft]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDE_GROUND_STORAGE_KEY, String(hideGroundAircraft));
    } catch {
      // localStorage can be unavailable in private or restricted browser contexts.
    }
  }, [hideGroundAircraft]);

  useEffect(() => {
    if (!presentationMode) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setPresentationMode(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presentationMode]);

  useEffect(() => {
    if (activeIndex < wallAircraft.length) return;
    setActiveIndex(0);
  }, [activeIndex, wallAircraft.length]);

  useEffect(() => {
    if (rotationPaused || wallAircraft.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % wallAircraft.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [rotationPaused, wallAircraft.length]);

  return (
    <main className={`app ${viewMode}-mode ${presentationMode ? "presentation-mode" : ""}`}>
      <header className="app-header">
        <div>
          <div className="eyebrow">FLIGHTOP / {DEFAULT_CENTER.label} AREA</div>
          <h1>Wall Display</h1>
        </div>
        <nav className="mode-switch" aria-label="Display mode">
          <button
            className={viewMode === "wall" ? "active" : ""}
            onClick={() => {
              setPresentationMode(false);
              setViewMode("wall");
            }}
          >
            Wall Mode
          </button>
          <button
            className={viewMode === "radar" ? "active" : ""}
            onClick={() => {
              setPresentationMode(false);
              setViewMode("radar");
            }}
          >
            Radar / Setup
          </button>
          {viewMode === "wall" && (
            <button
              className={presentationMode ? "active" : ""}
              onClick={() => {
                setViewMode("wall");
                setPresentationMode(true);
              }}
            >
              Presentation Mode
            </button>
          )}
        </nav>
      </header>

      {viewMode === "wall" ? (
        <section className="wall-layout" aria-label="FlightOp wall mode">
          <WallAircraftDisplay
            activeScanMode={activeScanMode}
            displayedAircraftCount={wallAircraft.length}
            hiddenGroundCount={hideGroundAircraft ? hiddenGroundCount : 0}
            lastUpdated={lastUpdated}
            selectedAircraft={selectedAircraft}
            selectedAtc={selectedAtc}
            status={status}
          />

          {!presentationMode && (
            <aside className="wall-controls" aria-label="Wall controls">
              <section className="control-bank rotation-controls">
                <span className="kicker">Rotation</span>
                <div className="button-row">
                  <button onClick={() => stepAircraft(-1)}>Previous</button>
                  <button onClick={() => setRotationPaused((value) => !value)}>
                    {rotationPaused ? "Resume" : "Pause"}
                  </button>
                  <button onClick={() => stepAircraft(1)}>Next</button>
                </div>
                <p>
                  {rotationPaused
                    ? "Rotation paused"
                    : `Rotating every ${ROTATION_MS / 1000} seconds`}
                </p>
              </section>

              <section className="control-bank setup-controls">
                <label>
                  <span className="kicker">Scan mode</span>
                  <select value={scanMode} onChange={(event) => setScanMode(event.target.value)}>
                    {SCAN_MODES.map((mode) => (
                      <option value={mode.value} key={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="toggle-control">
                  <input
                    type="checkbox"
                    checked={hideGroundAircraft}
                    onChange={(event) => setHideGroundAircraft(event.target.checked)}
                  />
                  <span>Hide ground aircraft</span>
                </label>
                <label>
                  <span className="kicker">Area radius</span>
                  <select value={radiusNm} onChange={(event) => setRadiusNm(Number(event.target.value))}>
                    {RADIUS_OPTIONS.map((radius) => (
                      <option value={radius} key={radius}>
                        {radius} NM
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="control-bank data-controls">
                <span className="kicker">Data</span>
                <div className="button-row split">
                  <button onClick={fetchAircraft}>Refresh</button>
                  <button onClick={() => setAutoRefresh((value) => !value)}>
                    Auto {autoRefresh ? "on" : "off"}
                  </button>
                </div>
                <p>adsb.fi open ADS-B data via /api/aircraft</p>
              </section>

              <section className="control-bank upcoming">
                <span className="kicker">Up next / {activeScanMode.label}</span>
                {wallAircraft.slice(0, 5).map((plane, index) => (
                  <button
                    key={`${plane.id}-${index}`}
                    className={plane.id === selectedAircraft?.id ? "active" : ""}
                    onClick={() => {
                      setActiveIndex(index);
                      setRotationPaused(true);
                    }}
                  >
                    <span>{aircraftLabel(plane)}</span>
                    <small>{formatAlt(plane.altitude)} · {formatRoute(plane)}</small>
                  </button>
                ))}
                {!wallAircraft.length && <p>No matches for this scan mode.</p>}
              </section>

              <section className="control-bank trip-watch">
                <span className="kicker amber">Trip watch structure</span>
                {trackedFlights.map((tracker) => (
                  <div key={tracker.id}>
                    <strong>{tracker.name}</strong>
                    {tracker.hiddenOnGround ? (
                      <p>Tracked aircraft is on the ground. Turn off Hide Ground Aircraft to view it.</p>
                    ) : tracker.aircraft ? (
                      <p>
                        {locationText(tracker.aircraft)} · {formatAlt(tracker.aircraft.altitude)} ·{" "}
                        {formatSpeed(tracker.aircraft.groundSpeed)} ·{" "}
                        {aircraftTypeLabel(tracker.aircraft)} · {formatRoute(tracker.aircraft)}
                      </p>
                    ) : (
                      <p>Waiting for a known callsign or registration.</p>
                    )}
                  </div>
                ))}
              </section>
            </aside>
          )}
        </section>
      ) : (
        <section className="radar-layout" aria-label="Radar setup mode">
          <Suspense
            fallback={
              <section className="map-wrap map-loading">
                <div className="radar-overlay">
                  <span className="kicker">Radar / Setup</span>
                  <strong>Loading map...</strong>
                </div>
                <div className="credit">Data: adsb.fi open data · Map: OpenStreetMap</div>
              </section>
            }
          >
            <RadarMap
              aircraft={visibleAircraft}
              center={DEFAULT_CENTER}
              onSelectPlane={selectPlane}
              selectedAircraft={selectedAircraft}
              status={status}
            />
          </Suspense>

          <aside className="radar-panel">
            <section className="control-bank">
              <label>
                <span className="kicker">Search</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Flight, reg, hex, type"
                />
              </label>
              <label>
                <span className="kicker">Scan mode</span>
                <select value={scanMode} onChange={(event) => setScanMode(event.target.value)}>
                  {SCAN_MODES.map((mode) => (
                    <option value={mode.value} key={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toggle-control">
                <input
                  type="checkbox"
                  checked={hideGroundAircraft}
                  onChange={(event) => setHideGroundAircraft(event.target.checked)}
                />
                <span>Hide ground aircraft</span>
              </label>
              <label>
                <span className="kicker">Radius</span>
                <select value={radiusNm} onChange={(event) => setRadiusNm(Number(event.target.value))}>
                  {RADIUS_OPTIONS.map((radius) => (
                    <option value={radius} key={radius}>
                      {radius} NM
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="radar-selected">
              <span className="kicker amber">Selected aircraft</span>
              {selectedAircraft ? (
                <>
                  <h2>{aircraftLabel(selectedAircraft)}</h2>
                  <p>{aircraftTypeLabel(selectedAircraft)}</p>
                  <p>{formatRoute(selectedAircraft)}</p>
                  <dl>
                    <div>
                      <dt>Altitude</dt>
                      <dd>{formatAlt(selectedAircraft.altitude)}</dd>
                    </div>
                    <div>
                      <dt>Speed</dt>
                      <dd>{formatSpeed(selectedAircraft.groundSpeed)}</dd>
                    </div>
                    <div>
                      <dt>Heading</dt>
                      <dd>{formatHeading(selectedAircraft.track)}</dd>
                    </div>
                    <div>
                      <dt>Seen</dt>
                      <dd>{ageText(selectedAircraft.seen)}</dd>
                    </div>
                  </dl>
                  {selectedAircraft.hex && (
                    <a
                      href={`https://globe.adsb.fi/?icao=${selectedAircraft.hex}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in adsb.fi globe
                    </a>
                  )}
                </>
              ) : (
                <p>No aircraft selected.</p>
              )}
            </section>

            <section className="aircraft-list">
              {radarAircraft.slice(0, 80).map((plane) => (
                <button
                  key={plane.id}
                  className={plane.id === selectedAircraft?.id ? "plane-row active" : "plane-row"}
                  onClick={() => selectPlane(plane)}
                >
                  <span>
                    <b>{aircraftLabel(plane)}</b>
                    <small>{aircraftTypeLabel(plane)}</small>
                  </span>
                  <span className="right">
                    <b>{formatAlt(plane.altitude)}</b>
                    <small>{formatSpeed(plane.groundSpeed)}</small>
                  </span>
                </button>
              ))}
            </section>
          </aside>
        </section>
      )}
    </main>
  );
}
