"""
SURAKSHA - Transport Models
Intelligent farmer transport routing system
Django Models (Module 2)
"""

from django.db import models
from django.conf import settings


class StorageFacility(models.Model):
    """Storage facilities, markets, and distribution centers."""

    FACILITY_TYPE_CHOICES = [
        ('cold_storage', 'Cold Storage'),
        ('warehouse', 'Warehouse'),
        ('market', 'Agricultural Market (APMC)'),
        ('distribution', 'Distribution Center'),
        ('processing', 'Processing Unit'),
    ]

    name = models.CharField(max_length=300)
    facility_type = models.CharField(max_length=30, choices=FACILITY_TYPE_CHOICES)
    address = models.TextField()
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100, default='Karnataka')
    latitude = models.FloatField()
    longitude = models.FloatField()
    capacity_tons = models.FloatField(default=0)
    available_capacity_tons = models.FloatField(default=0)
    contact_phone = models.CharField(max_length=15, blank=True)
    contact_email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    operating_hours = models.CharField(max_length=100, default='6AM - 8PM')
    accepted_crops = models.TextField(blank=True, help_text='Comma-separated list of accepted crops')
    price_per_ton = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        verbose_name = 'Storage Facility'
        verbose_name_plural = 'Storage Facilities'

    def __str__(self):
        return f"{self.name} ({self.get_facility_type_display()}) - {self.city}"


class TransportRequest(models.Model):
    """Farmer's transport request for crop movement."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('route_suggested', 'Route Suggested'),
        ('confirmed', 'Confirmed'),
        ('in_transit', 'In Transit'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
    ]

    CROP_TYPE_CHOICES = [
        ('vegetables', 'Vegetables'),
        ('fruits', 'Fruits'),
        ('grains', 'Grains / Cereals'),
        ('pulses', 'Pulses'),
        ('dairy', 'Dairy Products'),
        ('poultry', 'Poultry / Eggs'),
        ('spices', 'Spices'),
        ('flowers', 'Flowers'),
        ('other', 'Other'),
    ]

    PRIORITY_CHOICES = [
        ('normal', 'Normal'),
        ('urgent', 'Urgent (Perishable)'),
        ('bulk', 'Bulk Transport'),
    ]

    request_id = models.CharField(max_length=20, unique=True, blank=True)
    farmer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='transport_requests'
    )

    # Crop details
    crop_type = models.CharField(max_length=30, choices=CROP_TYPE_CHOICES)
    crop_name = models.CharField(max_length=200)
    quantity_tons = models.FloatField()
    is_perishable = models.BooleanField(default=False)
    requires_cold_storage = models.BooleanField(default=False)

    # Pickup location
    pickup_address = models.TextField()
    pickup_latitude = models.FloatField()
    pickup_longitude = models.FloatField()
    pickup_date = models.DateTimeField()

    # Destination
    preferred_destination_type = models.CharField(
        max_length=30, choices=StorageFacility.FACILITY_TYPE_CHOICES, blank=True
    )
    destination = models.ForeignKey(
        StorageFacility, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='incoming_requests'
    )

    # AI Route
    suggested_route = models.JSONField(null=True, blank=True)
    estimated_distance_km = models.FloatField(null=True, blank=True)
    estimated_duration_hours = models.FloatField(null=True, blank=True)
    route_score = models.FloatField(default=0.0)  # efficiency score

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    special_instructions = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.request_id}] {self.farmer.full_name} - {self.crop_name} ({self.quantity_tons}T)"

    def save(self, *args, **kwargs):
        if not self.request_id:
            import random, string
            self.request_id = 'TRP' + ''.join(random.choices(string.digits, k=7))
        super().save(*args, **kwargs)


class RouteWaypoint(models.Model):
    """Individual waypoints in a transport route."""
    transport_request = models.ForeignKey(
        TransportRequest, on_delete=models.CASCADE, related_name='waypoints'
    )
    sequence = models.IntegerField()
    name = models.CharField(max_length=200)
    latitude = models.FloatField()
    longitude = models.FloatField()
    waypoint_type = models.CharField(max_length=50, default='checkpoint')
    eta = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['sequence']