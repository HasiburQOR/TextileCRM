from django.core.exceptions import ValidationError
from django.db import transaction

from packing.models import PackingCarton, PackingList
from sourcing.models import SourcingRequest


@transaction.atomic
def create_packing_list(*, sourcing_request: SourcingRequest, order_qty, shipment_qty, front_mark, side_mark, cartons: list) -> PackingList:
    if PackingList.objects.filter(request=sourcing_request).exists():
        raise ValidationError("This request already has a packing list.")

    pl = PackingList(request=sourcing_request, orderQty=order_qty or 0, shipmentQty=shipment_qty or 0, frontMark=front_mark or "", sideMark=side_mark or "")
    pl.compute_shortage()
    pl.save()

    for c in cartons:
        if not c.get("cartonNoFrom") and not c.get("cartonNoTo") and not c.get("qtyPerCarton"):
            continue
        carton = PackingCarton(
            packingList=pl,
            cartonNoFrom=c.get("cartonNoFrom") or 0,
            cartonNoTo=c.get("cartonNoTo") or 0,
            color=c.get("color") or "",
            assortId=c.get("assortId") or "",
            itemNumber=c.get("itemNumber") or "",
            sizeBreakdown=c.get("sizeBreakdown") or "",
            qtyPerCarton=c.get("qtyPerCarton") or 0,
            orderQty=c.get("orderQty") or 0,
            ctnLength=c.get("ctnLength") or 0,
            ctnWidth=c.get("ctnWidth") or 0,
            ctnHeight=c.get("ctnHeight") or 0,
            netWeight=c.get("netWeight") or 0,
            grossWeight=c.get("grossWeight") or 0,
        )
        carton.compute_derived()
        carton.save()

    pl.recompute_totals_from_cartons()
    pl.save(update_fields=["totalCbm", "totalNetWeight", "totalGrossWeight", "updatedAt"])
    return pl
