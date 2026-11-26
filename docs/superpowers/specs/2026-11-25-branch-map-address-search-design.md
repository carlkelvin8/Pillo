# Branch Map Address Search Design

## Intent

Make it easier for clinic staff to set a branch pin without manually zooming and panning across the Philippines map.

## Design

Add a place/address search control to the branch location map. Search runs only after an explicit user action and goes through an authenticated server endpoint with a configurable provider URL, shared per-server request spacing, and short-lived result caching. Search results show OpenStreetMap attribution. Choosing one updates the coordinates, places the pin, and centers/zooms the map to that location once. Keep map-click placement and marker dragging for precise adjustment. Remove the visible latitude and longitude fields; coordinates remain managed internally and submitted with the form.

## Approaches considered

- Address/place search with map recentering: recommended because it avoids most manual zooming and searching while preserving precise pin adjustment.
- Start with a closer map view: simpler, but staff still have to pan and zoom to find each branch.

## Constraints and calls

- Reuse the current Leaflet/OpenStreetMap map and submit hidden coordinate inputs with the existing outer form.
- Preserve OpenStreetMap attribution and follow the provider's current search-service usage requirements.
- Show loading, empty-result, and request-error states in the search control.
