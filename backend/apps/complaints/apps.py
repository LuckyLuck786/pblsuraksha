from django.apps import AppConfig


class ComplaintsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.complaints'

    def ready(self):
        """Connect signals when the app is fully loaded."""
        import apps.complaints.signals  # noqa: F401 — registers signal handlers
