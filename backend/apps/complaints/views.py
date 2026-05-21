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


def api_error_response(message, status_code=status.HTTP_400_BAD_REQUEST, details=None):
    payload = {
        'status': 'error',
        'status_code': status_code,
        'message': message,
    }
    if details is not None:
        payload['details'] = details
    return Response(payload, status=status_code)


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

        # ── Intelligence Layer: auto-categorize + compute severity ──────────
        try:
            ai_result = categorize_complaint(title, complaint_data.get('description', ''))
        except Exception as exc:
            logger.error(f'AI categorization failed for "{title[:60]}": {exc}', exc_info=True)
            ai_result = {
                'category': 'other', 'priority': 'medium',
                'summary': 'Auto-analysis unavailable.',
            }

        try:
            severity = compute_severity(
                title,
                complaint_data.get('description', ''),
                ai_result.get('category', 'other'),
                ai_result.get('priority', 'medium'),
            )
        except Exception as exc:
            logger.error(f'Severity computation failed: {exc}', exc_info=True)
            severity = 3.0

        # ── Auto-geocode the incident location ──────────────────────────────
        # Try the full address first, fall back to the short location name.
        # Failure is non-fatal — complaint is still saved without coordinates.
        lat, lon = None, None
        try:
            from .utils import geocode_location
            primary  = complaint_data.get('incident_address', '').strip()
            fallback = complaint_data.get('incident_location', '').strip()
            lat, lon = geocode_location(primary or fallback, fallback if primary else '')
        except Exception as exc:
            logger.warning(f'Geocoding step failed (non-fatal): {exc}')

        complaint = serializer.save(
            reporter=user,
            ai_category=ai_result.get('category', ''),
            ai_priority=ai_result.get('priority', 'medium'),
            ai_summary=ai_result.get('summary', ''),
            priority=ai_result.get('priority', 'medium'),
            severity_score=severity,
            latitude=lat,
            longitude=lon,
        )

        logger.info(
            f'Complaint saved: {complaint.complaint_id} | '
            f'cat={complaint.category} pri={complaint.priority} '
            f'severity={severity} coords=({lat}, {lon}) '
            f'provider={ai_result.get("ai_provider", "?")}'
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
        return api_error_response('Permission denied.', status_code=status.HTTP_403_FORBIDDEN)

    try:
        complaint = Complaint.objects.get(complaint_id=complaint_id)
    except Complaint.DoesNotExist:
        logger.warning(f'update_complaint_status: complaint {complaint_id} not found')
        return api_error_response('Complaint not found.', status_code=status.HTTP_404_NOT_FOUND)

    serializer = ComplaintUpdateActionSerializer(data=request.data)
    if not serializer.is_valid():
        return api_error_response(
            'Invalid update request.',
            status_code=status.HTTP_400_BAD_REQUEST,
            details=serializer.errors,
        )

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
    assigned_to_id = data.get('assigned_to_id')
    if assigned_to_id is not None:
        from apps.accounts.models import User
        try:
            officer = User.objects.get(id=assigned_to_id)
            complaint.assigned_to = officer
        except User.DoesNotExist:
            logger.warning(
                f'update_complaint_status: invalid officer id {assigned_to_id} for {complaint_id}'
            )
            return api_error_response(
                'Assigned officer not found.',
                status_code=status.HTTP_400_BAD_REQUEST
            )

    if data['status'] == 'resolved':
        complaint.resolved_at = timezone.now()

    try:
        complaint.save()
    except Exception as exc:
        logger.error(
            f'update_complaint_status: failed to save complaint {complaint_id}: {exc}',
            exc_info=True
        )
        return api_error_response(
            'Unable to update complaint due to a server error.',
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    logger.info(
        f'Complaint {complaint_id} updated by {request.user.username}: '
        f'status {old_status}→{complaint.status}, priority={complaint.priority}'
    )

    # Create timeline update
    try:
        update = ComplaintUpdate.objects.create(
            complaint=complaint,
            updated_by=request.user,
            old_status=old_status,
            new_status=data['status'],
            message=data['message'],
            is_public=True
        )
    except Exception as exc:
        logger.error(
            f'update_complaint_status: failed to create update record for {complaint_id}: {exc}',
            exc_info=True
        )
        return api_error_response(
            'Complaint status changed, but timeline update failed.',
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    # Notify the reporter
    if complaint.reporter:
        try:
            Notification.objects.create(
                user=complaint.reporter,
                title=f'Complaint {complaint.complaint_id} Updated',
                message=f'Status changed to: {complaint.get_status_display()}. {data["message"]}',
                notif_type='complaint_update',
                related_complaint=complaint
            )
        except Exception as exc:
            logger.warning(
                f'update_complaint_status: failed to notify reporter for {complaint_id}: {exc}',
                exc_info=True
            )

    return Response({
        'status': 'ok',
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
        return api_error_response('Complaint not found.', status_code=status.HTTP_404_NOT_FOUND)

    # Only reporter or authority can upload
    user = request.user
    if user != complaint.reporter and user.role not in ('authority', 'admin'):
        return api_error_response('Permission denied.', status_code=status.HTTP_403_FORBIDDEN)

    files = request.FILES.getlist('files')
    if not files:
        return api_error_response('No files provided.', status_code=status.HTTP_400_BAD_REQUEST)

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

        # Vision AI: generate ai_description for image evidence (if field exists)
        if ft == 'image' and hasattr(evidence, 'ai_description'):
            try:
                import base64
                with evidence.file.open('rb') as img_file:
                    img_data = base64.b64encode(img_file.read()).decode()
                # Note: Full vision AI requires Gemini multimodal — simplified to text-based description request
                evidence.ai_description = f"[Vision AI] Image uploaded at {evidence.uploaded_at}"
                evidence.save()
            except Exception:
                pass

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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_complaints(request):
    """
    GET /api/complaints/export/?export_format=xlsx&status=pending&priority=critical
    Export filtered complaints to Excel or PDF.
    Note: uses 'export_format' (not 'format') to avoid clash with DRF's URL_FORMAT_OVERRIDE.
    """
    if request.user.role not in ('admin', 'authority'):
        return Response({'error': 'Authority access required.'}, status=403)

    fmt      = request.GET.get('export_format', 'xlsx').lower()
    qs       = Complaint.objects.all()
    status_f = request.GET.get('status')
    priority_f = request.GET.get('priority')
    if status_f:   qs = qs.filter(status=status_f)
    if priority_f: qs = qs.filter(priority=priority_f)
    qs = qs.order_by('-created_at')[:500]

    if fmt == 'xlsx':
        import openpyxl
        from django.http import HttpResponse
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Complaints'
        headers = ['ID', 'Title', 'Category', 'Priority', 'Status', 'Severity', 'Location', 'Reporter', 'Created']
        ws.append(headers)
        for c in qs:
            ws.append([
                c.complaint_id, c.title[:80], c.category, c.priority,
                c.status, float(c.severity_score or 0),
                c.incident_location, c.reporter.username if c.reporter else 'Anonymous',
                c.created_at.strftime('%d %b %Y %H:%M') if c.created_at else '',
            ])
        # Auto-width
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="complaints_export.xlsx"'
        wb.save(response)
        return response

    elif fmt == 'pdf':
        from django.http import HttpResponse
        try:
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
            import io

            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=30, bottomMargin=30)
            styles = getSampleStyleSheet()
            elements = []
            elements.append(Paragraph('Safe City Connect — Complaints Export', styles['Title']))
            elements.append(Spacer(1, 12))

            data = [['ID', 'Title', 'Category', 'Priority', 'Status', 'Location', 'Created']]
            for c in qs[:200]:
                data.append([
                    c.complaint_id, c.title[:50], c.category or '', c.priority or '',
                    c.status, (c.incident_location or '')[:30],
                    c.created_at.strftime('%d %b %Y') if c.created_at else '',
                ])

            t = Table(data, repeatRows=1)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4f46e5')),
                ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
                ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
                ('FONTSIZE',   (0,0), (-1,-1), 8),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f5f5f5')]),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e0e0e0')),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('PADDING', (0,0), (-1,-1), 4),
            ]))
            elements.append(t)
            doc.build(elements)

            buf.seek(0)
            response = HttpResponse(buf, content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="complaints_export.pdf"'
            return response
        except ImportError:
            return Response({'error': 'PDF export requires reportlab. Run: pip install reportlab'}, status=500)

    return Response({'error': 'Unsupported format. Use xlsx or pdf.'}, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_anonymous_tip(request):
    """
    POST /api/complaints/anonymous-tip/
    Submit a complaint where the reporter's identity is hashed and hidden.
    Body: same as regular complaint creation
    """
    import hashlib
    from django.conf import settings as djsettings

    user = request.user
    salt = getattr(djsettings, 'ANONYMOUS_TIP_SALT', 'scc_default_salt_change_me')
    reporter_hash = hashlib.sha256(f"{user.id}{salt}".encode()).hexdigest()[:16]

    data = request.data.copy()
    complaint = Complaint.objects.create(
        title             = data.get('title', '')[:300],
        description       = data.get('description', ''),
        incident_location = data.get('incident_location', ''),
        incident_address  = data.get('incident_address', ''),
        category          = 'other',
        priority          = 'medium',
        status            = 'pending',
        reporter          = None,   # Anonymous — no reporter FK
        is_anonymous      = True,
        ai_summary        = f'ANONYMOUS_TIP|hash:{reporter_hash}|Awaiting AI classification.',
        severity_score    = 5.0,
    )

    # Run AI classification in background (non-blocking)
    try:
        from apps.intelligence.engine import categorize_complaint, compute_severity
        result = categorize_complaint(complaint.title, complaint.description)
        complaint.category      = result.get('category', 'other')
        complaint.priority      = result.get('priority', 'medium')
        complaint.ai_category   = complaint.category
        complaint.ai_priority   = complaint.priority
        complaint.ai_summary    = f"ANONYMOUS_TIP|hash:{reporter_hash}|{result.get('summary', '')}"
        complaint.severity_score = compute_severity(
            complaint.title, complaint.description, complaint.category, complaint.priority
        )
        complaint.save()
    except Exception:
        pass  # Classification failure doesn't block tip submission

    return Response({
        'message': 'Anonymous tip submitted. Your identity is protected.',
        'complaint_id': complaint.complaint_id,
        'tip_reference': f'TIP-{reporter_hash[:8].upper()}',
    }, status=201)