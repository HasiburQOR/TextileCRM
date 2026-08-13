from rest_framework.permissions import BasePermission

from apps.accounts.models import Roles


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == Roles.ADMIN)


class IsManagementOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Roles.ADMIN, Roles.MANAGEMENT)
        )


class IsQCOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Roles.ADMIN, Roles.QC)
        )


class IsSupplierStaff(BasePermission):
    """Any internal/supplier-side role — i.e. anyone but the Buyer role."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role != Roles.BUYER)


class IsRole(BasePermission):
    """
    Configurable per view via `view.allowed_roles = [Roles.ADMIN, Roles.QC]`.
    Admin is always allowed regardless of the list, matching the DRF doc's
    "Admin always allowed" convention used across the supplier side.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        allowed = getattr(view, "allowed_roles", None)
        if allowed is None:
            return True
        return user.role == Roles.ADMIN or user.role in allowed
