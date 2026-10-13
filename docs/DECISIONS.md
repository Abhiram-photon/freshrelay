# FreshRelay — Architectural & Product Decisions

This file records every material choice made while building FreshRelay, why it was
made, and what it costs. It complements the README (how to run) and API.md (contract).

---

## D1. Single Next.js app instead of a `/client + /server + /shared` monorepo

**Decision:** One Next.js 16 App Router service; the REST contract lives under
`/api/v1` route handlers; "shared" Zod schemas live in `src/lib/schemas.ts` and are
imported by both the handlers (server validation) and the client forms.

**Why:** v1 is a single deployable unit: one process, one port, one log stream. A
separate Fastify server would double the operational surface (CORS, sessions across
origins, two deploys to keep in sync) without a scaling need at this stage.

**Kept from the original requirements:** REST shape (paths, verbs, status codes, error
envelope), Zod validation on both ends, session-cookie auth, TanStack Query on the client.

**Cost:** API and UI deploy together; you can't scale/iterate them independently.
Mitigation: all domain logic sits in framework-agnostic modules under `src/lib`
(`listings.ts`, `reservations.ts`, `geo.ts`, …) — lifting them into a standalone
Fastify/Express service later is a mechanical move.

## D2. Location model — lat/lng + bbox + haversine instead of PostGIS

**Decision:** Locations are stored as `lat`/`lng` float pairs; radius search = a
bounding-box pre-filter in SQL, then exact haversine distance + ranking in JS
(`src/lib/geo.ts`). GIST/`ST_DWithin` are replaced by a composite index on
`(status, windowEnd)` plus lat/lng range indexes that feed the bbox filter. The schema
runs on **PostgreSQL 16** (Neon in production, Docker locally); early development used
SQLite, which is why this decision exists at all.

**Why:** For the data scale of a food-rescue network (hundreds of listings per city,
not millions), bbox + haversine is accurate and index-cheap; PostGIS would add an
extension dependency without changing results. The model is portable across engines —
it started on SQLite and moved to PostgreSQL unchanged.

**Equivalence:** For the dataset scale this app is designed for (≤ 500 candidate rows
per query, enforced with `take: 500`), bbox+haversine returns the same rows as
`ST_DWithin` with distances within metres of `ST_Distance` — the formulas are
identical on the sphere; PostGIS simply pushes the same math into the index.

**PostGIS upgrade path** (mechanical, listed for completeness):

1. `datasource db { provider = "postgresql" }` in `prisma/schema.prisma`.
2. Replace `lat Float` / `lng Float` on `Organization` and `Listing` with
   `location Unsupported("geography(Point,4326)")?` plus a migration running
   `CREATE EXTENSION postgis;` and `UPDATE … SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;`.
3. Re-create indexes: `CREATE INDEX … USING GIST (location);`
4. Swap the bbox pre-filter for `WHERE ST_DWithin(location, ST_MakePoint(:lng,:lat)::geography, :radius*1000)`
   and haversine for `ST_Distance(location, …::geography)/1000` inside
   `$queryRaw` (the service functions in `src/lib/geo.ts` are the only touch points).
5. Keep the same DTO/sort logic untouched.

## D3. scrypt instead of argon2id

**Decision:** `crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })` with a
16-byte random salt, encoded `scrypt$N$r$p$salt$hash`.

**Why:** `argon2` requires node-gyp/native binaries, which complicate serverless
deploys; scrypt is a memory-hard KDF in the same RFC family, built into Node, with
zero native dependencies.

**Cost:** argon2id has better GPU/ASIC resistance. Migration: `verify` tries scrypt;
re-hash on next successful login when the prefix says `argon2id`.

## D4. Reservation state machine — creation is immediately CONFIRMED

**Decision:** `POST /listings/:id/reservations` creates the reservation directly in
`CONFIRMED` (acceptance is automatic in v1). `HELD` exists in the state machine and
the 30-minute `holdExpiresAt` release loop is fully implemented, but no v1 flow
creates HELD rows — it is reserved for a future confirm/pay step.

**Why:** Avoids a phantom state where stock is locked but nobody has been told the
pickup code; acceptance is automatic in v1 (a future confirm/pay step can introduce
HELD, and the release loop is already live).

**State machine:**

```
CONFIRMED ──verify(code, in slot)──▶ COLLECTED          (terminal; counts toward impact)
CONFIRMED ──cancel(either party)───▶ CANCELLED          (stock restored)
CONFIRMED ──window end w/o pickup──▶ EXPIRED            (stock restored by worker)
HELD ──hold timeout (30 min)───────▶ EXPIRED            (stock restored by worker)
CONFIRMED ──5 bad verify attempts──▶ LOCKED             (admin/provider notified;
                                                         provider cancels to release stock)
```

## D5. Oversell prevention — atomic conditional UPDATE

**Decision:** Stock is decremented with

```sql
UPDATE "Listing"
SET "quantityRemaining" = "quantityRemaining" - ?,
    "version" = "version" + 1
WHERE "id" = ? AND "quantityRemaining" >= ? AND "status" = 'ACTIVE'
```

inside a transaction; `0 rows affected` → `409 INSUFFICIENT_STOCK`.

**Why:** The conditional UPDATE is a single atomic statement — the row is locked for
the duration of the statement, so parallel reservations for the last units can never
overshoot (one winner, the rest get 409) regardless of engine. `version` doubles as
the optimistic-locking token for PATCH.

## D6. Approximate location & address privacy

**Decision:** Public/list responses round coordinates to a ~500 m grid
(`APPROX_COORD_STEP = 0.005°`) and omit `pickupAddress`/`pickupInstructions` unless
the viewer is the owner, an admin, or — for recipients — has a live-or-collected
reservation on that listing (the "confirmed recipient"; a past pickup still knows the
address). Detail responses carry `exact: boolean` so the UI can label the map
"approximate".

**Interpretation note:** the requirements asked for "confirmed recipient" access and
"full details only for approved recipient or owner"; the stricter reading is
implemented, extended to past collectors (they already saw the address at pickup).

## D7. Best-match ranking formula

**Decision:** `score = 0.6 · (1 − distance/radius) + 0.4 · (1 − hoursLeft/windowHours)`

- `distance` = haversine km from viewer (clamped to `[0, radius]`)
- `hoursLeft` = time until `windowEnd` (clamped to `[0, …]`)
- `radius` = the active search radius; `windowHours` = the listing's own window span

Distance dominates (a bakery 300 m away closing in 4 h beats one 4 km away closing in
5 h), while urgency breaks ties. Both terms ∈ [0,1], so the score ∈ [0,1] and is
stable across radii. Exposed as `sort=best_match` (default), `nearest`, `ending_soon`.

## D8. Meals-equivalent estimate

**Decision:** `meals ≈ kg ÷ 0.4` (i.e. 1 meal ≈ 400 g of food). Non-kg units convert
with documented per-unit equivalents (e.g. 1 loaf ≈ 0.4 kg, 1 meal-box = 0.4 kg, 1 litre
milk ≈ 1.03 kg); unknown units count as 1 unit = 0.25 kg. The formula and its
"estimate, not measurement" caveat are rendered in the Impact UI, and the constant is
configurable via `KG_PER_MEAL`.

**Why:** 400 g/meal is a common food-bank planning figure; the requirement called for
a documented, configurable assumption.

## D9. Pickup codes — hash-only, single-use, windowed

- 6-digit code = `crypto.randomInt(0, 1_000_000)` zero-padded; HMAC-SHA256 with
  `APP_SECRET` stored in `codeHash`; comparison via `timingSafeEqual`.
- Validity window: `pickupStart ≤ now ≤ listing.windowEnd` (enforced server-side).
- Single-use: verification flips status to `COLLECTED` in the same guarded update.
- After 5 failed attempts → `LOCKED` + notifications to provider and admins + audit.
- The plaintext code is delivered exactly once — in the `RESERVATION_CONFIRMED`
  in-app notification and email. `/me/reservations` re-surfaces it by joining that
  notification (reservations store only the hash, per the security requirement).

## D10. Expiry model — worker + check-on-read

**Decision:** Two independent mechanisms guarantee no stale bookable state:

1. **Worker** (in-process, 15 s tick, started from `instrumentation.ts`): flips
   `ACTIVE/PAUSED/RESERVED_OUT → EXPIRED` past `windowEnd`/`expiresAt`, releases
   timed-out HELD holds, expires uncollected CONFIRMED reservations at window end,
   emits expiring-soon alerts and nearby digests. All jobs flow through a DB-backed
   `Job` table (type, payload, run_at, attempts, last_error) so nothing is lost on
   restart.
2. **Check-on-read:** search, detail and owner listings sweep before reading;
   `createReservation` re-validates inside the transaction. An expired listing can
   never be returned as ACTIVE or reserved.

## D11. Rate limiting — in-memory token bucket

**Decision:** Per-IP / per-user / per-email counters in process memory with sliding
windows; keyed limits: login 20/15 min per IP (+10/15 min per IP+email), register
10/h, password-reset 5/h, reservation create 20/h per user, verify 10/5 min per
provider (+20/5 min per IP).

**Cost:** counters don't survive restarts and don't shard across replicas. Acceptable
for v1; swap the `RateLimiter` interface for a DB or Redis backing later (the call
sites won't change).

## D12. CSRF in a proxied world

**Decision:** double-submit cookie (`fr_csrf`, readable, 7 d) + `x-csrf-token` header
equality + Origin validation against **any** hop of `X-Forwarded-Host`/`Host`
(deployments behind proxies/CDNs chain hops, so a single-host comparison
false-positives); `Origin: null` (sandboxed iframes) skips the Origin check but not
the double-submit.
The client fetches `GET /api/v1/csrf` once per session and transparently retries a
mutating request once after a `CSRF_FAILED`.

## D13. Testing strategy (documented scope cut)

Vitest + Testcontainers + Playwright were considered and deferred: v1 ships without a
test suite in-repo, trading automated coverage for shipping scope. Mitigations:

- **Static:** ESLint + `tsc --noEmit` gate every push.
- **Build:** every push to `main` runs a full production build on Vercel
  (install → prisma generate → `next build`) — a broken build fails the deploy loudly.
- **Behavioural:** the business-rule matrix is enforced as server-side rules
  and was verified end-to-end in a scripted real-browser pass:

| Business rule                                    | Enforced at                                             |
| ------------------------------------------------ | ------------------------------------------------------- |
| No reservation after window_end / expires_at / non-ACTIVE | `createReservation` in-transaction checks + expire-on-read |
| 1 ≤ qty ≤ quantity_remaining                     | Zod `reservationCreateSchema` + conditional UPDATE        |
| Concurrent reservations never oversell           | atomic conditional UPDATE (D5); one winner, rest 409      |
| Cancellation restores stock & status             | `cancelReservation` (RESERVED_OUT → ACTIVE on restore)    |
| Hold timeout releases stock                      | worker `releaseExpiredHolds` (D10)                        |
| Codes single-use, windowed, 5-strike lock        | `verifyPickup` (D9)                                       |
| Expired/suspended-org listings never in search   | search `where` clause                                     |
| Unapproved recipients can't reserve; unapproved providers can't publish | `requireApprovedOrg` + publish guard |
| Non-owner access → 404, not 403                  | object-level checks before role errors                    |
| Coordinates validated                            | Zod lat −90..90 / lng −180..180                           |
| PATCH can't drop quantity below reserved         | `QUANTITY_BELOW_RESERVED` unprocessable                   |

## D14. Notifications design

In-app rows are the source of truth (unread badge, mark-one/mark-all read). Emails are
fire-and-forget through a pluggable adapter — the shipped adapter writes JSON lines to
`.mail/outbox.log` and stdout; swap `emailAdapter` for SMTP/Resend/etc. without
touching call sites. "New nearby listing" emails are digested per recipient and
rate-limited to one per hour (`lastDigestAt` on the user).

## D15. Deferred features (explicitly out of scope for v1)

- QR rendering of the pickup code (the 6-digit entry path is fully implemented; a QR
  would only change the recipient's presentation, not the verify contract).
- Real-time push (WebSocket) for notifications — the UI polls TanStack Query.
- Image uploads for listings (photo URL field exists; hosting is bring-your-own).
- Multi-org users (data model allows it; the UI surfaces the first org).
- Geo-precision pickup guidance (approximate pin + exact address after confirmation
  is deliberately the only location disclosure).
- i18n (English-only copy ships; the copy strings are centralised for later extraction).
