"""
Tenant isolation for the Buyer role — the single most safety-critical piece
of this system (DRF Migration Instructions, Section 2.4). A buyer-role user
must never be able to read another buyer's data, and must never be able to
successfully call a write endpoint, anywhere in the API.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import Roles


class TenantScopedViewSet:
    """
    Mixin for any ViewSet whose queryset must be restricted to the requesting
    buyer's own data when ``request.user.role == Roles.BUYER``.

    Subclasses MUST set ``tenant_lookup`` to the ORM lookup path (Django
    double-underscore syntax) from this viewset's model to the owning
    BuyerProfile's id — e.g. ``"buyerProfile_id"`` on SisterProfile itself,
    or ``"sisterProfile__buyerProfile_id"`` on a model nested under
    SisterProfile.

    Fails closed: if ``tenant_lookup`` is left unset (or the user has no
    buyer_profile_id) and a buyer-role user reaches this viewset, the
    queryset resolves to ``.none()`` rather than leaking unfiltered data.
    Every buyer-reachable viewset must explicitly declare its tenant_lookup —
    this is deliberate friction, not an oversight.

    Because DRF's default ``get_object()`` looks the pk up *within*
    ``get_queryset()``, a buyer requesting another buyer's detail row 404s
    automatically once the list is correctly scoped — no separate detail-view
    check is needed.
    """

    tenant_lookup: str | None = None

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "role", None) == Roles.BUYER:
            buyer_profile_id = getattr(user, "buyer_profile_id", None)
            if not self.tenant_lookup or not buyer_profile_id:
                return qs.none()
            qs = qs.filter(**{self.tenant_lookup: buyer_profile_id})
        return qs


class BuyerReadOnly(BasePermission):
    """
    Global permission (installed as a DEFAULT_PERMISSION_CLASS): a buyer-role
    user may only ever issue safe (read) requests, on any endpoint, anywhere
    in the API. This guarantees BR-54 / FR-78 even if a future viewset
    forgets to check the role explicitly.
    """

    message = "The Buyer Portal is read-only."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if getattr(user, "role", None) == Roles.BUYER:
            return request.method in SAFE_METHODS
        return True
