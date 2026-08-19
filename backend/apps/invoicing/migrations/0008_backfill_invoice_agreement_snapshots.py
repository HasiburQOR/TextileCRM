# Backfill for the agreement redesign, running while BOTH the old
# (exchangeRateValueLocked + rateQuote) and the new (agreementTypeAtCreation,
# commission totals) columns exist:
#
#   1. agreementTypeAtCreation ← the Sister Profile's agreementType today.
#   2. Rates that were quoted as MULTIPLY (a published ExchangeRate's
#      "target = source × rate") become their reciprocal, because the new
#      Invoice.convert() always DIVIDES ("1 buyer = <rate> supplier").
#      1/rate keeps every existing convertedTotal bit-identical up to the
#      6-dp column precision.
#   3. commissionTotalSupplier/Buyer are computed once from the stored
#      commissionType/commissionValue; convertedTotal is recomputed with
#      the (possibly inverted) rate — same figure as before for every row.
#
# costTotal* stays 0: no expense pull ever happened for pre-redesign
# invoices, so there is no cost breakdown to reconstruct.

from decimal import ROUND_HALF_UP, Decimal

from django.db import migrations

TWO_PLACES = Decimal("0.01")
SIX_PLACES = Decimal("0.000001")


def _round(value, places):
    return value.quantize(places, rounding=ROUND_HALF_UP)


def backfill(apps, schema_editor):
    Invoice = apps.get_model("invoicing", "Invoice")
    SisterProfile = apps.get_model("buyers", "SisterProfile")

    sister_types = dict(SisterProfile.objects.values_list("id", "agreementType"))

    for invoice in Invoice.objects.all():
        invoice.agreementTypeAtCreation = sister_types.get(invoice.sisterProfile_id, "")

        if invoice.rateQuote == "multiply" and invoice.exchangeRateValueLocked:
            # Reciprocal: dividing by 1/x multiplies by x — identical result.
            invoice.exchangeRateValueLocked = _round(
                Decimal(1) / Decimal(invoice.exchangeRateValueLocked), SIX_PLACES
            )

        if invoice.commissionType == "percentage":
            commission = Decimal(invoice.totalValue) * Decimal(invoice.commissionValue) / 100
        elif invoice.commissionType == "flat":
            commission = Decimal(invoice.commissionValue)
        else:
            commission = Decimal("0")
        commission = _round(commission, TWO_PLACES)

        invoice.commissionTotalSupplier = commission
        rate = Decimal(invoice.exchangeRateValueLocked or 0)
        if rate:
            invoice.commissionTotalBuyer = _round(commission / rate, TWO_PLACES)
            invoice.convertedTotal = _round(
                (Decimal(invoice.totalValue) + commission) / rate, TWO_PLACES
            )
        invoice.save()


def reverse_noop(apps, schema_editor):
    # Deliberately irreversible: un-inverting a 6-dp reciprocal rate is
    # lossy, and the totals this wrote are re-derivable from the surviving
    # columns anyway. Rolling back further than 0007 means restoring from
    # a backup, not from a reverse migration.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("invoicing", "0007_invoice_agreement_commission_fields"),
    ]

    operations = [
        migrations.RunPython(backfill, reverse_noop),
    ]
