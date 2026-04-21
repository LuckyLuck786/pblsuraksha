"""
SURAKSHA - Accounts URL patterns
Maps URLs to views (Module 1 - Django views, Mapping URL's to views)
"""

from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.register, name='auth-register'),
    path('login/', views.login, name='auth-login'),
    path('token/refresh/', views.token_refresh, name='token-refresh'),
    path('profile/', views.profile, name='auth-profile'),
    path('dashboard-stats/', views.dashboard_stats, name='dashboard-stats'),
    path('users/', views.UserListView.as_view(), name='user-list'),
]