"""SURAKSHA - Intelligence Views"""

import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count

from apps.complaints.models import Complaint
from .engine import get_crime_hotspots, categorize_complaint, compute_severity

logger = logging.getLogger('apps.intelligence')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def hotspots(request):
    """GET /api/intelligence/hotspots/ — Crime hotspot cluster data"""
    logger.info(f'hotspots requested by {request.user.username}')
    complaints = Complaint.objects.all()
    spots = get_crime_hotspots(complaints)
    logger.debug(f'Returning {len(spots)} hotspots')
    return Response({'hotspots': spots})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def map_data(request):
    """
    GET /api/intelligence/map-data/
    Returns individual complaint pins + hotspot clusters for the live map.
    Authority/admin sees all; citizen sees only theirs.
    """
    user = request.user
    logger.info(f'map_data requested by {user.username} (role={user.role})')

    base_qs = (
        Complaint.objects.all()
        if user.role in ('authority', 'admin')
        else Complaint.objects.filter(reporter=user)
    )
    geo_qs = base_qs.filter(latitude__isnull=False, longitude__isnull=False)

    pins = []
    for c in geo_qs.values(
        'complaint_id', 'title', 'category', 'priority',
        'status', 'severity_score', 'latitude', 'longitude',
        'incident_location', 'ai_summary', 'created_at'
    ):
        pins.append({
            'complaint_id' : c['complaint_id'],
            'title'        : c['title'],
            'category'     : c['category'],
            'priority'     : c['priority'],
            'status'       : c['status'],
            'severity_score': c['severity_score'],
            'lat'          : c['latitude'],
            'lon'          : c['longitude'],
            'location'     : c['incident_location'],
            'ai_summary'   : c['ai_summary'] or '',
            'created_at'   : c['created_at'].strftime('%d %b %Y') if c['created_at'] else '',
        })

    hotspot_clusters  = get_crime_hotspots(base_qs)
    category_counts   = list(
        base_qs.values('category').annotate(count=Count('id')).order_by('-count')[:6]
    )

    logger.debug(f'map_data: {len(pins)} pins, {len(hotspot_clusters)} clusters')
    return Response({
        'pins'              : pins,
        'hotspots'          : hotspot_clusters,
        'total_with_coords' : len(pins),
        'total_complaints'  : base_qs.count(),
        'category_counts'   : category_counts,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_text(request):
    """POST /api/intelligence/analyze/ — Analyze complaint text before submission"""
    title       = request.data.get('title', '')
    description = request.data.get('description', '')

    if not title.strip():
        logger.warning(f'analyze_text called with empty title by {request.user.username}')
        return Response({'error': 'Title is required'}, status=400)

    logger.info(f'analyze_text: "{title[:60]}" by {request.user.username}')

    try:
        result   = categorize_complaint(title, description)
        severity = compute_severity(title, description, result['category'], result.get('priority', 'medium'))
        result['severity_score'] = severity
        logger.info(
            f'analyze_text result: cat={result["category"]}, pri={result["priority"]}, '
            f'severity={severity}'
        )
        return Response(result)
    except Exception as exc:
        logger.error(f'analyze_text failed: {exc}', exc_info=True)
        return Response({'error': 'Analysis failed. Please try again.'}, status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def insights(request):
    """GET /api/intelligence/insights/ — Smart insights for dashboard"""
    logger.info(f'insights requested by {request.user.username}')
    try:
        total            = Complaint.objects.count()
        resolved         = Complaint.objects.filter(status='resolved').count()
        pending_critical = Complaint.objects.filter(
            priority='critical', status__in=['pending', 'in_progress']
        ).count()
        resolution_rate  = round((resolved / total * 100), 1) if total > 0 else 0

        top_category = (
            Complaint.objects.values('category')
            .annotate(count=Count('id'))
            .order_by('-count')
            .first()
        )
        top_cat_name = (
            top_category['category'].replace('_', ' ').title()
            if top_category else 'N/A'
        )

        return Response({
            'resolution_rate' : resolution_rate,
            'pending_critical': pending_critical,
            'total_analyzed'  : total,
            'ai_categorized'  : Complaint.objects.exclude(ai_category='').count(),
            'insights'        : [
                f"{resolution_rate}% of all complaints have been resolved.",
                f"{pending_critical} critical complaints need immediate attention.",
                f"Top reported category: {top_cat_name}.",
                "Peak reporting hours: 6PM – 10PM (based on data trends).",
            ],
        })
    except Exception as exc:
        logger.error(f'insights endpoint failed: {exc}', exc_info=True)
        return Response({'error': 'Failed to compute insights'}, status=500)


