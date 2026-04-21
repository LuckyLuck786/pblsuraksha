"""
SURAKSHA - Transport Serializers
"""

from rest_framework import serializers
from .models import TransportRequest, StorageFacility, RouteWaypoint


class StorageFacilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageFacility
        fields = '__all__'


class TransportRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransportRequest
        fields = [
            'crop_type', 'crop_name', 'quantity_tons', 'is_perishable',
            'requires_cold_storage', 'pickup_address', 'pickup_latitude',
            'pickup_longitude', 'pickup_date', 'preferred_destination_type',
            'special_instructions',
        ]

    def validate_quantity_tons(self, value):
        if value <= 0:
            raise serializers.ValidationError('Quantity must be greater than 0.')
        return value

    def validate_pickup_address(self, value):
        if not value.strip():
            raise serializers.ValidationError('Pickup address is required.')
        return value.strip()


class TransportRequestSerializer(serializers.ModelSerializer):
    farmer_name = serializers.SerializerMethodField()
    destination_detail = StorageFacilitySerializer(source='destination', read_only=True)

    class Meta:
        model = TransportRequest
        fields = '__all__'

    def get_farmer_name(self, obj):
        return obj.farmer.full_name if obj.farmer else 'Unknown'