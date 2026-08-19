# Deployment Guide — GitHub + Dokploy

How to get this repo onto GitHub (done — see Section 1) and host it on your Dokploy VPS (Section 2 onward).

---

## 1. GitHub — done

The repo is already pushed: **https://github.com/HasiburQOR/TextileCRM**

What happened, for the record:
- Added a root `.gitignore` (excludes `node_modules/`, Python venvs, `__pycache__/`, `media/`, `staticfiles/`, `dist/`, `.env`, and Office lock files).
- Added `.env.example` — a safe, secret-free template of the `.env` file `docker-compose.yml` reads. Your real `.env` stays local and untracked.
- Made `docker-compose.yml` production-configurable (see Section 3) without changing any local dev defaults.
- `git init`, committed, added `origin` pointing at your repo, pushed `main`.

From now on, whenever you want to update the deployed app: commit your changes and `git push origin main` — Section 4 covers how Dokploy picks that up.

**Before your next push**, know what's in this repo:
- `backend/` — the Django REST API (the actual product you've been building).
- `frontend-admin/` — the React admin SPA + Buyer Portal.
- `django_app/` — a separate Django app bundled in the same repo/compose stack; decide if you actually want this deployed (see Section 3.1).
- Root-level `src/`, `prisma/`, `next.config.ts`, `package.json` — a Next.js/Prisma scaffold that **isn't referenced by `docker-compose.yml` at all**. It's dead weight in this repo unless you're using it for something outside this stack — safe to ignore, or delete later if you confirm you don't need it.

---

## 2. What Dokploy needs from this repo

Dokploy deploys straight from `docker-compose.yml` — no changes to your compose file's *structure* were needed, only making a few settings overridable via environment variables (already done and pushed). Dokploy's "Compose" application type reads the repo, builds the images defined there, and lets you set environment variables and a public domain per service through its UI (backed by Traefik).

**Architecture once deployed:**
```
Internet ──HTTPS──▶ Dokploy/Traefik ──▶ frontend-admin (nginx, port 80)
                                              │
                                    /api/, /media/ proxied internally to
                                              ▼
                                        backend-api (port 8000, internal only)
                                              │
                                              ▼
                                         db (Postgres, internal only)
```
Only **frontend-admin** needs a public domain. `backend-api` and `db` should stay internal-only — nginx already proxies `/api/` and `/media/` to `backend-api` (see `frontend-admin/nginx.conf`), so the browser only ever talks to one origin.

---

## 3. Environment variables to set in Dokploy

In Dokploy, open your app → **Environment** tab, and set these (this populates the `.env` Docker Compose reads on that server — you don't need to commit a `.env` file, and shouldn't):

| Variable | Value | Why |
|---|---|---|
| `POSTGRES_USER` | e.g. `textilecrm` | Don't use the `app_user`/`app_password` dev defaults in production |
| `POSTGRES_PASSWORD` | a strong random password | Same reason |
| `DJANGO_SECRET_KEY` | a long random string | Generate one: `python -c "import secrets; print(secrets.token_urlsafe(50))"` — never reuse the dev placeholder |
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` | Switches on `DEBUG=False`, HSTS, secure cookies (see `backend/config/settings/prod.py`) |
| `DJANGO_ALLOWED_HOSTS` | `your-domain.com` | Required — `prod.py` defaults this to empty, which rejects every request until set |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://your-domain.com` | Needed for the Django admin site (`/admin/`) and any cookie-based requests |
| `CORS_ALLOWED_ORIGINS` | `https://your-domain.com` | Lets the frontend-admin origin call the API — set it even though they're same-origin behind nginx, since the JS still sends an Origin header |
| `VITE_API_BASE_URL` | `/api/v1` | Keep this — it's a *build-time* arg, and relative works because nginx proxies same-origin. Only change it if you deploy `backend-api` on a separate public domain instead |
| `ADMIN_PORT` | leave default (`5173`) | Dokploy's Traefik routes your domain to this container port regardless of what's published to the host — see 3.2 |

`DJANGO_SECURE_SSL_REDIRECT` already defaults to `false` for `backend-api` in the compose file (it's never directly internet-facing, so it shouldn't force its own redirect — Traefik/Dokploy handles the actual HTTPS enforcement at the edge for the public domain). Leave it alone unless you later expose `backend-api` on its own public domain too.

### 3.1 Decide what to actually deploy

`docker-compose.yml` defines four services: `db`, `backend-api`, `django-app`, `frontend-admin`. If `django-app` (the separate HTMX app) isn't something you actually use, you have two options in Dokploy:
- Deploy it anyway (it'll just sit there, unused, consuming a bit of VPS resource) — simplest, no repo changes.
- Remove the `django-app` service block from `docker-compose.yml` before deploying (and its `django_media` volume) — cleaner, but means you'd commit that change here in this repo, not just in Dokploy.

Either is fine; this doesn't block deployment.

### 3.2 A security note on ports

Locally, `docker-compose.yml` publishes `db` on `5432`, `backend-api` on `8020`, and `django-app` on `8000` directly to the host, for convenient local debugging. **On a public VPS, published ports are reachable from the internet unless your firewall blocks them** — Dokploy's domain routing (Traefik) doesn't need those host port mappings at all; it reaches every service over the internal Docker network regardless.

Before or right after your first deploy, either:
- Firewall the VPS (e.g. `ufw`) to only allow 22 (SSH), 80, and 443 from the internet, and leave the compose file as-is, or
- Remove the `ports:` block from `db` in `docker-compose.yml` (keep `backend-api`'s if you want to hit the API directly for debugging via VPN/SSH tunnel, otherwise remove that too).

The firewall route is simpler and doesn't require touching the compose file.

---

## 4. Setting up the Dokploy app

1. **Log into your Dokploy dashboard** on your VPS.
2. **Create a new Project** (or use an existing one) to group these services.
3. **Add an Application → Compose** type.
4. **Connect the GitHub repo**: `https://github.com/HasiburQOR/TextileCRM`, branch `main`. If the repo is private, Dokploy will prompt you to authorize via GitHub OAuth or a deploy key — follow its prompt.
5. **Compose file path**: `docker-compose.yml` (repo root — this is the default, just confirm it).
6. **Environment variables**: paste in everything from the table in Section 3.
7. **Domain**: under the app's Domains/Traefik settings, point your domain (or subdomain, e.g. `crm.yourdomain.com`) at the **`frontend-admin`** service, container port `80`. Enable Dokploy's automatic Let's Encrypt SSL.
8. **Deploy**. Dokploy will build all four images and start the stack. First deploy takes a few minutes (same npm/pip installs you saw locally).
9. **Watch the `backend-api` logs** in Dokploy for the same startup sequence you've seen locally: wait-for-postgres → migrate → collectstatic → seed demo users → gunicorn up. If `DJANGO_ALLOWED_HOSTS` isn't set correctly you'll see `DisallowedHost` errors here — that's the #1 thing to check if the site loads but API calls fail.
10. **Visit your domain** and log in with `admin` / `admin123` (or whatever you've since changed it to) to confirm.

### After first deploy
- **Change the demo passwords** (`admin`, `hasib`, `karim`, `rahim`, `nasrin`, `farzana`, and the buyer logins) immediately — they're documented in plain text in `docments/User_Guide.md`, which is fine for a local demo but not for a public URL.
- **Back up the `postgres_data` volume** regularly — Dokploy has a scheduled backup feature per volume; set it up now, before there's real data to lose.
- **Redeploying after a code change**: `git push origin main` from your dev machine, then either let Dokploy's auto-deploy-on-push webhook pick it up (enable this in the app's Git settings) or click "Redeploy" manually in the dashboard.

---

## 5. Quick troubleshooting

| Symptom | Likely cause |
|---|---|
| Site loads, but login/API calls all fail | `DJANGO_ALLOWED_HOSTS` not set to your domain, or `DJANGO_SETTINGS_MODULE` still on `config.settings.dev` |
| Images/QR codes/documents don't load | `/media/` isn't reaching `backend-api` — check `frontend-admin/nginx.conf` proxy is intact in the built image, and that `backend-api` is healthy |
| Infinite redirect loop | `DJANGO_SECURE_SSL_REDIRECT` got set to `true` on `backend-api` while it's still only reached internally — leave it `false` unless you exposed it separately |
| 502 right after a redeploy | Same nginx-DNS-caching issue we hit locally this session — `frontend-admin`'s nginx resolves `backend-api`'s hostname once at container start; if Dokploy recreates `backend-api` without also restarting `frontend-admin`, give it a manual restart |
| Django admin (`/admin/`) rejects your login with a CSRF error | `DJANGO_CSRF_TRUSTED_ORIGINS` missing your `https://` domain |
