import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const mapStyle = {
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
        "raster-saturation": -0.9,
        "raster-brightness-min": 0.02,
        "raster-brightness-max": 0.36,
        "raster-contrast": 0.46,
      },
    },
  ],
};

function aircraftLabel(plane) {
  return plane.callsign || plane.registration || plane.hex || "UNKNOWN";
}

function makeAircraftGeoJson(aircraft) {
  return {
    type: "FeatureCollection",
    features: aircraft
      .filter((plane) => Number.isFinite(plane.lat) && Number.isFinite(plane.lon))
      .map((plane) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [plane.lon, plane.lat],
        },
        properties: {
          id: plane.id,
          label: aircraftLabel(plane),
          track: Number(plane.track) || 0,
          emergency: plane.emergency || plane.alert ? "yes" : "",
        },
      })),
  };
}

function boundsToPolygon(bounds) {
  if (!bounds) return null;
  return [
    [
      [bounds.west, bounds.north],
      [bounds.east, bounds.north],
      [bounds.east, bounds.south],
      [bounds.west, bounds.south],
      [bounds.west, bounds.north],
    ],
  ];
}

function circleToPolygon(center, radiusNm) {
  const points = [];
  const radiusDegrees = radiusNm / 60;
  const latRadians = (center.lat * Math.PI) / 180;
  const lonScale = Math.max(0.2, Math.cos(latRadians));

  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    points.push([
      center.lon + (Math.cos(angle) * radiusDegrees) / lonScale,
      center.lat + Math.sin(angle) * radiusDegrees,
    ]);
  }

  return [points];
}

function areaGeoJson(monitorArea, draftBounds) {
  const bounds = draftBounds || monitorArea.bounds;
  const coordinates = bounds
    ? boundsToPolygon(bounds)
    : circleToPolygon(monitorArea.center, monitorArea.radiusNm || monitorArea.fetchRadiusNm || 20);

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates,
        },
        properties: {
          label: draftBounds ? "Drawing area" : monitorArea.label,
        },
      },
    ],
  };
}

function boundsFromClicks(first, second) {
  return {
    north: Math.max(first.lat, second.lat),
    south: Math.min(first.lat, second.lat),
    east: Math.max(first.lng, second.lng),
    west: Math.min(first.lng, second.lng),
  };
}

export default function RadarMap({
  aircraft,
  center,
  draftBounds,
  drawMode,
  monitorArea,
  onAreaDrawn,
  onCancelDrawArea,
  onDraftBoundsChange,
  onSelectPlane,
  selectedAircraft,
  status,
}) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const aircraftRef = useRef(aircraft);
  const areaRef = useRef(monitorArea);
  const draftBoundsRef = useRef(draftBounds);
  const drawModeRef = useRef(drawMode);
  const drawStartRef = useRef(null);
  const onAreaDrawnRef = useRef(onAreaDrawn);
  const onDraftBoundsChangeRef = useRef(onDraftBoundsChange);
  const onSelectPlaneRef = useRef(onSelectPlane);

  aircraftRef.current = aircraft;
  areaRef.current = monitorArea;
  draftBoundsRef.current = draftBounds;
  drawModeRef.current = drawMode;
  onAreaDrawnRef.current = onAreaDrawn;
  onDraftBoundsChangeRef.current = onDraftBoundsChange;
  onSelectPlaneRef.current = onSelectPlane;

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapNode.current,
      center: [center.lon, center.lat],
      zoom: 7.6,
      pitch: 0,
      bearing: 0,
      style: mapStyle,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    mapRef.current = map;

    // The setup panel can change size after the lazy-loaded map mounts.
    // Keep MapLibre's canvas in lockstep with the visible map container.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapNode.current);

    map.on("load", () => {
      map.addSource("monitor-area", {
        type: "geojson",
        data: areaGeoJson(areaRef.current, draftBoundsRef.current),
      });

      map.addLayer({
        id: "monitor-area-fill",
        type: "fill",
        source: "monitor-area",
        paint: {
          "fill-color": "#f0ad3d",
          "fill-opacity": 0.15,
        },
      });

      map.addLayer({
        id: "monitor-area-line",
        type: "line",
        source: "monitor-area",
        paint: {
          "line-color": "#f0ad3d",
          "line-width": 2,
          "line-dasharray": [2, 1.3],
        },
      });

      map.addSource("aircraft", {
        type: "geojson",
        data: makeAircraftGeoJson(aircraftRef.current),
      });

      map.addLayer({
        id: "aircraft-glow",
        type: "circle",
        source: "aircraft",
        paint: {
          "circle-radius": 16,
          "circle-color": [
            "case",
            ["!=", ["get", "emergency"], ""],
            "#ff4d5a",
            "#88ffd2",
          ],
          "circle-opacity": 0.2,
          "circle-blur": 0.82,
        },
      });

      map.addLayer({
        id: "aircraft-dot",
        type: "circle",
        source: "aircraft",
        paint: {
          "circle-radius": 4.75,
          "circle-color": [
            "case",
            ["!=", ["get", "emergency"], ""],
            "#ff4d5a",
            "#f1fff7",
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#08110d",
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
            "#ff4d5a",
            "#88ffd2",
          ],
          "text-halo-color": "#08110d",
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
          "text-color": "#f1fff7",
          "text-halo-color": "#08110d",
          "text-halo-width": 1.25,
        },
      });

      map.on("click", "aircraft-plane", (event) => {
        if (drawModeRef.current) return;
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        const plane = aircraftRef.current.find((candidate) => candidate.id === id);
        if (plane) onSelectPlaneRef.current(plane);
      });

      map.on("mouseenter", "aircraft-plane", () => {
        if (drawModeRef.current) return;
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "aircraft-plane", () => {
        map.getCanvas().style.cursor = drawModeRef.current ? "crosshair" : "";
      });

      map.on("click", (event) => {
        if (!drawModeRef.current) return;

        if (!drawStartRef.current) {
          drawStartRef.current = event.lngLat;
          onDraftBoundsChangeRef.current?.(boundsFromClicks(event.lngLat, event.lngLat));
          return;
        }

        const bounds = boundsFromClicks(drawStartRef.current, event.lngLat);
        drawStartRef.current = null;
        onAreaDrawnRef.current?.(bounds);
      });

      map.on("mousemove", (event) => {
        if (!drawModeRef.current || !drawStartRef.current) return;
        onDraftBoundsChangeRef.current?.(boundsFromClicks(drawStartRef.current, event.lngLat));
      });
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const update = () => {
      const source = map.getSource("aircraft");
      if (source) source.setData(makeAircraftGeoJson(aircraft));
    };

    if (map.loaded()) update();
    else map.once("load", update);
  }, [aircraft]);

  useEffect(() => {
    drawStartRef.current = null;
    if (!drawMode) onDraftBoundsChange?.(null);
  }, [drawMode, onDraftBoundsChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const update = () => {
      const source = map.getSource("monitor-area");
      if (source) source.setData(areaGeoJson(monitorArea, draftBounds));
      map.getCanvas().style.cursor = drawMode ? "crosshair" : "";
    };

    if (map.loaded()) update();
    else map.once("load", update);
  }, [monitorArea, draftBounds, drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (monitorArea.type === "rectangle" && monitorArea.bounds) {
      map.fitBounds(
        [
          [monitorArea.bounds.west, monitorArea.bounds.south],
          [monitorArea.bounds.east, monitorArea.bounds.north],
        ],
        { padding: 80, duration: 700, maxZoom: 10 }
      );
      return;
    }

    map.easeTo({
      center: [center.lon, center.lat],
      zoom: monitorArea.radiusNm <= 20 ? 9.2 : 7.6,
      duration: 700,
    });
  }, [center.lat, center.lon, monitorArea]);

  useEffect(() => {
    if (!selectedAircraft || !mapRef.current) return;
    if (!Number.isFinite(selectedAircraft.lon) || !Number.isFinite(selectedAircraft.lat)) return;

    mapRef.current.easeTo({
      center: [selectedAircraft.lon, selectedAircraft.lat],
      zoom: 8.8,
      duration: 900,
    });
  }, [selectedAircraft]);

  return (
    <section className={`map-wrap ${drawMode ? "drawing-area" : ""}`}>
      <div ref={mapNode} className="map" />
      <div className="radar-overlay">
        <span className="kicker">Radar / Setup</span>
        <strong>{status}</strong>
      </div>
      {drawMode && (
        <div className="draw-overlay">
          <span className="kicker amber">Draw area</span>
          <strong>Click two corners on the map</strong>
          <button onClick={onCancelDrawArea}>Cancel</button>
        </div>
      )}
      <div className="credit">Data: adsb.fi open data · Map: OpenStreetMap</div>
    </section>
  );
}
