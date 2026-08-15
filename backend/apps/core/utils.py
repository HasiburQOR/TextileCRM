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


def sum_size_breakdown(size_breakdown) -> int:
    """Custom_Size_Breakdown_Feature.md: `size_breakdown` is a per-color,
    free-form array of `{"size_label": ..., "quantity": ...}` entries (not
    a fixed S/M/L/XL/XXL dict) — shared by apps.sourcing.ProductVariant and
    apps.packing.PackingCarton, so the sum lives in one place both call into,
    matching the doc's "build it once, reuse it, don't build two versions
    that could drift apart" instruction."""
    return sum(int(entry.get("quantity") or 0) for entry in (size_breakdown or []))


def generate_reference_code(prefix: str) -> str:
    """Reference_Numbers_Identifier_System.md: e.g. generate_reference_code('BUY')
    -> 'BUY-0001'. Unlike generate_code() above, this is NOT year-scoped — one
    continuous sequence per prefix forever, zero-padded to 4 digits (extends
    automatically past 9999, since next_sequence_number's PositiveIntegerField
    just keeps counting). Same atomic select_for_update() guarantee, never a
    "read max, add 1" pattern."""
    n = next_sequence_number(prefix)
    return f"{prefix}-{n:04d}"
