"""
SURAKSHA - Accounts Serializers
Django REST Framework serializers for user management
"""

from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Full user profile serializer."""
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'phone', 'address', 'city', 'state', 'pincode',
            'avatar', 'is_verified', 'latitude', 'longitude',
            'badge_number', 'station_name', 'farm_location', 'farm_size_acres',
            'created_at', 'date_joined',
        ]
        read_only_fields = ['id', 'created_at', 'date_joined', 'is_verified']


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration."""
    password = serializers.CharField(write_only=True, min_length=6)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'role', 'phone', 'city', 'state',
            'badge_number', 'station_name', 'farm_location',
        ]

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return data

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        # Auto-verify for demo; in production send email verification
        user.is_verified = True
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    """Serializer for login credentials."""
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data['username'], password=data['password'])
        if not user:
            raise serializers.ValidationError('Invalid credentials.')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled.')
        data['user'] = user
        return data


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Serializer for profile updates."""
    class Meta:
        model = User
        fields = [
            'first_name', 'last_name', 'phone', 'address',
            'city', 'state', 'pincode', 'avatar',
            'latitude', 'longitude', 'farm_location', 'farm_size_acres',
        ]