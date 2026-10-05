# KRYNX Video Vault v3

A full-stack student video/resource vault rebuilt to solve the previous login and background problems.

## What changed
- Locally, application data is stored in `server/data.json`; production stores it in a Supabase Postgres state table.
- Passwords use Node's built-in `crypto.scrypt` hashing.
- Tokens use HMAC-signed, expiring tokens.
- The admin account is seeded and its password is repaired on server start from server environment variables.
- Frontend and API use same-origin `/api` paths in development and production.
- The uploaded anime pictures are physically included in `client/public/anime/` as `bg_01.jpg` … `bg_20.jpg`.
- The login screen has a visible anime slideshow rather than a black-only background.
- Videos up to 1GB are uploaded directly from the browser to Cloudflare R2; chat attachments are capped at 50MB.
- Render's ephemeral disk is used only for local development uploads, never for production video storage.

## Run
```bash
npm run install:all
npm run dev
```
Open `http://localhost:5173`.
The API runs on port 5001 by default to avoid conflicts with other local services that may already use port 5000.

## Admin
Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 8 characters), and `TOKEN_SECRET` (at least 32 characters) in the server environment. The admin account is created from these settings on first launch; the password is repaired from the environment on subsequent launches. Never commit real values. See [server/.env.example](./server/.env.example).

The Admin Console can create user accounts with email/password credentials, reset user passwords, manage user accounts, and delete any video resource. User passwords are stored as scrypt hashes; the admin can set a new password but cannot view an existing password.

If you want a clean reset, stop the server and delete `server/data.json`; the server will recreate it and seed the admin.

## Deploy with free compute and cloud storage
The [Render Blueprint](./render.yaml) runs the app on Render's free web-service plan. Supabase stores account, video metadata, chat, and notification state in Postgres. Cloudflare R2 stores video and chat attachment objects, with short-lived signed URLs for uploads and playback.

**200GB cannot be stored for free.** Supabase Free includes 1GB of file storage, so it is not used for videos. Cloudflare R2 currently includes 10GB-month of Standard storage; storing 200GB continuously is approximately **$2.85 USD/month for storage** at its published $0.015/GB-month rate after the included 10GB, before request charges or taxes. Render Free may sleep after 15 minutes without traffic, and Supabase Free projects may pause after one week of inactivity. Check the providers' current terms and usage dashboards before relying on this for long-term storage.

### One-time provider setup
1. Create a Supabase Free project. In **Project Settings → Database**, copy its Postgres **Session pooler** connection string. Keep the password private. The app creates its `krynx_app_state` table automatically on first start.
2. Create a Cloudflare R2 bucket. Create an S3 API token scoped to that bucket with object read/write/delete permission. Record the account ID, access key ID, secret access key, and bucket name; never commit them.
3. In the R2 bucket's CORS settings, apply [r2-cors.json](./r2-cors.json) after replacing `YOUR-RENDER-SERVICE` with the assigned service name. Keep the local origins only if needed. Browser direct uploads will otherwise fail CORS preflight.
4. In Render, create a **Blueprint** from this GitHub repository and choose the `main` branch. Enter `ADMIN_EMAIL`, the Supabase `DATABASE_URL`, and R2 account/bucket/access-key values when prompted. Render generates `ADMIN_PASSWORD` and `TOKEN_SECRET`.
5. Deploy and wait for `/api/health` to report healthy. The administrator password is in the Render service's environment settings; do not post it publicly.
6. Copy the actual `https://…onrender.com` URL into [LIVE_LINK.txt](./LIVE_LINK.txt), then commit and push that file.

For ongoing use, monitor R2 storage and request usage. The app enforces a **1GB per-video limit** and **200GB total video quota**. Signed playback links expire after 12 hours; reloading the video list generates fresh links.

Render Free's filesystem is temporary. Do not rely on local files for production persistence. Never commit `.env`, `server/data.json`, uploaded files, or provider credentials; `.gitignore` excludes local data and secrets.

## Important
Saved links open in the in-app player. Direct MP4/WebM/OGG/M4V/MOV links and uploaded files use KRYNX's own play, seek, volume, and fullscreen controls. YouTube, Vimeo, Dailymotion, Twitch, TikTok, and Google Drive video previews use their embeddable players inside KRYNX; other URLs are shown in an embedded webpage frame. Some websites disable iframe embedding, require sign-in, or do not provide a direct video stream. Those restrictions cannot be bypassed by a website player, so the player keeps an “Open source” fallback and reports when a direct video URL cannot play.
