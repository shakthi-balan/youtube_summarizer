# Hosting Manual

Step-by-step instructions to host YouTube Summarizer in production. Pick one path:

| Path | Best for | Effort |
|------|----------|--------|
| [Vercel + Supabase](#1-vercel--supabase-fastest) | Public HTTPS with almost no server work | Lowest |
| [Docker on a VPS](#2-docker-on-a-vps) | A single machine you control | Medium |
| [Node.js without Docker](#3-nodejs-without-docker) | Existing Node hosts (Railway, Render, your own VM) | Medium |

After the app is up, complete [first-run setup](#first-run-after-the-app-is-live).

---

## What you need

1. **A Postgres database** — use [Supabase](https://supabase.com) (free tier is enough to start).
2. **Two secrets** — `APP_SECRET` (encrypts user API keys) and `BETTER_AUTH_SECRET` (signs sessions).
3. **A public URL** — cookies are marked Secure in production, so use **HTTPS**.
4. **Node.js 20+** — only if you are not using Docker or Vercel.

Transcript and LLM API keys (Supadata, Z.AI, optional fallbacks) are entered in the in-app setup wizard. You do not need them as environment variables to boot the app.

---

## Create a Supabase database

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Project Settings → Database**.
3. Copy two connection strings (URL-encode special characters in the password):

| Env var | Which URL | Port | When it is used |
|---------|-----------|------|-----------------|
| `DATABASE_URL` | **Transaction pooler** | `6543` | App runtime (especially serverless / Vercel) |
| `DIRECT_URL` | **Direct** or **Session pooler** | `5432` | Prisma migrations and seed |

Append `?pgbouncer=true` to the Transaction pooler URL if it is not already there.

Example shape:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
```

If you used the official **Supabase ↔ Vercel** integration, these aliases also work: `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`.

---

## Environment variables

Copy `.env.example` to `.env` (Docker / Node) or set the same names in the host’s dashboard (Vercel, Railway, etc.).

| Variable | Required | Notes |
|----------|----------|--------|
| `APP_SECRET` | Yes | `openssl rand -hex 32`. Changing this after users save API keys makes those keys unreadable. |
| `BETTER_AUTH_SECRET` | Yes | `openssl rand -base64 32`. Changing this signs users out. |
| `BETTER_AUTH_URL` | Yes in production | Exact public origin, no trailing slash. Example: `https://summarizer.example.com` |
| `DATABASE_URL` | Yes | Pooled Postgres URL (port `6543` on Vercel). |
| `DIRECT_URL` | Yes for migrations | Direct or session URL (port `5432`). Docker defaults this to `DATABASE_URL` if unset. |

Optional (usually left unset; users add keys in the UI):

| Variable | Purpose |
|----------|---------|
| `SUPADATA_API_KEY` | Transcripts (UI keys win if both are set) |
| `ZAI_API_KEY` | GLM summarization |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY` | Fallback models |
| `RESET_DATABASE` | Docker only. Set to `true` to wipe and recreate the schema. **Destroys all data.** |

Never commit `.env`. Never reuse development secrets in production.

---

## 1. Vercel + Supabase (fastest)

1. Push the repo to GitHub (or import [shakthi-balan/youtube_summarizer](https://github.com/shakthi-balan/youtube_summarizer)).
2. In [Vercel](https://vercel.com), **Add New → Project** and select the repo.
3. Keep the framework as Next.js. The repo already sets install/build in `vercel.json` (`npm install --legacy-peer-deps` and Prisma migrate + seed + `next build`).
4. Add environment variables for **Production** (and **Preview** if you use preview URLs):

   - `APP_SECRET`
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL` — first deploy can use `https://YOUR-PROJECT.vercel.app`; after a custom domain, set the custom origin and **redeploy**.
   - `DATABASE_URL`
   - `DIRECT_URL`

5. Deploy. If the first Git import already ran (and failed) before you saved env vars, add the vars, then start a **new** deployment — do not replay the old failed build.
6. Open the deployment URL. Confirm health:

   ```bash
   curl https://YOUR-PROJECT.vercel.app/api/health
   ```

   Expect `{"status":"ok",...}`. `503` means Postgres is unreachable or the URL is wrong.

**Custom domain:** Project → Settings → Domains, then update `BETTER_AUTH_URL` to `https://your-domain` and redeploy so auth cookies match the origin.

### Vercel build error: `prisma/vercel-build.mjs` exited with 1

The build runs `prisma migrate deploy` on Vercel. That step **only sees environment variables from the Vercel dashboard**, not your laptop `.env` (that file is gitignored).

The message about `POSTGRES_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` is the script telling you no database URL was present. Fix it like this:

1. In Supabase: **Project Settings → Database → Connect**. Copy:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`  
     Add `?pgbouncer=true` if it is not already on the URL.
   - **Session pooler** or **Direct** (port `5432`) → `DIRECT_URL`
   - URL-encode the password (`@` → `%40`, `#` → `%23`, and so on).
   - Add `sslmode=require` if it is not already on the URL.
2. In Vercel: **Settings → Environment Variables**. Add both names.
3. Check **Production** and **Preview** (a branch deploy is Preview; `main` is Production). Variables checked only for Development are **not** available in Git deployments.
4. If you used **Supabase × Vercel integration**, confirm those `POSTGRES_*` keys actually appear in the same Environment Variables page. If they are missing, add `DATABASE_URL` and `DIRECT_URL` yourself — the integration does not always inject them in time for the first build.
5. **Redeploy from a new build**, not the old failure:
   - Deployments → ⋮ on the latest → **Redeploy** → uncheck **Use existing Build Cache**, or
   - Push a new commit.
6. In the new build log, the script prints `DATABASE_URL: set|missing` (and the other keys) without printing secrets. You want at least one `set`.

Until a Postgres URL is visible in that log, the command will keep exiting with 1. The Next.js app cannot be built for this project without a database, because the Vercel build also applies migrations.

---

## 2. Docker on a VPS

Requirements: Docker Engine 20.10+, Docker Compose v2, a host with HTTPS (see [reverse proxy](#https-reverse-proxy)).

```bash
git clone https://github.com/shakthi-balan/youtube_summarizer.git
cd youtube_summarizer

cp .env.example .env
```

Edit `.env`:

```env
APP_SECRET=          # openssl rand -hex 32
BETTER_AUTH_SECRET=  # openssl rand -base64 32
BETTER_AUTH_URL=https://summarizer.example.com
DATABASE_URL=        # Supabase transaction pooler
DIRECT_URL=          # Supabase direct or session pooler
```

Start:

```bash
docker compose up -d --build
```

The container listens on **port 3000**. Migrations and security-question seed run on first start (allow ~30–40 seconds).

```bash
curl http://localhost:3000/api/health
docker compose logs -f
```

Point your reverse proxy at `127.0.0.1:3000`. Do not expose 3000 on the public internet if you have HTTPS on 443.

**Update:**

```bash
git pull
docker compose down
docker compose up -d --build
```

User data lives in Supabase, not in a Docker volume. `docker compose down` does not delete the database. `RESET_DATABASE=true` does.

**Different host port** (edit `docker-compose.yml`):

```yaml
ports:
  - "3001:3000"
```

**Manual `docker run`** (same env vars as compose):

```bash
docker build -t youtube-summarizer .
docker run -d --name youtube-summarizer -p 3000:3000 \
  -e NODE_ENV=production \
  -e APP_SECRET="..." \
  -e BETTER_AUTH_SECRET="..." \
  -e BETTER_AUTH_URL="https://summarizer.example.com" \
  -e DATABASE_URL="postgresql://..." \
  -e DIRECT_URL="postgresql://..." \
  youtube-summarizer
```

---

## 3. Node.js without Docker

```bash
git clone https://github.com/shakthi-balan/youtube_summarizer.git
cd youtube_summarizer

cp .env.example .env
# Fill APP_SECRET, BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL, DIRECT_URL

npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npx prisma db seed

npm run build
NODE_ENV=production npm start
```

The process listens on port **3000** by default (`PORT` can be set by some hosts). Put a process manager (systemd, PM2) and HTTPS in front of it.

Example systemd unit (`/etc/systemd/system/youtube-summarizer.service`):

```ini
[Unit]
Description=YouTube Summarizer
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/youtube_summarizer
EnvironmentFile=/opt/youtube_summarizer/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now youtube-summarizer
```

---

## HTTPS reverse proxy

`BETTER_AUTH_URL` must be the URL users type in the browser. In production, sessions use Secure cookies, so HTTP-only public access will not stay logged in.

### Caddy (automatic TLS)

```caddy
summarizer.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name summarizer.example.com;

    ssl_certificate     /etc/letsencrypt/live/summarizer.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/summarizer.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}

server {
    listen 80;
    server_name summarizer.example.com;
    return 301 https://$host$request_uri;
}
```

Summarization can take a while; keep a long `proxy_read_timeout` (or equivalent) so the stream is not cut off.

---

## First run after the app is live

1. Open the public URL.
2. **Register** an account (password: at least 10 characters, one uppercase, one number, one special character). Set three security questions when prompted.
3. Complete the **setup wizard**:
   - [Supadata](https://supadata.ai) — YouTube transcripts
   - [Z.AI](https://z.ai) — GLM summaries
   - Optional fallbacks: Gemini, Groq, OpenAI
4. Paste a YouTube URL and generate a summary.

Keys saved in the UI are encrypted with `APP_SECRET` and stored per user. They override any matching env vars.

---

## Health, logs, and common failures

| Check | Command / action |
|-------|------------------|
| App + DB | `GET /api/health` → `status: "ok"` |
| Docker logs | `docker compose logs -f` |
| Manual migrate | `docker compose exec app npx prisma migrate deploy` (or the same locally) |

| Symptom | Likely cause |
|---------|----------------|
| Health `503` / “Database unreachable” | Wrong `DATABASE_URL`, password not URL-encoded, or Supabase paused |
| `prisma/vercel-build.mjs` exited with 1 | No Postgres URL in the **Vercel** env for this Production/Preview deploy. See [Vercel build error](#vercel-build-error-prismavercel-buildmjs-exited-with-1) |
| `SELF_SIGNED_CERT_IN_CHAIN` during seed | Node’s `pg` client rejecting Supabase TLS. Redeploy this commit (seed/runtime use `ssl.rejectUnauthorized = false` for remote hosts). Optional: append `sslmode=require` to the URLs. |
| Login cookie never sticks | `BETTER_AUTH_URL` ≠ public origin, or site served as HTTP while `NODE_ENV=production` |
| Users get signed out after a deploy | `BETTER_AUTH_SECRET` changed |
| Saved API keys stop working | `APP_SECRET` changed |
| Port already in use | Change host mapping (`3001:3000`) or stop the other process |
| Container exits on migrate | Check logs; only use `RESET_DATABASE=true` if you accept wiping data |

---

## Security checklist

- Use unique production secrets; do not copy `.env` from a laptop.
- Serve the app on HTTPS and set `BETTER_AUTH_URL` to that origin.
- Restrict Postgres to the app (Supabase allow-list or private network). Do not publish `5432`/`6543` to the world unless you must.
- Do not set `RESET_DATABASE=true` except on throwaway databases.
- Keep Node 20+ and rebuild the image after `git pull`.

---

## Related docs

- [docs/installation.md](docs/installation.md) — Docker details
- [docs/configuration.md](docs/configuration.md) — API keys and models
- [docs/development.md](docs/development.md) — local development
- [docs/api.md](docs/api.md) — HTTP API
