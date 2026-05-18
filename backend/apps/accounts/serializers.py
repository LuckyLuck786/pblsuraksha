"""
Safe City Connect — Accounts Serializers
DRF serializers for user registration, login, profile management, and admin actions.
"""

from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User


class UserSerializer(serializers.ModelSerializer):
    """
    Read-only user profile snapshot returned by /profile/, /users/, and auth endpoints.
    Includes is_active so admin UI can show blocked/active state.
    """
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'phone', 'address', 'city', 'state', 'pincode',
            'avatar', 'is_verified', 'is_active', 'latitude', 'longitude',
            'badge_number', 'station_name',
            'created_at', 'date_joined',
        ]
        read_only_fields = ['id', 'created_at', 'date_joined', 'is_verified', 'is_active']


class RegisterSerializer(serializers.ModelSerializer):
    """
    Handles new-user registration (POST /api/auth/register/).
    Validates passwords match and ensures no duplicate phone/username/email.
    Phone is normalised to E.164 (+91XXXXXXXXXX) before uniqueness check.
    """
    password         = serializers.CharField(write_only=True, min_length=6)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'role', 'phone', 'city', 'state',
            'badge_number', 'station_name',
        ]

    def validate_phone(self, value):
        """Normalise phone to +91XXXXXXXXXX and reject if already registered."""
        if not value:
            return value
        phone = value.strip()
        # Normalise to E.164 (+91XXXXXXXXXX)
        if phone.startswith('0'):
            phone = '+91' + phone[1:]
        elif phone.startswith('91') and not phone.startswith('+'):
            phone = '+' + phone
        elif not phone.startswith('+'):
            phone = '+91' + phone
        # Uniqueness check — phone column has a DB-level unique constraint too
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError(
                'This phone number is already registered. Please log in or use a different number.'
            )
        return phone

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return data

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.is_verified = True   # auto-verified on registration
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    """
    Validates username + password credentials (POST /api/auth/login/).
    Returns authenticated User instance in validated_data['user'].
    Raises ValidationError if credentials are wrong or account is blocked.
    """
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data['username'], password=data['password'])
        if not user:
            raise serializers.ValidationError('Invalid credentials.')
        if not user.is_active:
            raise serializers.ValidationError('This account has been suspended. Contact an administrator.')
        data['user'] = user
        return data


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Partial-update serializer for /api/auth/profile/ (PUT/PATCH).
    Allows citizens and authorities to edit their own contact and location info.
    Phone uniqueness is enforced via the DB unique constraint on the model.
    """
    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone', 'address',
            'city', 'state', 'pincode', 'avatar',
            'latitude', 'longitude',
        ]