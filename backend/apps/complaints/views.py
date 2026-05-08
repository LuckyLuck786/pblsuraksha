"""
SURAKSHA - Complaints Views
Django REST Framework views for complaint management
Handles file uploads, status updates, and notifications
Module 1-3: Views, URL mapping, validation logic
"""

from rest_framework import status, generics, filters
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils import timezone
from django.db.models import Count, Q

import logging

from .models import Complaint, ComplaintEvidence, ComplaintUpdate, Notification
from .serializers import (
    ComplaintListSerializer, ComplaintDetailSerializer,
    ComplaintCreateSerializer, ComplaintUpdateActionSerializer,
    ComplaintEvidenceSerializer, NotificationSerializer
)
from apps.intelligence.engine import categorize_complaint, compute_severity

logger = logging.getLogger('apps.complaints')


class ComplaintListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/complaints/         - List complaints (filtered by role)
    POST /api/complaints/         - Submit a new complaint
    """
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description', 'incident_location', 'complaint_id']
    ordering_fields = ['created_at', 'priority', 'severity_score', 'status']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ComplaintCreateSerializer
        return ComplaintListSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Complaint.objects.select_related('reporter', 'assigned_to')

        # Role-based filtering
        if user.role in ('authority', 'admin'):
            qs = qs.all()
        elif user.role == 'citizen':
            qs = qs.filter(reporter=user)
        else:
            qs = qs.filter(reporter=user)

        # Query param filters
        status_filter = self.request.query_params.get('status')
        priority_filter = self.request.query_params.get('priority')
        category_filter = self.request.query_params.get('category')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if priority_filter:
            qs = qs.filter(priority=priority_filter)
        if category_filter:
            qs = qs.filter(category=category_filter)

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        complaint_data = serializer.validated_data
        title = complaint_data.get('title', '')

        logger.info(f'New complaint submission by {user.username}: "{title[:60]}"')

        # ── Intelligence Layer: auto-categorize, RAG-validate, compute severity ──
        try:
            ai_result = categorize_complaint(title, complaint_data.get('description', ''))
        except Exception as exc:
            logger.error(f'AI categorization failed for "{title[:60]}": {exc}', exc_info=True)
            ai_result = {
                'category': 'other', 'priority': 'medium',
                'summary': 'Auto-analysis unavailable.',
                'rag_validated': False, 'rag_corrected': False,
            }

        try:
            severity = compute_severity(title, complaint_data.get('description', ''), ai_result.get('category', 'other'))
        except Exception as exc:
            logger.error(f'Severity computation failed: {exc}', exc_info=True)
            severity = 3.0

        complaint = serializer.save(
            reporter=user,
            ai_category=ai_result.get('category', ''),
            ai_priority=ai_result.get('priority', 'medium'),
            ai_summary=ai_result.get('summary', ''),
            priority=ai_result.get('priority', 'medium'),
            severity_score=severity,
            rag_validated=ai_result.get('rag_validated', False),
            rag_corrected=ai_result.get('rag_corrected', False),
        )

        logger.info(
            f'Complaint saved: {complaint.complaint_id} | '
            f'cat={complaint.category} pri={complaint.priority} '
            f'severity={severity} rag_validated={complaint.rag_validated} '
            f'rag_corrected={complaint.rag_corrected} provider={ai_result.get("ai_provider", "?")}'
        )

        # Create initial update entry
        ComplaintUpdate.objects.create(
            complaint=complaint,
            updated_by=user,
            new_status='pending',
            message='Complaint submitted successfully. Your report is under review.',
            is_public=True
        )

        # Notify authorities
        from apps.accounts.models import User
        authorities = User.objects.filter(role__in=['authority', 'admin'])
        for auth in authorities:
            Notification.objects.create(
                user=auth,
                title=f'New {complaint.priority.upper()} priority complaint',
                message=f'[{complaint.complaint_id}] {complaint.title}',
                notif_type='complaint_update',
                related_complaint=complaint
            )

        return complaint

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        complaint = self.perform_create(serializer)
        return Response(
            ComplaintDetailSerializer(complaint, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )


class ComplaintDetailView(generics.RetrieveAPIView):
    """
    GET /api/complaints/<id>/ - Full complaint detail with evidence & timeline
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ComplaintDetailSerializer
    lookup_field = 'complaint_id'

    def get_queryset(self):
        user = self.request.user
        qs = Complaint.objects.select_related('reporter', 'assigned_to').prefetch_related('evidence', 'updates')
        if user.role in ('authority', 'admin'):
            return qs
        return qs.filter(reporter=user)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_complaint_status(request, complaint_id):
    """
    POST /api/complaints/<complaint_id>/update/
    Authority updates the status of a complaint
    """
    if request.user.role not in ('authority', 'admin'):
        logger.warning(f'update_complaint_status: unauthorised by {request.user.username} on {complaint_id}')
        return Response({'error': 'Permission denied.'}, status=403)

    try:
        complaint = Complaint.objects.get(complaint_id=complaint_id)
    except Complaint.DoesNotExist:
        logger.warning(f'update_complaint_status: complaint {complaint_id} not found')
        return Response({'error': 'Complaint not found.'}, status=404)

    serializer = ComplaintUpdateActionSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    data = serializer.validated_data
    old_status = complaint.status

    # Update complaint
    complaint.status = data['status']
    if 'priority' in data:
        complaint.priority = data['priority']
    if 'authority_notes' in data:
        complaint.authority_notes = data['authority_notes']
    if 'resolution_details' in data:
        complaint.resolution_details = data['resolution_details']
    if data.get('assigned_to_id'):
        from apps.accounts.models import User
        try:
            officer = User.objects.get(id=data['assigned_to_id'])
            complaint.assigned_to = officer
        except User.DoesNotExist:
            pass
    if data['status'] == 'resolved':
        complaint.resolved_at = timezone.now()

    complaint.save()
    logger.info(
        f'Complaint {complaint_id} updated by {request.user.username}: '
        f'status {old_status}→{complaint.status}, priority={complaint.priority}'
    )

    # Create timeline update
    update = ComplaintUpdate.objects.create(
        complaint=complaint,
        updated_by=request.user,
        old_status=old_status,
        new_status=data['status'],
        message=data['message'],
        is_public=True
    )

    # Notify the reporter
    if complaint.reporter:
        Notification.objects.create(
            user=complaint.reporter,
            title=f'Complaint {complaint.complaint_id} Updated',
            message=f'Status changed to: {complaint.get_status_display()}. {data["message"]}',
            notif_type='complaint_update',
            related_complaint=complaint
        )

    return Response({
        'message': 'Complaint updated successfully.',
        'complaint': ComplaintDetailSerializer(complaint, context={'request': request}).data
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_evidence(request, complaint_id):
    """
    POST /api/complaints/<complaint_id>/evidence/
    Upload evidence files (images, videos, audio, documents)
    Module 3: File upload handling
    """
    try:
        complaint = Complaint.objects.get(complaint_id=complaint_id)
    except Complaint.DoesNotExist:
        return Response({'error': 'Complaint not found.'}, status=404)

    # Only reporter or authority can upload
    user = request.user
    if user != complaint.reporter and user.role not in ('authority', 'admin'):
        return Response({'error': 'Permission denied.'}, status=403)

    files = request.FILES.getlist('files')
    if not files:
        return Response({'error': 'No files provided.'}, status=400)

    ALLOWED_TYPES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/quicktime', 'video/webm',
        'audio/mpeg', 'audio/wav', 'audio/ogg',
        'application/pdf',
    ]

    uploaded = []
    for f in files:
        if f.content_type not in ALLOWED_TYPES:
            continue
        # Determine file type
        ft = 'image'
        if f.content_type.startswith('video'):
            ft = 'video'
        elif f.content_type.startswith('audio'):
            ft = 'audio'
        elif f.content_type == 'application/pdf':
            ft = 'document'

        evidence = ComplaintEvidence.objects.create(
            complaint=complaint,
            file=f,
            file_type=ft,
            description=request.data.get('description', ''),
            uploaded_by=user
        )
        uploaded.append(ComplaintEvidenceSerializer(evidence, context={'request': request}).data)

    return Response({'uploaded': uploaded, 'count': len(uploaded)}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def analytics(request):
    """
    GET /api/complaints/analytics/
    Aggregated data for charts and dashboards
    """
    # Category breakdown
    by_category = list(
        Complaint.objects.values('category')
        .annotate(count=Count('id'))
        .order_by('-count')
    )

    # Status breakdown
    by_status = list(
        Complaint.objects.values('status')
        .annotate(count=Count('id'))
    )

    # Priority breakdown
    by_priority = list(
        Complaint.objects.values('priority')
        .annotate(count=Count('id'))
    )

    # Monthly trend (last 6 months)
    from django.db.models.functions import TruncMonth
    monthly = list(
        Complaint.objects
        .annotate(month=TruncMonth('created_at'))
        .values('month')
        .annotate(count=Count('id'))
        .order_by('month')[:6]
    )
    monthly_formatted = [
        {'month': m['month'].strftime('%b %Y'), 'count': m['count']}
        for m in monthly if m['month']
    ]

    # High-priority unresolved
    urgent = Complaint.objects.filter(
        priority__in=['high', 'critical'],
        status__in=['pending', 'acknowledged', 'in_progress']
    ).count()

    return Response({
        'by_category': by_category,
        'by_status': by_status,
        'by_priority': by_priority,
        'monthly_trend': monthly_formatted,
        'urgent_count': urgent,
        'total': Complaint.objects.count(),
        'resolved': Complaint.objects.filter(status='resolved').count(),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    """GET /api/complaints/notifications/ - User's notifications"""
    notifs = Notification.objects.filter(user=request.user)[:30]
    unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
    return Response({
        'notifications': NotificationSerializer(notifs, many=True).data,
        'unread_count': unread_count,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_notifications_read(request):
    """POST /api/complaints/notifications/read/ - Mark all as read"""
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return Response({'message': 'All notifications marked as read.'})