from django.shortcuts import render
from django.utils.dateparse import parse_date

from accounts.permissions import role_required
from audit.models import AuditLog


@role_required()
def audit_log_list(request):
    qs = AuditLog.objects.select_related("actor")
    entity_type = request.GET.get("entityType")
    if entity_type and entity_type != "ALL":
        qs = qs.filter(entityType=entity_type)
    date_from = parse_date(request.GET.get("dateFrom") or "")
    date_to = parse_date(request.GET.get("dateTo") or "")
    if date_from:
        qs = qs.filter(timestamp__date__gte=date_from)
    if date_to:
        qs = qs.filter(timestamp__date__lte=date_to)

    entity_types = AuditLog.objects.order_by().values_list("entityType", flat=True).distinct()
    return render(
        request,
        "audit/audit_log_list.html",
        {"logs": qs.order_by("-timestamp")[:200], "entity_types": entity_types, "entity_type_filter": entity_type or "ALL"},
    )
