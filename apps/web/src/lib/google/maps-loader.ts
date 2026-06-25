/**
 * Lightweight, idempotent loader for the Google Maps JavaScript API
 * (Places library). The script is injected once and shared across every
 * component that needs it, so multiple <AddressAutocomplete> instances do
 * not each pull their own copy.
 *
 * Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your env. If the key is missing the
 * loader resolves to `null` and callers fall back to a plain text input.
 */

// Minimal typings so we don't need the @types/google.maps package. We only
// reference the handful of Places APIs the address component actually uses.
export type GoogleNamespace = typeof globalThis & {
  google?: {
    maps?: {
      places?: {
        Autocomplete: new (
          input: HTMLInputElement,
          opts?: Record<string, unknown>,
        ) => GoogleAutocomplete;
      };
    };
  };
};

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GooglePlaceResult {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  name?: string;
  geometry?: {
    location?: { lat: () => number; lng: () => number };
  };
}

export interface GoogleAutocomplete {
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => GooglePlaceResult;
  setFields: (fields: string[]) => void;
  setComponentRestrictions: (r: { country: string | string[] }) => void;
  setTypes: (types: string[]) => void;
}

const CALLBACK_NAME = "__astraGoogleMapsReady";

let loadPromise: Promise<GoogleNamespace["google"] | null> | null = null;

/**
 * Returns the loaded `google` namespace, or `null` when no API key is
 * configured or the script fails to load. Safe to call repeatedly and on the
 * server (resolves to null there).
 */
export function loadGoogleMaps(): Promise<GoogleNamespace["google"] | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const w = window as GoogleNamespace;
  if (w.google?.maps?.places) return Promise.resolve(w.google);

  if (loadPromise) return loadPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    // No key configured — caller should degrade to a plain input.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[maps-loader] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set; " +
          "address autocomplete is disabled.",
      );
    }
    return Promise.resolve(null);
  }

  loadPromise = new Promise((resolve) => {
    // The Maps script calls this global when ready.
    (window as unknown as Record<string, unknown>)[CALLBACK_NAME] = () => {
      resolve((window as GoogleNamespace).google ?? null);
    };

    const existing = document.getElementById("google-maps-js");
    if (existing) return; // another caller already injected the tag

    const script = document.createElement("script");
    script.id = "google-maps-js";
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=places&loading=async&callback=${CALLBACK_NAME}`;
    script.onerror = () => {
      // eslint-disable-next-line no-console
      console.error("[maps-loader] Failed to load Google Maps JS API.");
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** A normalised, framework-agnostic address shape. */
export interface ParsedAddress {
  /** Street number + route, e.g. "12 Smith St". */
  addressLine1: string;
  suburb: string;
  /** State/territory short code, e.g. "ACT", "NSW". */
  state: string;
  postcode: string;
  country: string;
  /** Google's full formatted string. */
  formatted: string;
  lat: number | null;
  lng: number | null;
}

function pick(
  components: GoogleAddressComponent[],
  type: string,
  variant: "long_name" | "short_name" = "long_name",
): string {
  const match = components.find((c) => c.types.includes(type));
  return match ? match[variant] : "";
}

/** Turn a Google place result into our normalised ParsedAddress. */
export function parsePlace(place: GooglePlaceResult): ParsedAddress {
  const components = place.address_components ?? [];
  const streetNumber = pick(components, "street_number");
  const route = pick(components, "route");
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ").trim();

  // Suburb: try locality, then the postal town / sublocality fallbacks AU uses.
  const suburb =
    pick(components, "locality") ||
    pick(components, "postal_town") ||
    pick(components, "sublocality") ||
    pick(components, "administrative_area_level_2");

  const loc = place.geometry?.location;

  return {
    addressLine1,
    suburb,
    state: pick(components, "administrative_area_level_1", "short_name"),
    postcode: pick(components, "postal_code"),
    country: pick(components, "country"),
    formatted: place.formatted_address ?? "",
    lat: loc ? loc.lat() : null,
    lng: loc ? loc.lng() : null,
  };
}
