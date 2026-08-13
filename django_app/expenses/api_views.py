from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.utils import client_ip, log_action
from buyers.models import SisterProfile
from expenses.models import Expense
from expenses.serializers import ExpenseSerializer
from expenses.services import compute_settlement


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = Expense.objects.select_related("sisterProfile", "createdBy")
        for param, field in (("sisterProfileId", "sisterProfile_id"), ("productId", "productId"), ("sourceType", "sourceType")):
            value = self.request.query_params.get(param)
            if value:
                qs = qs.filter(**{field: value})
        return qs.order_by("-createdAt")

    def perform_create(self, serializer):
        expense = serializer.save(createdBy=self.request.user)
        log_action(self.request.user, "CREATE_EXPENSE", "Expense", expense.id, after={"amount": float(expense.amount), "sourceType": expense.sourceType}, ip_address=client_ip(self.request))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def settlement_api(request, sister_profile_id):
    sister_profile = SisterProfile.objects.get(pk=sister_profile_id)
    data = compute_settlement(sister_profile)
    return Response(
        {
            "sisterProfileId": str(sister_profile.id),
            "sisterProfileName": sister_profile.name,
            "agreementType": data["agreementType"],
            "negotiatedRate": data["negotiatedRate"],
            "totalAdvance": data["totalAdvance"],
            "totalExpense": data["totalExpense"],
            "amountOwed": data["amountOwed"],
            "netPosition": data["netPosition"],
            "negativeBalance": data["negativeBalance"],
        }
    )
