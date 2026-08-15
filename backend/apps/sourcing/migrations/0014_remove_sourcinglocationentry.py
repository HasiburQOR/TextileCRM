# -*- coding: utf-8 -*-
"""Removed the legacy SourcingLocationEntry model (with its hardcoded
`advanceAmount` field): Sourcing Cost line items now live entirely on
SourcingCostItem, whose `customCostFields` JSON list replaces the fixed
Advance column with any number of named numeric custom cost fields.
Migration 0013 already copied every location row's advance amount into a
"Advance" custom cost field, so nothing is lost — this just drops the
now-dead table."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("sourcing", "0013_remodel_sourcing_cost"),
    ]

    operations = [
        migrations.DeleteModel(
            name="SourcingLocationEntry",
        ),
    ]
