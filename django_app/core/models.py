import uuid

from django.db import models


class UUIDModel(models.Model):
    """Base model using a UUID primary key, mirroring the cuid() ids of the original app."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    createdAt = models.DateTimeField(auto_now_add=True)
    updatedAt = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SequenceCounter(models.Model):
    """Backs atomic, gap-free sequential codes like QC-2026-001 / INV-2026-001.

    The original Next.js app derived these from `db.model.count() + 1`, which is not
    race-safe under concurrent requests. This table + select_for_update() makes the
    increment atomic.
    """

    key = models.CharField(max_length=64, primary_key=True)
    value = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.key}={self.value}"
