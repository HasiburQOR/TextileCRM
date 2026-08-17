from decimal import Decimal

from django.db.models import Count, Q, Sum
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Roles
from apps.buyers.models import SisterProfile
from apps.buyers.serializers import BuyerProfileSelfSerializer, SisterProfileSelfSerializer
from apps.documents.models import DocumentVaultItem
from apps.documents.serializers import DocumentVaultItemSerializer
from apps.expenses.models import Expense
from apps.expenses.serializers import ExpenseSelfSerializer
from apps.invoicing.models import Invoice, InvoiceStatus
from apps.invoicing.serializers import InvoiceSelfSerializer
from apps.notifications.models import Notification
from apps.notifications.serializers import NotificationSerializer
from apps.packing.models import PackingList
from apps.packing.serializers import PackingListSelfSerializer
from apps.sourcing.models import Product, SourcingCost
from apps.sourcing.serializers import ProductSelfSerializer


class BuyerPortalDashboardView(APIView):
    """FR-79: "Buyer dashboard shows an overview across all of the buyer's
    own Sister Profiles, with drill-down into one." One aggregation
    endpoint rather than making the frontend stitch together 4-5 separate
    list calls per Sister Profile — the tenant scoping this relies on
    (`request.user.buyer_profile`) is the same guarantee TenantScopedViewSet
    gives every other buyer-reachable endpoint, just applied directly since
    this isn't a ModelViewSet over one queryset."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != Roles.BUYER or not request.user.buyer_profile_id:
            return Response({"detail": "Buyer role required."}, status=403)

        buyer_profile = request.user.buyer_profile
        sister_profiles = buyer_profile.sisterProfiles.all()

        rows = []
        for sister in sister_profiles:
            invoice_agg = Invoice.objects.filter(sisterProfile=sister).aggregate(
                total=Count("id"),
                pending=Count("id", filter=Q(status=InvoiceStatus.PENDING_APPROVAL)),
                issued=Count("id", filter=Q(status=InvoiceStatus.ISSUED)),
                outstanding=Sum("outstandingBalance"),
            )
            latest_cost = (
                SourcingCost.objects.filter(sisterProfile=sister).order_by("-createdAt").first()
            )
            rows.append(
                {
                    "id": str(sister.id),
                    "poReference": sister.poReference,
                    "agreementType": sister.agreementType,
                    "status": sister.status,
                    "productCount": sister.products.count(),
                    "latestCostStatus": latest_cost.status if latest_cost else None,
                    "invoices": {
                        "total": invoice_agg["total"], "pending": invoice_agg["pending"],
                        "issued": invoice_agg["issued"], "totalOutstanding": invoice_agg["outstanding"] or 0,
                    },
                }
            )

        return Response(
            {
                "buyerProfile": BuyerProfileSelfSerializer(buyer_profile).data,
                "sisterProfiles": rows,
            }
        )


class BuyerPortalPermission(IsAuthenticated):
    """Every /api/v1/portal/ endpoint is buyer-only — this is a distinct,
    dedicated surface from the Admin endpoints (Buyer_Portal_Documentation.md:
    "write separate buyer-facing serializers so there's no risk of an
    Admin-only field leaking through a shared serializer"), so every view
    here rejects non-buyer roles outright rather than relying on
    BuyerReadOnly's blanket safe-methods-only rule."""

    message = "Buyer role required."

    def has_permission(self, request, view):
        return bool(
            super().has_permission(request, view)
            and request.user.role == Roles.BUYER
            and request.user.buyer_profile_id
        )


def _owned_order_or_none(request, order_id):
    """Every /portal/orders/<id>/... view resolves the Sister Profile through
    this — scoped to request.user.buyer_profile_id, so a buyer requesting
    another buyer's order id gets exactly the same 404 as a nonexistent one
    (BR-52–56 / FR-77–81: never distinguish 'not yours' from 'doesn't exist')."""
    return (
        SisterProfile.objects.filter(pk=order_id, buyerProfile_id=request.user.buyer_profile_id)
        .select_related("buyerProfile")
        .first()
    )


class PortalDashboardView(APIView):
    """§17.1: KPI tiles, active trips, recent activity — the full
    replacement for the old bare 4-tile dashboard. (The settlement-ledger
    negative-balance alert this view used to carry went away with the
    Settlement Ledger; outstanding invoice totals below are the figure a
    buyer means by "what I still owe".)"""

    permission_classes = [BuyerPortalPermission]

    def get(self, request):
        buyer_profile = request.user.buyer_profile
        sister_profiles = list(buyer_profile.sisterProfiles.all())
        sister_ids = [s.id for s in sister_profiles]

        # What the buyer actually still owes against issued invoices.
        invoices_outstanding = Invoice.objects.filter(
            sisterProfile_id__in=sister_ids, status=InvoiceStatus.ISSUED,
        ).aggregate(total=Sum("outstandingBalance"))["total"] or Decimal("0")

        active_costs = (
            SourcingCost.objects.filter(sisterProfile_id__in=sister_ids, status="open")
            .select_related("sisterProfile")
            .prefetch_related("items__product")
        )
        active_costs_data = [
            {
                "id": str(t.id),
                "sisterProfileId": str(t.sisterProfile_id),
                "poReference": t.sisterProfile.poReference,
                "itemsCount": t.items.count(),
                "totalAmount": sum(
                    Decimal(str(cf.get("amount", 0)))
                    for item in t.items.all()
                    for cf in (item.customCostFields or [])
                ),
            }
            for t in active_costs
        ]

        recent_activity = Notification.objects.filter(user=request.user).order_by("-createdAt")[:10]

        return Response(
            {
                "buyerProfile": BuyerProfileSelfSerializer(buyer_profile).data,
                "kpis": {
                    "totalOrders": len(sister_profiles),
                    "ordersInProgress": sum(1 for s in sister_profiles if s.status == "active"),
                    "ordersCompleted": sum(1 for s in sister_profiles if s.status == "completed"),
                    "invoicesOutstanding": invoices_outstanding,
                },
                "activeSourcingCosts": active_costs_data,
                "recentActivity": NotificationSerializer(recent_activity, many=True).data,
            }
        )


class PortalOrdersListView(APIView):
    """§17.2: My Orders — one row per Sister Profile belonging to this buyer."""

    permission_classes = [BuyerPortalPermission]

    def get(self, request):
        sister_profiles = request.user.buyer_profile.sisterProfiles.all()
        rows = [SisterProfileSelfSerializer(s).data for s in sister_profiles]
        return Response(rows)


class PortalOrderDetailView(APIView):
    """§17.3: Order Detail — Overview tab."""

    permission_classes = [BuyerPortalPermission]

    def get(self, request, order_id):
        sister = _owned_order_or_none(request, order_id)
        if not sister:
            return Response({"detail": "Not found."}, status=404)
        return Response(SisterProfileSelfSerializer(sister).data)


class PortalOrderSourcingProgressView(APIView):
    """§17.4: per-product Sourcing Cost + location-by-location breakdown."""

    permission_classes = [BuyerPortalPermission]

    def get(self, request, order_id):
        sister = _owned_order_or_none(request, order_id)
        if not sister:
            return Response({"detail": "Not found."}, status=404)

        products = (
            Product.objects.filter(sisterProfile=sister)
            .prefetch_related("images", "sourcingCostItems__sourcingCost")
            .order_by("-createdAt")
        )
        rows = []
        for product in products:
            item = product.sourcingCostItems.order_by("-createdAt").first()
            rows.append(
                {
                    "product": ProductSelfSerializer(product).data,
                    "cost": {
                        "status": item.sourcingCost.status if item else None,
                        "fullPaymentConfirmedAt": item.sourcingCost.fullPaymentConfirmedAt if item else None,
                        "items": [
                            {
                                "locationName": i.locationName,
                                "quantity": i.quantity,
                                "customCostFields": i.customCostFields,
                            }
                            for i in (product.sourcingCostItems.filter(sourcingCost=item.sourcingCost) if item else [])
                        ],
                    } if item else None,
                }
            )
        return Response(rows)


class PortalOrderCostsView(APIView):
    """§17.5: cost breakdown by source type, this order only."""

    permission_classes = [BuyerPortalPermission]

    def get(self, request, order_id):
        sister = _owned_order_or_none(request, order_id)
        if not sister:
            return Response({"detail": "Not found."}, status=404)

        expenses = Expense.objects.filter(sisterProfile=sister).order_by("-createdAt")
        by_source = expenses.values("sourceType").annotate(total=Sum("amount")).order_by("sourceType")
        return Response(
            {
                "bySourceType": list(by_source),
                "total": expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0"),
                "items": ExpenseSelfSerializer(expenses, many=True).data,
            }
        )


class PortalOrderPackingListView(APIView):
    """§17.7: read-only packing list(s) for this order."""

    permission_classes = [BuyerPortalPermission]

    def get(self, request, order_id):
        sister = _owned_order_or_none(request, order_id)
        if not sister:
            return Response({"detail": "Not found."}, status=404)
        lists = PackingList.objects.filter(sisterProfile=sister).prefetch_related("cartons").order_by("-createdAt")
        return Response(PackingListSelfSerializer(lists, many=True).data)


class PortalOrderInvoicesView(APIView):
    """§17.8: invoice list + payment history, this order only."""

    permission_classes = [BuyerPortalPermission]

    def get(self, request, order_id):
        sister = _owned_order_or_none(request, order_id)
        if not sister:
            return Response({"detail": "Not found."}, status=404)
        invoices = (
            Invoice.objects.filter(sisterProfile=sister)
            .prefetch_related("lineItems", "payments")
            .order_by("-createdAt")
        )
        return Response(InvoiceSelfSerializer(invoices, many=True).data)


class PortalWalletView(APIView):
    """Buyer_Wallet_Module.md WF-10 / GET /api/v1/portal/wallet/: read-only,
    self-scoped from the authenticated buyer's own profile — no {id} param,
    same 'resolved from request.user.buyer_profile' pattern as every other
    /portal/ view in this module."""

    permission_classes = [BuyerPortalPermission]

    def get(self, request):
        from apps.wallet.serializers import WalletSelfSerializer, WalletTransactionSelfSerializer
        from apps.wallet.services import create_wallet

        wallet = create_wallet(request.user.buyer_profile)
        transactions = wallet.transactions.select_related("sisterProfile").order_by("-createdAt")[:200]
        return Response(
            {
                "wallet": WalletSelfSerializer(wallet).data,
                "transactions": WalletTransactionSelfSerializer(transactions, many=True).data,
            }
        )


class PortalOrderDocumentsView(APIView):
    """§17.9: download-only Document Vault, this order only."""

    permission_classes = [BuyerPortalPermission]

    def get(self, request, order_id):
        sister = _owned_order_or_none(request, order_id)
        if not sister:
            return Response({"detail": "Not found."}, status=404)
        documents = DocumentVaultItem.objects.filter(sisterProfile=sister).order_by("-createdAt")
        return Response(DocumentVaultItemSerializer(documents, many=True).data)
