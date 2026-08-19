from rest_framework import serializers

from apps.core.models import CompanyProfile

# Must stay in sync with `client_max_body_size 10m` in frontend-admin/nginx.conf
# — nginx is the layer that actually receives the upload, so if these two
# limits ever drift apart, oversized files get nginx's bare HTML 413 page
# instead of the readable error below.
LOGO_MAX_BYTES = 10 * 1024 * 1024


class CompanyProfileSerializer(serializers.ModelSerializer):
    """`missingFields` is exposed so the invoice screen can warn *before*
    someone generates a document with an empty bank block, rather than the
    export failing at download time."""

    missingFields = serializers.SerializerMethodField()
    isComplete = serializers.SerializerMethodField()
    updatedByName = serializers.CharField(source="updatedBy.display_name", read_only=True, default="")

    class Meta:
        model = CompanyProfile
        fields = [
            "name", "tagline", "logo", "sealSignature", "addressLine", "email", "phone", "contactPerson",
            "registrationNo", "bankName", "bankAccountTitle", "bankAccountNo", "bankSwiftCode", "bankAddress",
            "updatedAt", "updatedByName", "missingFields", "isComplete",
        ]
        read_only_fields = ["updatedAt", "updatedByName", "missingFields", "isComplete"]

    def validate_logo(self, logo):
        """nginx caps the request at 10 MB before it reaches us; this guard
        covers direct-to-Django uploads and answers with a message a human
        can act on rather than a raw length error."""
        if logo and logo.size > LOGO_MAX_BYTES:
            raise serializers.ValidationError(
                f"Letterhead image is {logo.size / (1024 * 1024):.1f} MB — the limit is 10 MB."
            )
        return logo

    def validate_sealSignature(self, seal_signature):
        if seal_signature and seal_signature.size > LOGO_MAX_BYTES:
            raise serializers.ValidationError(
                f"Seal/signature image is {seal_signature.size / (1024 * 1024):.1f} MB — the limit is 10 MB."
            )
        return seal_signature

    def get_missingFields(self, obj) -> list[str]:
        return obj.missing_fields()

    def get_isComplete(self, obj) -> bool:
        return obj.is_complete()
