# KRYNX Video Vault v3

A full-stack student video/resource vault rebuilt to solve the previous login and background problems.

## What changed
- No SQLite/native modules. Data is stored in `server/data.json`.
- Passwords use Node's built-in `crypto.scrypt` hashing.
- Tokens use HMAC-signed, expiring tokens.
- The admin account is seeded and its password is repaired on server start from server environment variables.
- Frontend and API use same-origin `/api` paths in development and production.
- The uploaded anime pictures are physically included in `client/public/anime/` as `bg_01.jpg` … `bg_20.jpg`.
- The login screen has a visible anime slideshow rather than a black-only background.
- Video uploads are capped at 1GB.
- `DATA_DIR` lets production deployments persist account data and uploads on a mounted disk.

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

## Deploy to Render
The repository includes a [Render Blueprint](./render.yaml) for one full-stack Node service. It builds the client, serves the UI and API together, and mounts a persistent disk at `/var/data` for user accounts, chat data, uploads, and videos. The Blueprint uses a paid Starter service because persistent disks are not available on Render's free web services.

To deploy:
1. Push this repository to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Enter the initial administrator email when prompted. Render generates the initial admin password and token secret.
4. Deploy, then get the generated `ADMIN_PASSWORD` from the service environment settings and share the login credentials privately.
5. After deployment, replace the contents of [LIVE_LINK.txt](./LIVE_LINK.txt) with the Render URL.

Do not add `.env`, `server/data.json`, or uploaded user content to Git. They are excluded by `.gitignore`.

## Important
Saved links open in the in-app player. Direct MP4/WebM/OGG/M4V/MOV links and uploaded files use KRYNX's own play, seek, volume, and fullscreen controls. YouTube, Vimeo, Dailymotion, Twitch, TikTok, and Google Drive video previews use their embeddable players inside KRYNX; other URLs are shown in an embedded webpage frame. Some websites disable iframe embedding, require sign-in, or do not provide a direct video stream. Those restrictions cannot be bypassed by a website player, so the player keeps an “Open source” fallback and reports when a direct video URL cannot play.
