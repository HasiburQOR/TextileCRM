from django.db import models

from core.models import TimeStampedModel, UUIDModel
from sourcing.models import SourcingRequest


class PackingList(UUIDModel, TimeStampedModel):
    request = models.OneToOneField(SourcingRequest, related_name="packingList", on_delete=models.CASCADE)
    orderQty = models.PositiveIntegerField(default=0)
    shipmentQty = models.PositiveIntegerField(default=0)
    shortQty = models.IntegerField(default=0)
    shortPct = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    totalCbm = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    totalNetWeight = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    totalGrossWeight = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    frontMark = models.CharField(max_length=255, blank=True, default="")
    sideMark = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["-createdAt"]

    def __str__(self):
        return f"Packing list for {self.request.productName}"

    def compute_shortage(self) -> None:
        self.shortQty = self.orderQty - self.shipmentQty
        self.shortPct = (self.shortQty / self.orderQty * 100) if self.orderQty > 0 else 0

    def recompute_totals_from_cartons(self) -> None:
        totals = self.cartons.aggregate(
            cbm=models.Sum(models.F("ctnCbm") * models.F("noOfCartons")),
            net=models.Sum(models.F("netWeight") * models.F("noOfCartons")),
            gross=models.Sum(models.F("grossWeight") * models.F("noOfCartons")),
        )
        self.totalCbm = totals["cbm"] or 0
        self.totalNetWeight = totals["net"] or 0
        self.totalGrossWeight = totals["gross"] or 0


class PackingCarton(UUIDModel):
    packingList = models.ForeignKey(PackingList, related_name="cartons", on_delete=models.CASCADE)
    cartonNoFrom = models.PositiveIntegerField(default=0)
    cartonNoTo = models.PositiveIntegerField(default=0)
    noOfCartons = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=255, blank=True, default="")
    assortId = models.CharField(max_length=255, blank=True, default="")
    itemNumber = models.CharField(max_length=255, blank=True, default="")
    sizeBreakdown = models.CharField(max_length=255, blank=True, default="")
    qtyPerCarton = models.PositiveIntegerField(default=0)
    shipQty = models.IntegerField(default=0)
    orderQty = models.IntegerField(default=0)
    shortQty = models.IntegerField(default=0)
    shortPct = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    ctnLength = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    ctnWidth = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    ctnHeight = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    netWeight = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    grossWeight = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    ctnCbm = models.DecimalField(max_digits=12, decimal_places=4, default=0)

    class Meta:
        ordering = ["cartonNoFrom"]

    def __str__(self):
        return f"Cartons {self.cartonNoFrom}-{self.cartonNoTo}"

    def compute_derived(self) -> None:
        self.noOfCartons = (self.cartonNoTo - self.cartonNoFrom + 1) if self.cartonNoTo >= self.cartonNoFrom else 1
        self.shipQty = self.noOfCartons * self.qtyPerCarton
        self.shortQty = self.orderQty - self.shipQty
        self.shortPct = (self.shortQty / self.orderQty * 100) if self.orderQty > 0 else 0
        self.ctnCbm = (self.ctnLength * self.ctnWidth * self.ctnHeight) / 1000000
