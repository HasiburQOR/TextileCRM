import random
import string
import time
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from core.models import SequenceCounter


def round_money(value) -> Decimal:
    """Round to 2dp, half-away-from-zero — matches the source app's Math.round(x*100)/100."""
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@transaction.atomic
def next_sequence_number(key: str) -> int:
    """Atomically increment and return the next number for a given counter key."""
    counter, _ = SequenceCounter.objects.select_for_update().get_or_create(key=key, defaults={"value": 0})
    counter.value += 1
    counter.save(update_fields=["value"])
    return counter.value


def generate_code(prefix: str) -> str:
    """e.g. generate_code('QC') -> 'QC-2026-001'. Scoped per-prefix-per-year, atomic."""
    year = timezone.now().year
    key = f"{prefix}-{year}"
    n = next_sequence_number(key)
    return f"{prefix}-{year}-{n:03d}"


def generate_style_number() -> str:
    """STY-<timestamp_ms>-<5 random base36 chars>, matching the original app's format."""
    ms = int(time.time() * 1000)
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f"STY-{ms}-{rand}"
