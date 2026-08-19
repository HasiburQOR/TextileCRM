#!/bin/sh
set -e

if [ "$DB_ENGINE" = "postgres" ]; then
  echo "Waiting for postgres at ${POSTGRES_HOST:-db}:${POSTGRES_PORT:-5432}..."
  python - <<'PYEOF'
import os
import socket
import time

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
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput

if [ "$DJANGO_SEED_DATA" = "true" ]; then
  python manage.py seed_demo_data
fi

exec "$@"
