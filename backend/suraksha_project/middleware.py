"""
SURAKSHA - Request Logging Middleware
Logs every HTTP request with method, path, user, status code, and response time.
"""

import time
import logging

logger = logging.getLogger('suraksha.requests')


class RequestLoggingMiddleware:
    """
    Logs all incoming HTTP requests and their responses.
    Format: METHOD /path [user] → STATUS in Xms
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()

        # Pre-request: log incoming
        user_label = 'anonymous'
        if hasattr(request, 'user') and request.user and request.user.is_authenticated:
            user_label = f'{request.user.username}({request.user.role})'

        response = self.get_response(request)

        elapsed_ms = round((time.monotonic() - start) * 1000, 1)
        status     = response.status_code
        method     = request.method
        path       = request.get_full_path()

        # Choose log level based on status
        if status >= 500:
            log = logger.error
        elif status >= 400:
            log = logger.warning
        else:
            log = logger.info

        log(
            f'{method:6s} {path:<55s} [{user_label}] → {status}  ({elapsed_ms}ms)',
            extra={
                'http_method' : method,
                'http_path'   : path,
                'http_status' : status,
                'duration_ms' : elapsed_ms,
                'user'        : user_label,
            }
        )
        return response

    def process_exception(self, request, exception):
        """Log unhandled exceptions before Django's 500 handler takes over."""
        path = request.get_full_path()
        user_label = 'anonymous'
        if hasattr(request, 'user') and request.user and request.user.is_authenticated:
            user_label = request.user.username
        logger.critical(
            f'Unhandled exception on {request.method} {path} [{user_label}]: '
            f'{type(exception).__name__}: {exception}',
            exc_info=True
        )
        return None  # let Django's default 500 handling proceed
