# Deploying to Railway

One Railway project holds two services: **PostgreSQL** (managed) and **the app** (one Docker image that
serves both the API and the Angular web app). The Android APK talks to the same URL.

Everything below is done in the Railway dashboard at <https://railway.com>. Roughly 15 minutes.

---

## Before you start

- The repository is on GitHub: `blg-kawsarul/small-business-erp-system`, branch `main`.
- The app lives in the **`sompriti-erp` subfolder** of that repository. This matters — see step 3.
- Have ready: a JWT signing key (see step 5), the first admin email and password, and your
  BulkSMSBD API key and sender ID.

---

## 0. Running the first month free

Railway has no permanent free tier, but new accounts get a **30-day trial with $5 of credit and no
credit card**. That is enough to run this app for about a month (figures below, checked 25 Sep 2026).

**Sign up with GitHub, not with an email address.** A trial on a verified GitHub account is the *full*
trial; an unverified one is the *limited* trial, which restricts outbound network access — and that
would stop the BulkSMSBD API calls, so SMS would fail.

What the trial gives you: up to 1 GB RAM per service, shared CPU, 5 services per project, and the same
features as the Hobby plan.

**What this app actually costs.** Railway bills what you use: $10/GB/month of RAM, $20/vCPU/month of
CPU, $0.15/GB/month of volume storage. Idling, the API container sits around 0.2 GB and PostgreSQL
around 0.15 GB, and neither uses much CPU:

| | RAM | CPU | Storage | Monthly |
| --- | --- | --- | --- | --- |
| App (API + web) | ~$2.00 | ~$0.40 | – | ~$2.40 |
| PostgreSQL | ~$1.50 | ~$0.20 | ~$0.15 | ~$1.85 |
| | | | | **~$4.25** |

So the $5 lasts roughly a month of both services running continuously — with little headroom. Two
things stretch it:

- **Turn on Serverless for the app service** (app service → Settings → **Serverless**). The container
  scales to zero when no requests arrive and wakes on the next one, which roughly halves its cost for a
  shop that is not using the system all night. The trade-off is a cold start of a few seconds on the
  first request, and the SMS dispatch worker only runs while the app is awake — not a problem in
  practice, because messages are queued by someone using the app, who is keeping it awake anyway.
- **Leave Serverless off for PostgreSQL.** A sleeping database is not worth the trouble.

**When the 30 days end**, the account drops to the Free plan: $1 of credit a month, 0.5 GB RAM per
service, one project, three services. That is about five days of running this app, so it is not a home
for it. The Hobby plan at **$5/month** (which includes $5 of usage — roughly this app's whole bill) is
the realistic next step.

> **Back up before the credit expires.** Railway deletes volumes belonging to trial accounts 30 days
> after the credit runs out. If there is real data in the database by then, either upgrade to Hobby or
> take a dump first (see *Backups* below).

Set **Usage → alerts** on day one so the balance does not surprise you.

---

## 1. Create the project and the database

1. Railway → **New Project** → **Deploy from GitHub repo**.
   Authorise Railway for the `blg-kawsarul` account if it asks, then pick
   `small-business-erp-system`.
2. Railway creates a service and immediately tries to build. **Let it fail** — it cannot work until
   step 3. Nothing is broken.
3. In the same project: **+ Create** → **Database** → **Add PostgreSQL**.

You now have two services side by side: your app and `Postgres`.

## 2. Point the service at the right folder

Open the app service → **Settings**:

| Setting | Value |
| --- | --- |
| **Root Directory** | `sompriti-erp` |
| Branch | `main` |
| Builder | Dockerfile (detected from `sompriti-erp/railway.json`) |

**Root Directory is the step people miss.** The `Dockerfile` and `railway.json` are inside
`sompriti-erp/`, not at the top of the repository. Without it the build fails with "no Dockerfile
found" or Railway tries to guess a Node build.

## 3. Generate the public domain

Still in **Settings** → **Networking** → **Generate Domain**. Take the port it offers (the app reads
Railway's `PORT`). You get something like `small-business-erp-system-production.up.railway.app`.

Copy that URL — the next step needs it.

## 4. Set the variables

App service → **Variables** → **Raw Editor**, paste the block below, then fix the four marked lines.

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}

Jwt__SigningKey=PASTE_A_LONG_RANDOM_SECRET
Jwt__AccessTokenMinutes=15

SEED_ADMIN_EMAIL=you@yourdomain.com
SEED_ADMIN_PASSWORD=ChangeMe123
SEED_ADMIN_NAME=Administrator
SEED_ADMIN_PHONE=01700000000

App__PublicBaseUrl=https://${{RAILWAY_PUBLIC_DOMAIN}}
App__BusinessName=Sompriti Enterprise

Cors__AllowedOrigins=https://localhost,capacitor://localhost,http://localhost

Sms__Enabled=true
Sms__Provider=BulkSmsBd
Sms__ApiUrl=https://bulksmsbd.net/api/smsapi
Sms__ApiKey=PASTE_YOUR_BULKSMSBD_API_KEY
Sms__SenderId=PASTE_YOUR_SENDER_ID

Email__Provider=Log
Email__FromAddress=no-reply@yourdomain.com
Email__FromName=Enterprise Resource Planning
```

Notes on the ones that matter:

- **`DATABASE_URL`** — leave `${{Postgres.DATABASE_URL}}` exactly as written. It is a reference to the
  database service, so it keeps working when Railway rotates the password. If your database service is
  named something other than `Postgres`, use that name.
- **`Jwt__SigningKey`** — any long random string; `openssl rand -base64 48` produces a good one.
  Changing it later logs everyone out. The app refuses to start without it, on purpose.
- **`SEED_ADMIN_PASSWORD`** — at least 8 characters with a letter and a number. This account is created
  only on the first start, and the app forces a password change at first login.
- **`App__PublicBaseUrl`** — `${{RAILWAY_PUBLIC_DOMAIN}}` fills itself in from step 3. It is used in
  password-reset links.
- **`Cors__AllowedOrigins`** — only the Android app needs this; the website is served from the same
  origin as the API. Leave the three values as they are.
- **`Email__Provider=Log`** — password-reset emails are written to the logs instead of being sent.
  To send them for real, set `Email__Provider=Brevo` (or `Resend`) and add `Email__ApiKey`.

Saving the variables triggers a fresh deploy.

## 5. Watch the first deploy

The **Deployments** tab shows the build (about 4–6 minutes the first time: Angular build, then
`dotnet publish`). Then, in the deploy logs, you should see in order:

```
Applied migration 0001_initial.sql
Seeded ADMIN user you@yourdomain.com. The password must be changed after first login.
Now listening on: http://0.0.0.0:8080
```

The app applies the database schema and creates the admin **before** it accepts traffic, so the health
check at `/health` only passes once the database is ready.

## 6. Check it

1. Open `https://<your-domain>/health` — it should return `Healthy`.
2. Open `https://<your-domain>/` — the login screen.
3. Log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. You will be asked to set a new password.
4. Create a company, a product, and one order to confirm the database is writing.
5. Finalize an order and check **SMS log** — a real message should now go out through BulkSMSBD.

---

## Pointing the Android app at the live server

In `frontend/src/environments/environment.mobile.ts`:

```ts
export const environment = {
  production: true,
  apiBaseUrl: 'https://<your-domain>',
};
```

Then rebuild the APK:

```bash
cd sompriti-erp/frontend
npm run build:mobile
npx cap sync android
npm run android:apk
```

The APK is at `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Because the server is on
HTTPS, no cleartext-traffic exception is needed.

---

## Day-to-day

**Deploying a change** — push to `main`. Railway rebuilds and swaps the container over with no
downtime worth mentioning. To stop that, turn off **Settings → Check Suites / Auto Deploy**.

**Database migrations** — add a new numbered file in
`backend/src/Sompriti.Erp.Infrastructure/Persistence/Migrations/`. It runs automatically on the next
deploy, inside an advisory lock, so two containers can never apply it twice. Never edit a file that has
already been applied.

**Backups** — Postgres service → **Backups** → enable, and keep at least 7 days. Do this before real
customer data goes in. A manual dump:

```bash
pg_dump "$(railway variables get DATABASE_PUBLIC_URL)" > backup.sql
```

**Logs** — app service → **Observability**, or **Deployments → View logs**. Failed SMS shows up both
there and in the app's SMS log screen.

**Cost** — two services on Railway's Hobby plan ($5/month of usage included). This app idles cheaply;
the database is the larger share. Watch **Usage** in the first week.

---

## When something goes wrong

| What you see | Cause and fix |
| --- | --- |
| Build: "Dockerfile does not exist" | Root Directory is not `sompriti-erp` (step 2). |
| Build fails in `npm ci` | `frontend/package-lock.json` is not committed, or is out of step with `package.json`. Run `npm install` locally, commit the lock file, push. |
| Deploy crash-loops, logs say `Jwt:SigningKey` | The signing key variable is missing or empty. |
| Logs: "Set ConnectionStrings__Default or DATABASE_URL" | The `DATABASE_URL` reference is wrong — check the database service's name matches `${{Postgres.DATABASE_URL}}`. |
| Health check times out | Look at the deploy logs for a migration error. The app will not serve traffic until the schema applies. |
| Login page loads, login returns 500 | Almost always the database: check the Postgres service is running and the two services are in the same project. |
| Android app cannot reach the server | `apiBaseUrl` still points at a LAN address, or `Cors__AllowedOrigins` is missing `https://localhost`. |
| No SMS arrives, log says SKIPPED | `Sms__Enabled` is not `true`. Status FAILED instead means the gateway rejected it — the error text is in the SMS log row. |
