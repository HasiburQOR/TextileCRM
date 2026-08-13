from rest_framework import viewsets

from accounts.permissions import IsAdmin
from buyers.models import BuyerProfile, SisterProfile
from buyers.serializers import BuyerProfileSerializer, SisterProfileSerializer


class BuyerProfileViewSet(viewsets.ModelViewSet):
    queryset = BuyerProfile.objects.all()
    serializer_class = BuyerProfileSerializer
    permission_classes = [IsAdmin]

    def perform_destroy(self, instance):
        if instance.sisterProfiles.exists():
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Cannot delete a buyer profile with sister profiles.")
        instance.delete()


class SisterProfileViewSet(viewsets.ModelViewSet):
    queryset = SisterProfile.objects.select_related("buyerProfile").all()
    serializer_class = SisterProfileSerializer
    permission_classes = [IsAdmin]
