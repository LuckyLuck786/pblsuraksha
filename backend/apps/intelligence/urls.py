from django.urls import path
from . import views

urlpatterns = [
    path('hotspots/', views.hotspots, name='hotspots'),
    path('map-data/', views.map_data, name='map-data'),
    path('analyze/', views.analyze_text, name='analyze-text'),
    path('insights/', views.insights, name='insights'),
    path('analyze-all/', views.analyze_all, name='analyze-all'),
    path('llm-analytics/', views.llm_analytics, name='llm-analytics'),
]
