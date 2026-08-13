from django.contrib import admin

from qc.models import QCReport


@admin.register(QCReport)
class QCReportAdmin(admin.ModelAdmin):
    list_display = ("reportId", "request", "totalCost", "travelMode", "createdBy", "createdAt")
    search_fields = ("reportId",)
