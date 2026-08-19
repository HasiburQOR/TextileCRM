from django.contrib import admin

from invoicing.models import ExchangeRate, Invoice, InvoiceLineItem, InvoicePayment


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0


class InvoicePaymentInline(admin.TabularInline):
    model = InvoicePayment
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("invoiceNo", "buyerName", "status", "totalValue", "outstandingBalance", "createdAt")
    list_filter = ("status",)
    search_fields = ("invoiceNo", "buyerName")
    inlines = [InvoiceLineItemInline, InvoicePaymentInline]


@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ("sourceCurrency", "targetCurrency", "rate", "effectiveDate", "publishedBy")
