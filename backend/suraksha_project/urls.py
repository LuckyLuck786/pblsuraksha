"""
SURAKSHA - Main URL Configuration
Django MVT pattern (Module 2) - URL routing
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # API v1 routes
    path('api/auth/', include('apps.accounts.urls')),
    path('api/complaints/', include('apps.complaints.urls')),
    path('api/transport/', include('apps.transport.urls')),
    path('api/intelligence/', include('apps.intelligence.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)