# CJ Mart Recruitment System

A full-stack careers site for CJ Mart: public job listings, an online application
form with file uploads and PDPA consent, a keyword FAQ chatbot, and an admin
panel — all backed by a real Node.js + Express + PostgreSQL API, with a
dedicated integration surface so a future Recruitment Management System (RMS)
can connect to it.

## Stack

- **Backend:** Node.js 18+, Express 5, PostgreSQL (via `pg`)
- **Auth:** signed httpOnly cookie sessions for the admin panel (JWT), a
  separate static API key for server-to-server integration
- **Uploads:** local disk storage (resume/photo), 5MB limit, PDF/PNG/JPG/WEBP/GIF only
- **Frontend:** plain HTML/CSS/JS (no build step), served as static files by the same Express app

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# edit .env: DATABASE_URL, ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH), JWT_SECRET

# 3. Create the database (adjust to your local Postgres setup)
createdb cjmart_recruitment

# 4. Run migrations (creates tables + seeds 6 sample jobs and default PDPA text)
npm run migrate

# 5. Start the server
npm start          # production
npm run dev         # auto-restart on file changes
```

The site is then available at `http://localhost:3000/` (or whatever `PORT` you set).
The admin panel is reachable from the "สำหรับแอดมิน" link in the site's nav bar, or directly at `/#admin`.

### Admin password

For local development, set `ADMIN_PASSWORD` in `.env` to a plain-text password.
For anything beyond local development, generate a bcrypt hash instead and use
`ADMIN_PASSWORD_HASH` (delete the plain-text one):

```bash
node scripts/hash-password.js "your-real-password"
# copy the printed hash into ADMIN_PASSWORD_HASH in .env
```

## Project structure

```
db/               schema.sql, seed.sql, migrate.js
src/
  server.js       Express app wiring
  auth.js         admin session cookies + integration API key middleware
  db.js           PostgreSQL connection pool
  upload.js       multer config for resume/photo uploads
  routes/         jobs, applications, faqRules, pdpa, adminAuth, integration
  utils/          id generation, CSV read/write, RMS webhook sender
public/           the static frontend (index.html, css/, js/, assets/logo.png)
uploads/          uploaded resumes/photos (gitignored; created at runtime)
```

## API reference

All request/response bodies are JSON unless noted. Admin endpoints require
the `cjmart_admin_session` cookie set by `/api/admin/login` (sent automatically
by the browser once logged in).

### Public

| Method & path | Description |
| --- | --- |
| `GET /api/jobs` | List currently open jobs |
| `POST /api/applications` | Submit an application. `multipart/form-data` with fields: `jobId, name, phone, email, area, startDate, experience, availability` (repeatable), `pdpaConsent` (must be `"true"`), plus optional `resumeFile` / `photoFile`. Rejects with 400 if PDPA consent is missing — this is re-checked server-side regardless of what the frontend sent. |
| `GET /api/faq-rules` | List admin-added FAQ keyword/answer pairs (the chatbot's default rules live in the frontend and are merged with these client-side) |
| `GET /api/pdpa` | Current PDPA policy text + consent checkbox text |

### Admin (cookie session)

| Method & path | Description |
| --- | --- |
| `POST /api/admin/login` | `{ password }` → sets session cookie |
| `POST /api/admin/logout` | Clears session cookie |
| `GET /api/admin/session` | `{ loggedIn }` |
| `GET /api/admin/jobs` | All jobs, including closed |
| `POST /api/admin/jobs` | Create a job |
| `PATCH /api/admin/jobs/:id` | Update any subset of job fields, including `open` (true/false) |
| `DELETE /api/admin/jobs/:id` | Delete a job |
| `GET /api/admin/export/jobs.csv` | Download all jobs as CSV |
| `POST /api/admin/import/jobs` | Upsert jobs from a CSV body (same shape as the export; matches by `id` when present) |
| `GET /api/admin/applications?jobId=&status=&page=&pageSize=` | Paginated, filterable applicant list |
| `PATCH /api/admin/applications/:id` | `{ status }` — one of ใหม่ / ติดต่อแล้ว / นัดสัมภาษณ์ / รับเข้าทำงาน / ไม่ผ่านการพิจารณา |
| `DELETE /api/admin/applications/:id` | Delete an application |
| `GET /api/admin/applications/:id/resume` | Download the applicant's resume file |
| `GET /api/admin/applications/:id/photo` | Download the applicant's photo |
| `GET /api/admin/export/applicants.csv` | Download all applicants as CSV |
| `GET /api/admin/export/applicants.json` | Download all applicants as JSON |
| `POST /api/admin/faq-rules` | `{ keywords: string[], answer }` |
| `DELETE /api/admin/faq-rules/:id` | Delete an FAQ rule |
| `GET /api/admin/pdpa` / `PUT /api/admin/pdpa` | Read/update `{ policyText, consentText }` |

## Connecting the Recruitment Management System

This project was deliberately built with a clean, documented integration
surface so that once the separate Recruitment Management System (RMS) is
ready, it can connect to this careers site's applicant database without any
changes to this codebase. Two independent mechanisms are provided — use
either one, or both:

### 1. Pull: polling API (`/api/integration/*`)

Set `INTEGRATION_API_KEY` in `.env` to a long random secret (these endpoints
return `503` until it's set). The RMS then calls these endpoints with an
`X-API-Key: <that secret>` header — this is intentionally separate from the
admin panel's cookie-based login, since a server-to-server integration has no
browser session:

- `GET /api/integration/jobs` — full job list with timestamps
- `GET /api/integration/applications?since=<ISO timestamp>&cursor=<id>&limit=<n>` —
  applications ordered oldest-first, so the RMS can page through everything
  it hasn't seen yet. Each response includes `nextCursor`; keep calling with
  that cursor until it comes back `null`, then store the latest `submittedAt`
  you saw and pass it as `since` on your next poll.

Example:

```bash
curl -H "X-API-Key: $INTEGRATION_API_KEY" \
  "https://your-domain.example/api/integration/applications?since=2026-09-01T00:00:00Z&limit=100"
```

### 2. Push: outbound webhook

Set `RMS_WEBHOOK_URL` in `.env` to the RMS's ingest URL. From then on, every
new application triggers a `POST` to that URL with:

```json
{ "event": "application.created", "data": { /* same shape as the API */ }, "sentAt": "..." }
```

This is fire-and-forget with a 5-second timeout — if the RMS is down or slow,
the applicant's own submission still succeeds; the webhook failure is only
logged server-side, never surfaced to the applicant. Because delivery isn't
guaranteed, treat the webhook as a low-latency notification to trigger a
poll via the API above, not as the sole source of truth.

## Deployment

This app has no dependency on any specific host — it's a standard Node.js
web service plus a PostgreSQL database, so any provider that offers both
works (Render, Railway, Fly.io, a VPS, your own company hosting, etc.).

### Quick test deploy (free, no commitment)

If you just want a real, working URL to click around and share for testing —
not a final hosting decision — this repo includes a `render.yaml` file that
lets [Render](https://render.com) build the whole thing (web service +
PostgreSQL database) automatically on its free tier:

1. Push this project to a GitHub (or GitLab) repository.
2. On Render, choose **New → Blueprint** and point it at that repository.
   Render reads `render.yaml` and creates both the web service and the
   database for you, on the free plan, with `JWT_SECRET` generated
   automatically and the database already wired up via `DATABASE_URL`.
3. Render will ask you to fill in one value it deliberately left blank:
   `ADMIN_PASSWORD` (pick any password for the admin panel during testing).
4. Every deploy runs `npm run migrate` automatically as part of the build, so
   the database schema (and the 6 sample jobs) is created the first time
   with nothing extra to run by hand.
5. Once it finishes building, Render gives you a `https://your-app.onrender.com`
   URL — that's a real, working, shareable site for testing.

Two things worth knowing about the free tier specifically (current as of
Render's pricing page — worth a quick check there since free-tier terms can
change): the free web service can spin down after periods of inactivity and
takes a few seconds to wake back up on the next request, and the free
Postgres database is meant for exploration rather than long-term storage of
real applicant data. Both are fine for trying the site out; neither is a
reason to worry about anything breaking during testing. When you're ready to
retire this and move to permanent hosting, deleting the Render project (or
just letting it sit unused) costs nothing and affects nothing else.

### Moving to permanent hosting later

Whichever host you settle on eventually, the setup is the same shape:

- Create a PostgreSQL database; copy its connection string into this app's
  `DATABASE_URL` environment variable (leave `PGSSL` unset/`true` — managed
  Postgres providers require SSL, which is the default here).
- Deploy this repository as a Node web service. Build command: `npm install
  && npm run migrate` (safe to run on every deploy — the migration is
  idempotent). Start command: `npm start`.
- Set the environment variables from `.env.example` in the host's dashboard
  (`ADMIN_PASSWORD_HASH` rather than the plain-text `ADMIN_PASSWORD` once
  this is more than a test; a real random `JWT_SECRET`; only fill in
  `INTEGRATION_API_KEY` / `RMS_WEBHOOK_URL` once the RMS exists).
- Uploaded resume/photo files are written to local disk (`uploads/`) — this
  needs a host with persistent disk storage (Render and Railway both have
  this; a serverless platform like Vercel does not, since its functions have
  no shared or persistent filesystem between requests — that host would need
  `src/upload.js` switched to a cloud storage backend such as Vercel Blob or
  S3 first). This wasn't needed for local development or the free-tier test
  path above, so it hasn't been built in, but the swap is isolated to that
  one file if a serverless host is ever the destination.

## Notes on this rebuild

This replaces the earlier prototype (a single self-contained Claude Artifact
page with data embedded in the page itself). That approach couldn't push data
to any external system — a published Artifact's content-security policy
blocks all outbound network requests to other hosts. This project has no such
restriction: it's a real server with a real database, so the applicant data
that used to live only inside a shared page now lives in PostgreSQL, and can
be reached both by this site's own admin panel and, later, by the
Recruitment Management System through the integration endpoints above.
