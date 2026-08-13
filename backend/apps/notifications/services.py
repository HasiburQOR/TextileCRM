from apps.accounts.models import Roles, User
from apps.notifications.models import Notification


def notify(*, user, title, message, notification_type, sister_profile=None) -> Notification:
    return Notification.objects.create(
        user=user, sisterProfile=sister_profile, title=title, message=message, type=notification_type,
    )


def notify_admins_and_buyer(*, sister_profile, title, message, notification_type) -> list[Notification]:
    """BR-50: negative-balance alerts go to Admin *and* the relevant buyer.
    Reused for any other event that should reach both sides."""
    recipients = list(User.objects.filter(role=Roles.ADMIN)) + list(
        User.objects.filter(role=Roles.BUYER, buyer_profile=sister_profile.buyerProfile)
    )
    return [
        notify(user=u, title=title, message=message, notification_type=notification_type, sister_profile=sister_profile)
        for u in recipients
    ]


def notify_buyer(*, sister_profile, title, message, notification_type) -> list[Notification]:
    """BR-55: the buyer watches invoice/financial events on their own
    Sister Profile — e.g. an invoice being issued or a payment recorded."""
    recipients = User.objects.filter(role=Roles.BUYER, buyer_profile=sister_profile.buyerProfile)
    return [
        notify(user=u, title=title, message=message, notification_type=notification_type, sister_profile=sister_profile)
        for u in recipients
    ]
