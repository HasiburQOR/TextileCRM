"""
Root conftest.py — shared fixtures for the whole test suite.
"""
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tests.factories import (
    BuyerProfileFactory,
    UserFactory,
)


@pytest.fixture
def api_client():
    """Unauthenticated DRF test client."""
    return APIClient()


@pytest.fixture
def admin_user(db):
    return UserFactory(role="admin")


@pytest.fixture
def staff_user(db):
    return UserFactory(role="company_rep")


def _authed_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def admin_client(admin_user):
    """DRF client authenticated as admin via JWT."""
    return _authed_client(admin_user)


@pytest.fixture
def staff_client(staff_user):
    return _authed_client(staff_user)


@pytest.fixture
def buyer_profile(db):
    """A BuyerProfile — the top-level 'tenant' equivalent."""
    return BuyerProfileFactory()


@pytest.fixture
def buyer_user(db, buyer_profile):
    """A User with role=buyer tied to buyer_profile."""
    return UserFactory(role="buyer", buyer_profile=buyer_profile)


@pytest.fixture
def buyer_client(buyer_user):
    """DRF client authenticated as a buyer via JWT."""
    return _authed_client(buyer_user)


@pytest.fixture
def other_buyer_profile(db):
    """A second buyer profile, for isolation/leakage tests."""
    return BuyerProfileFactory()
