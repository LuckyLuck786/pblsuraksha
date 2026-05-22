"""
Safe City Connect — Accounts Views
DRF views covering the full auth lifecycle:
  • register / login / token refresh
  • profile read + update
  • email verification link send + confirm
  • admin user management (block / unblock / delete)

Phone uniqueness is enforced at the serializer level (RegisterSerializer.validate_phone).
No OTP/SMS verification is required — registration completes in 3 steps.
"""

import logging

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

logger = logging.getLogger('apps.accounts')


def get_tokens_for_user(user):
    """Return a fresh JWT access + refresh token pair for the given user."""
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
    Create a new citizen or authority account (3-step flow, no OTP required).
    Phone uniqueness is enforced by RegisterSerializer.validate_phone().
    """
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        tokens = get_tokens_for_user(user)
        return Response({
            'message': 'Registration successful. Welcome to Safe City Connect!',
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


class IsAdminRole(IsAuthenticated):
    """Allow access if the user has role='admin' OR Django is_staff flag."""
    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and (getattr(request.user, 'role', None) == 'admin' or request.user.is_staff)
        )


class UserListView(generics.ListAPIView):
    """GET /api/auth/users/ — Full user list, admin role only."""
    serializer_class = UserSerializer
    queryset = User.objects.all().order_by('date_joined')
    permission_classes = [IsAdminRole]


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def manage_user(request, pk):
    """
    POST /api/auth/users/<pk>/manage/
    Admin-only action to block, unblock, or permanently delete a user account.

    Request body: {"action": "block" | "unblock" | "delete"}

    block   → sets is_active=False (login rejected with clear message)
    unblock → sets is_active=True  (restores access)
    delete  → permanently removes the user and all their data
    Admins cannot act on their own account.
    """
    if request.user.role != 'admin' and not request.user.is_staff:
        return Response({'error': 'Admin access required.'}, status=403)

    try:
        target = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=404)

    if target.pk == request.user.pk:
        return Response({'error': 'You cannot modify your own account.'}, status=400)

    action = request.data.get('action', '').strip()

    if action == 'block':
        target.is_active = False
        target.save(update_fields=['is_active'])
        _accounts_logger.info(f'Admin {request.user.username} blocked user {target.username}')
        return Response({'message': f'User @{target.username} has been blocked. They can no longer log in.'})

    elif action == 'unblock':
        target.is_active = True
        target.save(update_fields=['is_active'])
        _accounts_logger.info(f'Admin {request.user.username} unblocked user {target.username}')
        return Response({'message': f'User @{target.username} has been unblocked and can log in again.'})

    elif action == 'delete':
        username = target.username
        user_pk  = target.pk
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                # Clear django admin log entries referencing this user (as actor or object)
                cursor.execute(
                    "DELETE FROM django_admin_log WHERE user_id = %s OR (content_type_id IN "
                    "(SELECT id FROM django_content_type WHERE app_label='accounts' AND model='user') "
                    "AND object_id = %s)",
                    [user_pk, str(user_pk)]
                )
                # Clear any remaining orphan FK tables that Django ORM doesn't know about
                for orphan_table in ('transport_transportrequest', 'transport_routewaypoint'):
                    try:
                        cursor.execute(f"DELETE FROM {orphan_table} WHERE user_id = %s", [user_pk])
                    except Exception:
                        pass  # Table may not exist — safe to ignore
            target.delete()
            _accounts_logger.info(f'Admin {request.user.username} deleted user {username}')
            return Response({'message': f'User @{username} has been permanently deleted.'})
        except Exception as exc:
            _accounts_logger.error(f'Failed to delete user {username}: {exc}')
            return Response({'error': f'Could not delete user: {exc}'}, status=500)

    return Response({'error': 'Invalid action. Use "block", "unblock", or "delete".'}, status=400)


_accounts_logger = logger


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_email_verification(request):
    """POST /api/auth/send-email-verification/ — Send email verification link."""
    from apps.accounts.models import EmailVerification
    from django.core.mail import send_mail
    from django.conf import settings as djsettings

    user = request.user
    if not user.email:
        return Response({'error': 'No email address on file.'}, status=400)
    if user.email_verified:
        return Response({'message': 'Email is already verified.'})

    # Create token
    ev = EmailVerification.objects.create(user=user)

    frontend_url = getattr(djsettings, 'FRONTEND_URL', 'http://localhost:3000')
    verify_url   = f"{frontend_url}/verify-email/{ev.token}"

    try:
        send_mail(
            subject='Verify your Safe City Connect email',
            message=(
                f"Hello {user.full_name},\n\n"
                f"Click the link below to verify your email address:\n{verify_url}\n\n"
                f"This link expires in 24 hours.\n\nSafe City Connect Team"
            ),
            from_email=getattr(djsettings, 'DEFAULT_FROM_EMAIL', 'noreply@safecityconnect.in'),
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception as e:
        _accounts_logger.warning(f'Email send failed: {e}')
        # Dev mode: log token
        print(f'\n[DEV EMAIL] Verify URL for {user.email}: {verify_url}\n')

    return Response({'message': f'Verification email sent to {user.email}.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email_token(request):
    """POST /api/auth/verify-email/ — Verify email with token."""
    from apps.accounts.models import EmailVerification
    token = request.data.get('token', '').strip()
    if not token:
        return Response({'error': 'Token required.'}, status=400)

    try:
        ev = EmailVerification.objects.get(token=token, is_used=False)
    except EmailVerification.DoesNotExist:
        return Response({'error': 'Invalid or expired verification link.'}, status=400)

    if ev.is_expired:
        return Response({'error': 'Verification link has expired. Please request a new one.'}, status=400)

    ev.is_used = True
    ev.save()

    ev.user.email_verified = True
    ev.user.save()

    return Response({'message': 'Email verified successfully! Your account now has Verified Reporter status.'})