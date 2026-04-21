"""SURAKSHA - Complaints URL Configuration"""

from django.urls import path
from . import views

urlpatterns = [
    path('', views.ComplaintListCreateView.as_view(), name='complaint-list-create'),
    path('<str:complaint_id>/', views.ComplaintDetailView.as_view(), name='complaint-detail'),
    path('<str:complaint_id>/update/', views.update_complaint_status, name='complaint-update'),
    path('<str:complaint_id>/evidence/', views.upload_evidence, name='complaint-evidence'),
    path('data/analytics/', views.analytics, name='complaint-analytics'),
    path('data/notifications/', views.notifications_list, name='notifications'),
    path('data/notifications/read/', views.mark_notifications_read, name='notifications-read'),
]