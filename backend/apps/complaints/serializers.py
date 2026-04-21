"""
SURAKSHA - Complaints Serializers
Django REST Framework serializers - validation logic (Module 3)
"""

from rest_framework import serializers
from .models import Complaint, ComplaintEvidence, ComplaintUpdate, Notification
from apps.accounts.serializers import UserSerializer


class ComplaintEvidenceSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ComplaintEvidence
        fields = ['id', 'file', 'file_url', 'file_type', 'description', 'uploaded_at']
        read_only_fields = ['uploaded_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class ComplaintUpdateSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ComplaintUpdate
        fields = ['id', 'updated_by_name', 'old_status', 'new_status', 'message', 'is_public', 'created_at']

    def get_updated_by_name(self, obj):
        if obj.updated_by:
            return obj.updated_by.full_name
        return 'System'


class ComplaintListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    reporter_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    evidence_count = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = [
            'id', 'complaint_id', 'title', 'category', 'status', 'priority',
            'severity_score', 'incident_location', 'latitude', 'longitude',
            'reporter_name', 'assigned_to_name', 'evidence_count',
            'is_anonymous', 'created_at', 'updated_at',
        ]

    def get_reporter_name(self, obj):
        if obj.is_anonymous:
            return 'Anonymous'
        return obj.reporter.full_name if obj.reporter else 'Unknown'

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.full_name if obj.assigned_to else None

    def get_evidence_count(self, obj):
        return obj.evidence.count()


class ComplaintDetailSerializer(serializers.ModelSerializer):
    """Full serializer with nested evidence and updates."""
    reporter = UserSerializer(read_only=True)
    assigned_to = UserSerializer(read_only=True)
    evidence = ComplaintEvidenceSerializer(many=True, read_only=True)
    updates = ComplaintUpdateSerializer(many=True, read_only=True)
    reporter_name = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = '__all__'

    def get_reporter_name(self, obj):
        if obj.is_anonymous:
            return 'Anonymous'
        return obj.reporter.full_name if obj.reporter else 'Unknown'


class ComplaintCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new complaint. Includes validation logic (Module 3)."""

    class Meta:
        model = Complaint
        fields = [
            'title', 'description', 'category', 'incident_location',
            'incident_address', 'latitude', 'longitude',
            'incident_date', 'is_anonymous',
        ]

    def validate_title(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError('Title must be at least 10 characters.')
        return value.strip()

    def validate_description(self, value):
        if len(value.strip()) < 30:
            raise serializers.ValidationError('Description must be at least 30 characters.')
        return value.strip()

    def validate_incident_location(self, value):
        if not value.strip():
            raise serializers.ValidationError('Incident location is required.')
        return value.strip()


class ComplaintUpdateActionSerializer(serializers.Serializer):
    """For authority to update complaint status."""
    status = serializers.ChoiceField(choices=Complaint.STATUS_CHOICES)
    priority = serializers.ChoiceField(choices=Complaint.PRIORITY_CHOICES, required=False)
    message = serializers.CharField(min_length=5)
    assigned_to_id = serializers.IntegerField(required=False, allow_null=True)
    authority_notes = serializers.CharField(required=False, allow_blank=True)
    resolution_details = serializers.CharField(required=False, allow_blank=True)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'notif_type', 'is_read', 'related_complaint', 'created_at']