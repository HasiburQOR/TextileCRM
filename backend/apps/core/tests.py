import shutil
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.core.models import CompanyProfile

# Uploads in these tests write real image files — keep them off the
# developer's own backend/media/ directory.
_TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix="core-test-media-")


def _png_file(name: str, size_px: int, *, noise: bool = False) -> SimpleUploadedFile:
    img = Image.effect_noise((size_px, size_px), 100) if noise else Image.new("RGB", (size_px, size_px))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


@override_settings(MEDIA_ROOT=_TEST_MEDIA_ROOT)
class CompanyProfileLogoUploadTests(APITestCase):
    """The letterhead banner is uploaded through frontend-admin's nginx proxy,
    whose `client_max_body_size 10m` hard-caps the request — anything bigger
    gets nginx's bare HTML 413 page. These tests pin the server-side half of
    that contract (the same 10 MB, but as a readable JSON error)."""

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEST_MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_user(username="cp_admin", password="pass12345", role=Roles.ADMIN)
        self.client.force_authenticate(user=self.admin)

    def test_small_logo_is_accepted(self):
        resp = self.client.patch(reverse("company-profile"), {"logo": _png_file("banner.png", 10)}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["logo"])
        self.assertTrue(CompanyProfile.load().logo)

    def test_oversized_logo_is_rejected_with_a_clear_message(self):
        big = _png_file("huge.png", 3800, noise=True)  # noise → ~13 MB, a real decodable image
        self.assertGreater(big.size, 10 * 1024 * 1024)
        resp = self.client.patch(reverse("company-profile"), {"logo": big}, format="multipart")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("10 MB", str(resp.data["logo"]))

