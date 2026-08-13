from django.contrib import admin

from apps.expenses.models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ("sourceType", "amount", "currency", "sisterProfile", "product", "createdBy", "createdAt")
    list_filter = ("sourceType", "currency")
    readonly_fields = [f.name for f in Expense._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
