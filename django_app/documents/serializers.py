from rest_framework import serializers

from documents.models import DocumentVault


class DocumentVaultSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentVault
        fields = ["id", "sisterProfile", "documentType", "file", "fileName", "fileSize", "uploadedBy", "createdAt"]
        read_only_fields = ["id", "fileName", "fileSize", "uploadedBy", "createdAt"]

    def create(self, validated_data):
        file_obj = validated_data.get("file")
        validated_data["fileName"] = file_obj.name
        validated_data["fileSize"] = file_obj.size
        return super().create(validated_data)
