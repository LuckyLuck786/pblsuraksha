"""
Safe City Connect — Accounts Models

User        — custom AbstractUser with role-based access (citizen / authority / admin).
              phone is unique and nullable (NULL for users without a verified number).
              is_active (Django built-in) drives block/unblock in admin management.

OtpVerification   — 6-digit SMS OTP records with 10-minute expiry.
                    user FK is nullable to support pre-registration OTPs (phone
                    verified before the account is created).

EmailVerification — 64-char URL token for email address confirmation, 24-hour expiry.
"""

import secrets
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models
from django.utils import timezone
from datetime import timedelta


class User(AbstractUser):
    """
    Extended user model.  Django's built-in is_active flag is reused for
    admin block/unblock — setting it False prevents login immediately.
    """

    ROLE_CHOICES = [
        ('citizen', 'Citizen'),
        ('authority', 'Authority / Police'),
        ('admin', 'System Admin'),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='citizen')
    phone = models.CharField(max_length=15, blank=True, unique=True, null=True)
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

    # Verification fields
    phone_verified = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=False)
    # Anonymous tip identity shielding
    is_anonymous_reporter = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def full_name(self):
        return self.get_full_name() or self.username


# ---------------------------------------------------------------------------
# OTP / Email verification models
# ---------------------------------------------------------------------------

class OtpVerification(models.Model):
    """Stores phone OTP codes with 10-minute expiry."""

    PURPOSE_CHOICES = [
        ('phone_verify', 'Phone Verification'),
        ('login',        'Login OTP'),
    ]

    # user is NULL for pre-registration OTP (phone not yet tied to an account)
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='otps', null=True, blank=True)
    phone      = models.CharField(max_length=20)
    otp_code   = models.CharField(max_length=6)
    purpose    = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default='phone_verify')
    is_used    = models.BooleanField(default=False)
    attempts   = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.pk:
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"OTP for {self.phone} ({self.purpose})"


class EmailVerification(models.Model):
    """Stores email verification tokens with 24-hour expiry."""

    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='email_verifications')
    token      = models.CharField(max_length=64, unique=True)
    is_used    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.pk:
            self.token      = secrets.token_urlsafe(48)
            self.expires_at = timezone.now() + timedelta(hours=24)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"EmailVerification for {self.user.username}"