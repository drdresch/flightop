import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

const DEFAULT_CENTER = {
  lat: 45.5898,
  lon: -122.5951,
};

const DEFAULT_RADIUS_NM = 120;
const REFRESH_MS = 15_000;

function formatAlt(altitude) {
  if (altitude == null) return "n/a";
  if (altitude === "ground") return "GROUND";
  return `${Number(altitude).toLocaleString()} ft`;
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

function ageText(seconds) {
  const number = Number(seconds);
  if (!Number.isFinite(number)) return "fresh-ish";
  if (number < 1) return "now";
  return `${Math.round(number)}s ago`;
}

function aircraftLabel(plane) {
  return plane.flight || plane.registration || plane.hex || "UNKNOWN";
}

function makeAircraftGeoJson(aircraft) {
  return {
    type: "FeatureCollection",
    features: aircraft.map((plane) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [plane.lon, plane.lat],
      },
      properties: {
        hex: plane.hex,
        label: aircraftLabel(plane),
        flight: plane.flight,
        altitude: plane.altitude ?? "",
        speed: plane.groundSpeed ?? "",
        track: Number(plane.track) || 0,
        emergency: plane.emergency || "",
      },
    })),
  };
}

function sortAircraft(aircraft, mode) {
  const copy = [...aircraft];
  if (mode === "lowest") {
    return copy.sort((a, b) => {
      const aa = a.altitude === "ground" ? 0 : Number(a.altitude ?? 999999);
      const bb = b.altitude === "ground" ? 0 : Number(b.altitude ?? 999999);
      return aa - bb;
    });
  }
  if (mode === "fastest") {
    return copy.sort((a, b) => Number(b.groundSpeed ?? 0) - Number(a.groundSpeed ?? 0));
  }
  return copy.sort((a, b) => Number(a.distanceNm ?? 999999) - Number(b.distanceNm ?? 999999));
}

export default function App() {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const [aircraft, setAircraft] = useState([]);
  const [selectedHex, setSelectedHex] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState("Loading aircraft...");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("nearest");
  const [radiusNm, setRadiusNm] = useState(DEFAULT_RADIUS_NM);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [followSelected, setFollowSelected] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  const selectedAircraft = useMemo(() => {
    return aircraft.find((plane) => plane.hex === selectedHex) || aircraft[0] || null;
  }, [aircraft, selectedHex]);

  const filteredAircraft = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? aircraft.filter((plane) => {
          const blob = [
            plane.flight,
            plane.registration,
            plane.hex,
            plane.type,
            plane.squawk,
            plane.category,
          ].join(" ").toLowerCase();
          return blob.includes(q);
        })
      : aircraft;

    return sortAircraft(filtered, sortMode);
  }, [aircraft, query, sortMode]);

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

      setAircraft(data.aircraft || []);
      setLastUpdated(data.fetchedAt || new Date().toISOString());
      setStatus(`${data.aircraft?.length || 0} aircraft within ${data.radiusNm} NM`);
    } catch (error) {
      setStatus(`Could not load aircraft: ${error.message}`);
    }
  }, [radiusNm]);

  useEffect(() => {
    fetchAircraft();
  }, [fetchAircraft]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(fetchAircraft, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchAircraft]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapNode.current,
      center: [DEFAULT_CENTER.lon, DEFAULT_CENTER.lat],
      zoom: 7.6,
      pitch: 0,
      bearing: 0,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
            paint: {
              "raster-saturation": -0.85,
              "raster-brightness-min": 0.05,
              "raster-brightness-max": 0.42,
              "raster-contrast": 0.38,
            },
          },
        ],
      },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("aircraft", {
        type: "geojson",
        data: makeAircraftGeoJson([]),
      });

      map.addLayer({
        id: "aircraft-glow",
        type: "circle",
        source: "aircraft",
        paint: {
          "circle-radius": 14,
          "circle-color": [
            "case",
            ["!=", ["get", "emergency"], ""],
            "#ff4d4d",
            "#9affd2",
          ],
          "circle-opacity": 0.18,
          "circle-blur": 0.75,
        },
      });

      map.addLayer({
        id: "aircraft-dot",
        type: "circle",
        source: "aircraft",
        paint: {
          "circle-radius": 4.5,
          "circle-color": [
            "case",
            ["!=", ["get", "emergency"], ""],
            "#ff4d4d",
            "#d7ffe8",
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#10231b",
        },
      });

      map.addLayer({
        id: "aircraft-plane",
        type: "symbol",
        source: "aircraft",
        layout: {
          "text-field": "✈",
          "text-size": 20,
          "text-rotate": ["get", "track"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": [
            "case",
            ["!=", ["get", "emergency"], ""],
            "#ff4d4d",
            "#9affd2",
          ],
          "text-halo-color": "#07120d",
          "text-halo-width": 1.5,
        },
      });

      map.addLayer({
        id: "aircraft-label",
        type: "symbol",
        source: "aircraft",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-anchor": "top",
          "text-offset": [0, 1.15],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#eaf7ef",
          "text-halo-color": "#07120d",
          "text-halo-width": 1.25,
        },
      });

      map.on("click", "aircraft-plane", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const hex = feature.properties?.hex;
        if (hex) setSelectedHex(hex);
      });

      map.on("mouseenter", "aircraft-plane", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "aircraft-plane", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const update = () => {
      const source = map.getSource("aircraft");
      if (source) {
        source.setData(makeAircraftGeoJson(aircraft));
      }
    };

    if (map.loaded()) update();
    else map.once("load", update);
  }, [aircraft]);

  useEffect(() => {
    if (!followSelected || !selectedAircraft || !mapRef.current) return;

    mapRef.current.easeTo({
      center: [selectedAircraft.lon, selectedAircraft.lat],
      zoom: 8.6,
      duration: 900,
    });
  }, [followSelected, selectedAircraft]);

  function selectPlane(plane) {
    setSelectedHex(plane.hex);
    if (mapRef.current) {
      mapRef.current.easeTo({
        center: [plane.lon, plane.lat],
        zoom: 9,
        duration: 700,
      });
    }
  }

  return (
    <main className="app">
      <section className="map-wrap">
        <div ref={mapNode} className="map" />

        <div className="topbar">
          <div>
            <div className="eyebrow">LIVE AIRSPACE</div>
            <h1>Flight Ops Dashboard</h1>
          </div>
          <div className="status-pill">
            <span className={autoRefresh ? "pulse on" : "pulse"} />
            {status}
          </div>
        </div>

        <div className="controls">
          <button onClick={fetchAircraft}>Refresh now</button>
          <button onClick={() => setAutoRefresh((value) => !value)}>
            Auto: {autoRefresh ? "on" : "off"}
          </button>
          <button onClick={() => setFollowSelected((value) => !value)}>
            Follow: {followSelected ? "on" : "off"}
          </button>
          <label>
            Radius
            <select value={radiusNm} onChange={(event) => setRadiusNm(Number(event.target.value))}>
              <option value="40">40 NM</option>
              <option value="80">80 NM</option>
              <option value="120">120 NM</option>
              <option value="180">180 NM</option>
              <option value="250">250 NM</option>
            </select>
          </label>
        </div>

        <div className="credit">
          Data: adsb.fi open data · Map: OpenStreetMap
        </div>
      </section>

      <aside className={`panel ${isPanelCollapsed ? "collapsed" : ""}`}>
        <button className="collapse" onClick={() => setIsPanelCollapsed((value) => !value)}>
          {isPanelCollapsed ? "Show" : "Hide"}
        </button>

        {!isPanelCollapsed && (
          <>
            <section className="hero-card">
              <div className="card-title">Currently watching</div>
              {selectedAircraft ? (
                <>
                  <h2>{aircraftLabel(selectedAircraft)}</h2>
                  <div className="big-meta">
                    <span>{formatAlt(selectedAircraft.altitude)}</span>
                    <span>{formatSpeed(selectedAircraft.groundSpeed)}</span>
                  </div>
                  <div className="grid">
                    <div>
                      <small>Type</small>
                      <b>{selectedAircraft.type || "n/a"}</b>
                    </div>
                    <div>
                      <small>Reg</small>
                      <b>{selectedAircraft.registration || "n/a"}</b>
                    </div>
                    <div>
                      <small>Track</small>
                      <b>{Math.round(Number(selectedAircraft.track) || 0)}°</b>
                    </div>
                    <div>
                      <small>Vert rate</small>
                      <b>{formatRate(selectedAircraft.verticalRate)}</b>
                    </div>
                    <div>
                      <small>Squawk</small>
                      <b>{selectedAircraft.squawk || "n/a"}</b>
                    </div>
                    <div>
                      <small>Seen</small>
                      <b>{ageText(selectedAircraft.seenPos ?? selectedAircraft.seen)}</b>
                    </div>
                  </div>
                  {selectedAircraft.hex && (
                    <a
                      className="external"
                      href={`https://globe.adsb.fi/?icao=${selectedAircraft.hex}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in adsb.fi globe
                    </a>
                  )}
                </>
              ) : (
                <p>No aircraft loaded yet.</p>
              )}
            </section>

            <section className="tools">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search flight, hex, type..."
              />
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                <option value="nearest">Nearest</option>
                <option value="lowest">Lowest</option>
                <option value="fastest">Fastest</option>
              </select>
            </section>

            <section className="aircraft-list">
              {filteredAircraft.slice(0, 60).map((plane) => (
                <button
                  key={`${plane.hex}-${plane.flight}`}
                  className={`plane-row ${plane.hex === selectedAircraft?.hex ? "active" : ""}`}
                  onClick={() => selectPlane(plane)}
                >
                  <span>
                    <b>{aircraftLabel(plane)}</b>
                    <small>{plane.type || plane.registration || plane.hex}</small>
                  </span>
                  <span className="right">
                    <b>{formatAlt(plane.altitude)}</b>
                    <small>{formatSpeed(plane.groundSpeed)}</small>
                  </span>
                </button>
              ))}
            </section>

            <footer>
              <p>
                Last update: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "n/a"}
              </p>
              <p>
                Tip: put this browser window on monitor 3, then hit fullscreen.
              </p>
            </footer>
          </>
        )}
      </aside>
    </main>
  );
}
