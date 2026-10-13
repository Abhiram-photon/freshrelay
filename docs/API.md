# FreshRelay — REST API Reference

Base path: **`/api/v1`** · Content type: `application/json` · Auth: httpOnly session
cookie (`fr_session`) set by `POST /auth/login` or `POST /auth/register`.

- All mutating requests require the CSRF double-submit header: `x-csrf-token` equal to
  the `fr_csrf` cookie. Obtain a token with `GET /api/v1/csrf` → `{ "token": "…" }`.
- All list endpoints paginate: `?page=1&limit=12` (defaults shown per endpoint) and
  return `{ items, total, page, pages }` (reservations/notifications return
  `{ items, total }`).
- One error shape everywhere:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Validation failed",
             "details": [{ "path": "quantity", "message": "Expected number, received string" }] } }
```

Common codes: `BAD_REQUEST` 400 · `VALIDATION_ERROR` 400 · `UNAUTHENTICATED` 401 ·
`FORBIDDEN` 403 · `CSRF_FAILED` 403 · `NOT_FOUND` 404 · `INSUFFICIENT_STOCK` 409 ·
`ALREADY_COLLECTED` 409 · `VERSION_CONFLICT` 409 · `LISTING_NOT_ACTIVE` /
`WINDOW_CLOSED` / `SLOT_OUTSIDE_WINDOW` / `SLOT_IN_PAST` / `QUANTITY_BELOW_RESERVED`
422 · `CODE_NOT_IN_WINDOW` 422 · `CODE_LOCKED` 423 · `RATE_LIMITED` 429.

Object-level rule: touching another user's listing/reservation returns **404**, not 403.

---

## Auth

### `POST /auth/register` — create account + organization (starts PENDING)

```json
// request
{
  "email": "help@newtrust.org",
  "password": "CorrectHorse9!",
  "name": "Priya Nair",
  "phone": "+91 90000 00000",
  "role": "RECIPIENT",
  "notifyNearby": true,
  "organization": {
    "type": "CHARITY",
    "name": "New Trust Charity",
    "address": "12 MG Road, Hyderabad",
    "lat": 17.4012,
    "lng": 78.4747
  }
}
```

`201` → `{ user: { id, email, name, role, status }, organization: { id, verificationStatus: "PENDING" } }`
and a session cookie (registration logs you in). Providers use roles `PROVIDER` +
types `BAKERY | GROCERY | CATERER | RESTAURANT | HOUSEHOLD`; recipients use
`RECIPIENT` + `FOOD_BANK | CHARITY | SHELTER | COMMUNITY_KITCHEN`.
Validation: password ≥ 8 chars with letter+number; lat ∈ [−90, 90]; lng ∈ [−180, 180].

### `POST /auth/login`

```json
// request  { "email": "anna@freshrelay.test", "password": "Demo1234!" }
// 200
{ "user": { "id": "…", "email": "anna@freshrelay.test", "name": "Anna Sebastian",
            "role": "RECIPIENT", "status": "ACTIVE" },
  "organization": { "id": "…", "name": "Anna Food Bank Hyderabad", "type": "FOOD_BANK",
                    "verificationStatus": "APPROVED" } }
```

Errors: `UNAUTHENTICATED` (bad credentials), `FORBIDDEN` (suspended account).
Rate limit: 20/15 min per IP, 10/15 min per IP+email.

### `POST /auth/logout` → `{ "ok": true }` (destroys the session row + cookie)

### `POST /auth/password-reset/request` — `{ "email": "…" }` → always `200 { ok: true }`
(enumeration-safe; the single-use token, valid 30 min, is emailed; in dev it is also
logged by the email adapter to `.mail/outbox.log`).

### `POST /auth/password-reset/confirm`

```json
{ "token": "<from email>", "password": "NewPassword1!" }
```

### `GET /auth/me`

```json
// 200
{ "user": { "id": "…", "email": "anna@freshrelay.test", "name": "Anna Sebastian",
            "phone": null, "role": "RECIPIENT", "status": "ACTIVE", "notifyNearby": true },
  "organization": { "id": "…", "name": "Anna Food Bank Hyderabad", "type": "FOOD_BANK",
                    "address": "2-4-606, Nampally, Hyderabad", "lat": 17.385, "lng": 78.4867,
                    "verificationStatus": "APPROVED", "verificationNote": null },
  "unreadNotifications": 5 }
```

### `DELETE /auth/me` — self-service deletion (anonymizes the user, cancels live listings)

---

## Listings

### `GET /listings` — public search (ACTIVE + non-expired + approved orgs only)

Query params:

| Param        | Default     | Notes                                              |
| ------------ | ----------- | -------------------------------------------------- |
| `lat`,`lng`  | —           | Viewer location (enables distance + radius filter) |
| `radius_km`  | `5` (max 50)| Filter by haversine distance                       |
| `category`   | —           | `BAKED_GOODS` … (see schemas)                      |
| `storage`    | —           | `AMBIENT` \| `CHILLED` \| `FROZEN` \| `HOT`        |
| `q`          | —           | title/description substring                        |
| `time_left_h`| —           | only listings closing within N hours               |
| `sort`       | `best_match`| `nearest` \| `ending_soon` \| `best_match`         |
| `page`,`limit` | `1`,`12`  | limit ≤ 50                                         |

```json
// 200
{
  "items": [{
    "id": "…", "title": "Butter croissants (60)",
    "description": "Flaky butter croissants from the morning batch.",
    "category": "BAKED_GOODS", "quantityTotal": 60, "quantityRemaining": 50,
    "unit": "item", "allergens": ["GLUTEN", "MILK", "EGGS"], "storageType": "AMBIENT",
    "windowStart": "2026-10-13T16:26:00.000Z", "windowEnd": "2026-10-13T22:56:00.000Z",
    "expiresAt": "2026-10-13T22:56:00.000Z", "status": "ACTIVE",
    "version": 3, "createdAt": "…",
    "location": { "lat": 17.395, "lng": 78.475, "approximate": true },
    "distanceKm": 1.78,
    "org": { "id": "…", "name": "Lakshmi's Bake House", "type": "BAKERY",
             "verificationStatus": "APPROVED" }
  }],
  "total": 14, "page": 1, "pages": 2,
  "viewerLocation": { "lat": 17.385, "lng": 78.4867 }
}
```

Privacy: `location` is rounded to a ~500 m grid and `pickupAddress` /
`pickupInstructions` are **omitted** unless the viewer is the owner, an admin, or a
recipient with a live-or-collected reservation on the listing (then
`approximate: false` and the exact fields appear). Expired/paused/draft/reserved-out
listings never appear.

### `GET /listings/:id` → `{ listing: <same DTO>, exact: boolean, isOwner: boolean }`

404 for unknown ids. Expire-on-read: a stale ACTIVE listing flips to `EXPIRED` here.

### `POST /listings` — provider only

```json
{
  "title": "Hot veg biryani trays",
  "description": "Surplus from a corporate lunch. Vegetarian.",
  "category": "PREPARED_MEALS",
  "quantityTotal": 12, "unit": "tray",
  "allergens": [],
  "storageType": "HOT",
  "pickupAddress": "5-9-31, Musheerabad Main Road, Hyderabad",
  "lat": 17.4165, "lng": 78.4989,
  "windowStart": "2026-10-13T14:00:00.000Z",
  "windowEnd": "2026-10-13T20:00:00.000Z",
  "expiresAt": "2026-10-13T20:00:00.000Z",
  "pickupInstructions": "Kitchen entrance at the rear gate",
  "photoUrl": "",
  "publish": true
}
```

`201` → `{ listing: { id, status, version } }`. `publish: false` (or omitted) creates
a `DRAFT`. Only `APPROVED` providers may publish (`403 FORBIDDEN` otherwise — pending
providers can keep drafts). Window rules: `windowEnd > windowStart`, `windowEnd` in
the future for non-drafts.

### `PATCH /listings/:id` — owner only

Accepts any subset of the create fields plus `version` (optimistic lock — mismatch →
`409 VERSION_CONFLICT`) and `publish: true`. Server rejects:

- `422 QUANTITY_BELOW_RESERVED` — new `quantityTotal` < already reserved/collected
- `422 WINDOW_INVALID` / `422 WINDOW_IN_PAST`
- `403` publish while organization not approved

### `POST /listings/:id/pause` · `/resume` · `/cancel` — owner only → `{ listing: { id, status } }`

`resume` re-checks the window (an expired listing stays `EXPIRED`). `cancel` releases
stock from live reservations.

### `GET /me/listings` — owner's listings (all statuses) + `liveReservations` count

---

## Reservations

### `POST /listings/:id/reservations` — RECIPIENT with APPROVED org

```json
// request
{ "quantity": 5,
  "pickupStart": "2026-10-13T17:06:00.000Z",
  "pickupEnd":   "2026-10-13T18:30:00.000Z" }
```

- `201` → `{ reservation: { id, status: "CONFIRMED", code: "529557" }, message }`
  The **code appears exactly once** in this response and in the confirmation
  notification/email; only its HMAC is stored.
- `409 INSUFFICIENT_STOCK` — someone took the stock first (atomic check).
- `422 LISTING_NOT_ACTIVE` / `WINDOW_CLOSED` / `SLOT_OUTSIDE_WINDOW` / `SLOT_IN_PAST`.
- `403` — org pending/rejected (`Your organization is awaiting verification`).
- Rate limit: 20/h per user.

Rules enforced in one transaction: listing ACTIVE, now < windowEnd/expiresAt, slot
inside the window, `1 ≤ quantity ≤ quantity_remaining`, atomic stock decrement.

### `GET /me/reservations` — recipient's reservations (with listing summary)

```json
{ "items": [{
    "id": "…",
    "listing": { "id": "…", "title": "Butter croissants (60)", "category": "BAKED_GOODS",
                 "unit": "item", "storageType": "AMBIENT", "pickupAddress": "Shop 4, …",
                 "pickupInstructions": "…", "windowStart": "…", "windowEnd": "…",
                 "status": "ACTIVE", "orgName": "Lakshmi's Bake House", "orgType": "BAKERY" },
    "quantity": 5, "pickupStart": "…", "pickupEnd": "…",
    "status": "CONFIRMED", "failedAttempts": 0, "code": "529557",
    "createdAt": "…" }],
  "total": 3 }
```

`code` is re-surfaced from the confirmation notification; `null` for collected/cancelled.

### `DELETE /reservations/:id` — recipient cancels own, or provider cancels with reason

```json
// provider request body (optional for recipients)
{ "reason": "Collector never arrived" }
```

→ `{ reservation: { id, status: "CANCELLED" } }`. Stock is restored; a
`RESERVED_OUT` listing returns to `ACTIVE` when stock is available again. Both parties
are notified.

### `GET /provider/reservations?listing_id=` — owner's incoming reservations

`listing_id` optional filter. Items include `recipientOrg {name,type}`, quantities,
slot, `status`, `failedAttempts`.

### `POST /reservations/:id/verify` — provider marks COLLECTED

```json
// request { "code": "529557" }
// 200     { "ok": true, "reservation": { "id": "…", "status": "COLLECTED",
//                    "collectedAt": "2026-10-13T17:19:02.000Z" },
//           "impact": { "quantityLabel": "5 item" } }
```

- Codes are valid `pickupStart ≤ now ≤ listing.windowEnd` → else `422 CODE_NOT_IN_WINDOW`.
- Wrong code → `400 INVALID_CODE` with `details.attemptsLeft`; after 5 failures the
  reservation is `LOCKED` (`423 CODE_LOCKED`), provider + admins notified, attempt audited.
- Already collected → `409 ALREADY_COLLECTED`.
- Rate limit: 10/5 min per provider, 20/5 min per IP.

---

## Notifications

### `GET /notifications?limit=50` → `{ items: [{ id, type, payload, read, createdAt }], unread }`

`type` ∈ `NEW_NEARBY_LISTING` · `RESERVATION_CREATED` (→ provider) ·
`RESERVATION_CONFIRMED` (→ recipient, carries the code) · `RESERVATION_CANCELLED` ·
`PICKUP_VERIFIED` · `LISTING_EXPIRING_SOON` · `ORG_APPROVED` · `ORG_REJECTED` ·
`RESERVATION_LOCKED` · `ACCOUNT_STATUS`.

### `POST /notifications/:id/read` → `{ ok: true }` · `POST /notifications/read-all` → `{ ok: true }`

---

## Impact

### `GET /me/impact?from&to` (dates optional, ISO)

```json
{ "role": "RECIPIENT",
  "totalKg": 61.1, "totalOriginal": 141, "pickups": 7,
  "mealsEstimate": 152.8,
  "mealsFormula": "meals ≈ kg ÷ 0.4 (1 meal ≈ 0.4 kg — estimate)",
  "monthly": [{ "month": "2026-05", "kg": 7.2, "pickups": 1 },
              { "month": "2026-06", "kg": 10,   "pickups": 1 }] }
```

Counts **COLLECTED reservations only**; non-kg units are normalized with documented
per-unit weights (see `src/lib/units.ts`). Providers get the same shape for their
listings' org; admins may call `/admin/metrics` for platform totals.

---

## Admin (ADMIN role)

| Endpoint | Body / Query | Response |
| --- | --- | --- |
| `GET /admin/organizations?status=PENDING\|APPROVED\|REJECTED` | — | `{ items: [{ id, name, type, address, lat, lng, verificationStatus, verificationNote, createdAt, owner: { id, email, name, status } }], total }` |
| `PATCH /admin/organizations/:id/verification` | `{ "decision": "APPROVED"\|"REJECTED", "note": "…" }` | `{ organization: { id, verificationStatus } }` — notifies the owner, audited |
| `PATCH /admin/users/:id/status` | `{ "status": "ACTIVE"\|"SUSPENDED" }` | `{ user: { id, status } }` — suspending kills sessions immediately, audited |
| `GET /admin/listings?status=&page=` | — | paginated listings with org, for moderation |
| `PATCH /admin/listings/:id/moderation` | `{ "action": "HIDE"\|"RESTORE", "note": "…" }` | `{ listing: { id, status } }` — HIDE ⇒ `CANCELLED` (releases stock), audited |
| `GET /admin/metrics` | — | `{ users: [{role,count,suspended}], organizations: [{status,count}], listings: [{status,count}], reservations: [{status,count}], impact: { totalKg, pickups, mealsEstimate } }` |

---

## Misc

- `GET /api/v1/csrf` → `{ "token": "…" }` (also sets the `fr_csrf` cookie).
- `GET /api/v1` → `{ name, version, endpoints: [...] }` (discovery).

## curl walkthrough (golden flow)

```bash
B=http://localhost:3000/api/v1
TOK=$(curl -s -c jar.txt $B/csrf | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# login as recipient
curl -s -b jar.txt -c jar.txt -H "x-csrf-token: $TOK" -H 'Content-Type: application/json' \
  -d '{"email":"anna@freshrelay.test","password":"Demo1234!"}' $B/auth/login

# search nearby
curl -s -b jar.txt "$B/listings?lat=17.385&lng=78.4867&radius_km=5&sort=nearest" | python3 -m json.tool

# reserve 5 items on a listing id from the search result
curl -s -b jar.txt -H "x-csrf-token: $TOK" -H 'Content-Type: application/json' \
  -d '{"quantity":5,"pickupStart":"2026-10-13T17:06:00Z","pickupEnd":"2026-10-13T18:30:00Z"}' \
  $B/listings/<LISTING_ID>/reservations        # → code

# login as the provider (new cookie jar + fresh token), then verify
curl -s -b jar2.txt -H "x-csrf-token: $TOK2" -H 'Content-Type: application/json' \
  -d '{"code":"529557"}' $B/reservations/<RESERVATION_ID>/verify
```
