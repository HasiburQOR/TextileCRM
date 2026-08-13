import json
from decimal import Decimal

from audit.models import AuditLog


class _JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def _snapshot(obj) -> str:
    if obj is None:
        return "{}"
    if isinstance(obj, dict):
        return json.dumps(obj, cls=_JSONEncoder, default=str)
    return json.dumps({k: v for k, v in obj.items()} if hasattr(obj, "items") else str(obj), cls=_JSONEncoder, default=str)


def log_action(actor, action: str, entity_type: str, entity_id, before=None, after=None, ip_address: str = "") -> None:
    AuditLog.objects.create(
        actor=actor,
        action=action,
        entityType=entity_type,
        entityId=str(entity_id),
        beforeSnapshot=_snapshot(before),
        afterSnapshot=_snapshot(after),
        ipAddress=ip_address,
    )


def client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")
