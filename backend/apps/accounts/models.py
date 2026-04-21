"""
SURAKSHA - Accounts Models
Custom User model with role-based access (citizen, authority/admin, farmer)
Django Models (Module 2)
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Extended User model with role and profile info."""

    ROLE_CHOICES = [
        ('citizen', 'Citizen'),
        ('authority', 'Authority / Police'),
        ('farmer', 'Farmer'),
        ('admin', 'System Admin'),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='citizen')
    phone = models.CharField(max_length=15, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True, default='Karnataka')
    pincode = models.CharField(max_length=10, blank=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    is_verified = models.BooleanField(default=False)
    # Location fields for geo-targeting
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Authority-specific fields
    badge_number = models.CharField(max_length=50, blank=True)  # for police
    station_name = models.CharField(max_length=200, blank=True)  # police station

    # Farmer-specific fields
    farm_location = models.CharField(max_length=300, blank=True)
    farm_size_acres = models.FloatField(null=True, blank=True)

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def full_name(self):
        return self.get_full_name() or self.username