from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import ADMIN, COMPANY_REP
from audit.utils import client_ip, log_action
from sourcing.models import RequestStatus, SourcingRequest
from sourcing.serializers import SourcingRequestSerializer


class SourcingRequestViewSet(viewsets.ModelViewSet):
    serializer_class = SourcingRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = SourcingRequest.objects.select_related("createdBy", "reviewedBy", "sisterProfile").prefetch_related("variants")
        user = self.request.user
        if user.role == COMPANY_REP:
            qs = qs.filter(createdBy=user)
        status_param = self.request.query_params.get("status")
        if status_param and status_param != "ALL":
            qs = qs.filter(status=status_param)
        return qs.order_by("-createdAt")

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if request.user.role != ADMIN:
            return Response({"detail": "Admin role required."}, status=403)
        req = self.get_object()
        before = {"status": req.status}
        req.status = RequestStatus.APPROVED_FOR_QC
        req.reviewedBy = request.user
        req.reviewedAt = timezone.now()
        req.save(update_fields=["status", "reviewedBy", "reviewedAt", "updatedAt"])
        log_action(request.user, "APPROVE_REQUEST", "SourcingRequest", req.id, before=before, after={"status": req.status}, ip_address=client_ip(request))
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if request.user.role != ADMIN:
            return Response({"detail": "Admin role required."}, status=403)
        reason = request.data.get("reason", "")
        if not reason:
            return Response({"detail": "A rejection reason is required."}, status=400)
        req = self.get_object()
        before = {"status": req.status}
        req.status = RequestStatus.REJECTED
        req.rejectionReason = reason
        req.reviewedBy = request.user
        req.reviewedAt = timezone.now()
        req.save(update_fields=["status", "rejectionReason", "reviewedBy", "reviewedAt", "updatedAt"])
        log_action(request.user, "REJECT_REQUEST", "SourcingRequest", req.id, before=before, after={"status": req.status, "reason": reason}, ip_address=client_ip(request))
        return Response(self.get_serializer(req).data)
