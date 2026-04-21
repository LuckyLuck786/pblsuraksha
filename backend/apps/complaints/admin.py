from django.contrib import admin
from .models import Complaint, ComplaintEvidence, ComplaintUpdate, Notification

@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ['complaint_id', 'title', 'category', 'status', 'priority', 'severity_score', 'reporter', 'created_at']
    list_filter = ['status', 'priority', 'category']
    search_fields = ['complaint_id', 'title', 'description', 'reporter__username']
    readonly_fields = ['complaint_id', 'created_at', 'updated_at', 'ai_category', 'ai_priority', 'ai_summary', 'severity_score']

@admin.register(ComplaintEvidence)
class EvidenceAdmin(admin.ModelAdmin):
    list_display = ['complaint', 'file_type', 'uploaded_by', 'uploaded_at']

@admin.register(ComplaintUpdate)
class ComplaintUpdateAdmin(admin.ModelAdmin):
    list_display = ['complaint', 'updated_by', 'old_status', 'new_status', 'created_at']

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['user', 'title', 'notif_type', 'is_read', 'created_at']