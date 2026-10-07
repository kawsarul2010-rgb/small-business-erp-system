# Tasif Matrix ERP

Purchase, sales, stock and payments for small businesses in Bangladesh — **one deployment serving many
businesses**, each completely separate from the others. A product of Tasif Matrix Limited.

| Layer | Technology |
|---|---|
| API | ASP.NET Core Web API, .NET 10, C# |
| Data | PostgreSQL + EF Core (Npgsql); schema created by versioned SQL scripts |
| Web | Angular 22 + Angular Material (responsive: tables on desktop, cards and bottom tabs on phones) |
| Android app | Capacitor 8 (the same Angular app packaged as an APK) |
| Hosting | Railway (one Docker service for API + web, one PostgreSQL service) |

## Many businesses, one system

Each business that buys the system (a *tenant*) gets its own users, companies, customers, suppliers,
products, stock, orders, payments, SMS log and reports. Its codes and numbers start at 100001 and
count independently. Nothing crosses between businesses, and that is enforced three separate ways,
each of which would stop a leak on its own:

1. **The application** filters every query by the signed-in business (EF Core global query filters on
   every `ITenantOwned` entity). Reading across businesses takes an explicit `IgnoreQueryFilters()`,
   used only in sign-in, the SMS worker and the super admin's platform screens.
2. **PostgreSQL row-level security.** Requests for a business run as the database role `erp_tenant`;
   the database hides every other business's rows whatever the query says (see
   `0004_multi_business.sql`, `TenantConnectionInterceptor`).
3. **Composite foreign keys.** A row can only reference rows of its own business, so an order line
   cannot point at another business's product even if its id is known.

The app refuses to start if a table holding business data has no row-level security, and a unit test
fails if a business entity is added without it.

**Roles**

| Role | Belongs to | Can |
|---|---|---|
| `SUPER_ADMIN` | no business | Create, edit, suspend and reactivate businesses; add a business admin or reset one's password; see each business's usage (user and order counts). **Cannot** see any business's customers, prices, sales or payments. |
| `ADMIN` | one business | Everything inside that business, including its users. |
| `MANAGER` | one business | Sales, customers, products, stock. |
| `USER` | one business | Their own orders and reports, once linked to a customer or supplier. |

**Onboarding a business:** either the owner signs up at **Create account → Register my business**
(business name, code, their own admin account; active straight away, signed in at once), or the super
admin creates it at **Businesses → New business** (name, code, first admin). There the
admin's temporary password is shown once; they change it at first sign-in. Staff then register at
`/register?business=<code>` and the business admin assigns their role. Suspending a business signs its
users out on their next request; reactivating restores everything as it was.

## Features

- Login, self-registration with a business code, refresh tokens, lockout after 5 failed logins, password reset by email, forced password change for new accounts
- Roles enforced on the server; USER sees only orders and reports of the linked buyer (customer) and/or supplier
- Companies, customers, suppliers (auto codes from 100001 per business), products in PCS, BOX (of PCS, KG or LITRE), KG or LITRE
- Purchase and sales orders: DRAFT → FINAL → VOID, line calculations, stock checks, row-locked atomic finalize/void, revision-based concurrency (HTTP 409)
- Stock balance, stock ledger, stock adjustments (opening stock, damage, loss, correction)
- Payments on FINAL orders with overpayment protection
- Two SMS to the customer or supplier (Bangladesh numbers, outbox + retry worker): when an order is finalized and when a payment is added, each with the running account (total, paid, due)
- Subscriptions (super admin → **Subscriptions**): billing on/off, free trial, extra (grace) days, reminder days; packages (e.g. Monthly / 3 months / Yearly) with a price per business size; business sizes chosen at sign-up; bKash Tokenized Checkout (sandbox or live, credentials stored encrypted); every payment, payments recorded by hand, per-business "never billed", size and paid-until date. Businesses see a reminder banner, pay on **Billing** with bKash, and are paused (only Billing works) after the grace days
- Inside the Android app there is no paying: the Billing page and the reminder banner show only the status and dates, and the sign-up page shows no prices. Google Play does not allow paying for the app's own subscription outside Google Play billing, nor pointing users to another way to pay; packages, prices and bKash stay on the website
- Posts (super admin → **Posts**): messages for the businesses (news, maintenance, how to renew). Each post is shown on the website and app, the website only, or the app only; goes to all businesses or chosen ones, optionally to admins only; can be pinned or kept as a draft. Businesses read them on **Announcements** (unread count in the menu; open even when the subscription has ended). Put anything about paying in a **Website only** post
- About shows the website link (the server address set in `environment.mobile.ts` inside the app)
- Delete account (**My profile → Delete account**, also on the website): erases the person's name, email, mobile and password, ends their sessions and removes their name from the business's records (which stay with the business). The only admin of a business closes it instead, after typing its code: every business record and account is deleted; the business name, code and subscription payments are kept. Done by the database functions `app_forget_user` / `app_close_business` (migration 0010); `tools/isolation/run.sh` checks them
- Public pages for Google Play, readable without signing in: **/privacy** (privacy policy) and **/delete-account** (how to delete an account and what is kept), in English and Bangla. They show the support email and phone set in **Subscriptions → Billing**. The text is in `frontend/src/app/features/legal/legal-content.ts`
- SMS switches: sent only when all three are on - the business (Settings, admin), the customer or supplier (on by default), and the order ("Send SMS", off by default; a business can make new orders start with it on)
- SMS billing per business: the super admin's Businesses page counts each business's sent SMS (this month, last month, 12-month history) in operator SMS parts, and with a price per SMS shows the amount to invoice
- PDF invoices, purchase orders and reports under each business's own name; share by WhatsApp or email
- Dashboard, customer / supplier / company / due reports
- Soft delete everywhere, full audit columns
- English and Bangla (বাংলা) display, chosen per device on the login screen, the account menu or the More tab; light and dark mode

### Translations

The English text in the code is the translation key: templates use `{{ 'Sales orders' | t }}` and code uses
`t('Order #{no} finalized.', { no })`. Bangla lives in `frontend/src/app/core/i18n/bn/ui.ts` (screens) and
`bn/server.ts` (messages the server sends); server messages with names or numbers in them are matched in
`core/i18n/bn-server.ts`. A sentence with no Bangla entry simply shows in English. Numbers, money and dates keep
English digits in both languages. Printed PDFs, SMS and emails stay in English.

## Android app (APK)

The Angular app is packaged for Android with [Capacitor](https://capacitorjs.com). The APK contains the web app and
talks to the same API over the network, so the server must be reachable from the phone (deploy it to Railway first,
or use your computer's LAN address while testing).

**One-time setup**

1. Install [Android Studio](https://developer.android.com/studio) (it brings the Android SDK) and a JDK 21
   (`brew install --cask temurin@21` on macOS). Open Android Studio once and let it finish installing the SDK.
2. Point the build at your API: edit `frontend/src/environments/environment.mobile.ts` and set
   `apiBaseUrl` to your server, e.g. `https://tasifmatrix-erp.up.railway.app` (the build refuses to run while it says `CHANGE-ME`).
3. Allow the app's origin on the API: set `Cors__AllowedOrigins=https://localhost,capacitor://localhost,http://localhost`
   (Railway → Variables, or `appsettings.Development.json` locally). Without this the app cannot log in.
4. Create the Android project once:

   ```bash
   cd frontend
   npm install
   npm run build:mobile
   npx cap add android
   npx @capacitor/assets generate --android   # app icon and splash screen from resources/
   ```

**Build the APK**

```bash
cd frontend
npm run android:apk       # build + sync + ./gradlew assembleDebug
# APK: frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Copy that file to an Android phone and open it (allow "install unknown apps").

**Build for Google Play (signed .aab)**

```bash
./build-aab.sh            # from the repository root
# -> release/tasifmatrix-erp-<version>-<code>.aab
```

The first run creates the upload key in `~/tasifmatrix-keys` (back that folder up: every Play update must be signed
with it). Each run gets a higher version code automatically; the version name comes from `APP_INFO.version` in
`frontend/src/app/core/app-info.ts`. If the Android project was generated under an older package name, the script
recreates it as the `appId` in `capacitor.config.ts` (the package name can never change once on Google Play).

`npm run android:open` opens the project in Android Studio, where you can run it on an emulator or a connected phone.

**Testing against your Mac instead of Railway**

Set `apiBaseUrl` to `http://<your-mac-ip>:5080` (find it with `ipconfig getifaddr en0`), run the API with
`ASPNETCORE_URLS=http://0.0.0.0:5080`, and allow plain http in `android/app/src/main/AndroidManifest.xml`
by adding `android:usesCleartextTraffic="true"` to the `<application>` tag. Use https in production.

## Repository layout

```
backend/
  src/Sompriti.Erp.Domain          entities, enums, business rules (calculations, status rules, BD mobile)
  src/Sompriti.Erp.Application     services (auth, users, master data, stock, orders, reports, SMS)
  src/Sompriti.Erp.Infrastructure  EF Core context, SQL migrations, JWT, password hashing, SMS/email providers, PDF
  src/Sompriti.Erp.Api             controllers, authentication handler, error handling, Program.cs
  tests/Sompriti.Erp.Tests         xUnit tests (rules, business separation, JWT, PDF, email, platform boundary)
backend/tools/isolation/          cross-business isolation checks run against a real PostgreSQL
frontend/
  src/app/core                     API client, auth, layout (phone vs desktop), Capacitor bridge
  src/app/shared                   reusable pieces: search select, list state, list footer, pipes
  src/app/layout                   app shell: sidebar on desktop, top bar + bottom tabs on phones
  src/app/features                 screens (auth, dashboard, master data, stock, orders, reports, users, SMS, platform)
  public/fonts                     bundled Inter + Material Symbols subset (works offline)
  tools/build-icon-font.py         regenerates the icon font subset after adding new icons
  capacitor.config.ts              Android app settings
Dockerfile                         builds web + API into one image
railway.json                       Railway build/deploy settings
docker-compose.yml                 local PostgreSQL (and optional full app)
.env.example                       all configuration variables
```

## Run locally

Prerequisites: .NET 10 SDK, Node.js 22.22+ (or 24), Docker (for PostgreSQL).

```bash
# 1. database
docker compose up -d postgres

# 2. API  (http://localhost:5080) – applies migrations and seeds the super admin owner@tasifmatrix.local / Owner@12345
cd backend
dotnet run --project src/Sompriti.Erp.Api

# 3. web  (http://localhost:4200)
cd frontend
npm install
npm start
```

Log in with `owner@tasifmatrix.local` / `Owner@12345` (the super admin); you will be asked to change the
password. Create a business from **Businesses**, then sign in as its admin in a private window.
Development settings live in `backend/src/Sompriti.Erp.Api/appsettings.Development.json`.
SMS and email use the `Log` provider locally (messages are written to the API console).

Run the tests:

```bash
cd backend
dotnet test
```

Or run everything in containers: `docker compose --profile app up --build` → http://localhost:8080

## Suggested first steps in a new business (as its admin)

1. Companies → add your company (name, code, address, phone – printed on PDFs)
2. Products → add products (prices are per piece; set pcs per box for box items)
3. Stock adjustments → enter opening stock (reason: Opening stock)
4. Customers / Suppliers → add parties with valid Bangladesh mobile numbers
5. Create a purchase or sales order, finalize it, add payments, print the PDF

## Deploy to Railway

**[DEPLOY.md](DEPLOY.md) has the full walkthrough** — dashboard steps, the complete variable block,
post-deploy checks and troubleshooting. The short version:

1. Push this repository to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** and select the repository.
   The `Dockerfile` and `railway.json` are at the top of this repository, so Root Directory stays empty.
3. **+ Create → Database → PostgreSQL** in the same project.
4. Open the app service → **Variables** and add (see `.env.example`):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (variable reference to the database service)
   - `Jwt__SigningKey` = a long random secret (`openssl rand -base64 48`)
   - `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD` (your platform-owner account; min. 8 chars with a letter and a number)
   - `App__PublicBaseUrl` = your Railway URL, e.g. `https://tasifmatrix-erp.up.railway.app`
   - SMS: `Sms__Enabled=true`, `Sms__Provider=BulkSmsBd`, `Sms__ApiKey`, `Sms__SenderId` (or `GenericHttp` settings)
   - Email: `Email__Provider=Brevo` (or `Resend`), `Email__ApiKey`, `Email__FromAddress`
5. **Settings → Networking → Generate Domain**.
6. Deploy. On start the app applies database migrations, checks row-level security, creates the super admin and serves the web app. Health check: `/health`.

Backups: enable Railway PostgreSQL backups (or schedule `pg_dump`) with at least 7 days of retention.

## Database migrations

The schema is managed by plain SQL files in `backend/src/Sompriti.Erp.Infrastructure/Persistence/Migrations`
(`0001_initial.sql`, `0002_...sql`). They run in order at startup inside a PostgreSQL advisory lock and are recorded in
`schema_migrations`. To change the schema, add a new numbered file – never edit an applied one – and update the EF mapping
in `AppDbContext` if needed.

**A new table that holds business data** needs a `tenant_uuid` column, `ENABLE ROW LEVEL SECURITY` and a
`tenant_isolation` policy (copy the pattern in `0004_multi_business.sql`), and its entity must implement
`ITenantOwned`. The app will not start otherwise. Run `backend/tools/isolation/run.sh` after schema changes: it builds a scratch database from all the
migrations and runs the cross-business isolation checks against it.

## API

Base path `/api/v1`, JSON (camelCase, enums as `UPPER_SNAKE_CASE`), errors as RFC 7807 problem details with a `code`
(`REVISION_CONFLICT`, `INSUFFICIENT_STOCK`, `OVERPAYMENT`, …). Every update/delete/status change must send the record's `revision`.

| Area | Endpoints |
|---|---|
| Auth | `POST auth/register` (needs `businessCode`), `POST auth/register-business` (new business + its admin; off with `App__AllowBusinessSignup=false`), `GET auth/signup-options`, `POST auth/login, refresh, logout, forgot-password, reset-password, change-password` · `GET auth/me` |
| Platform (SUPER_ADMIN) | `GET platform/summary` · `platform/businesses`: list, get, create (returns the first admin's temporary password once), update, `POST {id}/suspend`, `POST {id}/activate`, `POST {id}/admins`, `POST {id}/admins/{userId}/reset-password`, `GET {id}/sms-usage?months=12` |
| Master data | `companies`, `customers`, `suppliers`, `products` (list, `dropdown`, get, create, update, delete) |
| Users | `users` (ADMIN) + `POST users/{id}/unlock` |
| Stock | `GET stock/balances`, `GET stock/ledger`, `GET/POST stock/adjustments` |
| Orders | `purchase-orders`, `sales-orders`: list, get, create, update (draft), delete (draft), `DELETE {id}/lines/{lineId}`, `POST {id}/finalize`, `POST {id}/void`, `POST {id}/payments`, `DELETE {id}/payments/{paymentId}`, `GET {id}/pdf` |
| Reports | `GET reports/customers`, `reports/suppliers`, `reports/companies`, `GET dashboard` |
| SMS | `GET sms`, `POST sms/{id}/retry` (ADMIN) · orders: `POST {id}/sms` `{ sendSms, revision }` |
| Billing | `GET billing`, `GET billing/status`, `GET billing/payments`, `POST billing/checkout`, `POST billing/size`, `POST billing/payments/{id}/verify`, `GET billing/bkash/callback` (bKash returns here) · super admin: `platform/billing/settings` (+ `test-bkash`), `sizes`, `plans`, `payments`, `businesses/{id}` (+ `/payments` to record a payment) |
| Posts | `GET posts?channel=web\|app`, `GET posts/unread-count?channel=`, `POST posts/seen` · super admin: `GET/POST platform/posts`, `PUT/DELETE platform/posts/{id}`, `GET platform/posts/businesses` |
| Account | `GET auth/delete-account` (what deleting involves), `POST auth/delete-account` (password; the only admin also `closeBusiness` + `businessCode`) |
| Settings | `GET settings` (ADMIN, MANAGER), `PUT settings` (ADMIN): `smsEnabled`, `smsOnNewOrders` |
