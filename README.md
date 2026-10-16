# 11206 Load Test dashboard

Files:

- `index.html` — the dashboard (phone-first). Reads `students.xlsx` from the same folder in the browser.
- `students.xlsx` — roster: three columns, **First name**, **Last name**, **Tutor**. Tutor must be one of
  Lucy, Herman, Kamyar, Vanessa, Annabel, Aman, Daniel, Mitchell, Fernando, Michelle, Sarah.
- `api/results.js` — Vercel serverless function that stores results in a Redis database so every phone sees the same data.

## Deploy (free Vercel Hobby plan)

1. Push this folder to a **private** GitHub repo (replace the placeholder `students.xlsx` with the real one first).
2. In Vercel: **Add New → Project → Import** the repo. Framework preset: *Other*. No build command. Deploy.
3. In the Vercel project: **Storage** tab → **Create Database** → choose **Upstash → Redis** (free plan) → connect it to this project.
   This adds `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) as environment variables automatically.
4. **Settings → Environment Variables**: add `ADMIN_KEY` = a password of your choice. Only someone with this key can wipe all shared results from the dashboard.
5. **Deployments → Redeploy** so the function picks up the environment variables.
6. Share the project URL with the tutors. The header shows a green dot and "live" when syncing is working.

## How syncing works

- Every edit is saved on the phone immediately and sent to `/api/results` half a second later.
- Tutorial pages re-fetch when opened and every 30 s; the Compare page every 8 s. Newer timestamp wins per student.
- Offline edits are queued and sent when the phone reconnects.
- **Export to Excel** downloads everything (Results + Summary sheets). **Import results files** merges exported files back in (useful if a phone was offline all session).
