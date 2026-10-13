# FreshRelay 🥖→🏠

**Rescue surplus food before it is wasted.** FreshRelay lets bakeries, grocers, caterers,
restaurants and households list usable surplus food; food banks, charities, shelters and
community kitchens reserve pickups and collect it with a single-use 6-digit code. Both
sides get notifications, and impact dashboards track every kilogram rescued.

> UNEP estimates **1.05 billion tonnes** of food were wasted in 2022 across household,
> food-service and retail levels. FreshRelay makes the rescue step — list → find →
> reserve → collect — fast and verifiable.

---

## Architecture

Single Next.js 16 (App Router) service — React 19 SPA surface + REST API + embedded
jobs worker. Architectural choices and trade-offs: [docs/DECISIONS.md](docs/DECISIONS.md).

```
┌────────────────────────────────────────────────────────────────────┐
│                        Browser (React 19 SPA)                      │
│  landing · auth · browse(map+list) · listing · reserve · provider   │
│  dashboard · verify · reservations · impact · admin · notifications │
│  state: Zustand (views) + TanStack Query (server) + Zod validation │
└───────────────▲────────────────────────────────────────────────────┘
                │ fetch /api/v1/*  (httpOnly session cookie + CSRF)
┌───────────────┴────────────────────────────────────────────────────┐
│                     Next.js route handlers (/api/v1)               │
│  auth · listings · reservations · verify · notifications · impact  │
│  admin · csrf                                                      │
│  middleware: requireAuth / requireRole / requireApprovedOrg,       │
│  assertCsrf, rate limits, canonical error shape, audit log         │
├────────────────────────────────────────────────────────────────────┤
│  domain services (src/lib)                                         │
│  listings (search+privacy) · reservations (atomic stock, codes)    │
│  geo (haversine+bbox) · units (kg normalisation) · impact          │
│  notify (in-app + email adapter) · jobs queue · worker             │
├────────────────────────────────────────────────────────────────────┤
│  Prisma ORM                                                        │
│  PostgreSQL 16 (Neon in production) — PostGIS upgrade path noted   │
│  9 models: User, Organization, Listing, Reservation, Notification, │
│  Job, AuditLog, Session, PasswordResetToken                        │
└────────────────────────────────────────────────────────────────────┘
        │                                   │
        ▼                                   ▼
  Jobs worker (15s tick, in-process):   Email adapter (pluggable):
  expire listings · release holds ·     dev adapter → console +
  expiring-soon alerts · digests        .mail/outbox.log (swap for SMTP)
```

Live demo: **https://freshrelay.vercel.app** (deployed from `main` on Vercel + Neon —
see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Quick start (local)

```bash
# 1. Install (Bun recommended; Node 20+ works with npm/pnpm too)
bun install

# 2. Configure
cp .env.example .env   # point DATABASE_URL at any PostgreSQL 16 instance

# 3. Create the database schema
bun run db:push

# 4. Seed the Hyderabad demo dataset
bun prisma/seed.ts

# 5. Run
bun run dev        # http://localhost:3000  (lint: bun run lint, types: bunx tsc --noEmit)
```

Docker path (starts PostgreSQL 16 + the app):

```bash
docker compose up --build                          # app on :3000, db on a named volume
docker compose exec app bun prisma/seed.ts         # load demo data once
```

## Demo accounts (local demo only — clearly fake passwords)

| Role       | Email                       | Password    | Organization              | Status                       |
| ---------- | --------------------------- | ----------- | ------------------------- | ---------------------------- |
| ADMIN      | admin@freshrelay.test       | `Admin123!` | Platform Admin Office     | APPROVED                     |
| PROVIDER   | lakshmi@freshrelay.test     | `Demo1234!` | Lakshmi's Bake House      | APPROVED                     |
| PROVIDER   | greenbasket@freshrelay.test | `Demo1234!` | Green Basket Supermarket  | APPROVED                     |
| PROVIDER   | nizam@freshrelay.test       | `Demo1234!` | Nizam's Catering Co.      | APPROVED                     |
| PROVIDER   | charminar@freshrelay.test   | `Demo1234!` | Charminar Sweets House    | **PENDING** (cannot publish) |
| RECIPIENT  | anna@freshrelay.test        | `Demo1234!` | Anna Food Bank Hyderabad  | APPROVED                     |
| RECIPIENT  | hope@freshrelay.test        | `Demo1234!` | Hope Shelter Trust        | APPROVED                     |
| RECIPIENT  | seva@freshrelay.test        | `Demo1234!` | Seva Community Kitchen    | APPROVED                     |
| RECIPIENT  | bright@freshrelay.test      | `Demo1234!` | Bright Futures Charity    | **PENDING** (cannot reserve) |

The seed also creates **known pickup codes** for upcoming reservations (visible in the
recipient's "My reservations" page):

| Recipient            | Code     | Listing                  |
| -------------------- | -------- | ------------------------ |
| Hope Shelter Trust   | `246810` | Fresh sourdough loaves   |
| Anna Food Bank       | `135790` | Yogurt cups (chilled)    |
| Seva Community Kitchen| `902104`| Fruit salad tubs         |
| Anna Food Bank       | `555000` | Cinnamon rolls tray      |

Demo geography: **Hyderabad, India** (Nampally / Lakdikapul / Somajiguda / Musheerabad /
Malakpet). Anna Food Bank sees every seeded listing inside the default 5 km radius;
Seva's view demonstrates radius filtering (some providers are just outside 5 km).

The golden flow to try: log in as **anna** → Browse → open a listing → Reserve → copy the
code → log in as **lakshmi** → Dashboard → Reservations → Verify pickup → enter the code →
watch **Impact** update. Admin: approve the pending orgs in the Admin console.

## Environment variables

| Variable                       | Default                                  | Purpose                                                        |
| ------------------------------ | ---------------------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`                 | `postgresql://…` (see `.env.example`)    | Prisma connection (PostgreSQL 16 — Neon in production).        |
| `APP_SECRET`                   | dev-only fallback                        | HMAC secret for pickup-code hashes. **Change in production.**  |
| `KG_PER_MEAL`                  | `0.4`                                    | Meals estimate: `meals = kg ÷ 0.4` (surfaced in the UI).       |
| `HOLD_TIMEOUT_MINUTES`         | `30`                                     | Unconfirmed holds release stock after this.                    |
| `DIGEST_MIN_INTERVAL_MINUTES`  | `60`                                     | Rate limit for "new nearby listing" email digests.             |
| `EXPIRING_SOON_WINDOW_MINUTES` | `60`                                     | Provider alert window for listings about to expire.            |
| `FRESHRELAY_DISABLE_WORKER`    | `0`                                      | Set `1` to disable the embedded jobs worker.                   |

All times are stored in **UTC** and rendered in the viewer's timezone.

## Verification & tests

Verification is (a) static: `bun run lint` + `bunx tsc --noEmit`, (b) CI
([.github/workflows/ci.yml](.github/workflows/ci.yml)): install → prisma generate →
lint → typecheck → schema push → seed → production build against PostgreSQL 16, and
(c) a scripted browser pass over the golden flow (login → browse → reserve → verify →
impact → admin). The full business-rule matrix is implemented as *enforced server-side
rules* — see [docs/DECISIONS.md](docs/DECISIONS.md#d13-testing-strategy) for the mapping.

## API summary

Base path **`/api/v1`** — full reference with request/response examples in
[docs/API.md](docs/API.md). One error shape everywhere:
`{ "error": { "code", "message", "details?" } }`.

| Area          | Endpoints                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------- |
| Auth          | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/password-reset/request` · `POST /auth/password-reset/confirm` · `GET/DELETE /auth/me` |
| Listings      | `GET /listings` · `GET /listings/:id` · `POST /listings` · `PATCH /listings/:id` · `POST /listings/:id/pause|resume|cancel` · `GET /me/listings` |
| Reservations  | `POST /listings/:id/reservations` · `GET /me/reservations` · `DELETE /reservations/:id` · `GET /provider/reservations` · `POST /reservations/:id/verify` |
| Notifications | `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all`      |
| Impact        | `GET /me/impact` · `GET /admin/metrics`                                                      |
| Admin         | `GET /admin/organizations` · `PATCH /admin/organizations/:id/verification` · `PATCH /admin/users/:id/status` · `GET /admin/listings` · `PATCH /admin/listings/:id/moderation` |

Mutating requests need the CSRF double-submit header (`x-csrf-token` == `fr_csrf`
cookie; the SPA fetches `GET /api/v1/csrf` first and retries once on token staleness).

## Security highlights

- Passwords: scrypt (N=16384) with per-user salt — deviation from argon2id documented.
- Sessions: opaque 256-bit tokens, **only SHA-256 hashes stored**, httpOnly
  `SameSite=Lax` cookies, `Secure` when the request is https.
- Pickup codes & reset tokens: only HMAC-SHA256 / SHA-256 hashes stored; codes are
  single-use, valid from slot start to window end, lock after 5 failed attempts.
- CSRF: double-submit cookie + Origin/`X-Forwarded-Host` allow-list across proxy hops.
- Rate limits on login, register, password reset, reservation create, and code verify.
- Object-level authorization everywhere; non-owner access returns **404** (no existence leak).
- Parameterized queries only (Prisma + tagged-template `$executeRaw`).
- Account deletion anonymizes the user and cancels live listings; admin actions and
  verification attempts are audit-logged.

## Troubleshooting

| Symptom                                      | Fix                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `403 CSRF_FAILED` on login                   | Hard-refresh the page (stale `fr_csrf` cookie); the client also self-heals once.       |
| Login says "Invalid email or password"       | Run `bun prisma/seed.ts` (resets demo accounts) and use the table above.               |
| Browse shows "No surplus food right now"     | Demo listings are time-boxed — re-seed to regenerate live windows.                     |
| `P1003` / database errors                    | `bun run db:push` to (re)create the schema at `DATABASE_URL`.                          |
| Emails nowhere                               | Dev adapter writes to `.mail/outbox.log` and stdout.                                   |
| Worker not expiring listings                 | Check `FRESHRELAY_DISABLE_WORKER`; only one process should run the worker.             |
| Port 3000 busy                               | Stop the other process or run `next dev -p 3001` / `next start -p 3001`. |

## Documentation

- [docs/API.md](docs/API.md) — endpoint reference with examples
- [docs/DECISIONS.md](docs/DECISIONS.md) — technical choices, assumptions, deferred features
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + Neon deployment guide
