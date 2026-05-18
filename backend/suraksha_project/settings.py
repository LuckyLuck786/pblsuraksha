"""
SURAKSHA - Intelligent Public Safety Platform
Django Settings
"""

from pathlib import Path
from datetime import timedelta
import os

def _env(key: str, default: str = '') -> str:
    """Read from environment, then from .env file if present."""
    val = os.environ.get(key, '')
    if val:
        return val
    env_file = Path(__file__).resolve().parent.parent / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            if k.strip() == key:
                return v.strip().strip('"').strip("'")
    return default

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'suraksha-secret-key-change-in-production-use-env-vars'

DEBUG = True

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    # Local apps
    'apps.accounts',
    'apps.complaints',
    'apps.intelligence',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'suraksha_project.middleware.RequestLoggingMiddleware',   # ← request logger
]

ROOT_URLCONF = 'suraksha_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'suraksha_project.wsgi.application'

# Database - SQLite for dev, switch to PostgreSQL for production
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# For PostgreSQL production (Module 4 - Postgre SQL):
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.postgresql',
#         'NAME': os.environ.get('DB_NAME', 'suraksha_db'),
#         'USER': os.environ.get('DB_USER', 'postgres'),
#         'PASSWORD': os.environ.get('DB_PASSWORD', ''),
#         'HOST': os.environ.get('DB_HOST', 'localhost'),
#         'PORT': os.environ.get('DB_PORT', '5432'),
#     }
# }

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── REST Framework (Django REST Framework - Module 1-5) ───────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}

# ─── JWT Settings ─────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=24),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ─── CORS (for React frontend) ─────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# ─── File Upload Settings ──────────────────────────────────────────────────
FILE_UPLOAD_MAX_MEMORY_SIZE = 52428800  # 50 MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 52428800

# ─── AI API Keys ───────────────────────────────────────────────────────────
# Set these in backend/.env or as environment variables
GROQ_API_KEY_1   = _env('GROQ_API_KEY_1')   # Key 1 → llama-3.3-70b-versatile
GROQ_API_KEY_2   = _env('GROQ_API_KEY_2')   # Key 2 → qwen/qwen3-32b
GEMINI_API_KEY   = _env('GEMINI_API_KEY')   # gemini-3.1-flash-lite
CEREBRAS_API_KEY = _env('CEREBRAS_API_KEY') # gpt-oss-120b via Cerebras inference

# ─── RAG Store ────────────────────────────────────────────────────────────
RAG_STORE_PATH = BASE_DIR / 'rag_store'

# ─── Logging ───────────────────────────────────────────────────────────────
LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version'                 : 1,
    'disable_existing_loggers': False,

    # ── Formatters ──────────────────────────────────────────────────────
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname:8s} {name} | {message}',
            'style' : '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '{levelname:8s} {name} | {message}',
            'style' : '{',
        },
        'request_fmt': {
            'format': '[{asctime}] {levelname:8s} REQUEST | {message}',
            'style' : '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },

    # ── Handlers ────────────────────────────────────────────────────────
    'handlers': {
        # Console — always on, for dev visibility
        'console': {
            'class'    : 'logging.StreamHandler',
            'formatter': 'simple',
            'level'    : 'DEBUG',
        },
        # Rotating general log — INFO and above (max 10 MB × 5 backups)
        'file_all': {
            'class'       : 'logging.handlers.RotatingFileHandler',
            'filename'    : str(LOGS_DIR / 'suraksha.log'),
            'maxBytes'    : 10 * 1024 * 1024,
            'backupCount' : 5,
            'formatter'   : 'verbose',
            'level'       : 'INFO',
            'encoding'    : 'utf-8',
        },
        # Rotating error log — ERROR and above only
        'file_errors': {
            'class'       : 'logging.handlers.RotatingFileHandler',
            'filename'    : str(LOGS_DIR / 'errors.log'),
            'maxBytes'    : 5 * 1024 * 1024,
            'backupCount' : 5,
            'formatter'   : 'verbose',
            'level'       : 'ERROR',
            'encoding'    : 'utf-8',
        },
        # Dedicated AI/RAG log
        'file_ai': {
            'class'       : 'logging.handlers.RotatingFileHandler',
            'filename'    : str(LOGS_DIR / 'ai_analysis.log'),
            'maxBytes'    : 10 * 1024 * 1024,
            'backupCount' : 3,
            'formatter'   : 'verbose',
            'level'       : 'DEBUG',
            'encoding'    : 'utf-8',
        },
        # Dedicated request log
        'file_requests': {
            'class'       : 'logging.handlers.RotatingFileHandler',
            'filename'    : str(LOGS_DIR / 'requests.log'),
            'maxBytes'    : 20 * 1024 * 1024,
            'backupCount' : 5,
            'formatter'   : 'request_fmt',
            'level'       : 'INFO',
            'encoding'    : 'utf-8',
        },
    },

    # ── Loggers ─────────────────────────────────────────────────────────
    'loggers': {
        # AI engine (LLM calls, parsing, fallback)
        'apps.intelligence.engine': {
            'handlers'  : ['console', 'file_all', 'file_errors', 'file_ai'],
            'level'     : 'DEBUG',
            'propagate' : False,
        },
        # RAG validation layer
        'apps.intelligence.rag': {
            'handlers'  : ['console', 'file_all', 'file_errors', 'file_ai'],
            'level'     : 'DEBUG',
            'propagate' : False,
        },
        # Intelligence views
        'apps.intelligence': {
            'handlers'  : ['console', 'file_all', 'file_errors'],
            'level'     : 'INFO',
            'propagate' : False,
        },
        # Complaints app
        'apps.complaints': {
            'handlers'  : ['console', 'file_all', 'file_errors'],
            'level'     : 'INFO',
            'propagate' : False,
        },
        # RAG signal (auto-indexing)
        'apps.complaints.signals': {
            'handlers'  : ['console', 'file_all', 'file_errors', 'file_ai'],
            'level'     : 'DEBUG',
            'propagate' : False,
        },
        # Auth / accounts app
        'apps.accounts': {
            'handlers'  : ['console', 'file_all', 'file_errors'],
            'level'     : 'INFO',
            'propagate' : False,
        },
        # HTTP request logger (our middleware)
        'suraksha.requests': {
            'handlers'  : ['console', 'file_requests'],
            'level'     : 'INFO',
            'propagate' : False,
        },
        # Django internals — only warnings to avoid noise
        'django': {
            'handlers'  : ['console', 'file_errors'],
            'level'     : 'WARNING',
            'propagate' : False,
        },
        'django.request': {
            'handlers'  : ['file_errors'],
            'level'     : 'ERROR',
            'propagate' : False,
        },
        # Root logger — catch anything not matched above
        '': {
            'handlers'  : ['console', 'file_all', 'file_errors'],
            'level'     : 'WARNING',
        },
    },
}

# ─── SMS OTP Provider ──────────────────────────────────────────────────────
# Fast2SMS (recommended for India, free tier available):
#   1. Register at https://www.fast2sms.com/
#   2. Go to Dev API → copy your API key
#   3. Add to backend/.env:  FAST2SMS_API_KEY=your_key_here
TWOFACTOR_API_KEY   = _env('TWOFACTOR_API_KEY') # 2factor.in — easiest India OTP, no DLT needed
FAST2SMS_API_KEY    = _env('FAST2SMS_API_KEY')  # Fast2SMS — needs website verification for OTP route

# Twilio (international, requires paid account):
TWILIO_ACCOUNT_SID  = _env('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN   = _env('TWILIO_AUTH_TOKEN')
TWILIO_FROM_NUMBER  = _env('TWILIO_FROM_NUMBER')
# If neither is configured, OTP is printed to server console + returned as dev_otp in API response.

# ─── Email (Email Verification) ───────────────────────────────────────────
# For dev: console backend prints emails to stdout (no real mail sent).
# For prod: switch to smtp and set EMAIL_HOST_* env vars.
EMAIL_BACKEND   = _env('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST      = _env('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT      = int(_env('EMAIL_PORT', '587'))
EMAIL_USE_TLS   = _env('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER = _env('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = _env('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL  = _env('DEFAULT_FROM_EMAIL', 'noreply@safecityconnect.in')

# ─── Anonymous Tip Settings ───────────────────────────────────────────────
# Random secret used when SHA-256 hashing reporter identity for anonymous tips.
# Change this in production and keep it secret.
ANONYMOUS_TIP_SALT = _env('ANONYMOUS_TIP_SALT', 'safe-city-connect-anon-salt-change-in-prod')

# ─── Frontend URL (used in email verification links) ──────────────────────
FRONTEND_URL = _env('FRONTEND_URL', 'http://localhost:3000')