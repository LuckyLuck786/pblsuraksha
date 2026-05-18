from django.urls import path
from . import views

urlpatterns = [
    path('hotspots/', views.hotspots, name='hotspots'),
    path('map-data/', views.map_data, name='map-data'),
    path('analyze/', views.analyze_text, name='analyze-text'),
    path('insights/', views.insights, name='insights'),
    path('analyze-all/', views.analyze_all, name='analyze-all'),
    path('llm-analytics/', views.llm_analytics, name='llm-analytics'),
    path('check-duplicate/',        views.check_duplicate,       name='check_duplicate'),
    path('investigation-summary/<str:complaint_id>/', views.investigation_summary, name='investigation_summary'),
    path('nl-query/',               views.nl_query,              name='nl_query'),
    path('trends/',                 views.crime_trends,          name='crime_trends'),
    path('predicted-hotspots/',     views.predicted_hotspots,    name='predicted_hotspots'),
    path('translate/',              views.translate_complaint,   name='translate_complaint'),
]
