from decimal import Decimal

from django.db.models import Sum
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.wallet.models import BuyerWallet, WalletTransaction, WalletTransactionType
from apps.wallet.serializers import WalletSerializer


class NegativeWalletBalancesView(APIView):
    """Buyer_Wallet_Module.md 'Dashboard (Module 1) update': the cash
    liquidity signal — which buyers have spent past what they've funded."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        wallets = BuyerWallet.objects.filter(negativeBalance=True).select_related("buyerProfile").order_by("balance")
        return Response(WalletSerializer(wallets, many=True).data)


class WalletSummaryView(APIView):
    """The supplier side of "how much have buyers sent us", in both
    currencies.

    Grouped BY CURRENCY rather than reduced to one number: wallets are
    per-buyer and each names its own currency, so a single scalar total
    would be adding USD to EUR. `byCurrency` is the money as the buyers see
    it (what they funded and what has been charged against it);
    `bySupplierCurrency` is the same spend as the supplier incurred it,
    summed from each transaction's own locked source amount — which is why
    it can be read even though the rate differs per Sister Profile.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        by_currency = {}
        for row in BuyerWallet.objects.values("currency").annotate(balance=Sum("balance")):
            by_currency[row["currency"]] = {
                "currency": row["currency"],
                "balance": row["balance"] or Decimal("0"),
                "topUps": Decimal("0"),
                "charged": Decimal("0"),
                "refunded": Decimal("0"),
            }

        totals = (
            WalletTransaction.objects.values("currency", "type")
            .annotate(total=Sum("amount"))
        )
        field_for = {
            WalletTransactionType.TOP_UP: "topUps",
            WalletTransactionType.DEDUCTION: "charged",
            WalletTransactionType.REFUND: "refunded",
        }
        for row in totals:
            bucket = by_currency.setdefault(
                row["currency"],
                {"currency": row["currency"], "balance": Decimal("0"), "topUps": Decimal("0"),
                 "charged": Decimal("0"), "refunded": Decimal("0")},
            )
            field = field_for.get(row["type"])
            if field:
                # Deductions are stored negative; report them as a positive
                # "how much has been charged" figure.
                bucket[field] += abs(row["total"] or Decimal("0"))

        by_supplier_currency = [
            {"currency": row["sourceCurrency"], "spent": abs(row["total"] or Decimal("0"))}
            for row in (
                WalletTransaction.objects.filter(type=WalletTransactionType.DEDUCTION)
                .exclude(sourceCurrency="")
                .values("sourceCurrency")
                .annotate(total=Sum("sourceAmount"))
            )
        ]

        return Response({
            "byCurrency": sorted(by_currency.values(), key=lambda r: r["currency"]),
            "bySupplierCurrency": sorted(by_supplier_currency, key=lambda r: r["currency"]),
        })
