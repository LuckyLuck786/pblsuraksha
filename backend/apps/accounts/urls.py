"""
Safe City Connect — Accounts URL patterns
All auth and user-management endpoints are mounted under /api/auth/ in the root urls.py.
"""

from django.urls import path
from . import views

urlpatterns = [
    # ── Authentication ──────────────────────────────────────────────────────
    path('register/',       views.register,       name='auth-register'),
    path('login/',          views.login,           name='auth-login'),
    path('token/refresh/',  views.token_refresh,   name='token-refresh'),

    # ── Profile ─────────────────────────────────────────────────────────────
    path('profile/',        views.profile,         name='auth-profile'),
    path('dashboard-stats/', views.dashboard_stats, name='dashboard-stats'),

    # ── User list + admin management ────────────────────────────────────────
    path('users/',                    views.UserListView.as_view(), name='user-list'),
    path('users/<int:pk>/manage/',    views.manage_user,            name='manage-user'),

    # ── Email verification ───────────────────────────────────────────────────
    path('send-email-verification/', views.send_email_verification, name='send_email_verification'),
    path('verify-email/',            views.verify_email_token,      name='verify_email'),
]