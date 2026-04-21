"""SURAKSHA - Transport URLs"""
from django.urls import path
from . import views

urlpatterns = [
    path('', views.TransportRequestListCreateView.as_view(), name='transport-list-create'),
    path('facilities/', views.nearby_facilities, name='nearby-facilities'),
    path('facilities/all/', views.all_facilities, name='all-facilities'),
    path('<str:request_id>/confirm/', views.confirm_transport, name='confirm-transport'),
]