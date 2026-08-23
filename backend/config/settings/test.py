# config/settings/test.py
"""
Test settings — imported via DJANGO_SETTINGS_MODULE in pytest.ini.
Keep this fast: no S3, no real Redis.
"""
from .base import *  # noqa: F401,F403

DEBUG = False

# Fast password hashing — don't waste time on bcrypt rounds in tests
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# In-memory cache instead of Redis for tests
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
}

# Local file storage for media in tests
MEDIA_ROOT = "/tmp/textile_test_media"

# Disable throttling in tests unless a test explicitly opts in
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {},
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"