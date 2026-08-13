from django.contrib import admin

from expenses.models import Expense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ("sisterProfile", "sourceType", "amount", "currency", "createdBy", "createdAt")
    list_filter = ("sourceType", "currency")
