"use client";

import { icon, map, marker, tileLayer, type LatLng, type Map, type Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

const PHILIPPINES: [number, number] = [12.8797, 121.774];
const PIN_ZOOM = 16;
const locationIcon = icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

export default function BranchLocationMap({
  latitude,
  longitude,
  onPin,
  focusKey = 0,
}: {
  latitude: number | null;
  longitude: number | null;
  onPin: (latitude: number, longitude: number) => void;
  focusKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const lastFocusKey = useRef(focusKey);
  const [initial] = useState<[number, number] | null>(() =>
    latitude !== null && longitude !== null ? [latitude, longitude] : null,
  );

  useEffect(() => {
    if (!container.current) return;
    const locationMap = map(container.current, {
      scrollWheelZoom: false,
      worldCopyJump: true,
    }).setView(initial ?? PHILIPPINES, initial ? PIN_ZOOM : 6);
    mapRef.current = locationMap;
    tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(locationMap);

    const select = (point: LatLng) => {
      const { lat, lng } = point.wrap();
      onPin(lat, lng);
    };
    locationMap.on("click", ({ latlng }) => select(latlng));

    const pin = marker(initial ?? PHILIPPINES, {
      icon: locationIcon,
      draggable: true,
      title: "Branch location pin",
    });
    pin.on("dragend", () => select(pin.getLatLng()));
    markerRef.current = pin;

    const observer = new ResizeObserver(() => locationMap.invalidateSize({ pan: false }));
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      locationMap.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [initial, onPin]);

  useEffect(() => {
    const locationMap = mapRef.current;
    const pin = markerRef.current;
    if (!locationMap || !pin) return;
    if (latitude === null || longitude === null) {
      if (locationMap.hasLayer(pin)) pin.remove();
      return;
    }
    const position: [number, number] = [latitude, longitude];
    if (!locationMap.getBounds().contains(position)) locationMap.setView(position, PIN_ZOOM);
    pin.setLatLng(position).addTo(locationMap);
  }, [initial, latitude, longitude, onPin]);

  useEffect(() => {
    const locationMap = mapRef.current;
    if (focusKey === lastFocusKey.current) return;
    lastFocusKey.current = focusKey;
    if (!locationMap || latitude === null || longitude === null) return;
    locationMap.setView([latitude, longitude], PIN_ZOOM, { animate: true });
  }, [focusKey, latitude, longitude]);

  return (
    <div
      ref={container}
      role="region"
      aria-label="Branch location map"
      className="rounded-control border-line bg-subtle relative isolate h-64 w-full border"
    />
  );
}
