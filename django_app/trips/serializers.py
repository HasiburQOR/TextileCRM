from rest_framework import serializers

from trips.models import SourcingTrip, TripLocation


class TripLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripLocation
        fields = ["id", "sourcingTrip", "locationName", "quantity", "advanceAmount", "status", "date", "createdAt", "updatedAt"]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def validate(self, attrs):
        trip = attrs.get("sourcingTrip") or getattr(self.instance, "sourcingTrip", None)
        if trip and trip.status == "CLOSED":
            raise serializers.ValidationError("Cannot modify locations on a closed trip.")
        return attrs


class SourcingTripSerializer(serializers.ModelSerializer):
    locations = TripLocationSerializer(many=True, read_only=True)
    productName = serializers.CharField(source="request.productName", read_only=True)

    class Meta:
        model = SourcingTrip
        fields = ["id", "request", "productName", "status", "totalAdvance", "closedAt", "closedBy", "locations", "createdAt", "updatedAt"]
        read_only_fields = ["id", "status", "totalAdvance", "closedAt", "closedBy", "createdAt", "updatedAt"]
