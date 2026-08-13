#!/bin/sh
set -e

# ── Wait for PostgreSQL ──────────────────────────────────────────
echo "Waiting for postgres at ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}..."
python - <<'PYEOF'
import os, socket, time

host = os.environ.get("POSTGRES_HOST", "db")
port = int(os.environ.get("POSTGRES_PORT", "5432"))
for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit("Postgres did not become available in time")
PYEOF
echo "Postgres is up."

# ── Run migrations & collect static files ──────────────────────
python manage.py migrate --noinput
python manage.py collectstatic --noinput

# ── Seed demo users (safe — skips if admin user already exists) ─
python manage.py seed_demo_data

echo "✅ Backend API ready."

exec "$@"
