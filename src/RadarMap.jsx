import React, { useEffect, useRef } from "react";

const NM_TO_METERS = 1852;

function aircraftLabel(plane) {
  return plane.callsign || plane.registration || plane.hex || "UNKNOWN";
}

function areaBounds(bounds) {
  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];
}

function boundsFromPoints(first, second) {
  return {
    north: Math.max(first.lat, second.lat),
    south: Math.min(first.lat, second.lat),
    east: Math.max(first.lng, second.lng),
    west: Math.min(first.lng, second.lng),
  };
}

function updateAreaLayer(L, layerGroup, monitorArea, draftBounds) {
  layerGroup.clearLayers();
  const style = {
    color: "#f0ad3d",
    fillColor: "#f0ad3d",
    fillOpacity: 0.12,
    opacity: 0.95,
    weight: 2,
    dashArray: "8 6",
  };

  if (draftBounds || (monitorArea.type === "rectangle" && monitorArea.bounds)) {
    L.rectangle(areaBounds(draftBounds || monitorArea.bounds), style).addTo(layerGroup);
    return;
  }

  L.circle([monitorArea.center.lat, monitorArea.center.lon], {
    ...style,
    radius: (monitorArea.radiusNm || monitorArea.fetchRadiusNm || 20) * NM_TO_METERS,
  }).addTo(layerGroup);
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
  const aircraftLayerRef = useRef(null);
  const areaLayerRef = useRef(null);
  const drawStartRef = useRef(null);
  const drawModeRef = useRef(drawMode);
  const onAreaDrawnRef = useRef(onAreaDrawn);
  const onDraftBoundsChangeRef = useRef(onDraftBoundsChange);

  drawModeRef.current = drawMode;
  onAreaDrawnRef.current = onAreaDrawn;
  onDraftBoundsChangeRef.current = onDraftBoundsChange;

  useEffect(() => {
    const L = window.L;
    if (!L || !mapNode.current || mapRef.current) return undefined;

    const map = L.map(mapNode.current, {
      attributionControl: false,
      zoomControl: true,
    }).setView([center.lat, center.lon], 8);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      crossOrigin: true,
      attribution: "OpenStreetMap",
    }).addTo(map);

    aircraftLayerRef.current = L.layerGroup().addTo(map);
    areaLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.invalidateSize(false));
    resizeObserver.observe(mapNode.current);

    map.on("click", (event) => {
      if (!drawModeRef.current) return;
      if (!drawStartRef.current) {
        drawStartRef.current = event.latlng;
        onDraftBoundsChangeRef.current?.(boundsFromPoints(event.latlng, event.latlng));
        return;
      }

      const bounds = boundsFromPoints(drawStartRef.current, event.latlng);
      drawStartRef.current = null;
      onAreaDrawnRef.current?.(bounds);
    });

    map.on("mousemove", (event) => {
      if (!drawModeRef.current || !drawStartRef.current) return;
      onDraftBoundsChangeRef.current?.(boundsFromPoints(drawStartRef.current, event.latlng));
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      aircraftLayerRef.current = null;
      areaLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = window.L;
    const layerGroup = aircraftLayerRef.current;
    if (!L || !layerGroup) return;

    layerGroup.clearLayers();
    aircraft
      .filter((plane) => Number.isFinite(plane.lat) && Number.isFinite(plane.lon))
      .forEach((plane) => {
        const emergency = Boolean(plane.emergency || plane.alert);
        const marker = L.circleMarker([plane.lat, plane.lon], {
          radius: selectedAircraft?.id === plane.id ? 7 : 5,
          color: emergency ? "#ff4d5a" : "#08110d",
          fillColor: emergency ? "#ff4d5a" : "#88ffd2",
          fillOpacity: 1,
          opacity: 1,
          weight: 2,
        });

        marker.bindTooltip(aircraftLabel(plane), {
          className: "aircraft-map-label",
          direction: "top",
          offset: [0, -7],
        });
        marker.on("click", () => {
          if (!drawModeRef.current) onSelectPlane(plane);
        });
        marker.addTo(layerGroup);
      });
  }, [aircraft, onSelectPlane, selectedAircraft]);

  useEffect(() => {
    const L = window.L;
    if (!L || !areaLayerRef.current) return;
    updateAreaLayer(L, areaLayerRef.current, monitorArea, draftBounds);
  }, [monitorArea, draftBounds]);

  useEffect(() => {
    drawStartRef.current = null;
    if (!drawMode) onDraftBoundsChange?.(null);
    if (mapRef.current) {
      mapRef.current.getContainer().style.cursor = drawMode ? "crosshair" : "grab";
    }
  }, [drawMode, onDraftBoundsChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (monitorArea.type === "rectangle" && monitorArea.bounds) {
      map.fitBounds(areaBounds(monitorArea.bounds), { padding: [40, 40], maxZoom: 10 });
      return;
    }

    map.setView(
      [center.lat, center.lon],
      monitorArea.radiusNm <= 20 ? 10 : monitorArea.radiusNm <= 60 ? 8 : 7,
      { animate: true }
    );
  }, [center.lat, center.lon, monitorArea]);

  useEffect(() => {
    if (!selectedAircraft || !mapRef.current) return;
    if (!Number.isFinite(selectedAircraft.lon) || !Number.isFinite(selectedAircraft.lat)) return;
    mapRef.current.flyTo([selectedAircraft.lat, selectedAircraft.lon], 9, { duration: 0.8 });
  }, [selectedAircraft]);

  return (
    <section className={`map-wrap ${drawMode ? "drawing-area" : ""}`}>
      <div ref={mapNode} className="map" aria-label="Radar map" />
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
