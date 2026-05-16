"""
SURAKSHA - Accounts Views
Django REST Framework views for auth & user management
Django Views (Module 1-2) - handles HTTP requests and responses
"""

from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate

from .models import User
from .serializers import (
    UserSerializer, RegisterSerializer,
    LoginSerializer, ProfileUpdateSerializer
)


def get_tokens_for_user(user):
    """Generate JWT tokens for a user."""
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """
    POST /api/auth/register/
    Register a new user (citizen or authority)
    """
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        tokens = get_tokens_for_user(user)
        return Response({
            'message': 'Registration successful. Welcome to SURAKSHA!',
            'user': UserSerializer(user).data,
            'tokens': tokens,
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """
    POST /api/auth/login/
    Authenticate user and return JWT tokens
    """
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data['user']
        tokens = get_tokens_for_user(user)
        return Response({
            'message': f'Welcome back, {user.full_name}!',
            'user': UserSerializer(user).data,
            'tokens': tokens,
        })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def token_refresh(request):
    """
    POST /api/auth/token/refresh/
    Refresh JWT access token
    """
    refresh_token = request.data.get('refresh')
    if not refresh_token:
        return Response({'error': 'Refresh token required.'}, status=400)
    try:
        refresh = RefreshToken(refresh_token)
        return Response({'access': str(refresh.access_token)})
    except Exception:
        return Response({'error': 'Invalid refresh token.'}, status=401)


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def profile(request):
    """
    GET  /api/auth/profile/ - Get current user profile
    PUT  /api/auth/profile/ - Update profile
    """
    user = request.user
    if request.method == 'GET':
        return Response(UserSerializer(user).data)

    serializer = ProfileUpdateSerializer(user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response({
            'message': 'Profile updated successfully.',
            'user': UserSerializer(user).data,
        })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """
    GET /api/auth/dashboard-stats/
    Returns personalized stats for the logged-in user
    """
    from apps.complaints.models import Complaint

    user = request.user

    if user.role in ('authority', 'admin'):
        # Admin/authority sees all stats
        total_complaints = Complaint.objects.count()
        pending = Complaint.objects.filter(status='pending').count()
        in_progress = Complaint.objects.filter(status='in_progress').count()
        resolved = Complaint.objects.filter(status='resolved').count()
        high_priority = Complaint.objects.filter(priority='high').count()
        critical_priority = Complaint.objects.filter(priority='critical').count()

        return Response({
            'role': user.role,
            'total_complaints': total_complaints,
            'pending': pending,
            'in_progress': in_progress,
            'resolved': resolved,
            'high_priority': high_priority,
            'critical_priority': critical_priority,
        })
    else:
        # Citizen
        my_complaints = Complaint.objects.filter(reporter=user)
        return Response({
            'role': user.role,
            'total_reports': my_complaints.count(),
            'pending': my_complaints.filter(status='pending').count(),
            'in_progress': my_complaints.filter(status='in_progress').count(),
            'resolved': my_complaints.filter(status='resolved').count(),
        })


class UserListView(generics.ListAPIView):
    """GET /api/auth/users/ - List users (admin only)"""
    serializer_class = UserSerializer
    queryset = User.objects.all()

    def get_permissions(self):
        from rest_framework.permissions import IsAdminUser
        return [IsAdminUser()]