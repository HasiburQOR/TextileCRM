"""
Packing calculation service layer (BR-16–22 / FR-13–24), reduced to the
pieces that survived the Sourcing-Intake-as-Packing-List merge:

* PackingRule stays a standalone reusable template (size ratio + default
  carton dimensions/weights), still living in this app and linked to a
  Buyer Profile.
* All per-row packing math (ship qty, short/excess, CBM, totals) moved to
  apps.sourcing.services.compute_variant_derived — the ProductVariant IS
  the packing row now, so its derived fields are computed with every other
  intake-derived figure, in one place, per the DRF Migration Instructions'
  non-negotiable rule.
* PackingList/PackingCarton are gone; the packing-list document is a
  generated export of a Product (apps.packing.exports).
"""

import math
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError

from apps.packing.models import PackingRule

# PackingRule stores its default carton dimensions in INCHES (its historic
# shape, unchanged by the merge); ProductVariant stores centimetres. This is
# the single boundary where a rule's defaults flow onto a draft intake row.
INCH_TO_CM = Decimal("2.54")


def _cm(inches) -> Decimal:
    return (Decimal(str(inches or 0)) * INCH_TO_CM).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def generate_variant_rows_from_rule(
    *, product, packing_rule: PackingRule, colors: list, start_carton_no: int = 1
) -> list[dict]:
    """BR-19 / FR-19-20, restated for the merged model: carton count =
    ceil(Order Qty / units-per-carton), final carton left partial, carton
    numbers running sequentially across colors. Returns unsaved dicts shaped
    for ProductVariantSerializer — the client reviews them, then posts them
    as the Product's `variants` rows (still just defaults; editable before
    the intake record is committed).

    `colors` is a list of {"colorName": ..., "patternNo": ..., "orderQty":
    ...} — typically one entry per color for this product.
    """
    units_per_carton = packing_rule.units_per_carton()
    if units_per_carton <= 0:
        raise ValidationError("Packing rule has no units-per-carton ratio configured.")

    rows = []
    carton_no = start_carton_no
    for entry in colors:
        order_qty = int(entry.get("orderQty") or 0)
        num_cartons = math.ceil(order_qty / units_per_carton) if order_qty else 0
        if num_cartons == 0:
            continue
        rows.append(
            {
                "colorName": entry.get("colorName", ""),
                "patternNo": entry.get("patternNo", ""),
                "poNo": entry.get("poNo") or product.poNo,
                "assortId": entry.get("assortId", ""),
                "cartonNoFrom": carton_no,
                "cartonNoTo": carton_no + num_cartons - 1,
                "sizeBreakdown": [
                    {"size_label": k, "quantity": v} for k, v in packing_rule.sizeRatio.items()
                ],
                "innerBundle": entry.get("innerBundle", 1),
                "orderQty": order_qty,
                "unitPrice": entry.get("unitPrice"),
                "grossWeight": packing_rule.cartonGrossWeight,
                "netWeight": packing_rule.cartonNetWeight,
                # Rule defaults are inches; intake rows are centimetres.
                "ctnLength": _cm(packing_rule.cartonLength),
                "ctnWidth": _cm(packing_rule.cartonWidth),
                "ctnHeight": _cm(packing_rule.cartonHeight),
            }
        )
        carton_no += num_cartons
    return rows
