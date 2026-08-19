from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Roles, User
from apps.buyers.models import AgreementType, BuyerProfile, SisterProfile
from apps.documents.models import DocumentType, DocumentVaultItem


class DocumentVaultTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="admin", password="pass12345", role=Roles.ADMIN)
        self.rep = User.objects.create_user(username="rep", password="pass12345", role=Roles.COMPANY_REP)
        self.buyer_a = BuyerProfile.objects.create(name="Buyer A")
        self.buyer_b = BuyerProfile.objects.create(name="Buyer B")
        self.sister_a = SisterProfile.objects.create(
            buyerProfile=self.buyer_a, poReference="PO-A", agreementType=AgreementType.TYPE_1
        )
        self.sister_b = SisterProfile.objects.create(
            buyerProfile=self.buyer_b, poReference="PO-B", agreementType=AgreementType.TYPE_1
        )
        self.buyer_a_user = User.objects.create_user(
            username="buyer_a", password="pass12345", role=Roles.BUYER, buyer_profile=self.buyer_a
        )
        self.doc_a = DocumentVaultItem.objects.create(
            sisterProfile=self.sister_a, documentType=DocumentType.PO,
            file=SimpleUploadedFile("po.pdf", b"content"), fileName="po.pdf", fileSize=7, uploadedBy=self.admin,
        )
        self.doc_b = DocumentVaultItem.objects.create(
            sisterProfile=self.sister_b, documentType=DocumentType.CONTRACT,
            file=SimpleUploadedFile("contract.pdf", b"content"), fileName="contract.pdf", fileSize=7, uploadedBy=self.admin,
        )

    def test_supplier_staff_can_upload(self):
        self.client.force_authenticate(user=self.rep)
        resp = self.client.post(
            reverse("document-list"),
            {"sisterProfile": str(self.sister_a.id), "documentType": "qc_photo", "file": SimpleUploadedFile("photo.jpg", b"img")},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data["fileName"], "photo.jpg")
        self.assertEqual(resp.data["fileSize"], 3)

    def test_buyer_cannot_upload(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.post(
            reverse("document-list"),
            {"sisterProfile": str(self.sister_a.id), "documentType": "other", "file": SimpleUploadedFile("x.txt", b"x")},
            format="multipart",
        )
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_405_METHOD_NOT_ALLOWED))

    def test_buyer_cannot_see_another_buyers_documents(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("document-detail", args=[self.doc_b.id]))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_can_see_own_documents(self):
        self.client.force_authenticate(user=self.buyer_a_user)
        resp = self.client.get(reverse("document-list"))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in resp.data["results"]}
        self.assertEqual(ids, {str(self.doc_a.id)})

    def test_only_admin_can_delete(self):
        self.client.force_authenticate(user=self.rep)
        resp = self.client.delete(reverse("document-detail", args=[self.doc_a.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(reverse("document-detail", args=[self.doc_a.id]))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
