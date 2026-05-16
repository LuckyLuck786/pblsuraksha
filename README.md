# SURAKSHA — Safety Intelligence Platform

> A full-stack AI-powered public safety platform built on Django REST Framework and React 18.
> Designed as a research prototype demonstrating a **Multi-Tier Intelligent Analysis Engine (MTIAE)** that classifies,
> prioritises, and routes citizen complaints using multiple large language models in parallel.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Backend — Django Application](#5-backend--django-application)
   - 5.1 [Project Configuration](#51-project-configuration)
   - 5.2 [Custom Middleware](#52-custom-middleware)
   - 5.3 [Logging Infrastructure](#53-logging-infrastructure)
   - 5.4 [URL Routing](#54-url-routing)
6. [Data Models](#6-data-models)
   - 6.1 [User Model](#61-user-model-accountsuser)
   - 6.2 [Complaint Model](#62-complaint-model-complaintsomplaint)
   - 6.3 [Complaint Evidence Model](#63-complaint-evidence-model)
   - 6.4 [Complaint Update Model](#64-complaint-update-model-timeline)
   - 6.5 [Notification Model](#65-notification-model)
7. [Intelligence Engine](#7-intelligence-engine)
   - 7.1 [Overview and Tier Architecture](#71-overview-and-tier-architecture)
   - 7.2 [LLM Prompt Design](#72-llm-prompt-design)
   - 7.3 [Response Parsing and Validation](#73-response-parsing-and-validation)
   - 7.4 [Severity Scoring Algorithm](#74-severity-scoring-algorithm)
   - 7.5 [Parallel Multi-Provider Analysis](#75-parallel-multi-provider-analysis)
   - 7.6 [Rate Limiting](#76-rate-limiting)
   - 7.7 [Crime Hotspot Detection](#77-crime-hotspot-detection)
8. [REST API Reference](#8-rest-api-reference)
   - 8.1 [Authentication API](#81-authentication-api)
   - 8.2 [Complaints API](#82-complaints-api)
   - 8.3 [Intelligence API](#83-intelligence-api)
9. [Role-Based Access Control](#9-role-based-access-control)
10. [Geocoding Integration](#10-geocoding-integration)
11. [Frontend Application](#11-frontend-application)
    - 11.1 [Authentication Flow](#111-authentication-flow)
    - 11.2 [Citizen Interface](#112-citizen-interface)
    - 11.3 [Admin / Authority Interface](#113-admin--authority-interface)
    - 11.4 [Shared Infrastructure](#114-shared-infrastructure)
12. [Data Flow — Complaint Lifecycle](#12-data-flow--complaint-lifecycle)
13. [Data Storage and Persistence](#13-data-storage-and-persistence)
14. [Setup and Installation](#14-setup-and-installation)
15. [Environment Variables](#15-environment-variables)
16. [Management Commands](#16-management-commands)

---

## 1. Project Overview

SURAKSHA (meaning *protection* in Sanskrit) is an integrated civic-safety platform built around a single core module: public safety and complaint management.

Citizens can file detailed incident reports (theft, assault, harassment, traffic accidents, fraud, cybercrime, domestic violence, missing persons, drug activity, vandalism, noise, or other incidents). Every complaint is automatically:
- **Categorised** by an AI ensemble (two Groq Llama-3.3-70b instances + Google Gemini 2.0-Flash + a rule-based engine running in parallel)
- **Severity-scored** on a 0–10 scale using a blended content + priority formula
- **Geocoded** to GPS coordinates via OpenStreetMap's Nominatim service
- **Routed** to all registered authority users as push notifications
- **Tracked** through a full status lifecycle (pending → acknowledged → in_progress → resolved → closed)

Authority users (police officers, administrators) can update complaint status, add internal notes, upload resolution details, and assign cases to officers.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  REACT 18 FRONTEND                   │
│          (Create React App + Tailwind CSS)            │
│                                                       │
│  ┌──────────┐  ┌──────────────────────────────────┐  │
│  │  Citizen  │  │     Admin / Authority Pages      │  │
│  │  Pages   │  │                                  │  │
│  └──────────┘  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐    │
│  │         AuthContext (JWT state)              │    │
│  │         Axios API Layer + Interceptors       │    │
│  └──────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────┘
                        │  HTTP/REST  (JSON)
                        │  JWT Bearer token
┌───────────────────────▼─────────────────────────────┐
│           DJANGO REST FRAMEWORK BACKEND              │
│                                                       │
│  ┌──────────┐  ┌───────────┐                         │
│  │ accounts │  │ complaints│                         │
│  │  app     │  │   app     │                         │
│  └──────────┘  └─────┬─────┘                         │
│                       │                              │
│              ┌────────▼──────────┐                  │
│              │  intelligence app │                  │
│              │  ┌─────────────┐  │                  │
│              │  │   engine.py │  │                  │
│              │  │  Rate       │  │                  │
│              │  │  Limiter    │  │                  │
│              │  └──────┬──────┘  │                  │
│              └─────────┼─────────┘                  │
└────────────────────────┼─────────────────────────────┘
                         │  Parallel HTTP calls
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
  ┌─────────────┐ ┌─────────────┐ ┌──────────┐
  │ Groq API    │ │ Groq API    │ │  Google  │
  │ (Key 1)     │ │ (Key 2)     │ │  Gemini  │
  │ Llama-3.3   │ │ Llama-3.3   │ │  2.0     │
  │ -70b        │ │ -70b        │ │  Flash   │
  └─────────────┘ └─────────────┘ └──────────┘
```

**Database:** SQLite in development (`db.sqlite3`), PostgreSQL-ready in production (psycopg2 installed, config in settings commented out for easy switch).

**External services:**
- Groq API — two separate API keys for Llama-3.3-70b-versatile (same organisation, shared 30 RPM limit)
- Google Gemini API — gemini-2.0-flash (free tier, daily quota)
- OpenStreetMap Nominatim — forward geocoding, no API key required

---

## 3. Technology Stack

### Backend
| Package | Version | Role |
|---------|---------|------|
| Django | 4.2.7 | Web framework, ORM, admin |
| djangorestframework | 3.14.0 | REST API serializers, viewsets, pagination |
| djangorestframework-simplejwt | 5.5.1 | JWT access (24 h) + refresh (7 days) tokens |
| django-cors-headers | 4.3.1 | CORS for `localhost:3000` |
| Pillow | ≥11.0.0 | User avatar image field |
| groq | ≥0.9.0 | Official Groq Python SDK |
| google-genai | ≥2.0.0 | Official Gemini Python SDK |
| python-decouple | 3.8 | `.env` variable loading |
| psycopg2-binary | ≥2.9.9 | PostgreSQL driver (production path) |
| gunicorn | 21.2.0 | WSGI production server |

### Frontend
| Package | Version | Role |
|---------|---------|------|
| React / ReactDOM | 18.2.0 | UI framework |
| react-router-dom | 6.20.0 | Client-side routing, `ProtectedRoute` |
| axios | 1.6.2 | HTTP client with interceptors |
| leaflet + react-leaflet | 1.9.4 / 4.2.1 | Interactive crime hotspot map |
| recharts | 2.9.3 | Bar, pie, and line charts for analytics |
| react-hot-toast | 2.4.1 | Toast notifications |
| react-dropzone | 14.2.3 | Evidence file upload |
| framer-motion | 10.16.4 | Page transitions and animations |
| tailwindcss | 3.4.19 | Utility-first CSS |
| date-fns | 2.30.0 | Date formatting |

---

## 4. Repository Structure

```
suraksha/
├── backend/
│   ├── .env                              ← Secret keys (not in git)
│   ├── db.sqlite3                        ← Development database
│   ├── manage.py
│   ├── requirements.txt
│   ├── apps/
│   │   ├── accounts/                     ← User management
│   │   │   ├── models.py                 ← Custom User model
│   │   │   ├── serializers.py            ← User serializers
│   │   │   ├── views.py                  ← Auth endpoints
│   │   │   ├── urls.py
│   │   │   ├── admin.py
│   │   │   └── management/commands/
│   │   │       └── seed_data.py          ← Demo data seeder
│   │   ├── complaints/                   ← Core complaint system
│   │   │   ├── models.py                 ← Complaint, Evidence, Update, Notification
│   │   │   ├── serializers.py            ← Complaint serializers
│   │   │   ├── views.py                  ← Complaint CRUD + analytics endpoints
│   │   │   ├── urls.py
│   │   │   ├── utils.py                  ← Nominatim geocoder
│   │   │   ├── admin.py
│   │   │   └── management/commands/
│   │   │       └── import_test_cases.py  ← Excel → DB importer (300 cases)
│   │   └── intelligence/                 ← AI analysis engine
│   │       ├── engine.py                 ← All LLM logic + algorithms
│   │       ├── views.py                  ← Intelligence API endpoints
│   │       ├── urls.py
│   │       └── admin.py
│   ├── suraksha_project/
│   │   ├── settings.py                   ← Django configuration
│   │   ├── urls.py                       ← Root URL conf
│   │   ├── middleware.py                 ← Request logging middleware
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── logs/
│   │   ├── suraksha.log                  ← General application log
│   │   ├── errors.log                    ← ERROR+ only
│   │   ├── ai_analysis.log               ← Intelligence engine detailed log
│   │   └── requests.log                  ← HTTP access log
│   └── media/
│       └── uploads/                      ← User-uploaded evidence files
└── frontend/
    ├── package.json
    ├── tailwind.config.js
    └── src/
        ├── App.jsx                       ← Root component + all routes
        ├── context/
        │   └── AuthContext.jsx           ← JWT auth global state
        ├── layout/
        │   ├── Layout.jsx                ← App shell (sidebar + navbar)
        │   ├── Navbar.jsx                ← Top bar: clock, notifications
        │   └── Sidebar.jsx               ← Role-aware navigation
        ├── components/
        │   └── ErrorBoundary.jsx         ← React error boundary
        ├── pages/
        │   ├── auth/
        │   │   ├── LoginPage.jsx
        │   │   └── RegisterPage.jsx
        │   ├── citizen/
        │   │   ├── DashboardPage.jsx
        │   │   ├── CreateComplaintPage.jsx
        │   │   ├── CitizenComplaintsPage.jsx
        │   │   └── NotificationsPage.jsx
        │   ├── admin/
        │   │   ├── AdminDashboardPage.jsx
        │   │   ├── AdminComplaintsPage.jsx
        │   │   ├── AdminAnalyticsPage.jsx
        │   │   ├── AdminUsersPage.jsx
        │   │   └── HotspotMapPage.jsx
        │   └── profile/
        │       └── ProfilePage.jsx
        └── utils/
            ├── api.js                    ← Axios instance + all API calls
            └── logger.js                 ← Structured frontend logger
```

---

## 5. Backend — Django Application

### 5.1 Project Configuration

**File:** `backend/suraksha_project/settings.py`

Key settings and their implications for the research system:

| Setting | Value | Significance |
|---------|-------|-------------|
| `AUTH_USER_MODEL` | `accounts.User` | Extends Django's AbstractUser with role and location fields |
| `DATABASE` | SQLite (`db.sqlite3`) | File-based; zero-config for development. Swap to PostgreSQL for production by uncommenting the `psycopg2` block |
| `TIME_ZONE` | `Asia/Kolkata` | All `auto_now_add` timestamps stored in IST |
| `DEFAULT_AUTO_FIELD` | `BigAutoField` | All model PKs are 64-bit integers |
| JWT access lifetime | 24 hours | Access tokens expire after 24 h; refresh tokens last 7 days |
| `MEDIA_ROOT` | `BASE_DIR / 'media'` | Uploaded files stored here |
| `MEDIA_URL` | `/media/` | Served at this URL prefix |
| `PAGE_SIZE` | 20 | Default API pagination page size |
| AI keys | Loaded via `config()` from `.env` | `GROQ_API_KEY_1`, `GROQ_API_KEY_2`, `GEMINI_API_KEY` |

**Installed apps:**
```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    ...standard Django apps...,
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'apps.accounts',
    'apps.complaints',
    'apps.intelligence',
]
```

**CORS configuration:** The `corsheaders` middleware allows cross-origin requests from `http://localhost:3000` and `http://127.0.0.1:3000` only (the React dev server). All REST endpoints require the `Authorization: Bearer <token>` header except register, login, and token refresh.

---

### 5.2 Custom Middleware

**File:** `backend/suraksha_project/middleware.py`

`RequestLoggingMiddleware` is injected between `SecurityMiddleware` and `SessionMiddleware`. For every HTTP request it:

1. Records `start_time = time.time()` before passing to the next middleware
2. After response is generated, computes `response_time_ms = (time.time() - start_time) * 1000`
3. Logs to the `suraksha.requests` logger at INFO level:
   ```
   METHOD  /path/to/endpoint  [username (role)]  →  STATUS  (XXXms)
   ```

**Example log entries:**
```
POST    /api/complaints/                [luqman (citizen)]     →  201  (1247ms)
GET     /api/intelligence/hotspots/    [admin (admin)]        →  200  (83ms)
POST    /api/auth/login/               [anonymous]            →  200  (312ms)
```

---

### 5.3 Logging Infrastructure

Four rotating file handlers, each with specific retention policies:

| Log file | Logger | Level | Max size | Backup count | Content |
|----------|--------|-------|----------|-------------|---------|
| `logs/suraksha.log` | Root | INFO+ | 10 MB | 5 files | All INFO+ events across all apps |
| `logs/errors.log` | Root | ERROR+ | 5 MB | 5 files | Exceptions and errors only |
| `logs/ai_analysis.log` | `apps.intelligence` | DEBUG+ | 10 MB | 3 files | Every LLM call attempt, latency, result, severity calculation breakdown |
| `logs/requests.log` | `suraksha.requests` | INFO+ | 20 MB | 5 files | One line per HTTP request (from middleware) |

The `ai_analysis.log` is the most data-rich file for research purposes. It records:
- Which provider was attempted and in which order
- Exact latency in milliseconds per call
- Parsed category and priority from each provider
- The full severity computation breakdown: `base + kw_boost → content, blended with priority_score`
- Fallback events ("Token refresh failed — redirecting to login")

---

### 5.4 URL Routing

**File:** `backend/suraksha_project/urls.py`

All API endpoints are namespaced under `/api/`:

```
/api/auth/            → apps.accounts.urls
/api/complaints/      → apps.complaints.urls
/api/intelligence/    → apps.intelligence.urls
/admin/               → Django admin site
/media/<path>         → Uploaded file serving (dev only)
```

---

## 6. Data Models

### 6.1 User Model (`accounts.User`)

**File:** `backend/apps/accounts/models.py`

Extends Django's `AbstractUser`, replacing the default user model with one that supports three distinct roles within a single table (single-table inheritance via the `role` field).

| Field | Type | Constraints | Stored Value |
|-------|------|-------------|-------------|
| `id` | BigAutoField | PK, auto | Sequential integer |
| `username` | CharField(150) | Unique, required | Login identifier |
| `password` | CharField | Hashed (PBKDF2-SHA256) | Django-hashed password |
| `email` | EmailField | Optional | Email address |
| `first_name` | CharField(150) | Optional | |
| `last_name` | CharField(150) | Optional | |
| `role` | CharField(20) | Choices: `citizen`, `authority`, `admin` | Default: `citizen` |
| `phone` | CharField(15) | Blank/null | Mobile number |
| `address` | TextField | Blank | Free-text address |
| `city` | CharField(100) | Blank | City name |
| `state` | CharField(100) | Blank | Default: `Karnataka` |
| `pincode` | CharField(10) | Blank | Postal code |
| `avatar` | ImageField | Nullable; upload to `avatars/` | Stored relative path |
| `is_verified` | BooleanField | Default: `False`; set `True` on registration | Email/ID verified flag |
| `latitude` | FloatField | Nullable | User's GPS latitude |
| `longitude` | FloatField | Nullable | User's GPS longitude |
| `badge_number` | CharField(50) | Blank; authority-only | Police badge number |
| `station_name` | CharField(200) | Blank; authority-only | Police station name |
| `created_at` | DateTimeField | `auto_now_add=True` | Registration timestamp (IST) |
| `updated_at` | DateTimeField | `auto_now=True` | Last profile update timestamp |

**Computed property:** `full_name` returns `get_full_name()` (first + last) or falls back to `username`.

**Role semantics:**
- `citizen` — general public; files complaints; sees only their own data
- `authority` — police officer; views all complaints; updates status and assigns cases
- `admin` — full system access; same as authority plus user management

---

### 6.2 Complaint Model (`complaints.Complaint`)

**File:** `backend/apps/complaints/models.py`

The central entity of the platform. Every complaint goes through AI analysis at creation time and accumulates a status history and evidence files over its lifecycle.

| Field | Type | Constraints | Stored Value / Significance |
|-------|------|-------------|----------------------------|
| `id` | BigAutoField | PK | Internal DB identifier |
| `complaint_id` | CharField(20) | Unique | `SRK` + 7 random digits (e.g. `SRK1234567`); the public-facing reference |
| `title` | CharField(300) | Required; min 10 chars (client-validated) | Short incident title |
| `description` | TextField | Required; min 30 chars | Full incident narrative |
| `category` | CharField(50) | Choices (12 values) | **Final stored category** — set by AI; authority can override. One of: `theft`, `assault`, `harassment`, `traffic`, `fraud`, `cybercrime`, `domestic`, `missing_person`, `drug_activity`, `vandalism`, `noise`, `other` |
| `status` | CharField(20) | Choices (6 values) | Lifecycle stage: `pending` → `acknowledged` → `in_progress` → `resolved` → `closed` / `rejected`. Default: `pending` |
| `priority` | CharField(20) | Choices (4 values) | `low`, `medium`, `high`, `critical`. Default: `medium`; AI-assigned at creation; overrideable |
| `reporter` | FK → User | `SET_NULL`, nullable | The user who filed the complaint. Null if the user is deleted |
| `assigned_to` | FK → User | `SET_NULL`, nullable, blank | The authority officer handling this case |
| `incident_location` | CharField(500) | Required | Short location descriptor (e.g. "MG Road, Bangalore") — used as display label |
| `incident_address` | TextField | Blank | Full address string; fed to Nominatim geocoder |
| `latitude` | FloatField | Nullable | GPS latitude from geocoding |
| `longitude` | FloatField | Nullable | GPS longitude from geocoding |
| `nearest_police_station` | CharField(300) | Blank | Reserved field; populated if authority fills it |
| `ai_category` | CharField(50) | Blank | The **raw AI-assigned category** at submission time (may differ from `category` if authority overrides) |
| `ai_priority` | CharField(20) | Blank | The raw AI-assigned priority at submission time |
| `ai_summary` | TextField | Blank | One-sentence AI summary. Also used as import tag: `TEST_IMPORT|<ExcelCategory>|...` for 300 test cases |
| `severity_score` | FloatField | Default 0.0 | AI-computed severity on 0–10 scale |
| `incident_date` | DateTimeField | Nullable | When the incident happened (user-supplied) |
| `created_at` | DateTimeField | `auto_now_add=True` | When the complaint was filed |
| `updated_at` | DateTimeField | `auto_now=True` | When the complaint was last modified |
| `resolved_at` | DateTimeField | Nullable | Set when status transitions to `resolved` |
| `authority_notes` | TextField | Blank | Internal investigation notes; hidden from public API |
| `resolution_details` | TextField | Blank | Public-facing resolution description |
| `is_anonymous` | BooleanField | Default `False` | If `True`, reporter's name is hidden in API responses to other users |

**Database indexes:** `(status, priority)` composite, `(category)` single, `(created_at)` single — optimise the most common filter patterns.

**Ordering:** `-created_at` (newest first in all list endpoints).

**Auto-generated `complaint_id`:** Generated in `save()` override using `f"SRK{random.randint(1000000, 9999999)}"`. Collision retry is not implemented (extremely unlikely at the scale of this deployment).

**AI processing at creation (in `complaints/views.py`):**
```python
# 1. Categorise + summarise
result = categorize_complaint(title, description)
complaint.ai_category = result['category']
complaint.ai_priority = result['priority']
complaint.ai_summary  = result['summary']
complaint.category    = result['category']   # stored as the initial value
complaint.priority    = result['priority']

# 2. Severity score
complaint.severity_score = compute_severity(
    title, description, result['category'], result['priority']
)

# 3. Geocode
lat, lon = geocode_location(incident_address, incident_location)
complaint.latitude  = lat
complaint.longitude = lon
```

---

### 6.3 Complaint Evidence Model

**File:** `backend/apps/complaints/models.py`

Stores files uploaded as evidence for a complaint. Multiple evidence files can be attached to the same complaint.

| Field | Type | Constraints | Stored Value |
|-------|------|-------------|-------------|
| `id` | BigAutoField | PK | |
| `complaint` | FK → Complaint | `CASCADE` | Reference to parent complaint |
| `file` | FileField | Upload to `evidence/YYYY/MM/DD/` | Stored path relative to MEDIA_ROOT |
| `file_type` | CharField(20) | Choices: `image`, `video`, `audio`, `document`, `other` | Determined at upload from MIME type |
| `description` | CharField(300) | Blank | Optional caption for the file |
| `uploaded_by` | FK → User | `SET_NULL`, nullable | The user who uploaded this file |
| `uploaded_at` | DateTimeField | `auto_now_add=True` | Upload timestamp |

**Accepted MIME types (enforced server-side):**
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Video: `video/mp4`, `video/quicktime`, `video/webm`
- Audio: `audio/mpeg`, `audio/wav`, `audio/ogg`
- Documents: `application/pdf`

File size limit: 50 MB (set in Django settings via `DATA_UPLOAD_MAX_MEMORY_SIZE`).

---

### 6.4 Complaint Update Model (Timeline)

**File:** `backend/apps/complaints/models.py`

Every status change or manual update to a complaint creates an immutable timeline entry. This provides a full audit trail.

| Field | Type | Constraints | Stored Value |
|-------|------|-------------|-------------|
| `id` | BigAutoField | PK | |
| `complaint` | FK → Complaint | `CASCADE` | Reference to parent complaint |
| `updated_by` | FK → User | `SET_NULL`, nullable | Who made this update |
| `old_status` | CharField(20) | Blank | Status before the change |
| `new_status` | CharField(20) | Blank | Status after the change |
| `message` | TextField | Required (≥5 chars) | Human-readable update description |
| `is_public` | BooleanField | Default `True` | If `False`, only visible to authority/admin — hides internal notes from citizen view |
| `created_at` | DateTimeField | `auto_now_add=True` | When this update was recorded |

**Automatic first entry:** When a complaint is created, the system automatically creates the first timeline entry:
```python
ComplaintUpdate.objects.create(
    complaint=complaint,
    updated_by=request.user,
    new_status='pending',
    message='Complaint filed. Automated AI analysis completed.',
    is_public=True,
)
```

---

### 6.5 Notification Model

**File:** `backend/apps/complaints/models.py`

In-app notifications delivered to users when complaints they are involved with are updated.

| Field | Type | Constraints | Stored Value |
|-------|------|-------------|-------------|
| `id` | BigAutoField | PK | |
| `user` | FK → User | `CASCADE` | Recipient user |
| `title` | CharField(200) | Required | Short notification headline |
| `message` | TextField | Required | Full notification body |
| `notif_type` | CharField(30) | Choices | One of: `complaint_update`, `new_assignment`, `system` |
| `is_read` | BooleanField | Default `False` | Read/unread flag |
| `related_complaint` | FK → Complaint | `SET_NULL`, nullable | Links to the relevant complaint for deep-linking |
| `created_at` | DateTimeField | `auto_now_add=True` | When the notification was generated |

**Notification triggers:**
1. When a new complaint is filed → all users with `role='authority'` or `role='admin'` receive a `new_assignment` notification
2. When a complaint status is updated → the reporter receives a `complaint_update` notification

---

## 7. Intelligence Engine

**File:** `backend/apps/intelligence/engine.py`

This is the core research component of SURAKSHA. It implements the **Multi-Tier Intelligent Analysis Engine (MTIAE)** — a four-tier LLM ensemble that classifies, prioritises, and scores complaints.

### 7.1 Overview and Tier Architecture

```
Complaint Text (title + description)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│              analyze_all_llms()                      │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────┐  │
│  │  Tier 1  │  │  Tier 2  │  │  Tier 3  │  │  T4 │  │
│  │ Groq Key1│  │ Groq Key2│  │  Gemini  │  │ NLP │  │
│  │ Llama-3.3│  │ Llama-3.3│  │ 2.0-Flash│  │ KW  │  │
│  │  -70b    │  │  -70b    │  │          │  │     │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──┬──┘  │
│       │ (parallel, rate-limited)   │            │     │
│       └────────────┬───────────────┘            │     │
│                    ▼                            │     │
│              4 result dicts ←──────────────────┘     │
└─────────────────────────────────────────────────────┘
         │
         ▼
  For each successful result:
    compute_severity(category, priority, text) → 0–10 score
```

**Tier descriptions:**

| Tier | Provider | Model | API | Availability |
|------|----------|-------|-----|-------------|
| 1 | Groq (Key 1) | `llama-3.3-70b-versatile` | Groq Cloud REST | Free tier: 30 RPM, 100k TPD |
| 2 | Groq (Key 2) | `llama-3.3-70b-versatile` | Groq Cloud REST | Same org → shared 30 RPM limit |
| 3 | Google Gemini | `gemini-2.0-flash` | Google AI REST | Free tier: daily request cap |
| 4 | Rule-Based NLP | Keyword matching | Local (Python) | 100% — always available |

**Important:** Both Groq keys belong to the same organisation, so they share the 30 RPM limit. The benefit of two keys is token-per-day (TPD) budget — if Key 1 exhausts its 100k daily tokens, Key 2 has a fresh 100k budget.

The rule-based (Tier 4) engine always runs and always succeeds. It serves as an absolute fallback for the `categorize_complaint()` function and as an independent data point in `analyze_all_llms()`.

---

### 7.2 LLM Prompt Design

All three LLM tiers receive an identical prompt built by `_build_prompt(title, description)`:

```
You are an AI assistant for SURAKSHA, India's intelligent public safety platform.

Analyze the complaint and respond with ONLY a valid JSON object (no markdown, no explanation).

Complaint Title: {title}
Complaint Description: {description}

Return exactly this JSON structure:
{
  "category": "<one of: theft, assault, harassment, traffic, fraud, cybercrime,
                domestic, missing_person, drug_activity, vandalism, noise, other>",
  "priority": "<one of: low, medium, high, critical>",
  "summary": "<one concise sentence describing the incident and recommended action>"
}

Priority assignment rules:
- critical: murder, rape, kidnapping, bomb/terror threat, child in danger, armed robbery
- high: assault, robbery without weapon, missing person, serious accident, domestic violence
- medium: theft, harassment, fraud, cybercrime, drug activity, traffic violations
- low: noise complaints, minor vandalism, general nuisance

Respond ONLY with the JSON object. No other text.
```

**Design decisions:**
- Temperature set to `0.1` for both Groq and Gemini — maximises determinism and consistency across calls
- `max_tokens=400` — sufficient for the 3-field JSON, prevents runaway generation
- Explicit enumeration of all 12 categories and 4 priorities in the prompt to prevent hallucination outside the defined taxonomy
- Explicit priority rules with real-world Indian crime examples reduce ambiguity

---

### 7.3 Response Parsing and Validation

**Function:** `_parse_ai_json(text: str) → dict | None`

LLM responses are not always clean JSON. The parser applies a defensive multi-step process:

1. **Strip whitespace and markdown fences** — removes ` ```json ` / ` ``` ` wrappers that some LLMs add despite instructions
2. **Primary parse** — `json.loads(text)` on the cleaned string
3. **Regex fallback** — if primary parse fails, uses `re.search(r'\{[^{}]+\}', text, re.DOTALL)` to extract the first `{...}` block and parses that
4. **Field validation:**
   - If `category` not in `VALID_CATEGORIES` → replace with `"other"`
   - If `priority` not in `VALID_PRIORITIES` → replace with `"medium"`
   - If `summary` is missing or empty → synthesise: `"AI: [PRIORITY] category case detected."`
5. **Return `None`** if no valid JSON block can be extracted — triggers the next tier in the fallback chain

---

### 7.4 Severity Scoring Algorithm

**Function:** `compute_severity(title, description, category, priority) → float`

Produces a single 0–10 score that encodes both the *type* of incident (via category) and its *urgency* (via priority), modulated by the specific keywords found in the text.

**Formula:**

```
content_score = min(base[category] + keyword_boost, 10.0)
  where keyword_boost = min(high_kw_hits × 1.0 + med_kw_hits × 0.3, 2.5)

priority_score = fixed_midpoint[priority]
  where: low=2.0, medium=4.5, high=7.0, critical=9.5

blended = (content_score × 0.5) + (priority_score × 0.5)
final = max(blended, minimum[priority])   # hard floor for critical (8.0)
final = min(final, 10.0)                 # cap at 10
```

**Category base scores:**

| Category | Base Score | Rationale |
|----------|-----------|-----------|
| `missing_person` | 8.5 | Child/person safety — highest baseline |
| `assault` | 7.5 | Physical violence |
| `harassment` | 6.0 | Personal safety threat |
| `drug_activity` | 6.0 | Community safety risk |
| `domestic` | 6.0 | Domestic violence |
| `fraud` | 5.5 | Financial harm |
| `theft` | 5.5 | Property crime |
| `cybercrime` | 5.0 | Digital harm |
| `traffic` | 5.0 | Road safety |
| `vandalism` | 4.0 | Property damage |
| `other` | 3.5 | Unclassified |
| `noise` | 2.5 | Nuisance — lowest baseline |

**High-severity keywords** (each adds +1.0 to boost, max 2.5 total):
`murder, kill, killed, dead, death, blood, gun, weapon, bomb, rape, sexual assault, molestation, kidnap, abduct, terrorist, explosion, stabbed, stab, shot, shooting, unconscious, fire, burning, hostage, armed, acid attack, suicide`

**Medium-severity keywords** (each adds +0.3 to boost):
`robbery, assault, attack, accident, injury, hurt, fraud, missing, threaten, threat, harassment, snatch, steal, stolen, fight, chase, damage, broke, broken, hit, knocked, eve tease, stalking, loot, looted`

**Example computation:**

> Title: "Theft at MG Road bus stop"  
> Description: "My phone was snatched while I was waiting for the bus. The thief ran away."

- Category: `theft`, base = 5.5
- High kw hits: 0 → boost contribution = 0
- Med kw hits: `snatch`, `thief`(not in list, but `steal`/`snatch` match) → boost = 0.3 × 1 = 0.3
- Keyword boost = min(0.3, 2.5) = 0.3
- content_score = min(5.5 + 0.3, 10) = 5.8
- Priority: `medium` → priority_score = 4.5
- blended = (5.8 × 0.5) + (4.5 × 0.5) = 5.15
- Hard floor: not critical → floor = 0
- **Final: 5.15**

---

### 7.5 Parallel Multi-Provider Analysis

**Function:** `analyze_all_llms(title: str, description: str) → list[dict]`

Calls all four providers simultaneously using Python's `concurrent.futures.ThreadPoolExecutor` with `max_workers=4`.

Each provider call is wrapped in a `_timed()` closure that:
1. Records `t0 = time.perf_counter()` before calling the provider function
2. Catches any exception and stores it in `err`
3. Computes `latency_ms = (perf_counter() - t0) * 1000` regardless of success/failure
4. Calls `compute_severity()` on successful results using the provider's own category and priority output

**Return value — always exactly 4 dicts in fixed order:**

```python
[
  {
    "provider_key"  : "groq-key-1",
    "provider_label": "Groq Llama-3.3-70b (Key 1)",
    "success"       : True,         # or False
    "latency_ms"    : 342.7,        # float, measured by perf_counter
    "category"      : "theft",      # None if success=False
    "priority"      : "high",       # None if success=False
    "summary"       : "...",        # None if success=False
    "severity_score": 6.75,         # None if success=False
    "error"         : "..."         # only present when success=False
  },
  { "provider_key": "groq-key-2", ... },
  { "provider_key": "gemini",     ... },
  { "provider_key": "rule-based", ... }   # always success=True
]
```

**This function is called in two contexts:**
1. **Complaint creation form** — `POST /api/intelligence/analyze-all/` — lets citizens see all four model predictions simultaneously before submitting
2. **LLM analytics evaluation** — `GET /api/intelligence/llm-analytics/` — runs this on N complaints to compute evaluation metrics

---

### 7.6 Rate Limiting

**Class:** `_GroqRateLimiter`

A thread-safe sliding-window token bucket that prevents the Groq API from returning 429 RPM errors during parallel evaluations.

```python
class _GroqRateLimiter:
    _max  = 28       # allow 28 calls per window (2 below the 30 RPM hard limit)
    _win  = 60.0     # 60-second sliding window
    _lock = threading.Lock()
    _log: list[float] = []

    @classmethod
    def wait(cls) -> None:
        while True:
            with cls._lock:
                now      = time.monotonic()
                cls._log = [t for t in cls._log if now - t < cls._win]
                if len(cls._log) < cls._max:
                    cls._log.append(time.monotonic())
                    return       # slot acquired
                sleep_for = cls._log[0] + cls._win - now
            # Release lock before sleeping — other threads can keep checking
            if sleep_for > 0:
                time.sleep(sleep_for)
```

**How it works:**
- `_log` is a list of `time.monotonic()` timestamps representing when each Groq call was dispatched
- Before every Groq API call, the calling thread invokes `_GroqRateLimiter.wait()`
- The lock is acquired, calls older than 60 s are pruned, and if fewer than 28 remain, a new timestamp is appended and the thread proceeds
- If the window is full (28 calls in the last 60 s), `sleep_for` is computed as `oldest_call + 60 - now`, the lock is **released**, and the thread sleeps
- The lock is released before sleeping so other threads checking for available slots are not blocked

**Thread safety:** Multiple threads may simultaneously compute their `sleep_for` and race to re-check the window. This is safe because the check-and-insert is always done under the lock, making it atomically consistent.

`_GroqRateLimiter.wait()` is called in both `_analyze_with_groq_key()` (used by `analyze_all_llms`) and `_analyze_with_groq()` (used by the fallback chain in `categorize_complaint()`).

---

### 7.7 Crime Hotspot Detection

**Function:** `get_crime_hotspots(complaints: QuerySet) → list[dict]`

Implements a lightweight spatial clustering algorithm based on a uniform 1 km grid:

1. **Grid key generation:** For each geocoded complaint, the latitude and longitude are rounded to 2 decimal places (`round(lat, 2)`, `round(lon, 2)`). At India's latitude (~13°N for Bangalore), 0.01° ≈ 1.1 km, giving a grid resolution of approximately 1 km × 1 km.

2. **Cell accumulation:** Each grid cell accumulates `count`, a list of `categories`, and the sum of `severity_score` values from all complaints mapped to it.

3. **Threshold filtering:** Only cells with `count ≥ 2` are classified as hotspots and returned.

4. **Per-hotspot output:**
```python
{
    "lat"           : float,    # cell centre latitude (rounded)
    "lon"           : float,    # cell centre longitude (rounded)
    "incident_count": int,      # number of complaints in this cell
    "severity_avg"  : float,    # mean severity score across all complaints in cell
    "risk_level"    : str,      # "high" if count >= 5, "medium" otherwise
    "top_category"  : str,      # modal category (most frequent) in cell
}
```

5. **Sorting:** Results sorted descending by `incident_count` (highest density first).

**Limitations:** The grid-based approach does not perform true spatial clustering (e.g. DBSCAN). Incidents at cell boundaries may be split across adjacent cells. A DBSCAN implementation would produce better cluster boundaries but would require scipy.

---

## 8. REST API Reference

All endpoints are prefixed with `/api/`. Authentication uses **JWT Bearer tokens** unless marked as Public.

### 8.1 Authentication API

**Base URL:** `/api/auth/`

#### POST `/api/auth/register/`
Public. Creates a new user account.

**Request body:**
```json
{
  "username"     : "john_doe",
  "email"        : "john@example.com",
  "password"     : "SecurePass123",
  "password_confirm": "SecurePass123",
  "first_name"   : "John",
  "last_name"    : "Doe",
  "role"         : "citizen",
  "phone"        : "9876543210",
  "city"         : "Bangalore",
  "state"        : "Karnataka"
}
```

Role-specific additional fields:
- Authority: `"badge_number": "KA-PO-1234"`, `"station_name": "MG Road Police Station"`

**Response (HTTP 201):**
```json
{
  "message": "Registration successful. Welcome to SURAKSHA!",
  "user": {
    "id": 42, "username": "john_doe", "email": "...",
    "role": "citizen", "first_name": "John", ...
  },
  "tokens": {
    "access": "<JWT access token — expires 24h>",
    "refresh": "<JWT refresh token — expires 7 days>"
  }
}
```

**Side effects:** `is_verified` automatically set to `True`. User is created in the `accounts_user` table.

---

#### POST `/api/auth/login/`
Public. Authenticates credentials and returns tokens.

**Request:** `{ "username": "john_doe", "password": "SecurePass123" }`

**Response (HTTP 200):**
```json
{
  "message": "Login successful.",
  "user": { ...full user object... },
  "tokens": { "access": "...", "refresh": "..." }
}
```

---

#### POST `/api/auth/token/refresh/`
Public. Exchanges a valid refresh token for a new access token.

**Request:** `{ "refresh": "<refresh_token>" }`  
**Response:** `{ "access": "<new_access_token>" }`

---

#### GET `/api/auth/profile/`
JWT required. Returns the authenticated user's full profile.

**Response:** Full user serializer output including all role-specific fields.

---

#### PUT / PATCH `/api/auth/profile/`
JWT required. Updates the authenticated user's profile.

**Response:** `{ "message": "Profile updated successfully.", "user": {...} }`

---

#### GET `/api/auth/dashboard-stats/`
JWT required. Returns statistics tailored to the user's role.

**Response — citizen:**
```json
{
  "total_reports": 12,
  "pending": 4,
  "in_progress": 3,
  "resolved": 5
}
```

**Response — admin / authority:**
```json
{
  "total_complaints": 342,
  "pending": 87,
  "in_progress": 45,
  "resolved": 201,
  "high_priority": 23,
  "critical_priority": 8
}
```

---

### 8.2 Complaints API

**Base URL:** `/api/complaints/`

#### GET `/api/complaints/`
JWT required. Returns a paginated, role-filtered list of complaints.

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status value |
| `priority` | string | Filter by priority value |
| `category` | string | Filter by category value |
| `search` | string | Full-text search on title, description, location |
| `ordering` | string | Any model field; prefix `-` for descending |

**Role filtering (server-enforced):**
- `citizen` → `Complaint.objects.filter(reporter=request.user)`
- `authority` / `admin` → `Complaint.objects.all()`

**Response:** Paginated list with `count`, `next`, `previous`, `results[]`. Each result uses `ComplaintListSerializer` (abbreviated fields; no timeline).

---

#### POST `/api/complaints/`
JWT required. Creates a new complaint.

**Request body:**
```json
{
  "title"            : "Theft at MG Road bus stop",
  "description"      : "My mobile phone was snatched while waiting for the bus...",
  "incident_location": "MG Road, Bangalore",
  "incident_address" : "47 MG Road, Near Chinnaswamy Stadium, Bangalore 560001",
  "is_anonymous"     : false,
  "incident_date"    : "2026-05-16T18:30:00"
}
```

**Processing pipeline (all happens inside the view before returning):**
1. Validates fields (min lengths enforced)
2. Calls `categorize_complaint(title, description)` → AI result
3. Sets `ai_category`, `ai_priority`, `ai_summary`, `category`, `priority`
4. Calls `compute_severity(...)` → sets `severity_score`
5. Calls `geocode_location(incident_address, incident_location)` → sets `latitude`, `longitude`
6. Saves the complaint
7. Creates first `ComplaintUpdate` timeline entry
8. Creates `Notification` for every `authority`/`admin` user

**Response (HTTP 201):** Full `ComplaintDetailSerializer` output including nested evidence (empty) and updates (one entry).

---

#### GET `/api/complaints/<complaint_id>/`
JWT required. Returns full complaint detail.

**Response:** `ComplaintDetailSerializer` including:
- All complaint fields
- `evidence[]` — list of all attached files
- `updates[]` — full status history (public entries only for citizens; all entries for authority/admin)

---

#### POST `/api/complaints/<complaint_id>/update/`
JWT required (authority / admin only). Updates complaint status and adds a timeline entry.

**Request body:**
```json
{
  "status"          : "in_progress",
  "priority"        : "high",
  "message"         : "Officer Ravi has been dispatched to the location.",
  "assigned_to_id"  : 15,
  "authority_notes" : "CCTV footage requested from BMTC",
  "resolution_details": ""
}
```

**Side effects:**
- Updates `complaint.status`, `complaint.priority`, `complaint.assigned_to`
- If `new_status == "resolved"`: sets `complaint.resolved_at = now()`
- Creates `ComplaintUpdate` entry with `is_public=True`
- Creates `Notification` for the reporter (`complaint_update` type)

**Response:** `{ "message": "Complaint updated successfully.", "complaint": {...} }`

---

#### POST `/api/complaints/<complaint_id>/evidence/`
JWT required (reporter or authority). Uploads evidence files (multipart form data).

**Request:** Multipart form with `files[]` (multiple files allowed) and optional `description`.

**Response (HTTP 201):**
```json
{
  "uploaded": [
    { "id": 7, "file": "/media/evidence/2026/05/16/photo.jpg", "file_type": "image", ... }
  ],
  "count": 1
}
```

---

#### GET `/api/complaints/data/analytics/`
JWT required. Returns aggregated statistics for charts.

**Response:**
```json
{
  "by_category": [
    {"category": "theft",   "count": 45},
    {"category": "assault", "count": 32}, ...
  ],
  "by_status": [
    {"status": "pending",     "count": 87},
    {"status": "in_progress", "count": 45}, ...
  ],
  "by_priority": [
    {"priority": "critical", "count": 8},
    {"priority": "high",     "count": 23}, ...
  ],
  "monthly_trend": [
    {"month": "2026-01", "count": 28},
    {"month": "2026-02", "count": 35}, ...
  ],
  "urgent_count": 31,
  "total"       : 342,
  "resolved"    : 201
}
```

---

#### GET `/api/complaints/data/notifications/`
JWT required. Returns the last 30 notifications for the current user.

**Response:**
```json
{
  "notifications": [
    {
      "id": 88, "title": "Complaint SRK1234567 Updated",
      "message": "Your complaint status changed to in_progress.",
      "notif_type": "complaint_update", "is_read": false,
      "related_complaint": "SRK1234567", "created_at": "2026-05-16T..."
    }
  ],
  "unread_count": 3
}
```

---

#### POST `/api/complaints/data/notifications/read/`
JWT required. Marks all of the current user's notifications as read.

**Response:** `{ "message": "All notifications marked as read." }`

---

### 8.3 Intelligence API

**Base URL:** `/api/intelligence/`

#### POST `/api/intelligence/analyze/`
JWT required. Analyses a single complaint using the **fallback chain** (Tier 1 → 2 → 3 → 4, stopping at first success).

**Request:** `{ "title": "...", "description": "..." }`

**Response:**
```json
{
  "category"    : "theft",
  "priority"    : "high",
  "summary"     : "A mobile phone snatch reported at MG Road bus stop; immediate patrolling recommended.",
  "ai_provider" : "groq-llama3.3-70b (key 1)",
  "severity_score": 6.75
}
```

This endpoint is used internally during `POST /api/complaints/` — it is not called by the frontend directly in the complaint form (which uses `analyze-all` instead for the side-by-side comparison view).

---

#### POST `/api/intelligence/analyze-all/`
JWT required. Runs **all four providers simultaneously** and returns all four results.

**Request:** `{ "title": "...", "description": "..." }`

**Response:**
```json
{
  "results": [
    {
      "provider_key"  : "groq-key-1",
      "provider_label": "Groq Llama-3.3-70b (Key 1)",
      "success"       : true,
      "latency_ms"    : 387.4,
      "category"      : "theft",
      "priority"      : "high",
      "summary"       : "...",
      "severity_score": 6.75
    },
    { "provider_key": "groq-key-2", "success": true, ... },
    { "provider_key": "gemini",     "success": true, ... },
    { "provider_key": "rule-based", "success": true, ... }
  ]
}
```

This is displayed in the **CreateComplaintPage** as four side-by-side provider cards before the citizen submits their complaint.

---

#### GET `/api/intelligence/hotspots/`
JWT required. Computes and returns crime hotspot clusters from all complaints with GPS coordinates.

**Response:**
```json
{
  "hotspots": [
    {
      "lat": 12.97, "lon": 77.60,
      "incident_count": 14,
      "severity_avg": 7.2,
      "risk_level": "high",
      "top_category": "theft"
    }, ...
  ]
}
```

---

#### GET `/api/intelligence/map-data/`
JWT required. Returns both individual complaint pins and hotspot clusters for the live map view.

**Role filtering:** Authority/admin see all complaints; citizens see only their own.

**Response:**
```json
{
  "pins": [
    {
      "complaint_id": "SRK1234567",
      "title": "Theft at MG Road",
      "category": "theft",
      "priority": "high",
      "status": "pending",
      "severity_score": 6.75,
      "lat": 12.9762,
      "lon": 77.6033,
      "location": "MG Road, Bangalore",
      "ai_summary": "...",
      "created_at": "16 May 2026"
    }, ...
  ],
  "hotspots"          : [...],
  "total_with_coords" : 287,
  "total_complaints"  : 342,
  "category_counts"   : [
    {"category": "theft", "count": 45},
    {"category": "assault", "count": 32}, ...
  ]
}
```

---

#### GET `/api/intelligence/insights/`
JWT required. Generates four narrative AI insights from aggregate statistics.

**Response:**
```json
{
  "resolution_rate" : 58.8,
  "pending_critical": 8,
  "total_analyzed"  : 342,
  "ai_categorized"  : 338,
  "insights": [
    "58.8% of all complaints have been resolved.",
    "8 critical complaints need immediate attention.",
    "Top reported category: Theft.",
    "Peak reporting hours: 6PM – 10PM (based on data trends)."
  ]
}
```

---

## 9. Role-Based Access Control

SURAKSHA implements a three-role RBAC system enforced at two layers: the backend (per-view role checks) and the frontend (route guards).

### Role Definitions

| Role | Primary Purpose | Complaint Access | Admin Views |
|------|----------------|-----------------|-------------|
| `citizen` | General public | Own complaints only | No |
| `authority` | Police officer | All complaints; can update status, assign | All admin pages |
| `admin` | System administrator | All complaints; full update rights | All admin pages + user management |

### Backend Enforcement

Each view explicitly checks `request.user.role`:

```python
# Complaint list — role-based queryset
if user.role in ('authority', 'admin'):
    qs = Complaint.objects.all()
else:
    qs = Complaint.objects.filter(reporter=user)

# Complaint update — authority/admin only
if request.user.role not in ('authority', 'admin'):
    return Response({'error': 'Permission denied.'}, status=403)
```

### Frontend Enforcement

`App.jsx` wraps every route with a `ProtectedRoute` component that:
1. Checks if the user is authenticated (JWT present and profile loaded)
2. Optionally checks `allowedRoles` — e.g. admin pages require `['admin', 'authority']`
3. Redirects unauthenticated users to `/login`; redirects wrong-role users to their appropriate dashboard

---

## 10. Geocoding Integration

**File:** `backend/apps/complaints/utils.py`

**Function:** `geocode_location(primary_address: str, fallback_location: str) → tuple[float | None, float | None]`

Uses the **Nominatim** geocoding service from OpenStreetMap — free, no API key required, country-biased to India.

**Process:**
1. Attempts geocoding with `primary_address` (the full address string from the complaint form)
2. If that fails or returns no results, attempts with `fallback_location` (the short location name)
3. If both fail, returns `(None, None)` — geocoding failure is non-fatal; the complaint is saved without coordinates

**Request parameters:**
```python
requests.get(
    "https://nominatim.openstreetmap.org/search",
    params={
        "q": address,
        "format": "json",
        "limit": 1,
        "countrycodes": "in",   # bias to India
    },
    headers={"User-Agent": "SURAKSHA/1.0"},
    timeout=6
)
```

**Output from Nominatim:** `[{"lat": "12.9762", "lon": "77.6033", ...}]` — latitude and longitude are returned as strings and cast to `float`.

**Significance:** GPS coordinates stored in `Complaint.latitude` and `Complaint.longitude` enable:
- The crime hotspot grid clustering algorithm
- Individual complaint pins on the Leaflet map
- Future geospatial queries and proximity analysis

---

## 11. Frontend Application

### 11.1 Authentication Flow

**File:** `frontend/src/context/AuthContext.jsx`

Global JWT auth state provided via React Context to the entire app.

**State on mount:**
1. Reads `access_token` from `localStorage`
2. If token exists, calls `GET /api/auth/profile/` to hydrate the user object
3. If this fails (expired token), attempts `POST /api/auth/token/refresh/` using `refresh_token` from `localStorage`
4. If refresh fails, clears `localStorage` and sets `user = null`

**Exposed values:**
```javascript
{
  user,           // full user object or null
  loading,        // true while auth state is being determined
  login,          // (data) => calls POST /api/auth/login/, stores tokens
  register,       // (data) => calls POST /api/auth/register/, stores tokens
  logout,         // clears localStorage, sets user = null, redirects to /login
  updateUser,     // (updatedUser) => patches local user state
  isAuthority,    // user?.role === 'authority'
  isCitizen,      // user?.role === 'citizen'
}
```

**Axios interceptor** (in `api.js`) automatically handles 401 responses: when any API call returns 401, the interceptor uses the stored `refresh_token` to silently get a new `access_token`, updates `localStorage`, and retries the original request. If refresh also fails, the user is redirected to `/login`.

---

### 11.2 Citizen Interface

#### `RegisterPage.jsx`
A three-step wizard collecting user information progressively:

- **Step 1** — Role selection (citizen / authority) + first and last name
- **Step 2** — Username, email, password, confirm password
- **Step 3** — Phone, city, state + role-specific fields (badge/station for authority)

Submits to `POST /api/auth/register/` and on success stores tokens in `localStorage` and redirects based on role.

---

#### `LoginPage.jsx`
Username/password form. On success, stores `access_token` and `refresh_token` in `localStorage`, sets user context, and redirects to role-specific dashboard.

---

#### `DashboardPage.jsx`
Fetches dashboard stats (`GET /api/auth/dashboard-stats/`) and the last 5 complaints (`GET /api/complaints/?ordering=-created_at&limit=5`) on mount.

Displays:
- Four stat cards: total reports, pending, in progress, resolved — with colour-coded counts
- A recent activity feed with status and priority colour badges

---

#### `CreateComplaintPage.jsx`
The most complex citizen page. Combines complaint filing with a real-time AI comparison panel.

**Workflow:**
1. User fills title and description
2. User clicks **"⚡ Analyze with All Models"** — calls `POST /api/intelligence/analyze-all/`
3. Four `ProviderCard` components appear showing each model's prediction:
   - Category, priority, severity score, AI summary
   - Latency in milliseconds
   - Success/failure status
4. An `AgreementBanner` shows:
   - Green banner: all models agree on both category and priority
   - Yellow banner: partial agreement (one dimension matches, one doesn't)
   - Red banner: models disagree on both
5. User fills incident location and optional address
6. User optionally toggles anonymous submission
7. User submits — calls `POST /api/complaints/` with all form fields

**Output data generated:**
- 4 AI result cards displayed in a 2×2 grid
- Agreement state computed from all successful results
- Final complaint sent to backend where the `categorize_complaint()` fallback chain runs independently (may differ from the preview)

---

#### `CitizenComplaintsPage.jsx`
Filterable/searchable list of the citizen's own complaints. Supports filtering by status, priority, and category. Each complaint card is expandable to show the full description and status history.

---

#### `NotificationsPage.jsx`
Fetches and displays the last 30 notifications from `GET /api/complaints/data/notifications/`. A "Mark all read" button calls `POST /api/complaints/data/notifications/read/`. Unread notifications are highlighted visually.

---

### 11.3 Admin / Authority Interface

#### `AdminDashboardPage.jsx`
Auto-refreshes every 30 seconds using `setInterval`. Displays:
- Dashboard stat cards (`GET /api/auth/dashboard-stats/`)
- AI insights narrative (`GET /api/intelligence/insights/`)
- Recent complaint list (last 5)

---

#### `AdminComplaintsPage.jsx`
Full complaint management table with:
- Search + filter controls (status, priority, category)
- Sortable columns
- **Inline `UpdateModal`** — opens a drawer/modal allowing:
  - Status change dropdown
  - Priority override
  - Officer assignment (autocomplete of authority/admin users)
  - Authority notes (private)
  - Resolution details (public)
  - Mandatory update message
- Submits via `POST /api/complaints/<id>/update/`

---

#### `AdminAnalyticsPage.jsx`
Data visualisation page powered by **Recharts**. All data from `GET /api/complaints/data/analytics/`.

Charts rendered:
1. **Bar chart — by category:** 12 categories on X-axis, count on Y-axis
2. **Pie chart — by priority:** 4 slices (critical=red, high=orange, medium=yellow, low=green)
3. **Bar chart — by status:** 6 statuses
4. **Line chart — monthly trend:** last 12 months, complaint count per month

---

#### `AdminUsersPage.jsx`
Paginated user list (`GET /api/auth/users/`) with search (username, email, name) and filter by role. Shows count of users per role. Admin-only access.

---

#### `HotspotMapPage.jsx`
Interactive **Leaflet** map centered on Bangalore (default coordinates: 12.9716°N, 77.5946°E).

Data from `GET /api/intelligence/map-data/`:

**Individual complaint pins:**
- Coloured marker icons by priority (critical=red, high=orange, medium=yellow, low=green)
- Click → popup with complaint ID, title, category, status, AI summary, date

**Hotspot cluster circles:**
- `CircleMarker` with radius proportional to `incident_count`
- Colour by `risk_level` (high=red, medium=orange)
- Click → popup with incident count, dominant category, average severity

Map auto-fits bounds to all visible data using Leaflet's `fitBounds()`.

---

### 11.4 Shared Infrastructure

#### `Layout.jsx`
The shell component wrapping all authenticated pages. Contains:
- **`Sidebar.jsx`** — Role-aware navigation links. Citizens see Dashboard, Complaints, Notifications. Admin/Authority see Dashboard, All Complaints, Analytics, Crime Map, Users.
- **`Navbar.jsx`** — Top bar with live clock (updates every second), notification bell with unread badge count (fetches count every 30 s), user role badge, and profile/logout menu.

#### `ErrorBoundary.jsx`
React class-based error boundary wrapping the entire app. Catches JavaScript errors in child components and displays a friendly fallback UI instead of a blank screen.

#### `api.js` — Axios Instance
All API calls flow through a centralised Axios instance:
- **`baseURL`:** `http://localhost:8000/api` (or `REACT_APP_API_URL` env var)
- **`timeout`:** 30 000 ms globally; overridden to 300 000 ms for `getLLMAnalytics` (5-minute LLM evaluation)
- **Request interceptor:** Reads `access_token` from `localStorage` → attaches `Authorization: Bearer <token>`. Tags every request with `metadata.startTime = Date.now()`.
- **Response interceptor:** On success → logs status + latency. On 401 → attempts token refresh and retries. On 5xx → logs at ERROR level. On 4xx → logs at WARN level.

Grouped API namespaces:
```javascript
authAPI         = { register, login, getProfile, updateProfile, getDashboardStats }
complaintsAPI   = { getAll, getOne, create, updateStatus, uploadEvidence,
                    getAnalytics, getNotifications, markNotificationsRead }
intelligenceAPI = { analyzeText, getHotspots, getMapData, getInsights,
                    analyzeAll, getLLMAnalytics }
```

#### `logger.js` — Frontend Logger
Structured console + remote logger with five severity levels: `DEBUG < INFO < WARN < ERROR < CRITICAL`.

Features:
- **Module scoping:** `logger.module('CreateComplaintPage')` returns a logger that prefixes all messages with the module name
- **In-memory buffer:** Last 100 log entries kept in memory for debugging
- **Remote shipping:** `WARN+` logs are asynchronously POSTed to `/api/logs/frontend/` at most once every 2 seconds (rate-limited)
- **Global error capture:** Registers `window.onerror` and `window.addEventListener('unhandledrejection')` handlers to automatically log uncaught JavaScript errors

---

## 12. Data Flow — Complaint Lifecycle

```
Citizen submits complaint via CreateComplaintPage
         │
         ▼
POST /api/complaints/
  │
  ├─ Input validation
  │   ├─ title: ≥10 chars
  │   └─ description: ≥30 chars
  │
  ├─ AI Analysis (categorize_complaint)
  │   ├─ Try Groq Key 1 (llama-3.3-70b, temp=0.1)
  │   │   ├─ Success → parse JSON → validate category/priority
  │   │   └─ Fail → try Key 2
  │   ├─ Try Groq Key 2
  │   │   └─ Fail → try Gemini
  │   ├─ Try Gemini (gemini-2.0-flash, temp=0.1)
  │   │   └─ Fail → rule-based
  │   └─ Rule-based keyword analysis (always succeeds)
  │   → Sets: category, priority, ai_summary
  │
  ├─ Severity Scoring (compute_severity)
  │   → Sets: severity_score (0.0–10.0)
  │
  ├─ Geocoding (geocode_location via Nominatim)
  │   → Sets: latitude, longitude (nullable)
  │
  ├─ DB Save (Complaint row created)
  │   → complaint_id = "SRK" + 7 random digits
  │   → created_at = now() in IST
  │   → status = "pending"
  │
  ├─ Timeline entry created (ComplaintUpdate)
  │   → message = "Complaint filed. Automated AI analysis completed."
  │   → is_public = True
  │
  └─ Notifications sent (Notification rows)
      → One row per authority/admin user
      → notif_type = "new_assignment"
      → title = "New Complaint Filed: SRKxxxxxxx"

         ▼ (Later — authority updates)

POST /api/complaints/<id>/update/
  ├─ Role check: must be authority or admin
  ├─ Update complaint fields (status, priority, assigned_to)
  ├─ If status → "resolved": set resolved_at = now()
  ├─ Create ComplaintUpdate timeline entry
  └─ Create Notification for reporter
      → notif_type = "complaint_update"
      → title = "Complaint SRKxxxxxxx Updated"
```

**Final stored data per complaint:**
- 1 row in `complaints_complaint` (all fields)
- 1+ rows in `complaints_complaintupdate` (one per status change)
- 0+ rows in `complaints_complainntevidence` (one per uploaded file)
- 1+ rows in `complaints_notification` (for all relevant users)

---

## 13. Data Storage and Persistence

### Database Tables

| Table | Rows (typical) | Primary key | Notable indexes |
|-------|---------------|-------------|----------------|
| `accounts_user` | 10–1000 | BigInt PK | `username` (unique) |
| `complaints_complaint` | 300+ (311 in dev with test import) | BigInt PK | `complaint_id` (unique), `(status, priority)`, `category`, `created_at` |
| `complaints_complaintnupdate` | ~3× complaint count | BigInt PK | FK to complaint |
| `complaints_complaintevidence` | Variable | BigInt PK | FK to complaint |
| `complaints_notification` | High volume | BigInt PK | `(user, is_read)` |

### File Storage

All uploaded evidence files are stored under `backend/media/`:
```
media/
├── avatars/              ← User profile pictures
│   └── <filename>
└── evidence/
    └── YYYY/MM/DD/       ← Date-partitioned evidence files
        └── <filename>
```

### Log Files

All logs use `RotatingFileHandler` under `backend/logs/`:

| File | Content | Size / Retention |
|------|---------|-----------------|
| `suraksha.log` | All INFO+ application events | 10 MB × 5 backup files |
| `errors.log` | ERROR and above only | 5 MB × 5 backup files |
| `ai_analysis.log` | Every LLM call, latency, parse result, severity calculation | 10 MB × 3 backup files |
| `requests.log` | One line per HTTP request (method, path, user, status, ms) | 20 MB × 5 backup files |

### Test Data (Research Dataset)

300 test complaints were imported from an Excel file (`cases - test 300.xlsx`) using the `import_test_cases` management command. They are tagged by prefixing `ai_summary` with `TEST_IMPORT|<original_category>|` for easy identification and removal.

**Category distribution after keyword-based mapping to SURAKSHA taxonomy:**

| Category | Count | Percentage | Source mapping |
|----------|-------|-----------|---------------|
| `other` | 126 | 42% | Utility, Roads, Water, Civic, Education, Health, Fire, Infrastructure, NaturalDisaster |
| `assault` | 87 | 29% | Crime/Critical Excel rows (default mapping) |
| `vandalism` | 42 | 14% | Environment, Sanitation, Encroachment |
| `traffic` | 17 | 6% | Traffic category |
| `missing_person` | 6 | 2% | Keyword matches: missing, kidnap, abduct |
| `theft` | 6 | 2% | Keyword matches: theft, steal, rob |
| `harassment` | 5 | 2% | Keyword matches: harass, sexual, rape |
| `noise` | 5 | 2% | Noise category |
| `domestic` | 2 | 1% | Keyword matches: domestic, dowry, spouse |
| `fraud` | 2 | 1% | Keyword matches: fraud, scam, cheat |
| `drug_activity` | 1 | 0% | Keyword matches: drug, narcotic |
| `cybercrime` | 1 | 0% | Keyword matches: cyber, online fraud, phish |
| **Total** | **300** | **100%** | |

**Research note:** The dataset is heavily skewed toward `other` (42%) and `assault` (29%), with negligible representation of cybercrime, drug activity, and fraud. This skew significantly depresses macro-averaged F1 scores compared to the balanced 1,200-complaint synthetic dataset used in the reference research paper (ICISCE 2025 — MTIAE). See the Honest Comparison Report in the LLM Analytics page for a detailed breakdown.

---

## 14. Setup and Installation

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm 9+

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment variables (copy and fill in)
cp .env.example .env
# Edit .env with your API keys

# Run migrations
python manage.py migrate

# Create admin user
python manage.py createsuperuser

# (Optional) Seed demo data
python manage.py seed_data

# Start development server
python manage.py runserver 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server (proxies API to localhost:8000)
npm start
```

The React dev server runs at `http://localhost:3000`. The proxy in `package.json` forwards `/api/` requests to `http://localhost:8000`.

---

## 15. Environment Variables

**File:** `backend/.env`

```ini
# Groq AI (Llama-3.3-70b-versatile)
GROQ_API_KEY_1=gsk_...   # Primary key — org shared 30 RPM, 100k TPD
GROQ_API_KEY_2=gsk_...   # Secondary key — same org, additional 100k TPD buffer

# Google Gemini (gemini-2.0-flash)
GEMINI_API_KEY=AIza...    # Free tier: daily request quota applies

# Django
SECRET_KEY=django-insecure-...   # Generate a new one for production
DEBUG=True
ALLOWED_HOSTS=*
```

**Rate limit context for research:**
- Groq 30 RPM means at most 28 complaint analyses per minute across both keys (the rate limiter caps to 28/min)
- Groq 100k TPD: each complaint analysis uses approximately 350–500 tokens total (prompt + response); 100k tokens supports ~200–285 analyses before TPD exhaustion per key
- Gemini free tier: daily request limit varies by account; may exhaust with large evaluations

---

## 16. Management Commands

### `python manage.py seed_data`
**File:** `backend/apps/accounts/management/commands/seed_data.py`

Creates demo users with pre-set credentials and sample data for development:
- `admin` / `admin123` — admin role
- `officer_ravi` / `officer123` — authority role
- `priya_sharma` / `citizen123` — citizen role
- Sample complaints

### `python manage.py import_test_cases`
**File:** `backend/apps/complaints/management/commands/import_test_cases.py`

Imports complaints from an Excel file for LLM evaluation benchmarking.

```bash
# Default (reads from ~/Downloads/cases - test 300.xlsx)
python manage.py import_test_cases

# Custom file path
python manage.py import_test_cases --file /path/to/cases.xlsx

# Clear previous imports before re-importing
python manage.py import_test_cases --clear
```

**Excel format expected:**

| Column 0 | Column 1 | Column 2 | Column 3 | Column 4 | Column 5 |
|----------|----------|----------|----------|----------|----------|
| Case ID | Category | Incident Title | Detailed Description | Incident Location | Full Address |

**Category mapping applied:**

Excel categories mapped directly: `Traffic→traffic`, `Noise→noise`, `Environment/Sanitation/Encroachment→vandalism`, `Roads/Water/Electricity/Utility/Civic/Education/Infrastructure→other`, `Health→other(medium)`, `Fire→other(high)`, `NaturalDisaster→other(high)`.

Crime/Critical Excel rows run through keyword rules first (missing/kidnap→`missing_person`, harass/sexual/rape→`harassment`, theft/steal/rob→`theft`, drug/narcotic→`drug_activity`, domestic/dowry/spouse→`domestic`, fraud/scam→`fraud`, cyber/phish→`cybercrime`, vandaliz/damage→`vandalism`, traffic/accident→`traffic`), then default to `assault/high` for Crime rows and `assault/critical` for Critical rows.

Each imported complaint:
- Gets `severity_score` computed by `compute_severity()`
- Has `status = 'pending'`
- Has `ai_summary` prefixed with `TEST_IMPORT|<ExcelCategory>|` for filtering
- Is attributed to the first admin/superuser in the database as the reporter

---

*This README was written to support research documentation for the SURAKSHA MTIAE system. For the LLM model evaluation methodology, metric computation (F1, MAE, Spearman ρ), and paper benchmark comparisons, refer to the LLM Analytics page in the admin interface and the ICISCE 2025 MTIAE paper.*
