"""
The packing-list tests that used to live here (PackingCarton totals, signed
short/excess, rule generation) moved to tests/test_packing_merge.py when
the standalone PackingList/PackingCarton models were removed in the
Sourcing-Intake-as-Packing-List merge — the same semantics are now computed
on ProductVariant by apps.sourcing.services.compute_variant_derived.
This app's only remaining model is PackingRule (covered there too).
"""
