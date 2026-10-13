# Deploying FreshRelay to Vercel

`main` is the production branch: PostgreSQL (Neon), serverless-safe worker
switch, and `postinstall: prisma generate`. Every push to `main` deploys
automatically.

## 1. Create a database (Neon — free)

1. Sign up at <https://neon.com> with GitHub → **New Project**.
2. Copy the connection string (`postgresql://…`).
   - Use the **direct** string (no `-pooler`) for `db push` / seeding (step 2).
   - Use the **pooled** string (contains `-pooler`) as `DATABASE_URL` on Vercel (step 4).

## 2. Create tables + seed demo data (run locally)

```bash
DATABASE_URL="postgresql://DIRECT_STRING" APP_SECRET="<your-secret>" bunx prisma db push
DATABASE_URL="postgresql://DIRECT_STRING" APP_SECRET="<your-secret>" bun prisma/seed.ts
```

The seed prints all demo passwords. Use the **same `APP_SECRET`** when seeding
and on Vercel — pickup codes are HMAC'd with it, so seeded codes only verify if
the secret matches.

## 3. Import to Vercel

1. <https://vercel.com> → Add New → **Project** → import `Abhiram-photon/freshrelay`.
2. Leave **Production Branch** as `main`.

## 4. Environment variables (Project → Settings → Environment Variables)

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** string (`…-pooler…`) | serverless-friendly connection |
| `APP_SECRET` | long random hex (32+ bytes) | HMAC for pickup codes; must match seed-time value |
| `FRESHRELAY_DISABLE_WORKER` | `1` | background jobs can't run loops on serverless |

Optional tuning (defaults are fine): `KG_PER_MEAL` (0.4), `HOLD_TIMEOUT_MINUTES` (30),
`DIGEST_MIN_INTERVAL_MINUTES` (60), `EXPIRING_SOON_WINDOW_MINUTES` (60).

## 5. Verify

Open the deployment URL and run the golden path: login with a demo account →
browse → reserve → verify pickup code → impact dashboard.

## Known limitation

Scheduled background jobs (expiry sweeps, email digests) don't run on Vercel
serverless. Listing expiry is **also checked at read time**, so feeds stay
correct; full cron can be added later with Vercel Cron hitting a job-runner
endpoint.
