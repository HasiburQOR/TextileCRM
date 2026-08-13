from notifications.models import Notification

NAV_ITEMS = [
    {"id": "dashboard", "url": "dashboard:index", "label": "Dashboard", "icon": "speedometer2", "admin_only": False},
    {"id": "buyers", "url": "buyers:list", "label": "Buyers", "icon": "people", "admin_only": True},
    {"id": "sister-profiles", "url": "buyers:sister_list", "label": "Sister Profiles", "icon": "diagram-3", "admin_only": True},
    {"id": "sourcing", "url": "sourcing:list", "label": "Sourcing Intake", "icon": "building-gear", "admin_only": False},
    {"id": "sourcing-trips", "url": "trips:list", "label": "Sourcing Trips", "icon": "geo-alt", "admin_only": False},
    {"id": "approval", "url": "sourcing:approval", "label": "Admin Approval", "icon": "shield-check", "admin_only": True},
    {"id": "catalog", "url": "sourcing:catalog", "label": "Product Catalog", "icon": "search", "admin_only": False},
    {"id": "packing", "url": "packing:list", "label": "Packing Lists", "icon": "clipboard-data", "admin_only": False},
    {"id": "qc-costs", "url": "qc:list", "label": "QC Costs", "icon": "currency-dollar", "admin_only": False},
    {"id": "warehouse", "url": "warehouse:list", "label": "Warehouse Costs", "icon": "building", "admin_only": False},
    {"id": "expenses", "url": "expenses:list", "label": "Expenses", "icon": "receipt", "admin_only": False},
    {"id": "settlement", "url": "expenses:settlement", "label": "Settlement", "icon": "percent", "admin_only": False},
    {"id": "costing", "url": "dashboard:cost_reports", "label": "Cost Reports", "icon": "bar-chart", "admin_only": False},
    {"id": "invoices", "url": "invoicing:list", "label": "Invoices", "icon": "receipt-cutoff", "admin_only": False},
    {"id": "exchange-rates", "url": "invoicing:exchange_rates", "label": "Exchange Rates", "icon": "arrow-left-right", "admin_only": True},
    {"id": "documents", "url": "documents:list", "label": "Document Vault", "icon": "folder-fill", "admin_only": False},
    {"id": "audit-log", "url": "audit:list", "label": "Audit Log", "icon": "file-earmark-text", "admin_only": True},
]


def nav_context(request):
    user = getattr(request, "user", None)
    is_admin = bool(user and user.is_authenticated and user.role == "ADMIN")
    unread_count = 0
    if user and user.is_authenticated:
        unread_count = Notification.objects.filter(user=user, isRead=False).count()
    nav_items = [n for n in NAV_ITEMS if not n["admin_only"] or is_admin]
    return {
        "nav_items": nav_items,
        "is_admin": is_admin,
        "unread_notification_count": unread_count,
    }
