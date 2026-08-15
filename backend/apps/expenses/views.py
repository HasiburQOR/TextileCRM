from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsRole
from apps.buyers.models import SisterProfile
from apps.core.tenancy import TenantScopedViewSet
from apps.expenses import services
from apps.expenses.models import Expense
from apps.expenses.serializers import ExpenseSelfSerializer, ExpenseSerializer
from apps.sourcing.models import Product

WRITE_ACTIONS = ("update", "partial_update", "destroy")


class ExpenseViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-48 / FR-72-73: read-mostly — almost every row here is written by
    the QC/Warehouse/Sourcing services via `record_expense()`, not by a
    direct POST. A direct POST is still exposed (e.g. a misc cost that
    isn't produced by any other module) but routes through the same
    service, never a raw serializer save, so the "one shared entry point"
    invariant holds everywhere."""

    queryset = Expense.objects.select_related("sisterProfile__buyerProfile", "product", "createdBy")
    tenant_lookup = "sisterProfile__buyerProfile_id"
    allowed_roles = [Roles.COMPANY_REP, Roles.EMPLOYEE, Roles.QC, Roles.WAREHOUSE]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return ExpenseSelfSerializer
        return ExpenseSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        for param, field in (
            ("sisterProfile", "sisterProfile_id"),
            ("buyerProfile", "sisterProfile__buyerProfile_id"),
            ("product", "product_id"),
            ("sourceType", "sourceType"),
        ):
            value = self.request.query_params.get(param)
            if value:
                qs = qs.filter(**{field: value})
        return qs

    def create(self, request, *args, **kwargs):
        data = request.data
        sister_profile = SisterProfile.objects.filter(pk=data.get("sisterProfile")).first()
        if not sister_profile:
            raise ValidationError({"sisterProfile": "Required."})
        product = Product.objects.filter(pk=data.get("product")).first() if data.get("product") else None
        expense = services.record_expense(
            sister_profile=sister_profile,
            product=product,
            source_type=data.get("sourceType"),
            amount=data.get("amount"),
            currency=data.get("currency", "BDT"),
            remarks=data.get("remarks", ""),
            field_name=data.get("fieldName", ""),
            created_by=request.user,
        )
        if expense is None:
            raise ValidationError({"amount": "Must be a non-zero amount."})
        return Response(self.get_serializer(expense).data, status=status.HTTP_201_CREATED)
