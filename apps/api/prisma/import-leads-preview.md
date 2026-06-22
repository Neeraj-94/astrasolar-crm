# Leads import — dry-run preview

Source: `prisma/data/leads-import.json` (3,411 leads) → `Lead` table (upsert by `id`).
Run the importer: `npm run db:import-leads --workspace=@astra/api`
Preview only (writes nothing): `npm run db:import-leads --workspace=@astra/api -- --dry-run`

## User resolution

| | matched to real user | placeholder created | fallback |
|---|---|---|---|
| **leadGen** (required) | 3,041 | 66 | 304 → `Unknown (import)` user |
| **consultant** (optional) | 2,819 | 118 | 474 → `null` |

Placeholder users created (inactive, `imported.<slug>@imported.astrasolar.local`):

| name | leads |
|---|---|
| GUY | 101 |
| Inbound | 42 |
| Max | 24 |
| SIMON | 17 |

Junk values (`"CONSULTANT"`, `"REP"`, `"3/2026"`, `"2nd appt"`, …) are NOT turned into users — they route to the `Unknown (import)` user (lead-gen) or `null` (consultant).

## Stage distribution (derived)

BOOKED 2,529 · CONVERTED 487 · CLOSED 162 · INTAKE 233

(SOLD→CONVERTED, CANCELLED→CLOSED, has bookingDate→BOOKED, else INTAKE)

## Enum mapping

**source** → BLOOM_ASTRA 2,995 · WEBSITE 125 · INBOUND 96 · REFERRAL 74 · BRIGHTE 55 · (66 unmapped → BLOOM_ASTRA default)

**company** → ASTRA 1,645 · DC 1,423 · (343 blank/unknown → ASTRA default)

**disposition** → PRES_PROP_CREATED 853 · NO_ANSWER 648 · SOLD 487 · BEEN_RESCHEDULED 240 · NOT_INTERESTED 230 · RESCHEDULE 206 · CALL_BACK 185 · CANCELLED 162 · DNQ 107 · null 293

**outcome** (lead-gen enum; PRES/SOLD/etc. are dispositions so → null) → null 2,819 · NO_ANSWER 285 · RESCHEDULE 104 · HOT_CALL_BACK 99 · NOT_INTERESTED 65 · DNQ 39

## stateLog

13 leads → 13 `LeadStateLog` snapshot rows (current stage/outcome/disposition/leadGenId/consultantId; `changedBy` from `_lastEditedBy`, else lead-gen). The field-level from/to is not stored — the model has no field for it.
