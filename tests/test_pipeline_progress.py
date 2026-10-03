# tests/test_pipeline_progress.py
"""
Unified Sourcing Pipeline — spec assertions for the per-order (Sister
Profile) progress endpoint and the optional packing-list step:

  * The pipeline has exactly four steps in a FIXED order:
    1 Sourcing Intake, 2 Sourcing Cost, 3 Packing List, 4 Warehouse Cost.
  * Step 3 (Packing List) is optional per product: done once every product
    has had its document downloaded OR been explicitly skipped.
  * nextStep always names the first incomplete step; completed only when
    all four are done.
  * The endpoint is tenant-scoped: another buyer's order 404s.
"""
import pytest

from tests.factories import (
    ProductFactory,
    SisterProfileFactory,
    SourcingCostFactory,
    WarehouseCostFactory,
)

PIPELINE_STEP_ORDER = ["intake", "sourcingCost", "packingList", "warehouseCost"]


def _pipeline(client, profile):
    return client.get(f"/api/v1/sister-profiles/{profile.id}/pipeline/")


@pytest.mark.integration
def test_empty_order_starts_at_step_one(admin_client):
    """A fresh Sister Profile has nothing done; the first step to act on is
    Sourcing Intake, and the endpoint reports the fixed 1→4 step order."""
    profile = SisterProfileFactory()

    resp = _pipeline(admin_client, profile)

    assert resp.status_code == 200
    assert list(resp.data["steps"].keys()) == PIPELINE_STEP_ORDER
    assert all(not s["done"] for s in resp.data["steps"].values())
    assert resp.data["nextStep"] == "intake"
    assert resp.data["completed"] is False


@pytest.mark.integration
def test_steps_complete_in_order(admin_client):
    """Walking the whole pipeline: after each step the nextStep pointer
    advances to the following step, in the spec's fixed order."""
    profile = SisterProfileFactory()

    product = ProductFactory(sisterProfile=profile)  # step 1
    data = _pipeline(admin_client, profile).data
    assert data["steps"]["intake"]["done"] is True
    assert data["steps"]["intake"]["productCount"] == 1
    assert data["nextStep"] == "sourcingCost"

    SourcingCostFactory(sisterProfile=profile)  # step 2
    data = _pipeline(admin_client, profile).data
    assert data["steps"]["sourcingCost"]["done"] is True
    assert data["nextStep"] == "packingList"

    product.packingListSkipped = True  # step 3 (optional — skip path)
    product.save(update_fields=["packingListSkipped"])
    data = _pipeline(admin_client, profile).data
    assert data["steps"]["packingList"]["done"] is True
    assert data["steps"]["packingList"]["skippedCount"] == 1
    assert data["nextStep"] == "warehouseCost"

    WarehouseCostFactory(sisterProfile=profile)  # step 4
    data = _pipeline(admin_client, profile).data
    assert data["steps"]["warehouseCost"]["done"] is True
    assert data["nextStep"] is None
    assert data["completed"] is True


@pytest.mark.integration
def test_packing_step_pending_until_every_product_done_or_skipped(admin_client):
    """Per-product optionality: with two products where only one is
    skipped, the step — and therefore the order — is still pending."""
    profile = SisterProfileFactory()
    SourcingCostFactory(sisterProfile=profile)
    ProductFactory(sisterProfile=profile, packingListSkipped=True)
    ProductFactory(sisterProfile=profile)  # still pending

    data = _pipeline(admin_client, profile).data

    assert data["steps"]["packingList"]["done"] is False
    assert data["steps"]["packingList"]["skippedCount"] == 1
    assert data["steps"]["packingList"]["exportedCount"] == 0
    assert data["nextStep"] == "packingList"
    assert data["completed"] is False


@pytest.mark.integration
def test_packing_list_export_marks_step_done_and_clears_skip(admin_client):
    """Downloading the packing-list document is the other way to finish
    step 3: it stamps packingListExportedAt and clears an earlier skip so
    the two markers never both claim the step."""
    profile = SisterProfileFactory()
    product = ProductFactory(sisterProfile=profile, packingListSkipped=True)

    resp = admin_client.get(f"/api/v1/products/{product.id}/packing-list-export/")

    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/pdf"
    product.refresh_from_db()
    assert product.packingListExportedAt is not None
    assert product.packingListSkipped is False

    data = _pipeline(admin_client, profile).data
    assert data["steps"]["packingList"]["done"] is True
    assert data["steps"]["packingList"]["exportedCount"] == 1
    assert data["nextStep"] == "sourcingCost"


@pytest.mark.integration
def test_packing_list_skip_toggles_via_endpoint(staff_client):
    """POST packing-list-skip flips the skip marker on, and a second POST
    flips it back off (an un-skip path is needed if it was hit by
    accident)."""
    profile = SisterProfileFactory()
    product = ProductFactory(sisterProfile=profile)
    url = f"/api/v1/products/{product.id}/packing-list-skip/"

    assert staff_client.post(url).data["packingListSkipped"] is True
    product.refresh_from_db()
    assert product.packingListSkipped is True

    assert staff_client.post(url).data["packingListSkipped"] is False
    product.refresh_from_db()
    assert product.packingListSkipped is False


@pytest.mark.tenant
def test_pipeline_is_tenant_scoped(buyer_client, buyer_profile, other_buyer_profile):
    """A buyer must never read another buyer's pipeline (404, not 403 — a
    403 would confirm the order exists), but can read their own."""
    foreign = SisterProfileFactory(buyerProfile=other_buyer_profile)

    resp = buyer_client.get(f"/api/v1/sister-profiles/{foreign.id}/pipeline/")
    assert resp.status_code == 404

    own = SisterProfileFactory(buyerProfile=buyer_profile)
    ProductFactory(sisterProfile=own, packingListSkipped=True)

    resp = buyer_client.get(f"/api/v1/sister-profiles/{own.id}/pipeline/")
    assert resp.status_code == 200
    assert resp.data["steps"]["intake"]["done"] is True
    assert resp.data["steps"]["packingList"]["done"] is True
