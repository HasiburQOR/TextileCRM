from django.contrib import admin

from apps.ledger.models import SettlementLedger


@admin.register(SettlementLedger)
class SettlementLedgerAdmin(admin.ModelAdmin):
    list_display = ("sisterProfile", "totalAdvance", "totalExpense", "amountOwed", "netPosition", "negativeBalance")
    list_filter = ("negativeBalance",)
    readonly_fields = [f.name for f in SettlementLedger._meta.fields]

    def has_add_permission(self, request):
        return False
