from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.models import User
from apps.accounts.permissions import IsAdmin
from apps.accounts.serializers import CustomTokenObtainPairSerializer, UserCreateSerializer, UserSerializer


class TokenObtainPairWithClaimsView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class MeView(APIView):
    """Lets any authenticated client (Admin app, Buyer Portal, future Flutter
    app) bootstrap its own session without decoding the JWT client-side."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserViewSet(viewsets.ModelViewSet):
    """
    Admin-only user management. This is how Buyer Portal credentials get
    created per BR-53 ("issued manually by Admin; no self-registration") —
    there is no public registration endpoint anywhere in this API.
    """

    queryset = User.objects.all().order_by("createdAt")
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UserCreateSerializer
        return UserSerializer
