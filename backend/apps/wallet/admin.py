from django.contrib import admin

from apps.wallet.models import BuyerWallet, WalletTransaction


@admin.register(BuyerWallet)
class BuyerWalletAdmin(admin.ModelAdmin):
    list_display = ("buyerProfile", "balance", "currency", "negativeBalance", "lowBalance")
    list_filter = ("negativeBalance", "lowBalance")
    readonly_fields = ("balance", "negativeBalance", "lowBalance", "createdAt", "updatedAt")

    def has_add_permission(self, request):
        return False


@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ("wallet", "type", "amount", "currency", "sourceType", "sisterProfile", "createdBy", "createdAt")
    list_filter = ("type", "sourceType")
    search_fields = ("reason", "methodReference")
    readonly_fields = [f.name for f in WalletTransaction._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
