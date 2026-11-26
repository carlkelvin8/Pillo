"use client";

import { MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { branchCoordinatesSchema } from "@/features/branches/schemas";
import type { ActionState } from "@/lib/action-state";

const BranchLocationMap = dynamic(() => import("./branch-location-map"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="rounded-control bg-subtle text-muted grid h-64 place-items-center text-sm"
    >
      Loading map…
    </div>
  ),
});

type PlaceResult = { latitude: number; longitude: number; label: string };
type NominatimResult = { lat: string; lon: string; display_name: string };

export function BranchLocationField({
  latitude,
  longitude,
  errors,
}: {
  latitude: number | null;
  longitude: number | null;
  errors?: ActionState["fieldErrors"];
}) {
  const mapId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const searchRequest = useRef(0);
  const [point, setPoint] = useState({
    latitude: latitude?.toFixed(6) ?? "",
    longitude: longitude?.toFixed(6) ?? "",
  });
  const parsed = branchCoordinatesSchema.safeParse(point);
  const onPin = useCallback((lat: number, lng: number) => {
    setPoint({ latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
  }, []);

  const searchPlaces = async () => {
    const search = query.trim();
    if (!search || searching) return;

    const requestId = ++searchRequest.current;
    setSearching(true);
    setSearchMessage("");
    setResults([]);
    try {
      const response = await fetch(`/api/geocoding/search?q=${encodeURIComponent(search)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        if (requestId === searchRequest.current) {
          setSearchMessage(
            response.status === 429 && typeof payload?.error === "string"
              ? payload.error
              : "Search failed. Please try again.",
          );
        }
        return;
      }
      const data = (await response.json()) as NominatimResult[];
      const places = data.flatMap((place) => {
        const latitude = Number(place.lat);
        const longitude = Number(place.lon);
        return Number.isFinite(latitude) && Number.isFinite(longitude) && place.display_name
          ? [{ latitude, longitude, label: place.display_name }]
          : [];
      });
      if (requestId !== searchRequest.current) return;
      setResults(places);
      if (places.length === 0)
        setSearchMessage("No places found. Try a nearby landmark or address.");
    } catch {
      if (requestId === searchRequest.current) {
        setSearchMessage("Search failed. Please try again.");
      }
    } finally {
      if (requestId === searchRequest.current) setSearching(false);
    }
  };

  const choosePlace = (place: PlaceResult) => {
    setPoint({ latitude: place.latitude.toFixed(6), longitude: place.longitude.toFixed(6) });
    setQuery(place.label);
    setResults([]);
    setSearchMessage("");
    setOpen(true);
    setFocusKey((key) => key + 1);
  };

  return (
    <fieldset className="border-line flex min-w-0 flex-col gap-3 border-t pt-3">
      <legend className="pt-2 text-sm font-semibold">Map location</legend>
      <p className="text-muted text-sm">Patients can use this pin to find the branch.</p>
      <div role="search" className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`${mapId}-search`}>
          Search address or place
        </label>
        <Input
          id={`${mapId}-search`}
          value={query}
          onChange={(event) => {
            searchRequest.current += 1;
            setSearching(false);
            setQuery(event.target.value);
            setResults([]);
            setSearchMessage("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void searchPlaces();
            }
          }}
          placeholder="Search an address or place"
          autoComplete="street-address"
        />
        <Button
          type="button"
          onClick={() => void searchPlaces()}
          disabled={searching || !query.trim()}
        >
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>
      {searchMessage ? (
        <p
          role={searchMessage.startsWith("Search failed") ? "alert" : "status"}
          className="text-muted text-sm"
        >
          {searchMessage}
        </p>
      ) : null}
      {results.length > 0 ? (
        <>
          <p className="text-muted text-xs">
            Search results from OpenStreetMap. ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              OpenStreetMap contributors
            </a>
            .
          </p>
          <ul
            aria-label="Search results"
            className="border-line divide-line rounded-control divide-y border"
          >
            {results.map((place) => (
              <li key={`${place.latitude},${place.longitude}`}>
                <button
                  type="button"
                  onClick={() => choosePlace(place)}
                  className="hover:bg-canvas min-h-11 w-full px-3 py-2 text-left text-sm"
                >
                  {place.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={open}
          aria-controls={mapId}
          onClick={() => setOpen(!open)}
        >
          <MapPin aria-hidden="true" />
          {open ? "Hide map" : "Set pin on map"}
        </Button>
        {point.latitude || point.longitude ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setPoint({ latitude: "", longitude: "" })}
          >
            Clear pin
          </Button>
        ) : null}
      </div>
      <div id={mapId} hidden={!open}>
        {open ? (
          <>
            <p className="text-muted mb-2 text-sm">
              Search for a place, click the map, or drag the pin to adjust.
            </p>
            <BranchLocationMap
              latitude={parsed.data?.latitude ?? null}
              longitude={parsed.data?.longitude ?? null}
              onPin={onPin}
              focusKey={focusKey}
            />
          </>
        ) : null}
      </div>
      <input type="hidden" name="latitude" value={point.latitude} />
      <input type="hidden" name="longitude" value={point.longitude} />
      {errors?.latitude?.[0] || errors?.longitude?.[0] ? (
        <p role="alert" className="text-danger-chip-ink text-sm">
          Choose a valid map location.
        </p>
      ) : null}
    </fieldset>
  );
}
