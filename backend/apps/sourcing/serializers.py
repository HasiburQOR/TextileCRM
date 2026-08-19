from rest_framework import serializers

from apps.sourcing.models import (
    CORE_FIELD_DESCRIPTORS,
    FieldGroup,
    Product,
    ProductImage,
    ProductTemplate,
    ProductVariant,
    SourcingCost,
    SourcingCostItem,
    TemplateField,
)


class FieldGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldGroup
        fields = ["id", "name", "description"]
        read_only_fields = ["id"]


class TemplateFieldSerializer(serializers.ModelSerializer):
    """The Field Library — GET /api/v1/field-library/."""

    fieldGroupName = serializers.CharField(source="fieldGroup.name", read_only=True, default=None)

    class Meta:
        model = TemplateField
        fields = ["id", "fieldKey", "label", "fieldType", "selectOptions", "isRequired", "fieldGroup", "fieldGroupName", "createdAt"]
        read_only_fields = ["id", "createdAt"]


class ProductTemplateFieldReadSerializer(serializers.Serializer):
    """Read-only nested representation of one selected field on a template
    (the join row's own displayOrder + the Field Library entry's detail)."""

    id = serializers.UUIDField(source="field.id")
    fieldKey = serializers.CharField(source="field.fieldKey")
    label = serializers.CharField(source="field.label")
    fieldType = serializers.CharField(source="field.fieldType")
    selectOptions = serializers.JSONField(source="field.selectOptions")
    isRequired = serializers.BooleanField(source="field.isRequired")
    fieldGroup = serializers.UUIDField(source="field.fieldGroup_id", allow_null=True)
    displayOrder = serializers.IntegerField()


class ProductTemplateSerializer(serializers.ModelSerializer):
    """Admin/staff-facing. Write payload accepts `fieldIds` (a flat list of
    Field Library UUIDs) — apps.sourcing.services.save_template_fields does
    the actual selection + auto-group-expansion + ordering, never a raw M2M
    `.set()` (see that service's docstring for why)."""

    fields = ProductTemplateFieldReadSerializer(source="templateFields", many=True, read_only=True)
    fieldIds = serializers.ListField(child=serializers.UUIDField(), write_only=True, required=False)
    coreFields = serializers.SerializerMethodField()

    class Meta:
        model = ProductTemplate
        fields = ["id", "name", "description", "isActive", "fields", "fieldIds", "coreFields", "createdBy", "createdAt", "updatedAt"]
        read_only_fields = ["id", "createdBy", "createdAt", "updatedAt"]

    def get_coreFields(self, obj) -> list:
        return CORE_FIELD_DESCRIPTORS

    def create(self, validated_data):
        from apps.sourcing.services import save_template_fields

        field_ids = validated_data.pop("fieldIds", [])
        validated_data["createdBy"] = self.context["request"].user
        template = ProductTemplate.objects.create(**validated_data)
        save_template_fields(template, field_ids)
        return template

    def update(self, instance, validated_data):
        from apps.sourcing.services import save_template_fields

        field_ids = validated_data.pop("fieldIds", None)
        instance = super().update(instance, validated_data)
        if field_ids is not None:
            save_template_fields(instance, field_ids)
        return instance


class ProductVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductVariant
        fields = [
            "id", "colorName", "patternNo", "orderQty", "sizeBreakdown", "pcsPerCarton", "innerBundle",
            "customFieldValues",
            "cartonNoFrom", "cartonNoTo", "noOfCartons", "totalPcs",
            "unitPrice", "totalAmount",
            "grossWeight", "netWeight", "totalGrossWeight", "totalNetWeight",
            "ctnLength", "ctnWidth", "ctnHeight", "cbm", "totalCbm",
        ]
        read_only_fields = [
            "id", "pcsPerCarton", "noOfCartons", "totalPcs", "totalAmount",
            "totalGrossWeight", "totalNetWeight", "cbm", "totalCbm",
        ]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = [
            "id", "product", "image", "label", "customLabelName",
            "gpsLat", "gpsLng", "capturedAt", "uploadedBy", "createdAt",
        ]
        # product is set by the view from the URL (ProductViewSet.upload_image),
        # never from the request body — read_only here so a client that
        # doesn't send it (the frontend never does) isn't rejected with a
        # spurious "This field is required."
        read_only_fields = ["id", "product", "uploadedBy", "createdAt"]

    def validate(self, attrs):
        if attrs.get("label") == "custom" and not attrs.get("customLabelName"):
            raise serializers.ValidationError({"customLabelName": "Required when label is 'custom'."})
        return attrs


class ProductSerializer(serializers.ModelSerializer):
    """Admin/staff-facing — full detail, every field."""

    variants = ProductVariantSerializer(many=True, required=False)
    images = ProductImageSerializer(many=True, read_only=True)
    totalOrderQty = serializers.IntegerField(source="total_order_qty", read_only=True)
    createdByName = serializers.CharField(source="createdBy.display_name", read_only=True)
    reviewedByName = serializers.CharField(source="reviewedBy.display_name", read_only=True, default=None)
    sisterProfilePoReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    # `factoryPackingList` is only the raw scan uploaded at intake — it says
    # nothing about whether a real Packing List module row exists for this
    # product. This counts the latter (apps.packing.PackingCarton rows
    # actually referencing this product), which is what the Sourcing Intake
    # list's "Packing List" indicator should reflect.
    packingCartonCount = serializers.IntegerField(source="packingCartons.count", read_only=True)
    templateName = serializers.CharField(source="template.name", read_only=True, default=None)

    class Meta:
        model = Product
        fields = [
            "id", "sisterProfile", "sisterProfilePoReference", "styleNumber", "name", "brandName", "poNo", "material",
            "template", "templateName", "resolvedTemplateFields", "customFields",
            "status", "rejectionReason", "goodsName", "finalPrice", "fabricDetails", "factoryPackingList",
            "packingCartonCount",
            "productQrGenerated", "productQrPayload", "cartonQrGenerated", "cartonQrPayload",
            "createdBy", "createdByName", "reviewedBy",
            "reviewedByName", "reviewedAt", "variants", "images", "totalOrderQty", "createdAt", "updatedAt",
        ]
        # styleNumber is writable — auto-suggested client-side, editable before
        # submit; falls back to the model's generate_style_number() default if
        # omitted. Still unique (UniqueValidator, from the model's unique=True).
        # goodsName/finalPrice/fabricDetails are read-only here — they're
        # written only via the dedicated final-qc action, matching the
        # Final QC & QR module's own endpoint (Final_QC_QR_Module.md).
        # resolvedTemplateFields IS client-writable (redesigned: it's the
        # grid's active-column schema, so the client may extend the chosen
        # Template's fields with ad hoc columns added while building this
        # one product — BR: those stay private to this product, never
        # written back to the shared Field Library). If the client omits it,
        # create()/update() fall back to auto-resolving from `template`.
        read_only_fields = [
            "id", "status", "rejectionReason", "goodsName", "finalPrice", "fabricDetails",
            "productQrGenerated", "productQrPayload", "cartonQrGenerated", "cartonQrPayload",
            "createdBy", "reviewedBy", "reviewedAt", "createdAt", "updatedAt",
        ]

    def create(self, validated_data):
        from apps.sourcing.services import compute_variant_derived, resolve_template_fields

        variants_data = validated_data.pop("variants", [])
        validated_data["createdBy"] = self.context["request"].user
        # BR: "store the resolved field set on the product at creation
        # time... not a live pointer that changes retroactively." Snapshotted
        # once, here — from the client's payload if it sent one (template
        # fields + any ad hoc columns added while building this product),
        # else auto-resolved from whatever the Template's selection is right now.
        if not validated_data.get("resolvedTemplateFields"):
            validated_data["resolvedTemplateFields"] = resolve_template_fields(validated_data.get("template"))
        product = Product.objects.create(**validated_data)
        for variant_data in variants_data:
            variant = ProductVariant(product=product, **variant_data)
            compute_variant_derived(variant)
            variant.save()
        return product

    def update(self, instance, validated_data):
        """Edit form lets Admin correct any field, including per-color rows
        entered at intake — variants (when present in the payload) are fully
        replaced rather than diffed/matched by id, same pattern as create();
        no other model references ProductVariant rows directly, so this is
        safe. resolvedTemplateFields: if the client explicitly sends it
        (e.g. appending an ad hoc column via "Add Column"), that value wins
        as-is; otherwise it's only re-resolved when `template` itself is
        being changed — never touched on edits unrelated to either, so it
        doesn't silently drift from what was true at creation."""
        from apps.sourcing.services import compute_variant_derived, resolve_template_fields

        variants_data = validated_data.pop("variants", None)
        if "resolvedTemplateFields" not in validated_data and "template" in validated_data and validated_data["template"] != instance.template:
            validated_data["resolvedTemplateFields"] = resolve_template_fields(validated_data["template"])
        instance = super().update(instance, validated_data)
        if variants_data is not None:
            instance.variants.all().delete()
            for variant_data in variants_data:
                variant = ProductVariant(product=instance, **variant_data)
                compute_variant_derived(variant)
                variant.save()
        return instance


class ProductSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — read-only, no internal review/QR-flag/reject-reason
    plumbing exposed."""

    variants = ProductVariantSerializer(many=True, read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    totalOrderQty = serializers.IntegerField(source="total_order_qty", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "styleNumber", "name", "brandName", "poNo", "material", "status",
            "goodsName", "fabricDetails", "variants", "images", "totalOrderQty", "createdAt",
        ]
        read_only_fields = fields


class RejectProductSerializer(serializers.Serializer):
    reason = serializers.CharField(allow_blank=False)


class SourcingCostItemSerializer(serializers.ModelSerializer):
    """One product reference + custom cost fields within a Sourcing Cost."""

    productName = serializers.CharField(source="product.name", read_only=True)
    styleNumber = serializers.CharField(source="product.styleNumber", read_only=True)
    poNo = serializers.CharField(source="product.poNo", read_only=True)
    brandName = serializers.CharField(source="product.brandName", read_only=True)
    totalAmount = serializers.SerializerMethodField()

    class Meta:
        model = SourcingCostItem
        fields = [
            "id", "sourcingCost", "product", "productName", "styleNumber", "poNo", "brandName",
            "locationName", "quantity", "customCostFields", "totalAmount", "date", "createdAt", "updatedAt",
        ]
        read_only_fields = [
            "id", "sourcingCost", "productName", "styleNumber", "poNo", "brandName",
            "totalAmount", "createdAt", "updatedAt",
        ]

    def get_totalAmount(self, obj):
        from decimal import Decimal
        total = Decimal("0")
        for cf in obj.customCostFields or []:
            total += Decimal(str(cf.get("amount", 0)))
        return str(total)

    def validate_customCostFields(self, value):
        """Custom cost fields are numbers by design: each entry must be a
        `{name, amount}` pair with a non-empty name and a non-negative
        numeric amount. The fixed "Advance" column is gone — anything the
        user wants to charge (including an advance) is just another named
        numeric custom cost field."""
        if not isinstance(value, list):
            raise serializers.ValidationError("customCostFields must be a list of {name, amount} objects.")
        from decimal import Decimal, InvalidOperation

        for cf in value:
            if not isinstance(cf, dict) or not str(cf.get("name", "")).strip():
                raise serializers.ValidationError("Each custom cost field needs a non-empty 'name'.")
            try:
                amount = Decimal(str(cf.get("amount", 0)))
            except (InvalidOperation, TypeError, ValueError):
                raise serializers.ValidationError(f"Amount for '{cf.get('name')}' must be a number.")
            if amount < 0:
                raise serializers.ValidationError(f"Amount for '{cf.get('name')}' cannot be negative.")
        return value


class SourcingCostSerializer(serializers.ModelSerializer):
    """Admin/staff-facing."""

    items = SourcingCostItemSerializer(many=True, required=False)
    sisterProfileName = serializers.CharField(source="sisterProfile.buyerProfile.name", read_only=True)
    poReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    totalAmount = serializers.SerializerMethodField()

    class Meta:
        model = SourcingCost
        fields = [
            "id", "sisterProfile", "sisterProfileName", "poReference",
            "status", "fullPaymentConfirmedAt", "items", "totalAmount", "createdAt", "updatedAt",
        ]
        read_only_fields = ["id", "status", "fullPaymentConfirmedAt", "totalAmount", "createdAt", "updatedAt"]

    def get_totalAmount(self, obj):
        from decimal import Decimal
        total = Decimal("0")
        for item in obj.items.all():
            for cf in item.customCostFields or []:
                total += Decimal(str(cf.get("amount", 0)))
        return str(total)

    def create(self, validated_data):
        from django.db import transaction

        from apps.sourcing import services

        items_data = validated_data.pop("items", [])
        with transaction.atomic():
            cost = SourcingCost.objects.create(**validated_data)
            for item_data in items_data:
                item = SourcingCostItem.objects.create(sourcingCost=cost, **item_data)
                # Wallet deduction happens per item, on creation — same rule
                # the nested item endpoint enforces (SourcingCostItemViewSet
                # .perform_create), so both write paths stay identical.
                services.deduct_cost_item(item, self.context["request"].user)
        return cost


class SourcingCostSelfSerializer(serializers.ModelSerializer):
    """Buyer-facing — live read-only sourcing cost progress."""

    items = SourcingCostItemSerializer(many=True, read_only=True)
    poReference = serializers.CharField(source="sisterProfile.poReference", read_only=True)
    totalAmount = serializers.SerializerMethodField()

    class Meta:
        model = SourcingCost
        fields = ["id", "poReference", "status", "fullPaymentConfirmedAt", "items", "totalAmount", "createdAt"]
        read_only_fields = fields

    def get_totalAmount(self, obj):
        from decimal import Decimal
        total = Decimal("0")
        for item in obj.items.all():
            for cf in item.customCostFields or []:
                total += Decimal(str(cf.get("amount", 0)))
        return str(total)
