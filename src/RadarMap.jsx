import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

export default function RadarMap({ aircraft, center, onSelectPlane, selectedAircraft, status }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const aircraftRef = useRef(aircraft);
  const onSelectPlaneRef = useRef(onSelectPlane);

  aircraftRef.current = aircraft;
  onSelectPlaneRef.current = onSelectPlane;

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: mapNode.current,
      center: [center.lon, center.lat],
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
              "raster-saturation": -0.9,
              "raster-brightness-min": 0.02,
              "raster-brightness-max": 0.36,
              "raster-contrast": 0.46,
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
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        const plane = aircraftRef.current.find((candidate) => candidate.id === id);
        if (plane) onSelectPlaneRef.current(plane);
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
  }, [center.lat, center.lon]);

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
    if (!selectedAircraft || !mapRef.current) return;
    if (!Number.isFinite(selectedAircraft.lon) || !Number.isFinite(selectedAircraft.lat)) return;

    mapRef.current.easeTo({
      center: [selectedAircraft.lon, selectedAircraft.lat],
      zoom: 8.8,
      duration: 900,
    });
  }, [selectedAircraft]);

  return (
    <section className="map-wrap">
      <div ref={mapNode} className="map" />
      <div className="radar-overlay">
        <span className="kicker">Radar / Setup</span>
        <strong>{status}</strong>
      </div>
      <div className="credit">Data: adsb.fi open data · Map: OpenStreetMap</div>
    </section>
  );
}
