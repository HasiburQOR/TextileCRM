from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, render

from notifications.models import Notification


@login_required
def notification_list(request):
    notifications = Notification.objects.filter(user=request.user).order_by("-createdAt")[:100]
    return render(request, "notifications/notification_list.html", {"notifications": notifications})


@login_required
def mark_read(request, pk):
    notification = get_object_or_404(Notification, pk=pk, user=request.user)
    if request.method == "POST":
        notification.isRead = True
        notification.save(update_fields=["isRead"])
    return render(request, "notifications/_notification_row.html", {"n": notification})
