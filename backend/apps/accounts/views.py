"""
Safe City Connect — Accounts Views
DRF views covering the full auth lifecycle:
  • register / login / token refresh
  • profile read + update
  • phone OTP send + verify (pre-registration and post-login)
  • email verification link send + confirm
  • admin user management (block / unblock / delete)
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
    Create a new citizen or authority account.

    Phone uniqueness is enforced at the serializer level before the DB write.
    If the submitted phone was already OTP-verified (pre-registration flow),
    phone_verified=True is set automatically by matching the used OTP record.
    """
    from apps.accounts.models import OtpVerification
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()

        # Auto-mark phone as verified if a recent pre-reg OTP was used for this phone
        if user.phone:
            verified_otp = OtpVerification.objects.filter(
                phone=user.phone,
                purpose='phone_verify',
                is_used=True,
                user__isnull=True,  # pre-registration OTP has no user FK
            ).order_by('-created_at').first()
            if verified_otp:
                user.phone_verified = True
                user.is_verified    = True
                # Tie the OTP record to this new user
                verified_otp.user = user
                verified_otp.save(update_fields=['user'])
                user.save(update_fields=['phone_verified', 'is_verified'])

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


class UserListView(generics.ListAPIView):
    """GET /api/auth/users/ — Full user list, admin-only."""
    serializer_class = UserSerializer
    queryset = User.objects.all().order_by('date_joined')

    def get_permissions(self):
        from rest_framework.permissions import IsAdminUser
        return [IsAdminUser()]


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
        _otp_logger.info(f'Admin {request.user.username} blocked user {target.username}')
        return Response({'message': f'User @{target.username} has been blocked. They can no longer log in.'})

    elif action == 'unblock':
        target.is_active = True
        target.save(update_fields=['is_active'])
        _otp_logger.info(f'Admin {request.user.username} unblocked user {target.username}')
        return Response({'message': f'User @{target.username} has been unblocked and can log in again.'})

    elif action == 'delete':
        username = target.username
        target.delete()
        _otp_logger.info(f'Admin {request.user.username} deleted user {username}')
        return Response({'message': f'User @{username} has been permanently deleted.'})

    return Response({'error': 'Invalid action. Use "block", "unblock", or "delete".'}, status=400)


import random
import logging as _logging

_otp_logger = _logging.getLogger('apps.accounts')


def _generate_otp() -> str:
    return str(random.randint(100000, 999999))


def _send_sms_otp(phone: str, otp: str) -> bool:
    """
    Deliver an OTP to a phone number via the first available SMS provider.
    Provider priority (each falls through to the next on failure):
      1. 2Factor.in  — Indian OTP API, free tier, no DLT/website verification needed
      2. Fast2SMS    — Indian bulk SMS; OTP route needs website verification first
      3. Twilio      — International; trial accounts can only message verified numbers

    Returns True if an SMS was dispatched, False if all providers failed.
    Configure providers by setting the matching env vars in backend/.env.
    """
    import requests as _requests
    from django.conf import settings

    # Strip country code to 10-digit format required by Indian providers
    number_10 = phone.strip()
    if number_10.startswith('+91'):
        number_10 = number_10[3:]
    elif number_10.startswith('91') and len(number_10) == 12:
        number_10 = number_10[2:]

    # ── 1. 2Factor.in ─────────────────────────────────────────────────────────
    twofa_key = getattr(settings, 'TWOFACTOR_API_KEY', '')
    if twofa_key:
        try:
            resp = _requests.get(
                f'https://2factor.in/API/V1/{twofa_key}/SMS/{number_10}/{otp}',
                timeout=10,
            )
            data = resp.json()
            if data.get('Status') == 'Success':
                _otp_logger.info(f'2Factor OTP sent to {number_10[-4:].rjust(len(number_10), "*")}')
                return True
            _otp_logger.warning(f'2Factor error (trying next): {data}')
        except Exception as e:
            _otp_logger.warning(f'2Factor request failed (trying next): {e}')

    # ── 2. Fast2SMS ───────────────────────────────────────────────────────────
    fast2sms_key = getattr(settings, 'FAST2SMS_API_KEY', '')
    if fast2sms_key:
        try:
            resp = _requests.post(
                'https://www.fast2sms.com/dev/bulkV2',
                headers={'authorization': fast2sms_key, 'Content-Type': 'application/json'},
                json={'route': 'otp', 'variables_values': otp, 'numbers': number_10},
                timeout=10,
            )
            data = resp.json()
            if data.get('return') is True:
                _otp_logger.info(f'Fast2SMS OTP sent to {number_10[-4:].rjust(len(number_10), "*")}')
                return True
            _otp_logger.warning(f'Fast2SMS error (trying next): {data}')
        except Exception as e:
            _otp_logger.warning(f'Fast2SMS request failed (trying next): {e}')

    # ── 3. Twilio ─────────────────────────────────────────────────────────────
    twilio_sid   = getattr(settings, 'TWILIO_ACCOUNT_SID', '')
    twilio_token = getattr(settings, 'TWILIO_AUTH_TOKEN', '')
    twilio_from  = getattr(settings, 'TWILIO_FROM_NUMBER', '')
    if twilio_sid and twilio_token and twilio_from:
        try:
            from twilio.rest import Client
            client = Client(twilio_sid, twilio_token)
            client.messages.create(
                body=f"Your Safe City Connect verification code: {otp}. Valid for 10 minutes. Do not share this code.",
                from_=twilio_from,
                to=phone,
            )
            _otp_logger.info(f'Twilio OTP sent to {phone[-4:].rjust(len(phone), "*")}')
            return True
        except Exception as e:
            _otp_logger.warning(f'Twilio SMS failed: {e}')

    _otp_logger.error(f'All SMS providers failed for {phone[-4:].rjust(len(phone), "*")}')
    return False


@api_view(['POST'])
@permission_classes([AllowAny])
def send_phone_otp(request):
    """
    POST /api/auth/send-otp/
    Generate and dispatch a 6-digit OTP to the given phone number.

    Two modes:
      1. Pre-registration — body: {"phone": "+91XXXXXXXXXX"}
         OTP record is created with user=None (not tied to an account yet).
         The /register/ endpoint matches this record afterwards.
      2. Post-login re-verify — body: {"phone": "...", "user_id": 5}
         OTP is tied to an existing user account.

    Rate-limited to 3 requests per 10-minute window per phone number.
    SMS is dispatched via the first configured provider (2Factor.in → Fast2SMS → Twilio).
    Returns 503 if no SMS provider is configured.
    """
    from apps.accounts.models import OtpVerification
    from django.utils import timezone
    from datetime import timedelta

    phone   = request.data.get('phone', '').strip()
    user_id = request.data.get('user_id')

    if not phone:
        return Response({'error': 'Phone number required.'}, status=400)

    # Normalize phone: add +91 if starts with 0 or missing country code
    if phone.startswith('0'):
        phone = '+91' + phone[1:]
    elif phone.startswith('91') and not phone.startswith('+'):
        phone = '+' + phone
    elif not phone.startswith('+'):
        phone = '+91' + phone

    # Resolve user (may be None for pre-registration)
    user = None
    if user_id:
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)
    else:
        # Try finding existing user with this phone (post-registration re-verify)
        user = User.objects.filter(phone=phone).first()
        # If no user found, this is a pre-registration OTP — user stays None

    # Rate limit by phone number (applies to both modes)
    recent = OtpVerification.objects.filter(
        phone=phone, created_at__gte=timezone.now() - timedelta(minutes=10)
    )
    if recent.count() >= 3:
        return Response({'error': 'Too many OTP requests. Please wait 10 minutes.'}, status=429)

    otp = _generate_otp()
    OtpVerification.objects.create(user=user, phone=phone, otp_code=otp, purpose='phone_verify')

    sent = _send_sms_otp(phone, otp)
    if not sent:
        return Response(
            {'error': 'Unable to send SMS. Please configure an SMS provider (2Factor.in, Fast2SMS, or Twilio) in backend/.env.'},
            status=503,
        )

    masked = f'{"*" * (len(phone) - 4)}{phone[-4:]}'
    return Response({'message': f'OTP sent to {masked}.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_phone_otp(request):
    """
    POST /api/auth/verify-otp/
    Verify the OTP for a phone number.

    Body: {"phone": "+91XXXXXXXXXX", "otp_code": "123456"}
          Optionally: "user_id" to also mark user.phone_verified = True immediately.

    For pre-registration: returns {"verified": true, "phone": "+91..."} without
    touching any user record. The registration endpoint then marks phone_verified.
    For existing-user mode: additionally updates user.phone_verified = True.
    """
    from apps.accounts.models import OtpVerification

    phone    = request.data.get('phone', '').strip()
    otp_in   = request.data.get('otp_code', '').strip()
    user_id  = request.data.get('user_id')

    if not phone or not otp_in:
        return Response({'error': 'phone and otp_code are required.'}, status=400)

    # Normalize phone
    if phone.startswith('0'):
        phone = '+91' + phone[1:]
    elif phone.startswith('91') and not phone.startswith('+'):
        phone = '+' + phone
    elif not phone.startswith('+'):
        phone = '+91' + phone

    # Get latest unused OTP for this phone
    try:
        otp_obj = OtpVerification.objects.filter(
            phone=phone, purpose='phone_verify', is_used=False
        ).latest('created_at')
    except OtpVerification.DoesNotExist:
        return Response({'error': 'No active OTP found. Please request a new one.'}, status=400)

    # Increment attempts
    otp_obj.attempts += 1
    otp_obj.save(update_fields=['attempts'])

    if otp_obj.attempts > 5:
        return Response({'error': 'Too many incorrect attempts. Please request a new OTP.'}, status=429)

    if otp_obj.is_expired:
        return Response({'error': 'OTP has expired. Please request a new one.'}, status=400)

    if otp_obj.otp_code != otp_in:
        remaining = 5 - otp_obj.attempts
        return Response({'error': f'Incorrect OTP. {remaining} attempts remaining.'}, status=400)

    # Mark OTP as used
    otp_obj.is_used = True
    otp_obj.save(update_fields=['is_used'])

    # If a specific user is given, mark them as phone-verified
    user = None
    if user_id:
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            pass
    elif otp_obj.user_id:
        user = otp_obj.user

    if user:
        user.phone_verified = True
        user.is_verified    = True
        user.save(update_fields=['phone_verified', 'is_verified'])
        tokens = get_tokens_for_user(user)
        return Response({
            'message': 'Phone verified successfully!',
            'verified': True,
            'phone': phone,
            'user': UserSerializer(user).data,
            'tokens': tokens,
        })

    # Pre-registration mode: just confirm the phone is verified (no user yet)
    return Response({
        'message': 'Phone verified successfully!',
        'verified': True,
        'phone': phone,
    })


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
        _otp_logger.warning(f'Email send failed: {e}')
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