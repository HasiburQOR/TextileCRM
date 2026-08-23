# tests/test_tenant_isolation.py
"""
Buyer-scoped isolation — the most dangerous bug class here. A queryset
that forgets to filter by buyer_profile leaks Buyer A's data to Buyer B.
Every viewset or serializer that touches buyer-scoped models must pass
these checks.
"""
import pytest

from apps.buyers.models import SisterProfile
from tests.factories import BuyerProfileFactory, SisterProfileFactory, UserFactory

pytestmark = pytest.mark.tenant


def test_admin_sees_all_buyer_profiles(admin_client):
    """Admin can list all buyer profiles — no scoping restriction."""
    BuyerProfileFactory(name="Alpha")
    BuyerProfileFactory(name="Beta")

    resp = admin_client.get("/api/v1/buyers/")
    assert resp.status_code == 200

    names = {b["name"] for b in resp.data["results"]}
    assert "Alpha" in names
    assert "Beta" in names


def test_buyer_cannot_see_other_buyers_data(buyer_client, buyer_profile, other_buyer_profile):
    """A buyer's portal client must never see another buyer's Sister Profiles.
    The portal list endpoint filters on request.user.buyer_profile_id."""
    # Create orders under both buyers
    SisterProfileFactory(buyerProfile=buyer_profile, poReference="PO-OWN-001")
    SisterProfileFactory(buyerProfile=other_buyer_profile, poReference="PO-OTHER-001")

    resp = buyer_client.get("/api/v1/portal/orders/")
    assert resp.status_code == 200

    po_refs = [o["poReference"] for o in resp.data]
    assert "PO-OWN-001" in po_refs
    assert "PO-OTHER-001" not in po_refs


def test_buyer_cannot_fetch_other_buyers_order_by_id(buyer_client, buyer_profile, other_buyer_profile):
    """A buyer requesting another buyer's order id gets 404, not 403 —
    a 403 confirms the object exists, which is itself a minor info leak."""
    foreign_order = SisterProfileFactory(buyerProfile=other_buyer_profile)

    resp = buyer_client.get(f"/api/v1/portal/orders/{foreign_order.id}/")
    assert resp.status_code == 404

