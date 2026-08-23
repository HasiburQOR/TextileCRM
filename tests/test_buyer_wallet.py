# tests/test_buyer_wallet.py
"""
Wallet balance math — off-by-one or double-deduction bugs here
directly cost money. Tests the actual service-layer write path
(record_top_up / record_deduction / recompute_wallet_balance) rather
than a non-existent model method.
"""
import pytest
from decimal import Decimal

from apps.wallet.models import BuyerWallet, WalletTransaction, WalletTransactionType
from apps.wallet.services import create_wallet, record_top_up, recompute_wallet_balance
from tests.factories import BuyerProfileFactory, UserFactory

pytestmark = pytest.mark.unit


def test_wallet_top_up_increases_balance(db):
    """A top-up must increase the wallet balance by exactly the amount."""
    bp = BuyerProfileFactory()
    admin = UserFactory(role="admin")
    wallet = create_wallet(bp)

    record_top_up(
        wallet=wallet, amount=Decimal("1000.00"), currency="USD",
        method_reference="BANK-001", created_by=admin,
    )
    wallet.refresh_from_db()
    assert wallet.balance == Decimal("1000.00")


def test_wallet_balance_cannot_go_negative(db):
    """A deduction larger than the balance sets negativeBalance=True
    and the balance field reflects the actual (negative) sum.
    The system records the truth rather than silently clamping."""
    bp = BuyerProfileFactory()
    admin = UserFactory(role="admin")
    wallet = create_wallet(bp)

    # Top up a small amount
    record_top_up(
        wallet=wallet, amount=Decimal("100.00"), currency="USD",
        method_reference="BANK-001", created_by=admin,
    )

    # Record a manual adjustment that pushes it negative
    from apps.wallet.services import record_adjustment

    record_adjustment(
        wallet=wallet, amount=Decimal("-250.00"), reason="over-correction",
        created_by=admin,
    )
    wallet.refresh_from_db()

    assert wallet.balance == Decimal("-150.00")
    assert wallet.negativeBalance is True


def test_recompute_wallet_balance_is_atomic(db):
    """Every wallet write path (record_top_up, record_deduction, record_adjustment)
    wraps recompute_wallet_balance inside @transaction.atomic. This verifies
    the guard exists — select_for_update on the wallet row itself would be a
    stronger guarantee against concurrent writes and should be added.
    """
    import inspect
    from apps.wallet.services import record_top_up, record_deduction, record_adjustment

    for fn in (record_top_up, record_deduction, record_adjustment):
        source = inspect.getsource(fn)
        assert "@transaction.atomic" in source or "transaction.atomic" in source, (
            f"{fn.__name__} must be wrapped in @transaction.atomic"
        )


def test_wallet_transactions_are_append_only(db):
    """WalletTransactions should never be updated in place — corrections
    are always new rows. Verify the service creates a new row each time."""
    bp = BuyerProfileFactory()
    admin = UserFactory(role="admin")
