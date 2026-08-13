"""
Packing calculation service layer (BR-16–22 / FR-13–24). Every derived
field is computed here, never in a serializer or the future frontend, per
the DRF Migration Instructions' non-negotiable rule.
"""

import math
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.packing.models import CUBIC_INCHES_PER_CBM, PackingCarton, PackingList, PackingRule


def _dec(value) -> Decimal:
    return Decimal(str(value or 0))


def _round2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _round4(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


# grossWeight/netWeight/ctnLength/ctnWidth/ctnHeight are DecimalField(max_digits=8,
# decimal_places=2) — matches the DB constraint exactly, so a bad/mistyped
# value gets a clear 400 here instead of an unhandled Postgres DataError.
_DECIMAL_8_2_MAX = Decimal("999999.99")
_RANGE_CHECKED_FIELDS = ["grossWeight", "netWeight", "ctnLength", "ctnWidth", "ctnHeight"]


def _validate_carton_ranges(carton: PackingCarton) -> None:
    errors = {}
    for field in _RANGE_CHECKED_FIELDS:
        value = _dec(getattr(carton, field))
        if abs(value) > _DECIMAL_8_2_MAX:
            errors[field] = f"Must be at most {_DECIMAL_8_2_MAX} — got {value}."
    if errors:
        raise ValidationError(errors)


def compute_carton_derived(carton: PackingCarton) -> None:
    """Fills every column that the sample packing list computes rather than
    hand-enters, from the columns that are actually typed in."""
    carton.noOfCartons = (
        carton.cartonNoTo - carton.cartonNoFrom + 1 if carton.cartonNoTo >= carton.cartonNoFrom else 0
    )
    carton.totalPcsPerCarton = sum(int(v) for v in (carton.sizeBreakdown or {}).values())
    carton.shipQty = carton.noOfCartons * carton.totalPcsPerCarton

    # Signed: positive = short of order, negative = shipped in excess of order.
    carton.shortExcessQty = carton.orderQty - carton.shipQty
    carton.shortExcessPct = (
        _round2(_dec(carton.shortExcessQty) / _dec(carton.orderQty) * 100) if carton.orderQty else Decimal("0")
    )

    carton.totalGrossWeight = _round2(_dec(carton.grossWeight) * carton.noOfCartons)
    carton.totalNetWeight = _round2(_dec(carton.netWeight) * carton.noOfCartons)

    # Round only once, at the end — rounding the per-carton figure first and
    # then multiplying compounds error across many cartons (verified against
    # the sample sheet: summing pre-rounded per-carton CBMs landed a cent
    # short of the sheet's own G.TOTAL). `ctnCbm` is still stored, rounded,
    # for per-carton display; `totalCbm` is derived from the unrounded value.
    cubic_inches = _dec(carton.ctnLength) * _dec(carton.ctnWidth) * _dec(carton.ctnHeight)
    per_carton_cbm_unrounded = cubic_inches / Decimal(str(CUBIC_INCHES_PER_CBM)) if cubic_inches else Decimal("0")
    carton.ctnCbm = _round4(per_carton_cbm_unrounded)
    carton.totalCbm = _round4(per_carton_cbm_unrounded * carton.noOfCartons)


def recompute_packing_list_totals(packing_list: PackingList) -> None:
    cartons = list(packing_list.cartons.all())
    packing_list.totalCartonQty = sum(c.noOfCartons for c in cartons)
    packing_list.totalOrderQty = sum(c.orderQty for c in cartons)
    packing_list.totalShipQty = sum(c.shipQty for c in cartons)
    packing_list.shortExcessQty = packing_list.totalOrderQty - packing_list.totalShipQty
    packing_list.shortExcessPct = (
        _round2(_dec(packing_list.shortExcessQty) / _dec(packing_list.totalOrderQty) * 100)
        if packing_list.totalOrderQty
        else Decimal("0")
    )
    packing_list.totalGrossWeight = _round2(sum((c.totalGrossWeight for c in cartons), Decimal("0")))
    packing_list.totalNetWeight = _round2(sum((c.totalNetWeight for c in cartons), Decimal("0")))
    packing_list.totalCbm = _round4(sum((c.totalCbm for c in cartons), Decimal("0")))
    packing_list.save(
        update_fields=[
            "totalCartonQty", "totalOrderQty", "totalShipQty", "shortExcessQty", "shortExcessPct",
            "totalGrossWeight", "totalNetWeight", "totalCbm", "updatedAt",
        ]
    )


@transaction.atomic
def create_packing_list(*, sister_profile, created_by, cartons: list, packing_rule=None, **header_fields) -> PackingList:
    packing_list = PackingList.objects.create(
        sisterProfile=sister_profile, createdBy=created_by, packingRule=packing_rule, **header_fields
    )
    for carton_data in cartons:
        carton = PackingCarton(packingList=packing_list, **carton_data)
        compute_carton_derived(carton)
        _validate_carton_ranges(carton)
        carton.save()
    recompute_packing_list_totals(packing_list)
    packing_list.refresh_from_db()
    return packing_list


def add_carton(packing_list: PackingList, **carton_data) -> PackingCarton:
    carton = PackingCarton(packingList=packing_list, **carton_data)
    compute_carton_derived(carton)
    _validate_carton_ranges(carton)
    carton.save()
    recompute_packing_list_totals(packing_list)
    return carton


def generate_cartons_from_rule(
    *, product, packing_rule: PackingRule, colors: list, start_carton_no: int = 1
) -> list[dict]:
    """BR-19 / FR-19-20: carton count = ceil(Order Qty / units-per-carton),
    with the final carton left partial (this project's own resolution of
    the SRS's still-open rounding question — see SRS §8). Carton numbers
    continue sequentially from `start_carton_no`, so callers can chain this
    across multiple products/colors within one PackingList (FR-20).

    `colors` is a list of {"colorBreakdown": {...}, "patternNo": ..., "orderQty": ...}
    — typically summed straight from that product's ProductVariant rows.
    Returns plain dicts ready to pass into `create_packing_list`/`add_carton`
    (not yet saved), so the caller can review/edit before committing.
    """
    units_per_carton = packing_rule.units_per_carton()
    if units_per_carton <= 0:
        raise ValidationError("Packing rule has no units-per-carton ratio configured.")

    cartons = []
    carton_no = start_carton_no
    for entry in colors:
        order_qty = int(entry["orderQty"])
        num_cartons = math.ceil(order_qty / units_per_carton) if order_qty else 0
        if num_cartons == 0:
            continue
        cartons.append(
            {
                "product": product,
                "cartonNoFrom": carton_no,
                "cartonNoTo": carton_no + num_cartons - 1,
                "colorBreakdown": entry.get("colorBreakdown", {}),
                "patternNo": entry.get("patternNo", ""),
                "assortId": entry.get("assortId", ""),
                "sizeBreakdown": dict(packing_rule.sizeRatio),
                "innerBundle": entry.get("innerBundle", 1),
                "orderQty": order_qty,
                "grossWeight": packing_rule.cartonGrossWeight,
                "netWeight": packing_rule.cartonNetWeight,
                "ctnLength": packing_rule.cartonLength,
                "ctnWidth": packing_rule.cartonWidth,
                "ctnHeight": packing_rule.cartonHeight,
            }
        )
        carton_no += num_cartons
    return cartons
