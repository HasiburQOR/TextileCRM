# tests/factories.py
"""
factory_boy factories. Keep these in lockstep with model changes —
when a required field is added to a model, add it here too or
every test using that factory breaks with an opaque IntegrityError.
"""
import factory
from factory.django import DjangoModelFactory

from apps.accounts.models import User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
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
