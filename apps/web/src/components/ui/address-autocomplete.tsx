"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  loadGoogleMaps,
  parsePlace,
  type GoogleAutocomplete,
  type ParsedAddress,
} from "@/lib/google/maps-loader";

export type AddressAutocompleteProps = {
  /** Current text value of the input (the street/address line). */
  value: string;
  /** Fires on every keystroke so the field stays controlled. */
  onChange: (value: string) => void;
  /**
   * Fires once when the user picks a suggestion from the dropdown, with the
   * full parsed address. Use this to fill suburb / state / postcode etc.
   */
  onSelect?: (address: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
  /** ISO country code(s) to bias/restrict results to. Defaults to "au". */
  country?: string | string[];
  id?: string;
  name?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
};

/**
 * A controlled text input enhanced with Google Places autocomplete.
 *
 * - Degrades gracefully to a plain input when no API key is configured or the
 *   Maps script fails to load, so forms never break.
 * - Restricts results to Australia by default (override via `country`).
 * - On selection, calls `onSelect` with a normalised {@link ParsedAddress}
 *   AND `onChange` with the street line, keeping the input controlled.
 */
export const AddressAutocomplete = React.forwardRef<
  HTMLInputElement,
  AddressAutocompleteProps
>(function AddressAutocomplete(
  {
    value,
    onChange,
    onSelect,
    placeholder = "Start typing an address…",
    className,
    country = "au",
    id,
    name,
    disabled,
    autoFocus,
    onBlur,
    onKeyDown,
    ...rest
  },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLInputElement | null>(null);
  const acRef = React.useRef<GoogleAutocomplete | null>(null);

  // Keep latest callbacks in refs so the listener (attached once) stays fresh.
  const onSelectRef = React.useRef(onSelect);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
    onChangeRef.current = onChange;
  });

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  React.useEffect(() => {
    let cancelled = false;

    loadGoogleMaps().then((google) => {
      if (cancelled || !google?.maps?.places || !innerRef.current) return;
      if (acRef.current) return; // already wired

      const ac = new google.maps.places.Autocomplete(innerRef.current, {
        types: ["address"],
        componentRestrictions: { country },
        fields: ["address_components", "formatted_address", "geometry", "name"],
      });
      acRef.current = ac;

      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.address_components) return; // user typed but didn't pick
        const parsed = parsePlace(place);
        onChangeRef.current(parsed.addressLine1 || parsed.formatted);
        onSelectRef.current?.(parsed);
      });
    });

    return () => {
      cancelled = true;
    };
    // `country` is stable per-instance; re-running would orphan the widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      {...rest}
      ref={setRefs}
      id={id}
      name={name}
      type="text"
      value={value}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      // Stop the browser's native autofill from covering Google's dropdown.
      autoComplete="off"
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
});
