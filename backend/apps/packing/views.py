from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin, IsRole, IsSupplierStaff
from apps.packing import services
from apps.packing.models import PackingRule
from apps.packing.serializers import GenerateVariantRowsSerializer, PackingRuleSerializer
from apps.sourcing.models import Product

WRITE_ACTIONS = ("update", "partial_update", "destroy")


class PackingRuleViewSet(viewsets.ModelViewSet):
    """Internal config, not part of the Buyer Portal's read surface (BR-55
    lists Packing Lists, not Packing Rule templates). After the merge this
    app's only persistent model is PackingRule — the packing-list document
    itself is a generated export of a Product (see
    apps.sourcing.views.ProductViewSet.packing_list_export)."""

    queryset = PackingRule.objects.all()
    serializer_class = PackingRuleSerializer

    def get_permissions(self):
        if self.action in ("create", *WRITE_ACTIONS):
            return [IsAdmin()]
        return [IsSupplierStaff()]

    @action(detail=False, methods=["post"], url_path="generate-preview", url_name="generate-preview")
    def generate_preview(self, request):
        """FR-19-20, restated for the merged model: returns unsaved
        ProductVariant-shaped rows for review — does not persist. The client
        posts the reviewed rows as the Product's `variants` to actually
        save them."""
        payload = GenerateVariantRowsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        product = Product.objects.get(pk=payload.validated_data["product"])
        packing_rule = PackingRule.objects.get(pk=payload.validated_data["packingRule"])
        try:
            rows = services.generate_variant_rows_from_rule(
                product=product,
                packing_rule=packing_rule,
                colors=payload.validated_data["colors"],
                start_carton_no=payload.validated_data["startCartonNo"],
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(rows)
