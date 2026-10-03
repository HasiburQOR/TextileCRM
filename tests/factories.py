# tests/factories.py
"""
factory_boy factories. Keep these in lockstep with model changes —
when a required field is added to a model, add it here too or
every test using that factory breaks with an opaque IntegrityError.
"""
from decimal import Decimal

import factory
from django.utils import timezone
from factory.django import DjangoModelFactory

from apps.accounts.models import User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.packing.models import PackingRule
from apps.sourcing.models import Product, ProductVariant, SourcingCost, SourcingCostItem
from apps.wallet.models import BuyerWallet


class BuyerProfileFactory(DjangoModelFactory):
    class Meta:
        model = BuyerProfile

    name = factory.Sequence(lambda n: f"Buyer Co {n}")
    contactInfo = "test contact"


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    username = factory.Sequence(lambda n: f"user{n}")
    role = "admin"
    is_active = True

    @factory.post_generation
    def password(obj, create, extracted, **kwargs):
        obj.set_password(extracted or "testpass123")
        if create:
            obj.save()


class SisterProfileFactory(DjangoModelFactory):
    class Meta:
        model = SisterProfile

    buyerProfile = factory.SubFactory(BuyerProfileFactory)
    agreementType = AgreementType.TYPE_1
    supplierCurrency = "BDT"
    buyerCurrency = "USD"
    exchangeRate = 120


class BuyerWalletFactory(DjangoModelFactory):
    class Meta:
        model = BuyerWallet

    buyerProfile = factory.SubFactory(BuyerProfileFactory)
    balance = 0


class ProductFactory(DjangoModelFactory):
    """Sourcing Intake record — which, since the Sourcing-Intake-as-Packing-
    List merge, is also the packing list document (packingDate + front/side
    marks live here, per-color packing rows on its variants)."""

    class Meta:
        model = Product

    sisterProfile = factory.SubFactory(SisterProfileFactory)
    name = factory.Sequence(lambda n: f"Product {n}")
    poNo = factory.Sequence(lambda n: f"PO-{n}")
    createdBy = factory.SubFactory(UserFactory)


class ProductVariantFactory(DjangoModelFactory):
    """One per-color intake row — the packing-list row since the merge."""

    class Meta:
        model = ProductVariant

    product = factory.SubFactory(ProductFactory)
    colorName = factory.Sequence(lambda n: f"Color {n}")


class PackingRuleFactory(DjangoModelFactory):
    class Meta:
        model = PackingRule

    name = factory.Sequence(lambda n: f"Rule {n}")
    sizeRatio = {"S": 1, "M": 3, "L": 5, "XL": 4, "XXL": 2}
    cartonLength = Decimal("24")  # inches — the rule's historic convention
    cartonWidth = Decimal("18")
    cartonHeight = Decimal("12")
    cartonNetWeight = Decimal("6.7")
    cartonGrossWeight = Decimal("6.9")


class SourcingCostFactory(DjangoModelFactory):
    """One Sister Profile's sourcing cost sheet (open until closed)."""

    class Meta:
        model = SourcingCost

    sisterProfile = factory.SubFactory(SisterProfileFactory)


class SourcingCostItemFactory(DjangoModelFactory):
    """One product reference + custom cost fields within a Sourcing Cost."""

    class Meta:
        model = SourcingCostItem

    sourcingCost = factory.SubFactory(SourcingCostFactory)
    product = factory.SubFactory(ProductFactory)
    locationName = factory.Sequence(lambda n: f"Location {n}")
    quantity = 100
    customCostFields = []
    date = factory.LazyFunction(timezone.now)
