# FreshRelay

**Rescue surplus food before it goes to waste.**

FreshRelay connects businesses and households with surplus food to the people who can
put it to good use. Bakeries, restaurants, grocers and caterers list what they have
left; food banks, charities, shelters and community kitchens find what's nearby, reserve
it, and collect it with a single-use pickup code. Both sides get notifications, and
impact dashboards track every kilogram rescued.

**Live app → https://freshrelay.vercel.app**

## Features

**Providers**

- Publish surplus-food listings with quantity, pickup window, location and notes
- Pause, resume or cancel listings at any time
- Verify handoffs with a single-use 6-digit pickup code
- Get alerted when listings are about to expire

**Recipients**

- Discover nearby food on an interactive map and list view, filtered by distance
- Reserve instantly with live stock control — no overselling, ever
- Track active and past reservations, cancel with one click
- Get notified when new listings appear nearby

**Admins**

- Verify organizations before they can operate
- Moderate listings and manage user accounts
- Platform-wide impact metrics

**Under the hood**

- Role-based access with an organization approval workflow
- Single-use HMAC-hashed pickup codes, scrypt password hashing, httpOnly session cookies
- CSRF protection and rate limiting on all sensitive endpoints
- In-app and email notifications through a pluggable adapter
- Impact tracking: meals saved (`kg ÷ 0.4`) and kilograms diverted from waste

## Tech stack

| Layer     | Choice                                           |
| --------- | ------------------------------------------------ |
| Framework | Next.js 16 (App Router) · React 19 · TypeScript  |
| UI        | Tailwind CSS · shadcn/ui · Lucide icons          |
| State     | Zustand (client) · TanStack Query (server)       |
| Database  | PostgreSQL (Neon in production) · Prisma ORM     |
| Auth      | httpOnly session cookies · scrypt hashing        |
| Hosting   | Vercel                                           |

## Getting started

Prerequisites: [Bun](https://bun.sh) (or Node 20+) and a PostgreSQL 16 database.

```bash
git clone https://github.com/Abhiram-photon/freshrelay.git
cd freshrelay
bun install

cp .env.example .env    # then point DATABASE_URL at your PostgreSQL instance

bun run db:push         # create the database schema
bun prisma/seed.ts      # load the Hyderabad demo dataset

bun run dev             # http://localhost:3000
```

Or with Docker (starts PostgreSQL 16 and the app together):

```bash
docker compose up --build
docker compose exec app bun prisma/seed.ts   # once, to load demo data
```

## Environment variables

Copy `.env.example` to `.env` and adjust. The essentials:

| Variable                    | Required            | Purpose                                                        |
| --------------------------- | ------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`              | yes                 | PostgreSQL connection string used by Prisma                     |
| `APP_SECRET`                | yes in production   | HMAC secret for pickup-code hashes (dev-only fallback built in) |
| `KG_PER_MEAL`               | no                  | Meals estimate divisor, default `0.4`                           |
| `HOLD_TIMEOUT_MINUTES`      | no                  | Unconfirmed holds release stock after this, default `30`        |
| `FRESHRELAY_DISABLE_WORKER` | no                  | Set `1` on serverless to disable the embedded jobs worker       |

## Demo accounts

The seed script creates a demo dataset set in Hyderabad, India:

| Role                | Email                     | Password    |
| ------------------- | ------------------------- | ----------- |
| Admin               | admin@freshrelay.test     | `Admin123!` |
| Provider            | lakshmi@freshrelay.test   | `Demo1234!` |
| Provider (pending)  | charminar@freshrelay.test | `Demo1234!` |
| Recipient           | anna@freshrelay.test      | `Demo1234!` |
| Recipient (pending) | bright@freshrelay.test    | `Demo1234!` |

The golden flow to try: log in as **anna** → browse → reserve a listing → copy the
pickup code → log in as **lakshmi** → verify the pickup → watch the impact dashboard
update. Then sign in as **admin** to approve the pending organizations.

## Project structure

```
src/
  app/            # App Router shell + /api/v1 route handlers
  components/
    freshrelay/   # application UI (landing, browse, provider, admin, …)
    ui/           # shadcn/ui primitives
  lib/            # domain services: listings, reservations, geo, notify, jobs, auth
prisma/           # schema + seed script
docs/             # API reference, deployment guide, decision log
```

## API

REST API under `/api/v1` — the full reference with request/response examples lives in
[docs/API.md](docs/API.md).

## Deployment

Production runs on **Vercel** with **Neon PostgreSQL**. The step-by-step guide —
database setup, environment variables and deploy instructions — is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [docs/API.md](docs/API.md) — endpoint reference with examples
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + Neon deployment guide
- [docs/DECISIONS.md](docs/DECISIONS.md) — technical choices, assumptions and trade-offs
