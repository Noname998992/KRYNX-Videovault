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
- Free production hosting uses Supabase for persistent account and chat data, and Unlisted YouTube URLs for embedded video playback.
- Direct file uploads are disabled in the free deployment so videos and chat attachments are not lost on Render's ephemeral disk.
- Cloudflare R2 direct uploads remain available as an optional paid storage configuration.

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

## Deploy for free
The [Render Blueprint](./render.yaml) runs the app on Render's free web-service plan. Supabase Postgres stores accounts, video links, chat, and notifications. Render's local filesystem is temporary, so the free deployment deliberately disables video-file and chat-attachment uploads.

There is **no free, private 200GB video bucket** in this setup. Instead, upload videos you have rights to share to your own YouTube channel as **Unlisted**, then add each video URL in KRYNX using **Upload Resource → Link**. KRYNX embeds supported YouTube links in its player. Unlisted videos are not private: anyone with the link can watch and share it, and videos remain subject to YouTube's account limits and terms. This workaround does not promise 200GB of private storage.

The Supabase Free project is configured in the Singapore region. Use a strong private database password; enter it only in provider forms. From **Project Settings → Database**, copy the Postgres **Session pooler** connection string; the app creates its `krynx_app_state` table automatically when deployed.

To deploy:
1. In Render, create a **Blueprint** from this GitHub repository and select the `main` branch.
2. Enter `ADMIN_EMAIL` and the Supabase `DATABASE_URL` when prompted. Render generates `ADMIN_PASSWORD` and `TOKEN_SECRET`.
3. Deploy and wait for `/api/health` to report healthy. The administrator password is in the Render service's environment settings; do not post it publicly.
4. Copy the actual `https://…onrender.com` URL into [LIVE_LINK.txt](./LIVE_LINK.txt), then commit and push that file.

Render Free may sleep after 15 minutes without traffic; waking the site can take about a minute. Supabase Free projects may pause after a week of inactivity. Keep both accounts active and check their current usage/limits.

### Optional paid video storage
To later enable direct file uploads instead of YouTube links, configure a Cloudflare R2 bucket and scoped S3 credentials in the Render service environment (`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`), then apply [r2-cors.json](./r2-cors.json) with the actual Render origin. R2 requires billing authorization for over-limit usage; at 200GB the current storage-only estimate is about **$2.85 USD/month**, plus request charges and taxes. The application caps this mode at 1GB per video and 200GB total.

Render Free's filesystem is temporary. Do not rely on local files for production persistence. Never commit `.env`, `server/data.json`, uploaded files, or provider credentials; `.gitignore` excludes local data and secrets.

## Important
Saved links open in the in-app player. Direct MP4/WebM/OGG/M4V/MOV links and uploaded files use KRYNX's own play, seek, volume, and fullscreen controls. YouTube, Vimeo, Dailymotion, Twitch, TikTok, and Google Drive video previews use their embeddable players inside KRYNX; other URLs are shown in an embedded webpage frame. Some websites disable iframe embedding, require sign-in, or do not provide a direct video stream. Those restrictions cannot be bypassed by a website player, so the player keeps an “Open source” fallback and reports when a direct video URL cannot play.
