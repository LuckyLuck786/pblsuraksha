"""
SURAKSHA - Transport Views
Intelligent farmer transport routing system
Module 4: jQuery AJAX / JSON responses for route data
"""

import math
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import TransportRequest, StorageFacility
from .serializers import (
    TransportRequestSerializer, TransportRequestCreateSerializer,
    StorageFacilitySerializer
)
from apps.intelligence.engine import suggest_route


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two GPS coordinates in km."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class TransportRequestListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/transport/          - List transport requests
    POST /api/transport/          - Create a new transport request
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TransportRequestCreateSerializer
        return TransportRequestSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role in ('authority', 'admin'):
            return TransportRequest.objects.all()
        return TransportRequest.objects.filter(farmer=user)

    def perform_create(self, serializer):
        data = serializer.validated_data

        # Find nearby facilities
        facilities = StorageFacility.objects.filter(is_active=True)
        if data.get('requires_cold_storage'):
            facilities = facilities.filter(facility_type='cold_storage')
        if data.get('preferred_destination_type'):
            facilities = facilities.filter(facility_type=data['preferred_destination_type'])

        # Pick closest facility
        best_facility = None
        best_distance = float('inf')
        for f in facilities:
            d = haversine_distance(
                data['pickup_latitude'], data['pickup_longitude'],
                f.latitude, f.longitude
            )
            if d < best_distance:
                best_distance = d
                best_facility = f

        # Generate route suggestion
        route_data = suggest_route(
            data['pickup_latitude'], data['pickup_longitude'],
            best_facility.latitude if best_facility else data['pickup_latitude'],
            best_facility.longitude if best_facility else data['pickup_longitude'],
            data.get('is_perishable', False)
        )

        est_hours = best_distance / 50 if best_distance < float('inf') else 0

        serializer.save(
            farmer=self.request.user,
            destination=best_facility,
            suggested_route=route_data,
            estimated_distance_km=round(best_distance, 2) if best_distance < float('inf') else 0,
            estimated_duration_hours=round(est_hours, 2),
            status='route_suggested',
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = TransportRequest.objects.filter(farmer=request.user).latest('created_at')
        return Response(
            TransportRequestSerializer(instance).data,
            status=status.HTTP_201_CREATED
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def nearby_facilities(request):
    """
    GET /api/transport/facilities/?lat=12.9&lon=77.5&type=cold_storage
    Returns nearby storage/market facilities sorted by distance
    """
    lat = float(request.query_params.get('lat', 12.9716))
    lon = float(request.query_params.get('lon', 77.5946))
    facility_type = request.query_params.get('type', '')
    radius_km = float(request.query_params.get('radius', 100))

    facilities = StorageFacility.objects.filter(is_active=True)
    if facility_type:
        facilities = facilities.filter(facility_type=facility_type)

    result = []
    for f in facilities:
        d = haversine_distance(lat, lon, f.latitude, f.longitude)
        if d <= radius_km:
            data = StorageFacilitySerializer(f).data
            data['distance_km'] = round(d, 2)
            result.append(data)

    result.sort(key=lambda x: x['distance_km'])
    return Response({'facilities': result, 'count': len(result)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_transport(request, request_id):
    """POST /api/transport/<request_id>/confirm/ - Farmer confirms the suggested route"""
    try:
        tr = TransportRequest.objects.get(request_id=request_id, farmer=request.user)
    except TransportRequest.DoesNotExist:
        return Response({'error': 'Transport request not found.'}, status=404)

    if tr.status != 'route_suggested':
        return Response({'error': 'Cannot confirm at this stage.'}, status=400)

    tr.status = 'confirmed'
    tr.save()
    return Response({'message': 'Transport confirmed!', 'request': TransportRequestSerializer(tr).data})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def all_facilities(request):
    """GET /api/transport/facilities/all/ - All facilities for map display"""
    facilities = StorageFacility.objects.filter(is_active=True)
    return Response(StorageFacilitySerializer(facilities, many=True).data)