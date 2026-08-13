"""
BR-57 / FR-82. A single explicit function, called from every write path
that needs an audit trail — same "shared service function" convention as
apps.expenses.services.record_expense, rather than a decorator/mixin that
would have to introspect arbitrary call signatures to build snapshots.
"""

from decimal import Decimal

from apps.audit.models import AuditLogEntry


def _json_safe(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def log_action(*, actor, action: str, entity_type: str, entity_id, before: dict | None = None, after: dict | None = None) -> AuditLogEntry:
    return AuditLogEntry.objects.create(
        actor=actor,
        action=action,
        entityType=entity_type,
        entityId=str(entity_id),
        beforeSnapshot=_json_safe(before or {}),
        afterSnapshot=_json_safe(after or {}),
    )
