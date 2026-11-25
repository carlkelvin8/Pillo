import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const leaflet = vi.hoisted(() => ({
  icon: vi.fn((options: Record<string, unknown>) => ({ options })),
  map: vi.fn(),
  marker: vi.fn(),
  tileLayer: vi.fn(),
}));

vi.mock("leaflet", () => leaflet);

import BranchLocationMap from "./branch-location-map";

describe("BranchLocationMap marker setup", () => {
  beforeEach(() => {
    const locationMap = {
      getBounds: vi.fn(() => ({ contains: vi.fn(() => true) })),
      hasLayer: vi.fn(() => false),
      invalidateSize: vi.fn(),
      on: vi.fn(),
      remove: vi.fn(),
      setView: vi.fn(),
    };
    const locationMarker = {
      addTo: vi.fn(),
      getLatLng: vi.fn(() => ({ lat: 14.6, lng: 121.0 })),
      on: vi.fn(),
      remove: vi.fn(),
      setLatLng: vi.fn().mockReturnThis(),
    };
    const mapInstance = { ...locationMap, setView: vi.fn() };
    mapInstance.setView.mockReturnValue(mapInstance);
    leaflet.map.mockReturnValue(mapInstance);
    leaflet.marker.mockReturnValue(locationMarker);
    leaflet.tileLayer.mockReturnValue({ addTo: vi.fn() });
    leaflet.icon.mockClear();
    leaflet.marker.mockClear();
  });

  it("provides explicit icon URLs so Leaflet can render branch pins", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(<BranchLocationMap latitude={14.6} longitude={121.0} onPin={vi.fn()} />);

    await waitFor(() => expect(leaflet.marker).toHaveBeenCalled());
    const markerOptions = leaflet.marker.mock.calls[0]?.[1] as {
      icon: { options: { iconUrl?: string; iconRetinaUrl?: string } };
    };

    expect(markerOptions.icon.options.iconUrl).toEqual(expect.any(String));
    expect(markerOptions.icon.options.iconUrl).not.toBe("");
    expect(markerOptions.icon.options.iconRetinaUrl).toEqual(expect.any(String));
  });

  it("does not remove a marker that has never been added to the map", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(<BranchLocationMap latitude={null} longitude={null} onPin={vi.fn()} />);

    await waitFor(() => expect(leaflet.marker).toHaveBeenCalled());
    const unaddedMarker = leaflet.marker.mock.results[0]?.value as {
      remove: ReturnType<typeof vi.fn>;
    };
    expect(unaddedMarker.remove).not.toHaveBeenCalled();
  });

  it("recenters and zooms when a searched place is selected", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    const onPin = vi.fn();
    const { rerender } = render(
      <BranchLocationMap latitude={null} longitude={null} onPin={onPin} focusKey={0} />,
    );
    await waitFor(() => expect(leaflet.marker).toHaveBeenCalled());
    const locationMap = leaflet.map.mock.results[0]?.value as {
      setView: ReturnType<typeof vi.fn>;
    };
    locationMap.setView.mockClear();

    rerender(
      <BranchLocationMap latitude={14.5995} longitude={120.9842} onPin={onPin} focusKey={1} />,
    );

    await waitFor(() =>
      expect(locationMap.setView).toHaveBeenCalledWith([14.5995, 120.9842], 16, {
        animate: true,
      }),
    );

    locationMap.setView.mockClear();
    rerender(<BranchLocationMap latitude={14.61} longitude={121.01} onPin={onPin} focusKey={1} />);
    expect(locationMap.setView).not.toHaveBeenCalled();

    rerender(
      <BranchLocationMap latitude={14.5995} longitude={120.9842} onPin={onPin} focusKey={2} />,
    );
    await waitFor(() =>
      expect(locationMap.setView).toHaveBeenCalledWith([14.5995, 120.9842], 16, {
        animate: true,
      }),
    );
  });
});
