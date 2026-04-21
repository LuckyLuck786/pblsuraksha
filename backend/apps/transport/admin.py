from django.contrib import admin
from .models import TransportRequest, StorageFacility, RouteWaypoint

@admin.register(StorageFacility)
class StorageFacilityAdmin(admin.ModelAdmin):
    list_display = ['name', 'facility_type', 'city', 'available_capacity_tons', 'is_active']

@admin.register(TransportRequest)
class TransportRequestAdmin(admin.ModelAdmin):
    list_display = ['request_id', 'farmer', 'crop_name', 'quantity_tons', 'status', 'created_at']
    list_filter = ['status', 'crop_type']