# Shipment Sourcing — Django

A Django rewrite of the shipment sourcing / QC / warehouse / invoicing management app, containerized with Docker.

## Run it

```bash
cp .env.example .env      # edit DJANGO_SECRET_KEY and POSTGRES_PASSWORD
docker compose up -d --build
```

Visit http://localhost:8000. On first boot the container migrates the database and (if `DJANGO_SEED_DATA=true` in `.env`) seeds demo data — safe to leave on, it skips itself if data already exists.

## Demo logins

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin — full access |
| `hasib` | `pass123` | Company Rep — sourcing intake, own requests |
| `karim` | `pass123` | QC Person — QC cost reports |
| `rahim` | `pass123` | Warehouse Manager — warehouse costs |

Buyer portal (`/buyers/portal/login/`, separate login from staff accounts):

| Username | Password |
|---|---|
| `zara_portal` | `buyer123` |
| `hm_portal` | `buyer123` |

Django admin is at `/admin/` (log in as `admin`).

## Stack

- Django 6.1 + Django REST Framework (JWT via `simplejwt`) at `/api/`
- PostgreSQL 16 (via `docker-compose.yml`; set `DB_ENGINE=sqlite` env var to fall back to SQLite for local dev without Docker)
- Server-rendered templates (Bootstrap 5 + HTMX) for the UI; one Django app per domain area (`accounts`, `buyers`, `sourcing`, `trips`, `qc`, `warehouse`, `packing`, `invoicing`, `expenses`, `notifications`, `documents`, `audit`, `dashboard`, `core`)
- gunicorn + WhiteNoise for serving the app and static files in the container
- Real session-based auth with server-enforced roles (the original Next.js prototype had no server-side access control at all — any client could approve/reject/void by editing the request body)

## Local dev without Docker

```bash
python -m venv .venv && .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver
```

Defaults to SQLite (`db.sqlite3`) unless `DB_ENGINE=postgres` is set.

## Notes on business-logic fidelity

This is a faithful port of the original Prisma/Next.js data model and calculations (QC/warehouse cost totals, packing-list CBM math, invoice commission + outstanding-balance recalculation, TYPE_1/2/3 settlement formulas), with two deliberate fixes:

- Sequential codes (`QC-2026-001`, `INV-2026-001`) are now generated atomically via a `SELECT ... FOR UPDATE` counter, instead of the original's `count() + 1` (which could collide under concurrent requests).
- A `commissionType: 'FIXED'` value in the original seed data didn't match the `'FLAT'` the app's own logic checked for — fixed here so seeded invoices compute their commission correctly.
