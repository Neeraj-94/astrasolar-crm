# Google Address Autocomplete

Address fields in the CRM use Google Places Autocomplete. As the user types,
Google suggests real addresses; picking one fills the street, suburb, state,
and postcode automatically. Without an API key the inputs silently fall back to
plain text, so nothing breaks if the key is missing.

## What was added

| File | Purpose |
| --- | --- |
| `src/lib/google/maps-loader.ts` | Loads the Maps JS API once; `parsePlace()` normalises a Google result into `{ addressLine1, suburb, state, postcode, country, formatted, lat, lng }`. |
| `src/components/ui/address-autocomplete.tsx` | Reusable `<AddressAutocomplete>` input. Controlled, AU-restricted by default, calls `onSelect(parsedAddress)` when a suggestion is chosen. |
| `src/app/globals.css` | Dark-theme styling for Google's `.pac-container` dropdown + z-index so it sits above dialogs. |

Currently wired into: the **Blacklist** add form and the **Bloome leads** inline
address cell (which fills address + suburb + postcode together). Drop the
component into any future sales/customer form the same way.

## 1. Create the API key

1. Go to <https://console.cloud.google.com/> and select (or create) a project.
2. **APIs & Services → Library** — enable both:
   - **Maps JavaScript API**
   - **Places API**
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Copy the key.

## 2. Restrict the key (important — it ships to the browser)

On the key's edit page:

- **Application restrictions → Websites (HTTP referrers).** Add:
  - `http://localhost:3000/*` (local dev)
  - `https://<your-netlify-domain>/*`
  - your production domain, e.g. `https://crm.astrasolar.com.au/*`
- **API restrictions → Restrict key** → tick **Maps JavaScript API** and
  **Places API** only.

Referrer + API restrictions are what stop the public key from being abused.

## 3. Enable billing

Places requires a billing account. Google's monthly free credit covers typical
internal CRM volume, but billing must be enabled or requests are rejected.

## 4. Add the key to the app

Local — in `apps/web/.env.local`:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="AIza...your-key..."
```

Netlify — **Site settings → Environment variables** → add the same variable.
Then redeploy (env vars are baked in at build time because the name is
`NEXT_PUBLIC_*`).

Restart `npm run dev` after editing `.env.local`.

## 5. Verify

1. Open the Leads → Blacklist tab, or the Bloome leads inline address cell.
2. Start typing an address — a styled dropdown of suggestions appears.
3. Pick one. In the leads cell, suburb and postcode populate alongside the
   street. In the blacklist form, the full formatted address fills in.

## Notes

- Default country restriction is `au`. Override per-instance with the
  `country` prop (e.g. `country={["au", "nz"]}`).
- Want a different field split? `onSelect` hands you the full `ParsedAddress`;
  map whichever fields you need.
- The component is the **legacy** `places.Autocomplete` widget — stable and
  well-supported. If you later migrate to the new `PlaceAutocompleteElement`,
  only `maps-loader.ts` and the component internals change; callers stay the same.
