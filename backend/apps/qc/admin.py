from django.contrib import admin

from apps.qc.models import QCReport


@admin.register(QCReport)
class QCReportAdmin(admin.ModelAdmin):
    list_display = ("reportId", "product", "totalCost", "travelMode", "createdBy", "createdAt")
    search_fields = ("reportId",)
