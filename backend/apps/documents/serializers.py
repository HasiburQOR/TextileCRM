from rest_framework import serializers

from apps.documents.models import DocumentVaultItem


class DocumentVaultItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentVaultItem
        fields = ["id", "sisterProfile", "documentType", "file", "fileName", "fileSize", "uploadedBy", "createdAt"]
        read_only_fields = ["id", "fileName", "fileSize", "uploadedBy", "createdAt"]

    def create(self, validated_data):
        file_obj = validated_data["file"]
        validated_data["fileName"] = file_obj.name
        validated_data["fileSize"] = file_obj.size
        return super().create(validated_data)
