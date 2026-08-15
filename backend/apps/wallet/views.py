from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.wallet.models import BuyerWallet
from apps.wallet.serializers import WalletSerializer


class NegativeWalletBalancesView(APIView):
    """Buyer_Wallet_Module.md 'Dashboard (Module 1) update': a distinct
    widget from the Settlement Ledger's existing negative-balance alert —
    cash liquidity (this) vs. contractual amount owed (Settlement Ledger),
    per the module doc's explicit "these are two different signals" note."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        wallets = BuyerWallet.objects.filter(negativeBalance=True).select_related("buyerProfile").order_by("balance")
        return Response(WalletSerializer(wallets, many=True).data)
