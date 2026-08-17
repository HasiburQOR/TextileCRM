from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Roles
from apps.accounts.permissions import IsAdmin
from apps.buyers.models import BuyerProfile, SisterProfile
from apps.buyers.serializers import (
    BuyerProfileSelfSerializer,
    BuyerProfileSerializer,
    SisterProfileSelfSerializer,
    SisterProfileSerializer,
)
from apps.core.tenancy import TenantScopedViewSet

WRITE_ACTIONS = ("create", "update", "partial_update", "destroy")
# Buyer_Wallet_Module.md BR: "Only Admin can create Top-up or Adjustment
# transactions" — same Admin-only gate as WRITE_ACTIONS above, kept as a
# separate tuple since these are @action methods, not the standard CRUD set.
WALLET_ADMIN_ACTIONS = ("top_up", "adjust")


def _save_or_reject_duplicate_reference_code(serializer):
    """Reference_Numbers_Identifier_System.md: 'Manually entering a
    duplicate reference code is rejected with a clear error, never silently
    modified.' DRF's ModelSerializer already runs a UniqueValidator before
    this point (since `referenceCode` is `unique=True`), so this is a
    belt-and-braces backstop for the narrow concurrent-manual-entry race
    that check-then-save can't fully close — never a 500 either way.
    `referenceCode` is the only unique=True field on either model, so any
    IntegrityError here is attributable to it without parsing the DB
    driver's (dialect-specific) error message."""
    try:
        return serializer.save()
    except IntegrityError:
        raise DRFValidationError({"referenceCode": "This reference code is already in use."})


class BuyerProfileViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-01/BR-04: managed entirely by Admin; every other authenticated
    role may read (staff read everything, a buyer-role user only ever sees
    their own row via tenant scoping — this IS the tenant root, so the
    lookup path to itself is just "id")."""

    queryset = BuyerProfile.objects.all()
    tenant_lookup = "id"

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return BuyerProfileSelfSerializer
        return BuyerProfileSerializer

    def get_permissions(self):
        if self.action in WRITE_ACTIONS or self.action in WALLET_ADMIN_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        """Buyer_Wallet_Module.md WF-01: exactly one BuyerWallet, created
        automatically — never created separately/manually."""
        from apps.wallet.services import create_wallet

        buyer_profile = _save_or_reject_duplicate_reference_code(serializer)
        create_wallet(buyer_profile)

    # ── Buyer Wallet (Buyer_Wallet_Module.md) ──────────────────────────
    # get_object() below runs through TenantScopedViewSet's get_queryset(),
    # so a buyer-role user reaching any of these for another buyer's id
    # 404s exactly like every other tenant-scoped endpoint in this app.

    @action(detail=True, methods=["get", "patch"], url_path="wallet")
    def wallet_detail(self, request, pk=None):
        """GET: balance + summary (WF-10/WF-11). PATCH (Admin only): update
        currency / lowBalanceThreshold — the only fields on the wallet row
        itself that are ever hand-edited; `balance` stays derived (see
        apps.wallet.models.BuyerWallet's docstring)."""
        from apps.wallet.serializers import WalletSelfSerializer, WalletSerializer
        from apps.wallet.services import create_wallet

        buyer_profile = self.get_object()
        wallet = create_wallet(buyer_profile)

        if request.method == "PATCH":
            if request.user.role != Roles.ADMIN:
                raise PermissionDenied("Admin only.")
            serializer = WalletSerializer(wallet, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer_cls = WalletSelfSerializer if request.user.role == Roles.BUYER else WalletSerializer
        return Response(serializer_cls(wallet).data)

    @action(detail=True, methods=["get"], url_path="wallet/transactions")
    def wallet_transactions(self, request, pk=None):
        """WF-10/WF-11: full transaction history, filterable by Sister
        Profile / type / date range (UI Requirements: 'Admin needs to be
        able to answer "how much of this buyer's spend came from Order X"
        even though the balance itself isn't split.')."""
        from apps.wallet.serializers import WalletTransactionSelfSerializer, WalletTransactionSerializer
        from apps.wallet.services import create_wallet

        buyer_profile = self.get_object()
        wallet = create_wallet(buyer_profile)
        qs = wallet.transactions.select_related("sisterProfile", "createdBy", "sourceExpense")

        params = request.query_params
        if params.get("sisterProfile"):
            qs = qs.filter(sisterProfile_id=params["sisterProfile"])
        if params.get("type"):
            qs = qs.filter(type=params["type"])
        if params.get("date_from"):
            qs = qs.filter(createdAt__date__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(createdAt__date__lte=params["date_to"])

        serializer_cls = WalletTransactionSelfSerializer if request.user.role == Roles.BUYER else WalletTransactionSerializer
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(serializer_cls(page, many=True).data)
        return Response(serializer_cls(qs, many=True).data)

    @action(detail=True, methods=["post"], url_path="wallet/top-up")
    def top_up(self, request, pk=None):
        """WF-02: Admin-only (enforced via WALLET_ADMIN_ACTIONS above)."""
        from apps.wallet.serializers import WalletTransactionSerializer
        from apps.wallet.services import create_wallet, record_top_up

        buyer_profile = self.get_object()
        wallet = create_wallet(buyer_profile)
        data = request.data
        try:
            txn = record_top_up(
                wallet=wallet, amount=data.get("amount"), currency=data.get("currency") or wallet.currency,
                method_reference=data.get("methodReference", ""), created_by=request.user,
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(WalletTransactionSerializer(txn).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="wallet/adjust")
    def adjust(self, request, pk=None):
        """WF-06: Admin-only, reason required (enforced in
        apps.wallet.services.record_adjustment)."""
        from apps.wallet.serializers import WalletTransactionSerializer
        from apps.wallet.services import create_wallet, record_adjustment

        buyer_profile = self.get_object()
        wallet = create_wallet(buyer_profile)
        data = request.data
        sister_profile = None
        if data.get("sisterProfile"):
            sister_profile = SisterProfile.objects.filter(pk=data["sisterProfile"], buyerProfile=buyer_profile).first()
        try:
            txn = record_adjustment(
                wallet=wallet, amount=data.get("amount"), reason=data.get("reason", ""),
                created_by=request.user, sister_profile=sister_profile,
            )
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, "messages") else str(exc))
        return Response(WalletTransactionSerializer(txn).data, status=status.HTTP_201_CREATED)


class SisterProfileViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    """BR-02/BR-03: one per PO/shipment, created by Admin with its Agreement
    Type + rate. Readable by all supplier staff; a buyer-role user only
    ever sees Sister Profiles under their own BuyerProfile."""

    queryset = SisterProfile.objects.select_related("buyerProfile").all()
    tenant_lookup = "buyerProfile_id"

    def get_serializer_class(self):
        if self.request.user.role == Roles.BUYER:
            return SisterProfileSelfSerializer
        return SisterProfileSerializer

    def get_permissions(self):
        if self.action in WRITE_ACTIONS:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        _save_or_reject_duplicate_reference_code(serializer)

    def perform_update(self, serializer):
        """The exchange rate now decides what a buyer is charged for every
        cost recorded after it, so an edit is a money-affecting action and
        must leave an audit trail — unlike before, when nothing on this
        model touched a balance."""
        from apps.audit.services import log_action

        instance = self.get_object()
        before = {
            "supplierCurrency": instance.supplierCurrency, "buyerCurrency": instance.buyerCurrency,
            "exchangeRate": str(instance.exchangeRate), "agreementType": instance.agreementType,
            "status": instance.status,
        }
        updated = _save_or_reject_duplicate_reference_code(serializer)
        log_action(
            actor=self.request.user, action="UPDATE_SISTER_PROFILE",
            entity_type="SisterProfile", entity_id=updated.id, before=before,
            after={
                "supplierCurrency": updated.supplierCurrency, "buyerCurrency": updated.buyerCurrency,
                "exchangeRate": str(updated.exchangeRate), "agreementType": updated.agreementType,
                "status": updated.status,
            },
        )

    @action(detail=True, methods=["get"], url_path="cost-breakdown")
    def cost_breakdown(self, request, pk=None):
        """Where this order's money has gone, in both currencies.

        Feeds the Sister Profile overview and the invoice builder's
        breakdown panel. It lives here rather than on the invoice serializer
        because that serializer backs a 200-row list endpoint, where a
        per-row aggregation would be an N+1; and being an action on this
        ViewSet it inherits tenant scoping for free, so a buyer reaching for
        another buyer's order 404s like everywhere else.

        Supplier-currency figures are only summed across rows that actually
        share a currency — an Expense recorded in a third currency is never
        added to the supplier total, only to the buyer total it was charged
        at.
        """
        from django.db.models import Count, Sum

        from apps.expenses.models import Expense, SourceType
        from apps.sourcing.models import ProductVariant

        profile = self.get_object()

        groups = {
            "sourcing": [SourceType.SOURCING_ADVANCE],
            "warehouse": [
                SourceType.WAREHOUSE_LOADER, SourceType.WAREHOUSE_EXTRA_WORKER,
                SourceType.WAREHOUSE_PACKAGING_ITEM,
            ],
            "qc": [SourceType.QC_LUNCH, SourceType.QC_CARRYING, SourceType.QC_TRAVEL_EXTRA],
            "other": [SourceType.CUSTOM_FIELD, SourceType.EXTRA_COST],
        }
        group_of = {st: name for name, types in groups.items() for st in types}
        labels = dict(SourceType.choices)

        rows = (
            Expense.objects.filter(sisterProfile=profile)
            .values("sourceType", "currency")
            .annotate(
                amount=Sum("amount"),
                amountBuyer=Sum("amountInBuyerCurrency"),
                count=Count("id"),
            )
            .order_by("sourceType")
        )

        by_source_type, group_totals = [], {name: {"amount": Decimal("0"), "amountBuyer": Decimal("0")} for name in groups}
        total = Decimal("0")
        total_buyer = Decimal("0")
        for row in rows:
            amount = row["amount"] or Decimal("0")
            amount_buyer = row["amountBuyer"] or Decimal("0")
            same_currency = row["currency"] == profile.supplierCurrency
            by_source_type.append({
                "sourceType": row["sourceType"],
                "label": labels.get(row["sourceType"], row["sourceType"]),
                "group": group_of.get(row["sourceType"], "other"),
                "currency": row["currency"],
                "amount": amount,
                "amountBuyer": amount_buyer,
                "count": row["count"],
            })
            bucket = group_totals[group_of.get(row["sourceType"], "other")]
            bucket["amountBuyer"] += amount_buyer
            if same_currency:
                bucket["amount"] += amount
                total += amount
            total_buyer += amount_buyer

        order_qty = ProductVariant.objects.filter(product__sisterProfile=profile).aggregate(
            total=Sum("orderQty")
        )["total"] or 0

        return Response({
            "supplierCurrency": profile.supplierCurrency,
            "buyerCurrency": profile.buyerCurrency,
            "exchangeRate": profile.exchangeRate,
            "rateLabel": (
                f"1 {profile.buyerCurrency} = {profile.exchangeRate.normalize():f} {profile.supplierCurrency}"
                if profile.exchangeRate else ""
            ),
            "groups": group_totals,
            "bySourceType": by_source_type,
            "total": {"amount": total, "amountBuyer": total_buyer},
            "units": {
                "totalOrderQty": order_qty,
                "unitCost": (total / order_qty).quantize(Decimal("0.01")) if order_qty else None,
                "unitCostBuyer": (total_buyer / order_qty).quantize(Decimal("0.01")) if order_qty else None,
            },
        })
