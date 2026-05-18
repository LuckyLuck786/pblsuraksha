"""
SURAKSHA - Complaints Models
Core data models for the public safety complaint system
Django Models (Module 2) - configuring database, MVT pattern
"""

from django.db import models
from django.conf import settings


class Complaint(models.Model):
    """Main complaint/incident report model."""

    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('acknowledged', 'Acknowledged'),
        ('in_progress', 'In Progress'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
        ('rejected', 'Rejected'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]

    CATEGORY_CHOICES = [
        ('theft', 'Theft / Robbery'),
        ('assault', 'Assault / Violence'),
        ('harassment', 'Harassment'),
        ('traffic', 'Traffic Incident'),
        ('fraud', 'Fraud / Scam'),
        ('cybercrime', 'Cybercrime'),
        ('domestic', 'Domestic Issues'),
        ('missing_person', 'Missing Person'),
        ('drug_activity', 'Drug Activity'),
        ('vandalism', 'Vandalism / Damage'),
        ('noise', 'Noise Complaint'),
        ('other', 'Other'),
    ]

    # Core fields
    complaint_id = models.CharField(max_length=20, unique=True, blank=True)
    title = models.CharField(max_length=300)
    description = models.TextField()
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='other')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')

    # People involved
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True,
        related_name='filed_complaints'
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_complaints'
    )

    # Location
    incident_location = models.CharField(max_length=500)
    incident_address = models.TextField(blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    nearest_police_station = models.CharField(max_length=300, blank=True)

    # AI-generated fields (Intelligence Layer)
    ai_category    = models.CharField(max_length=50, blank=True)
    ai_priority    = models.CharField(max_length=20, blank=True)
    ai_summary     = models.TextField(blank=True)
    severity_score = models.FloatField(default=0.0)   # 0–10 AI-computed score

    # Incident timing
    incident_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    # Authority notes
    authority_notes = models.TextField(blank=True)
    resolution_details = models.TextField(blank=True)

    # Anonymous reporting option
    is_anonymous = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Complaint'
        verbose_name_plural = 'Complaints'
        indexes = [
            models.Index(fields=['status', 'priority']),
            models.Index(fields=['category']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"[{self.complaint_id}] {self.title} - {self.status}"

    def save(self, *args, **kwargs):
        # Auto-generate complaint ID
        if not self.complaint_id:
            import random
            import string
            prefix = 'SRK'
            suffix = ''.join(random.choices(string.digits, k=7))
            self.complaint_id = f"{prefix}{suffix}"
        super().save(*args, **kwargs)


class ComplaintEvidence(models.Model):
    """Evidence files attached to a complaint (photos, videos, documents)."""

    FILE_TYPE_CHOICES = [
        ('image', 'Image'),
        ('video', 'Video'),
        ('audio', 'Audio'),
        ('document', 'Document'),
        ('other', 'Other'),
    ]

    complaint = models.ForeignKey(
        Complaint, on_delete=models.CASCADE, related_name='evidence'
    )
    file = models.FileField(upload_to='evidence/%Y/%m/%d/')
    file_type = models.CharField(max_length=20, choices=FILE_TYPE_CHOICES, default='image')
    description = models.CharField(max_length=300, blank=True)
    # AI-generated description from Gemini Vision (set after image upload)
    ai_description = models.TextField(blank=True, default='')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return f"Evidence for {self.complaint.complaint_id} - {self.file_type}"


class ComplaintUpdate(models.Model):
    """Timeline of status updates for a complaint."""

    complaint = models.ForeignKey(
        Complaint, on_delete=models.CASCADE, related_name='updates'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    old_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20, blank=True)
    message = models.TextField()
    is_public = models.BooleanField(default=True)  # visible to citizen?
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Update on {self.complaint.complaint_id} at {self.created_at}"


class Notification(models.Model):
    """In-app notifications for users."""

    NOTIF_TYPE_CHOICES = [
        ('complaint_update', 'Complaint Update'),
        ('new_assignment', 'New Assignment'),
        ('system', 'System Notification'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications'
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    notif_type = models.CharField(max_length=30, choices=NOTIF_TYPE_CHOICES)
    is_read = models.BooleanField(default=False)
    related_complaint = models.ForeignKey(
        Complaint, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Notification for {self.user.username}: {self.title}"