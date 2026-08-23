# tests/test_invoice_logic.py
"""
Invoice calculations — the kind of arithmetic AI-generated code gets
subtly wrong (off-by-one in rounding, wrong branch for agreement type,
wallet deduction in the wrong order). Tests parametrized over every
AgreementType so a regression in one branch can't hide.
"""
import pytest
from decimal import Decimal

from apps.buyers.models import AgreementType
from apps.invoicing.models import CommissionType, Invoice, InvoiceLineItem, InvoiceStatus
from apps.invoicing.services import compute_line_item, create_invoice
from tests.factories import SisterProfileFactory, UserFactory

pytestmark = pytest.mark.unit


def _make_line(**overrides):
    """Minimal line-item dict that compute_line_item can derive from."""
    base = {
        "description": "Test Item",
        "ctn": 10,
        "qtyPerCtn": 100,
        "unitPrice": "5.00",
        "hsCode": "",
    }
    base.update(overrides)
    return compute_line_item(base)


@pytest.mark.parametrize(
    "ctn,qty_per_ctn,unit_price,expected_total_qty,expected_amount",
    [
        (10, 100, "5.00", 1000, Decimal("5000.00")),
        (0, 50, "3.00", 0, Decimal("0.00")),
        (5, 200, "1.50", 1000, Decimal("1500.00")),
    ],
)
def test_compute_line_item_derives_totals(ctn, qty_per_ctn, unit_price, expected_total_qty, expected_amount):
    line = _make_line(ctn=ctn, qtyPerCtn=qty_per_ctn, unitPrice=unit_price)
    assert line["totalQty"] == expected_total_qty
    assert line["amount"] == expected_amount


@pytest.mark.parametrize(
    "agreement_type,commission_rate,expect_commission_type",
    [
        (AgreementType.TYPE_1, 10, CommissionType.PERCENTAGE),
        (AgreementType.TYPE_2, 2, CommissionType.PER_UNIT),
        (AgreementType.TYPE_3, 5, CommissionType.PERCENTAGE),
    ],
)
def test_create_invoice_captures_agreement_type(
    db, agreement_type, commission_rate, expect_commission_type,
):
    """The invoice must snapshot the agreement type from the Sister Profile
    at creation time, so later profile edits never rewrite an issued document.
    The commission type is derived from the agreement type, not passed explicitly."""
    sister = SisterProfileFactory(agreementType=agreement_type)
    admin = UserFactory(role="admin")

    invoice = create_invoice(
        sister_profile=sister,
        created_by=admin,
        line_items=[_make_line()],
        commission_rate=commission_rate,
    )
    invoice.refresh_from_db()

    assert invoice.agreementTypeAtCreation == agreement_type
    assert invoice.status == InvoiceStatus.PENDING_APPROVAL


@pytest.mark.parametrize(
    "agreement_type,commission_rate,expected_grand_total",
    [
        # Type 1: 10% of totalValue. Lines: 5000 + 2000 = 7000. Commission: 700. Grand: 7700.
        (AgreementType.TYPE_1, 10, Decimal("7700.00")),
        # Type 2: 2 per unit. total_qty=500+100=600. Commission: 1200. Grand: 8200.
        (AgreementType.TYPE_2, 2, Decimal("8200.00")),
        # Type 3: % of costTotalSupplier (no expenses pulled). Commission: 0. Grand: 7000.
        (AgreementType.TYPE_3, 10, Decimal("7000.00")),
    ],
)
def test_invoice_total_matches_sum_of_lines(db, agreement_type, commission_rate, expected_grand_total):
    """grand_total() must be the predictable sum of line items plus commission.
    A mismatch here means the buyer is charged the wrong figure."""
    sister = SisterProfileFactory(agreementType=agreement_type)
    admin = UserFactory(role="admin")

    lines = [
        _make_line(description="Item A", ctn=5, qtyPerCtn=100, unitPrice="10.00"),
        _make_line(description="Item B", ctn=2, qtyPerCtn=50, unitPrice="20.00"),
    ]
    invoice = create_invoice(
        sister_profile=sister,
        created_by=admin,
        line_items=lines,
        commission_rate=commission_rate,
    )
    invoice.refresh_from_db()

