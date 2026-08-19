from functools import wraps

from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from accounts.models import Roles

ADMIN = Roles.ADMIN
COMPANY_REP = Roles.COMPANY_REP
QC_PERSON = Roles.QC_PERSON
WAREHOUSE_MANAGER = Roles.WAREHOUSE_MANAGER

ALL_ROLES = {ADMIN, COMPANY_REP, QC_PERSON, WAREHOUSE_MANAGER}


def role_required(*roles):
    """View decorator: 403s unless request.user.role is one of `roles` (ADMIN always allowed)."""

    def decorator(view_func):
        @wraps(view_func)
        @login_required
        def wrapped(request, *args, **kwargs):
            if request.user.role != ADMIN and request.user.role not in roles:
                raise PermissionDenied("You do not have permission to perform this action.")
            return view_func(request, *args, **kwargs)

        return wrapped

    return decorator


class IsRole(BasePermission):
    """DRF permission: allow ADMIN plus any role listed in `allowed_roles` on the view."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        allowed = getattr(view, "allowed_roles", None)
        if allowed is None:
            return True
        return request.user.role == ADMIN or request.user.role in allowed


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == ADMIN)
