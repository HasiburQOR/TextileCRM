from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin, IsRole, IsSupplierStaff
from apps.core.tenancy import TenantScopedViewSet
from apps.packing import exports, services
from apps.packing.models import PackingCarton, PackingList, PackingRule
from apps.packing.serializers import (
    GenerateCartonsSerializer,
    PackingCartonSerializer,
    PackingListSelfSerializer,
    PackingListSerializer,
    PackingRuleSerializer,
)
from apps.sourcing.models import Product

WRITE_ACTIONS = ("update", "partial_update", "destroy")
CREATE_ROLES = [Roles.COMPANY_REP, Roles.EMPLOYEE]
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class PackingRuleViewSet(viewsets.ModelViewSet):
    """Internal config, not part of the Buyer Portal's read surface (BR-55
    lists Packing Lists, not Packing Rule templates)."""

    queryset = PackingRule.objects.all()
    serializer_class = PackingRuleSerializer

    def get_permissions(self):
        if self.action in ("create", *WRITE_ACTIONS):
            return [IsAdmin()]
        return [IsSupplierStaff()]


class PackingListViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-16–22 / FR-13–24."""

    queryset = PackingList.objects.select_related("sisterProfile__buyerProfile", "packingRule").prefetch_related("cartons__product")
    tenant_lookup = "sisterProfile__buyerProfile_id"
    allowed_roles = CREATE_ROLES

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return PackingListSelfSerializer
        return PackingListSerializer

    def get_permissions(self):
        if self.action in ("create", "add_carton", "generate_preview"):
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        from apps.buyers.models import SisterProfile

        data = dict(request.data)
        cartons = data.pop("cartons", [])
        try:
            sister_profile = SisterProfile.objects.get(pk=data["sisterProfile"])
        except (KeyError, SisterProfile.DoesNotExist):
            raise DRFValidationError({"sisterProfile": "Required and must reference an existing Sister Profile."})
        packing_rule = (
            PackingRule.objects.filter(pk=data.get("packingRule")).first() if data.get("packingRule") else None
        )
        carton_rows = []
        for i, c in enumerate(cartons):
            row = dict(c)
            product_id = row.get("product")
            if not product_id:
                raise DRFValidationError({"cartons": f"Row {i + 1}: 'product' is required."})
            try:
                row["product"] = Product.objects.get(pk=product_id)
            except Product.DoesNotExist:
                raise DRFValidationError({"cartons": f"Row {i + 1}: product '{product_id}' not found."})
            carton_rows.append(row)
        try:
            packing_list = services.create_packing_list(
                sister_profile=sister_profile,
                created_by=request.user,
                cartons=carton_rows,
                packing_rule=packing_rule,
                poNo=data.get("poNo", ""),
                brandName=data.get("brandName", ""),
                date=data.get("date") or None,
                frontMark=data.get("frontMark", ""),
                sideMark=data.get("sideMark", ""),
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(self.get_serializer(packing_list).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            instance.delete()
        except ProtectedError:
            raise DRFValidationError("Cannot delete — this packing list is still referenced elsewhere.")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def add_carton(self, request, pk=None):
        packing_list = self.get_object()
        row = dict(request.data)
        product_id = row.get("product")
        try:
            row["product"] = Product.objects.get(pk=product_id)
        except Product.DoesNotExist:
            raise DRFValidationError({"product": f"Product '{product_id}' not found."})
        try:
            carton = services.add_carton(packing_list, **row)
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(PackingCartonSerializer(carton).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        """Downloadable copy of the packing list — PDF (default) or
        ?filetype=xlsx. (Named `filetype`, not `format` — see the matching
        note on InvoiceViewSet.export.) Tenant-scoped the same as every
        other action here."""
        packing_list = self.get_object()
        if request.query_params.get("filetype") == "xlsx":
            content = exports.render_packing_list_xlsx(packing_list)
            response = HttpResponse(content, content_type=XLSX_CONTENT_TYPE)
            filename = exports.packing_list_filename(packing_list, "xlsx")
        else:
            content = exports.render_packing_list_pdf(packing_list)
            response = HttpResponse(content, content_type="application/pdf")
            filename = exports.packing_list_filename(packing_list, "pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=["post"])
    def generate_preview(self, request):
        """FR-19-20: returns unsaved carton rows for review — does not
        persist. The client POSTs the reviewed rows to `add_carton` (or
        includes them in the initial `create` payload) to actually save."""
        payload = GenerateCartonsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        product = Product.objects.get(pk=payload.validated_data["product"])
        packing_rule = PackingRule.objects.get(pk=payload.validated_data["packingRule"])
        try:
            cartons = services.generate_cartons_from_rule(
                product=product,
                packing_rule=packing_rule,
                colors=payload.validated_data["colors"],
                start_carton_no=payload.validated_data["startCartonNo"],
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        for row in cartons:
            row["product"] = str(row["product"].id)
        return Response(cartons)


class PackingCartonViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """Nested under a packing list: /packing-lists/<list_pk>/cartons/."""

    queryset = PackingCarton.objects.select_related("packingList__sisterProfile__buyerProfile", "product")
    serializer_class = PackingCartonSerializer
    tenant_lookup = "packingList__sisterProfile__buyerProfile_id"
    allowed_roles = CREATE_ROLES

    def get_queryset(self):
        qs = super().get_queryset()
        list_id = self.kwargs.get("list_pk")
        if list_id:
            qs = qs.filter(packingList_id=list_id)
        return qs

    def get_permissions(self):
        if self.action == "create":
            return [IsRole()]
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        packing_list = PackingList.objects.get(pk=self.kwargs["list_pk"])
        carton = serializer.save(packingList=packing_list)
        services.compute_carton_derived(carton)
        carton.save()
        services.recompute_packing_list_totals(packing_list)
