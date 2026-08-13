from django.db import transaction
from django.utils import timezone

from apps.core.models import SequenceCounter


@transaction.atomic
def next_sequence_number(key: str) -> int:
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
