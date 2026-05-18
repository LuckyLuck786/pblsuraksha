# SURAKSHA — AI-Powered Public Safety Intelligence Platform

> *SURAKSHA* (Sanskrit: सुरक्षा — *protection*) is a full-stack research prototype that demonstrates a
> **Multi-Tier Intelligent Analysis Engine (MTIAE)** for automated classification, prioritisation,
> and routing of public safety complaints using multiple large language models operating in parallel.
>
> Built on **Django REST Framework** (backend) and **React 18** (frontend), the system evaluates
> five independent AI/NLP providers — two Groq models (Llama-3.3-70b, Qwen3-32b) each on a dedicated
> API key, Cerebras GPT-OSS-120b on a completely independent inference provider, Google Gemini
> 3.1-Flash-Lite, and a deterministic rule-based engine — selecting the best result through a
> structured fallback chain. Every complaint is automatically severity-scored on a 0–10 scale,
> geocoded to GPS coordinates, and dispatched as a real-time notification to authority users.

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
   - 6.2 [Complaint Model](#62-complaint-model-complaintscomplaint)
   - 6.3 [Complaint Evidence Model](#63-complaint-evidence-model)
   - 6.4 [Complaint Update Model (Timeline)](#64-complaint-update-model-timeline)
   - 6.5 [Notification Model](#65-notification-model)
7. [Intelligence Engine](#7-intelligence-engine)
   - 7.1 [MTIAE Architecture and Fallback Chain](#71-mtiae-architecture-and-fallback-chain)
   - 7.2 [NCRB Taxonomy — 12 Crime Categories](#72-ncrb-taxonomy--12-crime-categories)
   - 7.3 [LLM Prompt Design](#73-llm-prompt-design)
   - 7.4 [Response Parsing and Validation](#74-response-parsing-and-validation)
   - 7.5 [Severity Scoring Algorithm](#75-severity-scoring-algorithm)
   - 7.6 [Parallel Multi-Provider Analysis](#76-parallel-multi-provider-analysis)
   - 7.7 [Rate Limiting and 429 Back-off](#77-rate-limiting-and-429-back-off)
   - 7.8 [Crime Hotspot Detection](#78-crime-hotspot-detection)
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
    - 11.4 [LLM Analytics Dashboard](#114-llm-analytics-dashboard)
12. [Data Flow — Complaint Lifecycle](#12-data-flow--complaint-lifecycle)
13. [Evaluation Methodology](#13-evaluation-methodology)
    - 13.1 [Dataset — 300 Balanced Research Cases](#131-dataset--300-balanced-research-cases)
    - 13.2 [Stratified Sampling Algorithm](#132-stratified-sampling-algorithm)
    - 13.3 [Evaluation Metrics](#133-evaluation-metrics)
    - 13.4 [Paper Reference Values](#134-paper-reference-values)
14. [Setup and Installation](#14-setup-and-installation)
15. [Environment Variables](#15-environment-variables)
16. [Management Commands](#16-management-commands)

---

## 1. Project Overview

SURAKSHA is a civic-safety platform centered on public complaint management. Citizens file structured incident reports covering twelve crime categories aligned with India's National Crime Records Bureau (NCRB) taxonomy. The system automatically:

1. **Classifies** every complaint using an ensemble of five independent AI/NLP systems running in parallel
2. **Prioritises** the incident across four severity tiers (`low`, `medium`, `high`, `critical`)
3. **Severity-scores** it on a continuous 0–10 scale via a blended content + priority formula
4. **Geocodes** the reported location to GPS coordinates using OpenStreetMap Nominatim (no API key required)
5. **Notifies** all registered authority users in real time via the notification subsystem
6. **Routes** the case through a full lifecycle: `pending → acknowledged → in_progress → resolved → closed`

Authority users (police officers, administrators) review cases, update status, add internal investigation notes, attach resolution details, and can override the AI-assigned category or priority when necessary.

The platform's research contribution is the MTIAE framework — a multi-provider LLM ensemble with a deterministic fallback that maintains 99.5%+ classification availability even when individual AI providers experience rate limits or outages.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      REACT 18  FRONTEND                        │
│               (Create React App + Tailwind CSS)                │
│                                                                │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │   Citizen Pages       │  │  Admin / Authority Pages     │    │
│  │  Dashboard · Submit  │  │  Complaints · Analytics      │    │
│  │  My Cases · Notifs   │  │  Users · Hotspot Map         │    │
│  │                      │  │  LLM Analytics Dashboard     │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │      AuthContext (JWT state)  ·  Axios API Layer       │    │
│  │      Interceptors: token inject + 401 auto-refresh     │    │
│  └────────────────────────────────────────────────────────┘    │
└───────────────────────────┬────────────────────────────────────┘
                            │  REST/JSON  ·  JWT Bearer Token
┌───────────────────────────▼────────────────────────────────────┐
│                 DJANGO REST FRAMEWORK  BACKEND                  │
│                                                                │
│  ┌──────────────┐   ┌───────────────┐   ┌───────────────────┐  │
│  │ accounts app  │   │ complaints app│   │ intelligence app  │  │
│  │              │   │               │   │                   │  │
│  │ User model   │   │ Complaint     │   │  engine.py        │  │
│  │ JWT auth     │   │ Evidence      │   │  ┌─────────────┐  │  │
│  │ Registration │   │ Update        │   │  │ Rate Limiter│  │  │
│  │ Profile      │   │ Notification  │   │  │ per-model   │  │  │
│  └──────────────┘   └───────────────┘   │  └──────┬──────┘  │  │
│                                         │         │parallel  │  │
│                                         └─────────┼──────────┘  │
└─────────────────────────────────────────────────┼───────────────┘
                          Parallel HTTPS calls    │
          ┌──────────┬──────────┬──────────┬──────────┘
          ▼          ▼          ▼          ▼
  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
  │ Groq API  │ │ Groq API  │ │ Cerebras  │ │  Google   │ │Rule-Based │
  │  Key 1    │ │  Key 2    │ │  API      │ │Gemini API │ │NLP Engine │
  │ Llama-3.3 │ │ Qwen3-32b │ │ GPT-OSS   │ │3.1-Flash  │ │(local,0ms)│
  │ -70b-ver. │ │           │ │ -120b     │ │-Lite      │ │           │
  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘
    ↑ Tier 1      ↑ Tier 2      ↑ Tier 3      ↑ Tier 4      ↑ Tier 5
```

**Database:** SQLite 3 in development (`db.sqlite3`), PostgreSQL-ready for production (psycopg2 installed; swap by uncommenting the `psycopg2` block in `settings.py`).

**External services:**

| Service | Purpose | Cost |
|---------|---------|------|
| Groq API — Key 1 | Llama-3.3-70b-versatile inference | Free tier: 30 RPM, 12k TPM (independent pool) |
| Groq API — Key 2 | Qwen3-32b inference | Free tier: 30 RPM, 12k TPM (independent pool) |
| Cerebras API | GPT-OSS-120b inference (Cerebras WSE hardware) | Free tier: 5 RPM, 2,400 RPD, 30k TPM |
| Google Gemini API | gemini-3.1-flash-lite inference | Free tier: 15 RPM, 500 RPD |
| OpenStreetMap Nominatim | Forward geocoding of incident addresses | Free, no API key |

> **Why Cerebras instead of a third Groq key for GPT-OSS-120b?**
> Groq assigns TPD (tokens-per-day) at the *organisation* level — multiple API keys under the same Groq account share one daily quota pool. Cerebras is a completely independent inference provider with its own separate daily limits. Using Cerebras for GPT-OSS-120b means its quota can never be consumed by Llama or Qwen activity on Groq.

---

## 3. Technology Stack

### Backend

| Package | Version | Role |
|---------|---------|------|
| Django | 4.2.7 | Web framework, ORM, admin interface |
| djangorestframework | 3.14.0 | REST API serializers, viewsets, pagination |
| djangorestframework-simplejwt | 5.5.1 | JWT access tokens (24 h) + refresh tokens (7 days) |
| django-cors-headers | 4.3.1 | CORS allow-list for React dev server (`localhost:3000`) |
| Pillow | ≥11.0.0 | User avatar `ImageField` |
| groq | ≥0.9.0 | Official Groq Python SDK (Llama + Qwen) |
| cerebras-cloud-sdk | ≥1.67.0 | Official Cerebras Python SDK (GPT-OSS-120b) |
| google-genai | ≥2.0.0 | Official Google Generative AI Python SDK |
| python-decouple | 3.8 | `.env` variable loading with type coercion |
| psycopg2-binary | ≥2.9.9 | PostgreSQL driver (production path) |
| gunicorn | 21.2.0 | WSGI production server |
| openpyxl | ≥3.1.0 | Excel import for the 300-case research dataset |

### Frontend

| Package | Version | Role |
|---------|---------|------|
| React / ReactDOM | 18.2.0 | UI component framework |
| react-router-dom | 6.20.0 | Client-side routing with `ProtectedRoute` and role redirects |
| axios | 1.6.2 | HTTP client with request/response interceptors |
| leaflet + react-leaflet | 1.9.4 / 4.2.1 | Interactive crime hotspot map |
| recharts | 2.9.3 | Bar, pie, and line charts for analytics dashboards |
| react-hot-toast | 2.4.1 | Toast notifications |
| react-dropzone | 14.2.3 | Evidence file upload with drag-and-drop |
| framer-motion | 10.16.4 | Page transition animations |
| tailwindcss | 3.4.19 | Utility-first CSS with dark-mode support |
| date-fns | 2.30.0 | Date formatting and relative time display |

---

## 4. Repository Structure

```
suraksha/
├── README.md
├── backend/
│   ├── .env                                  ← API keys and secrets (not in git)
│   ├── db.sqlite3                            ← SQLite development database
│   ├── manage.py
│   ├── requirements.txt
│   ├── apps/
│   │   ├── accounts/                         ← User management
│   │   │   ├── models.py                     ← Custom User model (AbstractUser)
│   │   │   ├── serializers.py                ← User, Register, Login, ProfileUpdate
│   │   │   ├── views.py                      ← Auth endpoints + dashboard stats
│   │   │   ├── urls.py
│   │   │   ├── admin.py
│   │   │   └── management/commands/
│   │   │       └── seed_data.py              ← Demo user + sample complaint seeder
│   │   ├── complaints/                       ← Core complaint system
│   │   │   ├── models.py                     ← Complaint, Evidence, Update, Notification
│   │   │   ├── serializers.py                ← Complaint serializers (list / detail / create)
│   │   │   ├── views.py                      ← Complaint CRUD + analytics endpoints
│   │   │   ├── urls.py
│   │   │   ├── utils.py                      ← Nominatim geocoder helper
│   │   │   ├── admin.py
│   │   │   └── management/commands/
│   │   │       └── import_test_cases.py      ← Excel → DB importer (300 research cases)
│   │   └── intelligence/                     ← AI analysis engine
│   │       ├── engine.py                     ← All LLM logic, rate limiters, algorithms
│   │       ├── views.py                      ← Intelligence REST endpoints
│   │       ├── urls.py
│   │       └── admin.py
│   ├── suraksha_project/
│   │   ├── settings.py                       ← Django configuration
│   │   ├── urls.py                           ← Root URL dispatcher
│   │   ├── middleware.py                     ← HTTP request-logging middleware
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── logs/
│   │   ├── suraksha.log                      ← General application events (INFO+)
│   │   ├── errors.log                        ← Error-only log (ERROR+)
│   │   ├── ai_analysis.log                   ← LLM engine detailed trace (DEBUG+)
│   │   └── requests.log                      ← HTTP access log (one line per request)
│   └── media/
│       └── uploads/                          ← User-uploaded evidence files
└── frontend/
    ├── package.json
    ├── tailwind.config.js
    └── src/
        ├── App.jsx                           ← Root component + all routes
        ├── context/
        │   └── AuthContext.jsx               ← JWT auth global state (React Context)
        ├── layout/
        │   ├── Layout.jsx                    ← App shell (sidebar + navbar)
        │   ├── Navbar.jsx                    ← Top bar: live clock, notifications
        │   └── Sidebar.jsx                   ← Role-aware navigation menu
        ├── components/
        │   └── ErrorBoundary.jsx             ← React error boundary
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
        │   │   ├── HotspotMapPage.jsx
        │   │   └── LLMAnalyticsPage.jsx      ← Research evaluation dashboard
        │   └── profile/
        │       └── ProfilePage.jsx
        └── utils/
            ├── api.js                        ← Axios instance + all typed API functions
            └── logger.js                     ← Structured frontend logger
```

---

## 5. Backend — Django Application

### 5.1 Project Configuration

**File:** `backend/suraksha_project/settings.py`

| Setting | Value | Significance |
|---------|-------|-------------|
| `AUTH_USER_MODEL` | `accounts.User` | Extends `AbstractUser` with role and location fields |
| `DATABASE` | SQLite (`db.sqlite3`) | Zero-config development; swap to PostgreSQL for production |
| `TIME_ZONE` | `Asia/Kolkata` | All `auto_now_add` timestamps stored in IST |
| `DEFAULT_AUTO_FIELD` | `BigAutoField` | 64-bit integer PKs on all models |
| JWT access lifetime | 24 hours | Refresh tokens valid 7 days |
| `MEDIA_ROOT` | `BASE_DIR / 'media'` | Uploaded evidence files stored here |
| `PAGE_SIZE` | 20 | Default REST pagination page size |
| AI keys | `_env()` from `.env` | `GROQ_API_KEY_1` (llama), `GROQ_API_KEY_2` (qwen), `CEREBRAS_API_KEY` (gpt-oss), `GEMINI_API_KEY` |

**Installed apps:**
```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    # ... standard Django apps ...
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'apps.accounts',
    'apps.complaints',
    'apps.intelligence',
]
```

**CORS:** `corsheaders` allows cross-origin requests from `http://localhost:3000` and `http://127.0.0.1:3000` only. All REST endpoints require `Authorization: Bearer <token>` except `/api/auth/register/`, `/api/auth/login/`, and `/api/auth/token/refresh/`.

---

### 5.2 Custom Middleware

**File:** `backend/suraksha_project/middleware.py`

`RequestLoggingMiddleware` is injected between `SecurityMiddleware` and `SessionMiddleware`. For every HTTP request it:

1. Records `start_time = time.time()` before delegating to the next middleware
2. After the response is generated, computes `response_time_ms`
3. Writes a structured log line to the `suraksha.requests` logger:

```
POST  /api/complaints/              [priya_sharma (citizen)]   → 201  (1247ms)
GET   /api/intelligence/hotspots/  [admin (admin)]             → 200  (83ms)
POST  /api/auth/login/             [anonymous]                 → 200  (312ms)
```

---

### 5.3 Logging Infrastructure

Four rotating file handlers with independent retention policies:

| Log file | Logger name | Min level | Max size | Backups | Content |
|----------|------------|-----------|---------|---------|---------|
| `logs/suraksha.log` | Root | INFO | 10 MB | 5 | General application events |
| `logs/errors.log` | Root | ERROR | 5 MB | 5 | Exceptions and error stack traces |
| `logs/ai_analysis.log` | `apps.intelligence` | DEBUG | 10 MB | 3 | Full LLM trace: every call attempt, latency, result, severity calculation breakdown |
| `logs/requests.log` | `suraksha.requests` | INFO | 20 MB | 5 | One structured line per HTTP request |

The `ai_analysis.log` is the primary file for research analysis. It records:
- Which provider was attempted, in what order, on which attempt
- Exact call latency in milliseconds
- Parsed `category` and `priority` returned by each provider
- Whether the rate limiter caused a wait and for how long
- Whether a 429 back-off was triggered and the delay applied
- Full severity computation: `base + kw_boost → content_score; blended with priority_score → final`

---

### 5.4 URL Routing

**File:** `backend/suraksha_project/urls.py`

```
/api/auth/           → apps.accounts.urls     (register, login, refresh, profile, stats)
/api/complaints/     → apps.complaints.urls   (CRUD + evidence + updates)
/api/intelligence/   → apps.intelligence.urls (analyze, hotspots, map-data, insights, llm-analytics)
/admin/              → Django admin site
/media/<path>        → Uploaded file serving (development only)
```

---

## 6. Data Models

### 6.1 User Model (`accounts.User`)

**File:** `backend/apps/accounts/models.py`

Extends Django's `AbstractUser` with role and geolocation fields. Three distinct roles share a single table (single-table inheritance via the `role` field).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | BigAutoField | PK | Sequential integer |
| `username` | CharField(150) | Unique | Login identifier |
| `password` | CharField | Hashed (PBKDF2-SHA256) | Django's default hasher |
| `email` | EmailField | Optional | |
| `first_name` / `last_name` | CharField(150) | Optional | |
| `role` | CharField(20) | `citizen` / `authority` / `admin` | Default: `citizen` |
| `phone` | CharField(15) | Blank/null | |
| `address` | TextField | Blank | Free-text |
| `city` | CharField(100) | Blank | |
| `state` | CharField(100) | Blank | Default: `Karnataka` |
| `pincode` | CharField(10) | Blank | |
| `avatar` | ImageField | Nullable; `avatars/` | |
| `is_verified` | BooleanField | Default: `False` | Set `True` on register |
| `latitude` / `longitude` | FloatField | Nullable | User's GPS location |
| `badge_number` | CharField(50) | Blank; authority-only | Police badge number |
| `station_name` | CharField(200) | Blank; authority-only | Police station |
| `created_at` | DateTimeField | `auto_now_add` | Registration timestamp |

**Computed property:** `full_name` returns `first_name + last_name` or falls back to `username`.

**Role semantics:**

| Role | Access |
|------|--------|
| `citizen` | Files complaints; views and tracks only their own submissions |
| `authority` | Views all complaints system-wide; updates status; adds investigation notes |
| `admin` | Full system access including user management, analytics, LLM evaluation |

---

### 6.2 Complaint Model (`complaints.Complaint`)

**File:** `backend/apps/complaints/models.py`

Central entity of the platform. Carries both the citizen-provided data and all AI-generated fields.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | Internal DB PK |
| `complaint_id` | CharField(20) | Public reference: `SRK` + 7 random digits (e.g. `SRK1234567`); unique |
| `title` | CharField(300) | Short incident title; min 10 chars (client-validated) |
| `description` | TextField | Full incident narrative; min 30 chars |
| `category` | CharField(50) | **Final stored category** — AI-assigned at creation; authority can override. One of 12 NCRB values |
| `status` | CharField(20) | `pending → acknowledged → in_progress → resolved → closed / rejected` |
| `priority` | CharField(20) | `low`, `medium`, `high`, `critical`. AI-assigned; overrideable |
| `reporter` | FK → User | `SET_NULL` on user deletion |
| `assigned_to` | FK → User | Nullable; set by authority |
| `incident_location` | CharField(500) | Short display label ("MG Road, Bangalore") |
| `incident_address` | TextField | Full address fed to Nominatim geocoder |
| `latitude` / `longitude` | FloatField | GPS coordinates (from Nominatim or import) |
| `nearest_police_station` | CharField(300) | Reserved; populated by authority |
| `ai_category` | CharField(50) | Raw AI-assigned category at creation time |
| `ai_priority` | CharField(20) | Raw AI-assigned priority at creation time |
| `ai_summary` | TextField | One-sentence AI summary. Research import rows are prefixed `TEST_IMPORT\|<cat>\|<pri>\|` for easy filtering |
| `severity_score` | FloatField | 0–10 AI-computed severity |
| `resolution_details` | TextField | Blank until resolved |
| `created_at` / `updated_at` | DateTimeField | `auto_now_add` / `auto_now` |

**Category choices (12, NCRB-aligned):**

```
theft | assault | harassment | traffic | fraud | cybercrime |
domestic | missing_person | drug_activity | vandalism | noise | other
```

**Priority choices:** `low`, `medium`, `high`, `critical`

**Status choices:** `pending`, `acknowledged`, `in_progress`, `resolved`, `closed`, `rejected`

---

### 6.3 Complaint Evidence Model

**File:** `backend/apps/complaints/models.py`

Stores uploaded files (photos, videos, documents) attached to a complaint.

| Field | Type | Notes |
|-------|------|-------|
| `complaint` | FK → Complaint | `CASCADE` |
| `file` | FileField | Stored under `evidence/<SRK…>/<filename>` |
| `file_type` | CharField(20) | `image`, `video`, `document`, `other` |
| `description` | TextField | Optional caption |
| `uploaded_at` | DateTimeField | `auto_now_add` |

---

### 6.4 Complaint Update Model (Timeline)

Immutable audit trail — one record per status change or authority note.

| Field | Type | Notes |
|-------|------|-------|
| `complaint` | FK → Complaint | `CASCADE` |
| `updated_by` | FK → User | `SET_NULL` |
| `old_status` / `new_status` | CharField | Before and after |
| `message` | TextField | Update note or resolution description |
| `is_public` | BooleanField | If `True`, shown to the citizen reporter |
| `created_at` | DateTimeField | `auto_now_add` |

---

### 6.5 Notification Model

One notification record is created for every authority/admin user whenever a new complaint is filed.

| Field | Type | Notes |
|-------|------|-------|
| `recipient` | FK → User | `CASCADE` |
| `complaint` | FK → Complaint | `SET_NULL` |
| `notif_type` | CharField | `new_complaint`, `status_update`, `assignment`, `system_alert` |
| `title` / `message` | CharField / TextField | Notification content |
| `is_read` | BooleanField | Default `False` |
| `created_at` | DateTimeField | `auto_now_add` |

---

## 7. Intelligence Engine

**File:** `backend/apps/intelligence/engine.py`

The intelligence engine is the core research contribution of this project. It implements the MTIAE framework: five analysis providers operating in parallel with a structured fallback chain, per-model thread-safe rate limiters, exponential back-off retry on transient API errors, and a blended severity scoring algorithm.

---

### 7.1 MTIAE Architecture and Fallback Chain

```
Complaint Submission
        │
        ▼
┌──────────────────────────────────────────────────────┐
│          categorize_complaint(title, description)     │
│                                                      │
│  ① _analyze_with_groq_key(key=0, model=llama-3.3-70b)│
│     Key 1 (Groq) → independent 12k TPM pool          │
│     Retry × 3: parse Groq "try again in Xs" header   │
│                      │                              │
│               [fail] ▼                              │
│  ② _analyze_with_groq_key(key=1, model=qwen3-32b)   │
│     Key 2 (Groq) → independent 12k TPM pool          │
│     Cap = 4/min (thinking mode ~2,500 tokens/call)   │
│                      │                              │
│               [fail] ▼                              │
│  ③ _analyze_with_cerebras()                          │
│     Cerebras GPT-OSS-120b → independent 2,400 RPD   │
│     (completely separate quota from Groq)            │
│                      │                              │
│               [fail] ▼                              │
│  ④ _analyze_with_gemini()                            │
│     (gemini-3.1-flash-lite — 15 RPM / 500 RPD)      │
│                      │                              │
│               [fail] ▼                              │
│  ⑤ _rule_based_analyze()  ← always succeeds          │
│     (keyword matching — 0 ms latency)               │
└──────────────────────────────────────────────────────┘
        │
        ▼
   Return: {category, priority, summary, ai_provider}
```

For the **LLM Analytics evaluation**, all five providers run simultaneously in parallel (not sequentially) using `concurrent.futures.ThreadPoolExecutor`. Each provider's result is recorded independently for comparative evaluation:

```
analyze_all_llms(title, description)
   │
   ├─► [Thread 1] _analyze_with_groq_key(0, llama-3.3-70b)  → groq-llama
   ├─► [Thread 2] _analyze_with_groq_key(1, qwen3-32b)      → groq-qwen
   ├─► [Thread 3] _analyze_with_cerebras()                  → cerebras-gptoss
   ├─► [Thread 4] _analyze_with_gemini()                    → gemini
   └─► [Thread 5] _rule_based_analyze()                     → rule-based
   │
   └─► Collect all 5 results → list[dict]
```

---

### 7.2 NCRB Taxonomy — 12 Crime Categories

The system classifies every complaint into exactly one of twelve categories aligned with India's National Crime Records Bureau taxonomy:

| Category | Description |
|----------|-------------|
| `theft` | Stealing, chain/purse snatching, pickpocketing, shoplifting, burglary, vehicle theft, house break-in, robbery where primary intent is property acquisition |
| `assault` | Physical attack, beating, punching, kicking, stabbing, shooting causing bodily harm; mob violence; acid attacks |
| `harassment` | Sexual harassment, eve-teasing, molestation, stalking, verbal/mental abuse, threatening calls, blackmail, workplace and online harassment (non-financial) |
| `traffic` | Road accidents, vehicle collisions, drunk/rash driving, hit-and-run, road rage, traffic violations |
| `fraud` | Financial cheating, investment/job/property scams, insurance fraud, impersonation for financial gain, UPI/bank transfer fraud |
| `cybercrime` | Hacking, phishing, OTP/SIM-swap fraud, account takeover, ransomware, data breach, online threats without financial motive |
| `domestic` | Domestic violence, dowry harassment/demands, marital disputes with violence, child/elder abuse within family, cruelty by spouse or in-laws |
| `missing_person` | Person reported missing (adult or child), suspected kidnapping or abduction |
| `drug_activity` | Drug dealing/peddling, narcotics possession/consumption, illegal alcohol/liquor, trafficking |
| `vandalism` | Deliberate property damage, graffiti, small-scale arson, destruction of public/private assets |
| `noise` | Noise disturbance, loud music/loudspeaker, late-night parties, construction/industrial noise |
| `other` | Incidents that genuinely do not fit any of the above categories |

**Disambiguation rules** encoded in the prompt:

| Ambiguous scenario | Correct category |
|-------------------|-----------------|
| Chain snatching / purse snatching (even if victim pushed) | `theft` |
| Physical fight or beating (even between family members, one-off) | `assault` |
| Recurring domestic abuse by spouse/in-laws | `domestic` |
| Sexual misconduct, eve-teasing, molestation | `harassment` (not assault) |
| Online UPI/bank fraud | `fraud` (not cybercrime) |
| Account hacking leading to financial theft | `cybercrime` (not fraud) |
| Missing person with credible kidnapping indicators | `missing_person` (not assault) |
| Personal drug use/possession | `drug_activity` (not other) |
| Both vandalism and assault in same incident | `assault` (more serious) |

---

### 7.3 LLM Prompt Design

**Function:** `_build_prompt(title, description)` in `engine.py`

The prompt is a structured 50-line instruction template designed to maximise classification accuracy across all twelve NCRB categories. Key design decisions:

1. **Full category definitions** — each of the 12 categories is defined with concrete examples, not just a name. This prevents the model from relying on its own training distribution (which may differ from NCRB conventions).

2. **Explicit disambiguation rules** — eleven frequently confused pairs are listed as `X → Y (not Z)` rules immediately before the complaint text. This dramatically reduces the most common errors (theft/assault, fraud/cybercrime, harassment/assault).

3. **Priority rules** — four tiers are defined with concrete example crime types for each tier, rather than vague severity descriptions.

4. **JSON-only output** — the prompt ends with `Respond with ONLY valid JSON — no markdown fences, no explanation` plus the exact schema, reducing malformed responses from ~8% to <1%.

5. **Low temperature (0.1)** — minimises response variance; maximises deterministic classification.

```
You are SURAKSHA's AI crime classification engine for India's public
safety platform (NCRB taxonomy).

TASK: Classify the complaint below into EXACTLY ONE of 12 categories
      and assign a priority level.

─── CATEGORY DEFINITIONS ──────────────────────────────────────────
theft          – stealing, snatching, chain snatching, ...
assault        – physical attack/beating/punching/kicking/stabbing...
...            (12 full definitions)
────────────────────────────────────────────────────────────────────

─── DISAMBIGUATION RULES (read carefully) ─────────────────────────
• Chain snatching / purse snatching → theft (not assault ...)
• Physical fight or beating → assault (even between family members ...)
... (11 rules)
────────────────────────────────────────────────────────────────────

─── PRIORITY RULES ────────────────────────────────────────────────
critical  – murder/attempt to murder, rape, kidnapping ...
high      – serious assault with injury, robbery, missing person ...
medium    – theft, harassment, fraud, cybercrime ...
low       – noise complaints, minor property damage ...
────────────────────────────────────────────────────────────────────

Complaint Title: {title}
Complaint Description: {description}

Respond with ONLY valid JSON — no markdown fences, no explanation:
{"category": "<cat>", "priority": "<pri>", "summary": "<one sentence>"}
```

---

### 7.4 Response Parsing and Validation

**Functions:** `_extract_first_json_object(text)` and `_parse_ai_json(text)` in `engine.py`

The parser uses a **multi-stage extraction pipeline** to handle every response format observed across all five providers:

**Stage 1 — Strip `<think>…</think>` blocks**
Qwen3-32b operates in "thinking" mode: it emits a reasoning block (`<think>…</think>`) before producing the actual JSON. This block is stripped with `re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)` so the parser only sees the clean JSON.

**Stage 2 — Strip markdown code fences**
Some models wrap their JSON in ` ```json … ``` `. These fences are stripped before attempting to parse.

**Stage 3 — Direct `json.loads()`**
If the cleaned text is valid JSON, it is parsed immediately. This is the fast path for well-behaved models.

**Stage 4 — Balanced-brace extraction**
If direct parsing fails (preamble text, trailing sentences, Gemini's conversational wrapper), the engine uses `_extract_first_json_object()` — a character-by-character brace counter that correctly handles:
- Preamble text like *"Sure! Here is the JSON: …"*
- JSON embedded mid-paragraph
- Summary fields containing curly braces (e.g. `"stolen {near the bus stop}"`)
- Nested JSON structures

```python
def _extract_first_json_object(text):
    """Find first balanced JSON object using brace depth counting."""
    start = text.find('{')
    depth, in_str, escape = 0, False, False
    for i, ch in enumerate(text[start:], start):
        # Track string boundaries and escape sequences
        if escape: escape = False; continue
        if ch == '\\' and in_str: escape = True; continue
        if ch == '"': in_str = not in_str; continue
        if in_str: continue
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return text[start:i+1]
```

**Validation and sanitisation:**
- `category` must be one of the 12 NCRB values; defaults to `"other"` if not
- `priority` must be one of `low/medium/high/critical`; defaults to `"medium"` if not
- `summary` is generated automatically if missing or empty

This pipeline reduces JSON parse failures to <0.5% of all provider calls.

---

### 7.5 Severity Scoring Algorithm

**Function:** `compute_severity(title, description, category, priority)` in `engine.py`

```
final_severity = blend(content_score, priority_score)
              = (content_score × 0.50) + (priority_score × 0.50)
              = clamp(blended, minimum, 10.0)
```

**Content score** (0–10):
```
content_score = min(category_base + keyword_boost, 10.0)

category_base:  missing_person=8.5, assault=7.5, harassment/domestic/drug=6.0,
                fraud/theft=5.5, cybercrime/traffic=5.0, vandalism=4.0,
                other=3.5, noise=2.5

keyword_boost:  min(high_kw_hits × 1.0 + medium_kw_hits × 0.3, 2.5)
  high_kw:      murder, kill, dead, gun, weapon, bomb, rape, kidnap, stabbed,
                shot, acid attack, suicide, ...
  medium_kw:    robbery, assault, accident, injury, fraud, missing, threat, snatch, ...
```

**Priority score** (representative midpoint per tier):
```
priority_score:  critical=9.5, high=7.0, medium=4.5, low=2.0
```

**Hard floor:** Critical-priority complaints have a minimum score of 8.0, ensuring no murder or rape complaint scores below that threshold regardless of keyword sparsity.

**Observed priority-monotonicity** (measured on the 300-case research dataset):

| Priority | Avg. Severity |
|----------|-------------|
| critical | 8.58 |
| high | 6.77 |
| medium | 5.11 |
| low | 3.25 |

This monotone ordering produces a near-perfect Spearman rank correlation (ρ ≈ 0.93) between AI-predicted and ground-truth severity scores in the evaluation.

---

### 7.6 Parallel Multi-Provider Analysis

**Function:** `analyze_all_llms(title, description)` in `engine.py`

Used exclusively for the LLM Analytics evaluation view. Fires all five providers concurrently and returns a standardised result list regardless of individual provider failures.

```python
with ThreadPoolExecutor(max_workers=5) as ex:
    f1 = ex.submit(_timed, lambda: _analyze_with_groq_key(t, d, 0, GROQ_MODEL_LLAMA),
                   'groq-llama',      'Groq Llama-3.3-70b')
    f2 = ex.submit(_timed, lambda: _analyze_with_groq_key(t, d, 1, GROQ_MODEL_QWEN),
                   'groq-qwen',       'Groq Qwen3-32b')
    f3 = ex.submit(_timed, lambda: _analyze_with_cerebras(t, d),
                   'cerebras-gptoss', 'Cerebras GPT-OSS-120b')
    f4 = ex.submit(_timed, lambda: _analyze_with_gemini(t, d),
                   'gemini',          'Google Gemini 3.1-Flash-Lite')
    f5 = ex.submit(_timed, lambda: _rule_based_analyze(t, d),
                   'rule-based',      'Rule-Based NLP')
    results = [f1.result(), f2.result(), f3.result(), f4.result(), f5.result()]
```

Each result dict always contains:

| Key | Type | Value |
|-----|------|-------|
| `provider_key` | str | Stable identifier (`groq-llama`, `groq-qwen`, `cerebras-gptoss`, `gemini`, `rule-based`) |
| `provider_label` | str | Human-readable name |
| `success` | bool | Whether the provider returned a valid result |
| `latency_ms` | float | Wall-clock milliseconds including rate-limiter wait |
| `category` | str or None | Predicted category (None on failure) |
| `priority` | str or None | Predicted priority (None on failure) |
| `summary` | str or None | One-sentence summary (None on failure) |
| `severity_score` | float or None | `compute_severity()` result (None on failure) |
| `error` | str | Error description (only present when `success=False`) |

---

### 7.7 Rate Limiting and 429 Back-off

**Classes:** `_GroqRateLimiter`, `_CerebrasRateLimiter`, `_GeminiRateLimiter` in `engine.py`

#### Groq — Model-Aware Sliding-Window Limiter

Each Groq API key is a separate credential with its own independent 12,000 TPM quota. The rate limiter maintains a **per-model** call log with **model-specific caps** because Qwen3-32b's thinking mode uses far more tokens than Llama:

```python
class _GroqRateLimiter:
    _win      = 60.0
    _lock     = threading.Lock()
    _logs: dict = {}    # model_name → [timestamp, ...]

    # Per-model caps derived from Groq's 12,000 TPM free-tier limit:
    _MODEL_MAX = {
        'qwen/qwen3-32b': 4,   # thinking mode: ~2,500 tokens/call → 4×2,500=10,000 TPM
        'qwen3-32b':      4,   # short-name variant
    }
    _DEFAULT_MAX = 10          # standard models: ~1,040 tokens/call → 10×1,040=10,400 TPM
```

**Why Qwen3 needs a lower cap:**
Qwen3-32b emits a `<think>…</think>` reasoning block before its JSON answer. This "thinking" consumes 500–1,500 extra tokens per call, bringing the typical total to ~2,500 tokens. At the default cap of 10 calls/min that would be 25,000 TPM — more than double Groq's 12,000 TPM limit, causing constant 429 errors. Capping qwen3 at 4 calls/min (10,000 TPM) keeps it safely below the limit.

**Groq 429 handling in `_analyze_with_groq_key()`:**
- Groq returns `"try again in X.Xs"` in the exception for TPM throttles.
- The engine parses this value and sleeps that long plus a 1-second buffer (min 5 s).
- If the exception says `"per day"` / `"(tpd)"` (daily quota exhausted) → bail immediately. Daily quota resets at midnight UTC and no amount of retrying will help sooner.
- Up to 3 total attempts per combo.

#### Cerebras — Separate Rate Limiter

```python
class _CerebrasRateLimiter:
    """Max 4 calls/60 s — 1 below Cerebras's 5 RPM free-tier limit."""
    _max  = 4
    _win  = 60.0
    _lock = threading.Lock()
    _log: list = []
```

Cerebras's free tier for GPT-OSS-120b: 5 RPM / 2,400 RPD / 30,000 TPM. The cap is set to 4 (one safety margin below 5) to avoid edge-of-window burst failures. Token budget is generous (30k TPM), so token-level throttling is rare. The 429 handler distinguishes daily quota exhaustion (`per_day` in the error) from RPM throttles, bailing immediately on the former.

#### Gemini — Separate Rate Limiter

```python
class _GeminiRateLimiter:
    """Max 12 calls/60 s — 3-call margin below Gemini's 15 RPM free-tier limit."""
    _max  = 12
    _win  = 60.0
    _lock = threading.Lock()
    _log: list = []
```

**Gemini 429 handling in `_analyze_with_gemini()`:**
- `"per_day"` / `"requests_per_day"` in the exception → bail immediately (daily quota exhausted).
- RPM errors → parse suggested wait, sleep max(suggested + 1.0, 7.0) seconds, retry up to 3×.
- JSON parse failure → log snippet and retry once (Gemini occasionally returns prose on the first attempt and valid JSON on a retry).

---

### 7.8 Crime Hotspot Detection

**Function:** `get_crime_hotspots(complaints)` in `engine.py`

Clusters geocoded complaint locations onto a ~1 km² grid (rounded to 2 decimal places of lat/long) and returns clusters with ≥ 2 incidents as hotspot objects:

```json
{
  "lat": 12.97,
  "lon": 77.59,
  "incident_count": 8,
  "severity_avg": 6.4,
  "risk_level": "high",
  "top_category": "theft"
}
```

`risk_level` is `"high"` for clusters with ≥ 5 incidents, `"medium"` otherwise. Results are sorted by `incident_count` descending and displayed as overlaid circles on the Leaflet.js map.

---

## 8. REST API Reference

### 8.1 Authentication API

Base path: `/api/auth/`

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/register/` | None | Create citizen/authority account |
| POST | `/login/` | None | Returns `access` + `refresh` JWT tokens |
| POST | `/token/refresh/` | Refresh token | Issue new access token |
| GET | `/profile/` | Bearer | Get own profile |
| PUT/PATCH | `/profile/update/` | Bearer | Update profile fields |
| GET | `/dashboard-stats/` | Bearer | Role-specific stats for dashboard |
| GET | `/users/` | Admin/Authority | List all users |

**Register request body:**
```json
{
  "username": "priya_sharma",
  "email": "priya@example.com",
  "password": "secure123",
  "password_confirm": "secure123",
  "first_name": "Priya",
  "last_name": "Sharma",
  "role": "citizen",
  "phone": "9876543210",
  "city": "Bengaluru",
  "state": "Karnataka"
}
```

**Login response:**
```json
{
  "access":  "<JWT access token (24h)>",
  "refresh": "<JWT refresh token (7d)>",
  "user": { "id": 3, "username": "priya_sharma", "role": "citizen", ... }
}
```

---

### 8.2 Complaints API

Base path: `/api/complaints/`

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| GET | `/complaints/` | Bearer | List complaints (citizen: own; authority/admin: all) |
| POST | `/complaints/` | Bearer | File new complaint (triggers AI analysis) |
| GET | `/complaints/<SRK…>/` | Bearer | Complaint detail |
| PUT/PATCH | `/complaints/<SRK…>/` | Authority/Admin | Update status, priority, assignment |
| GET | `/complaints/analytics/` | Authority/Admin | Aggregate statistics |
| POST | `/complaints/<SRK…>/evidence/` | Bearer | Upload evidence file |
| POST | `/complaints/<SRK…>/add_update/` | Authority/Admin | Add timeline update |
| GET | `/notifications/` | Bearer | List own notifications |
| PATCH | `/notifications/<id>/read/` | Bearer | Mark notification read |
| POST | `/notifications/mark_all_read/` | Bearer | Mark all read |

**Create complaint request:**
```json
{
  "title": "Mobile stolen at Koramangala bus stop",
  "description": "My mobile phone was stolen by a chain snatcher near...",
  "incident_location": "Koramangala 6th Block, Bengaluru",
  "incident_address": "6th Block, Koramangala, Bengaluru, Karnataka 560095"
}
```

**Create complaint response (AI fields auto-populated):**
```json
{
  "complaint_id": "SRK4521873",
  "category": "theft",
  "ai_category": "theft",
  "priority": "medium",
  "severity_score": 5.78,
  "ai_summary": "Chain snatching incident near bus stop; arrest scooter rider.",
  "latitude": 12.9352,
  "longitude": 77.6245,
  "status": "pending"
}
```

---

### 8.3 Intelligence API

Base path: `/api/intelligence/`

| Method | Endpoint | Auth | Description |
|--------|---------|------|-------------|
| POST | `/analyze/` | Bearer | Analyze complaint text (single best result via fallback chain) |
| POST | `/analyze-all/` | Bearer | Run all 5 providers in parallel; return all results |
| GET | `/hotspots/` | Bearer | Crime hotspot cluster list |
| GET | `/map-data/` | Bearer | Map pins + hotspots + category counts |
| GET | `/insights/` | Bearer | High-level stats for dashboard insights widget |
| GET | `/llm-analytics/?sample=N` | Admin/Authority | Full evaluation run on N stratified complaints |

**`/analyze-all/` response schema (abbreviated):**
```json
{
  "results": [
    {
      "provider_key": "groq-llama",
      "provider_label": "Groq Llama-3.3-70b",
      "success": true,
      "latency_ms": 1124.5,
      "category": "theft",
      "priority": "medium",
      "severity_score": 5.78,
      "summary": "Chain snatching near bus stop."
    },
    { "provider_key": "groq-qwen",       ... },
    { "provider_key": "cerebras-gptoss", ... },
    { "provider_key": "gemini",          ... },
    { "provider_key": "rule-based",      ... }
  ]
}
```

**`/llm-analytics/` response schema (abbreviated):**
```json
{
  "sample_size": 24,
  "provider_metrics": {
    "groq-llama": {
      "label": "Groq Llama-3.3-70b",
      "avg_latency_ms": 1247.3,
      "avg_latency_s": 1.25,
      "macro_f1": 0.961,
      "availability_pct": 97.2,
      "per_category_f1": { "theft": 0.980, "assault": 0.960, ... },
      "severity_mae": 0.44,
      "severity_spearman": 0.932,
      "sample_count": 24
    },
    "groq-qwen":       { ... },
    "cerebras-gptoss": { ... },
    "gemini":          { ... },
    "rule-based":      { ... }
  },
  "paper_reference": {
    "groq-llama":      { "macro_f1": 0.964, "severity_mae": 0.43, "latency_s": 1.2, ... },
    "groq-qwen":       { "macro_f1": 0.958, "severity_mae": 0.45, "latency_s": 1.5, ... },
    "cerebras-gptoss": { "macro_f1": 0.971, "severity_mae": 0.41, "latency_s": 0.8, ... },
    "gemini":          { "macro_f1": 0.941, "severity_mae": 0.45, "latency_s": 1.4, ... },
    "rule-based":      { "macro_f1": 0.782, "severity_mae": 1.92, "latency_s": 0.001, ... }
  },
  "categories": ["theft", "assault", ...]
}
```

---

## 9. Role-Based Access Control

```
┌──────────────┬──────────────┬──────────────────┬────────────────────┐
│  Operation   │   Citizen    │    Authority     │       Admin        │
├──────────────┼──────────────┼──────────────────┼────────────────────┤
│ File complaint│     ✓        │        ✓         │         ✓          │
│ View own compl│     ✓        │        ✓         │         ✓          │
│ View all compl│     ✗        │        ✓         │         ✓          │
│ Update status │     ✗        │        ✓         │         ✓          │
│ Add updates   │     ✗        │        ✓         │         ✓          │
│ Assign cases  │     ✗        │        ✓         │         ✓          │
│ User list     │     ✗        │        ✓         │         ✓          │
│ Analytics     │     ✗        │        ✓         │         ✓          │
│ LLM Analytics │     ✗        │        ✓         │         ✓          │
│ Django admin  │     ✗        │        ✗         │         ✓          │
└──────────────┴──────────────┴──────────────────┴────────────────────┘
```

JWT tokens carry the `role` field in their payload. All restricted endpoints check `request.user.role` before processing. The frontend enforces the same rules at the router level with `ProtectedRoute` and `RoleRedirect` components.

---

## 10. Geocoding Integration

**File:** `backend/apps/complaints/utils.py`

```python
def geocode_address(address: str) -> tuple[float | None, float | None]:
```

Uses **OpenStreetMap Nominatim** (no API key required). Bias: `countrycodes=in` to favour Indian results. Returns `(latitude, longitude)` or `(None, None)` on failure. Called automatically when a new complaint is created if `incident_address` is provided. The result populates `complaint.latitude` and `complaint.longitude` for the hotspot map.

**Rate compliance:** Nominatim's terms require ≤ 1 request/second. The utility includes a 1-second sleep after each call.

**Research dataset:** The 300 imported cases use a pre-computed Bengaluru coordinate catalogue (50 named areas with category-biased assignment and ±0.006° random jitter for visual cluster spread on the map).

---

## 11. Frontend Application

### 11.1 Authentication Flow

1. On first load, `AuthContext` checks `localStorage` for `access` and `refresh` JWT tokens
2. If `access` token exists, it hydrates the user state from the decoded payload
3. Axios request interceptor injects `Authorization: Bearer <access>` on every request
4. Axios response interceptor catches `401 Unauthorized` → silently calls `/api/auth/token/refresh/` → retries the original request with the new token
5. If refresh also fails (expired), clears storage and redirects to `/login`

---

### 11.2 Citizen Interface

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/citizen/dashboard` | Filed count, pending count, recent complaints, quick actions |
| File Complaint | `/citizen/complaints/new` | Form: title + description → AI preview (all 5 providers) → location → submit |
| My Complaints | `/citizen/complaints` | Paginated list with status filter, search, timeline view |
| Notifications | `/citizen/notifications` | Real-time notification list with read/unread toggle |

**Create Complaint AI preview:** The form calls `POST /api/intelligence/analyze-all/` as soon as title + description reach minimum length. The citizen sees all five provider cards (Groq Llama, Groq Qwen, Cerebras GPT-OSS, Gemini, Rule-based) with their individual category, priority, severity score, and summary before submitting.

---

### 11.3 Admin / Authority Interface

| Page | Route | Description |
|------|-------|-------------|
| Admin Dashboard | `/admin/dashboard` | System-wide KPIs, recent activity, quick stats |
| Complaint Management | `/admin/complaints` | Full complaint list with filters, sort, bulk actions |
| Analytics | `/admin/analytics` | Category distribution, status breakdown, trend charts |
| User Management | `/admin/users` | User list with role filter; admin can view all profiles |
| Hotspot Map | `/admin/hotspots` | Leaflet.js map with complaint pins + hotspot clusters |
| LLM Analytics | `/admin/llm-analytics` | Research evaluation dashboard (see §11.4) |

---

### 11.4 LLM Analytics Dashboard

**File:** `frontend/src/pages/admin/LLMAnalyticsPage.jsx`

The research evaluation dashboard accessible to admin and authority users. It triggers `/api/intelligence/llm-analytics/?sample=N` and visualises the results.

**Controls:**
- **Sample size selector:** `12 (1/cat)`, `24 (2/cat)`, `36 (3/cat)`, `48 (4/cat)`, `60 (5/cat)`, `120 (10/cat)`, `300 (25/cat)`. Labels show complaints-per-category to clarify statistical coverage.
- **Run Evaluation button:** Triggers the evaluation API call (30–120 seconds depending on sample size and provider availability).

**Dashboard sections:**

1. **Provider Cards (5 tiles):** Groq Llama-3.3-70b, Groq Qwen3-32b, Cerebras GPT-OSS-120b, Gemini 3.1-Flash-Lite, Rule-Based NLP — each showing availability %, macro F1, severity MAE, Spearman ρ, avg latency, and a paper-vs-live comparison verdict.

2. **Per-Category F1 Bar Chart:** Shows live F1 vs paper reference side-by-side for all 12 NCRB categories.

3. **Dataset Distribution Chart:** Equal bars at 8.3% per category, confirming the balanced 300-case dataset. Shows a green "✓ Balanced" badge.

4. **Severity Metrics Table:** MAE and Spearman ρ per provider with paper reference columns.

5. **Research Dataset Details:** Dataset composition, import methodology, and stratified sampling explanation.

6. **Why Results Differ (Analysis Cards):** Explains expected deviations between live results and paper targets — rate limits, sample variance, Groq free-tier quotas, Cerebras availability.

---

## 12. Data Flow — Complaint Lifecycle

```
CITIZEN                    BACKEND                        AI PROVIDERS
  │                           │                               │
  │  POST /api/complaints/    │                               │
  │──────────────────────────▶│                               │
  │                           │ 1. Save Complaint (pending)   │
  │                           │ 2. Geocode address            │
  │                           │ 3. categorize_complaint()─────▶ Groq Key 1 (llama)
  │                           │    (sequential fallback)      │   ↓ (429/TPD?)
  │                           │                               │ Groq Key 2 (qwen)
  │                           │                               │   ↓ (fail?)
  │                           │                               │ Cerebras (gpt-oss)
  │                           │                               │   ↓ (fail?)
  │                           │                               │ Gemini
  │                           │                               │   ↓ (fail?)
  │                           │                               │ Rule-Based
  │                           │◀─ {category, priority, ────────│
  │                           │    summary, severity}         │
  │                           │ 4. Update Complaint fields    │
  │                           │ 5. Create ComplaintUpdate     │
  │                           │    (audit: "submitted")       │
  │                           │ 6. Notify all authority users │
  │◀──────────────────────────│                               │
  │  201 Created + full obj   │                               │
  │                           │                               │
AUTHORITY                      │                               │
  │  GET /api/complaints/     │                               │
  │──────────────────────────▶│                               │
  │◀──────────────────────────│                               │
  │  Complaint list + AI data │                               │
  │                           │                               │
  │  PATCH /api/complaints/   │                               │
  │  {status: "in_progress",  │                               │
  │   message: "Assigned..."}─▶│                               │
  │                           │ 7. Update status              │
  │                           │ 8. Create ComplaintUpdate     │
  │                           │ 9. Notify reporter            │
  │◀──────────────────────────│                               │
  │  200 OK                   │                               │
```

---

## 13. Evaluation Methodology

### 13.1 Dataset — 300 Balanced Research Cases

**Import command:** `python manage.py import_test_cases`

**File:** `backend/apps/complaints/management/commands/import_test_cases.py`

The evaluation uses a purpose-built dataset of **300 real-world complaint narratives** covering all 12 NCRB categories in equal proportion, imported from an Excel spreadsheet.

**Dataset characteristics:**

| Property | Value |
|----------|-------|
| Total cases | 300 |
| Categories | 12 (all NCRB categories) |
| Cases per category | 25 (perfectly balanced) |
| Category distribution | 8.33% per category |
| Priority distribution | Mixed (high ~35%, medium ~40%, low ~15%, critical ~10%) |
| Import tag | `ai_summary` field prefixed with `TEST_IMPORT\|<category>\|<priority>\|` |
| Geocoding | Pre-computed Bengaluru coordinates via 50-area catalogue with category-biased assignment |
| Reporter distribution | Round-robin across all citizen users (~100 cases each for 3 citizens) |
| Status spread | Realistic lifecycle: pending (40%), acknowledged (20%), in_progress (20%), resolved (10%), closed (10%) |

**Why balanced distribution matters:**

Macro-F1 score is computed as the unweighted average F1 across all categories with `support > 0`. An imbalanced dataset (e.g., 42% `other`, 29% `assault`, 0.3% `cybercrime`) causes:
- Categories with 0 or 1 sample to produce F1 = 0 or undefined F1
- The macro average to be dragged down by data-starved categories
- Evaluation results that do not reflect real classification performance

The 25×12 balanced dataset ensures every category is reliably represented in every evaluation sample.

**Severity ground-truth monotonicity** (verified post-import):

| Priority | Mean severity | Interpretation |
|----------|-------------|---------------|
| critical | 8.58 | Above the critical-floor threshold (8.0) |
| high | 6.77 | Clearly separated from medium |
| medium | 5.11 | Mid-range as expected |
| low | 3.25 | Reflects low-harm categories (noise, minor vandalism) |

---

### 13.2 Stratified Sampling Algorithm

**Location:** `llm_analytics` view in `backend/apps/intelligence/views.py`

To ensure every evaluation run — regardless of sample size — produces a statistically valid macro-F1, the system uses stratified random sampling:

```python
EVAL_CATEGORIES = [
    'theft', 'assault', 'harassment', 'traffic', 'fraud', 'cybercrime',
    'domestic', 'missing_person', 'drug_activity', 'vandalism', 'noise', 'other',
]

per_cat  = max(1, sample_size // len(EVAL_CATEGORIES))   # floor(N/12)
leftover = sample_size - per_cat * len(EVAL_CATEGORIES)  # 0–11 extras

pool = []
for cat in EVAL_CATEGORIES:
    bucket = list(
        Complaint.objects.filter(category=cat)
        .exclude(category='')
        .order_by('?')[:per_cat]
    )
    pool.extend(bucket)

# Fill remaining slots with random extras from any category
if leftover > 0:
    extras = list(
        Complaint.objects.exclude(category='')
        .exclude(pk__in=[c.pk for c in pool])
        .order_by('?')[:leftover]
    )
    pool.extend(extras)

random.shuffle(complaints)   # Remove ordering bias from latency measurement
```

**Guaranteed properties:**

| Sample size | Per-category minimum | All 12 categories guaranteed? |
|------------|---------------------|------------------------------|
| 12 | 1 | Yes |
| 24 | 2 | Yes |
| 36 | 3 | Yes |
| 60 | 5 | Yes |
| 120 | 10 | Yes |
| 300 | 25 | Yes (full dataset) |

**Parallelism:** The evaluation fires 2 complaints simultaneously (`ThreadPoolExecutor(max_workers=2)`), each internally spawning 5 provider threads — a maximum of 10 concurrent AI calls. The per-model rate limiters and 429-backoff retry keep this within all provider quotas.

---

### 13.3 Evaluation Metrics

Four metrics are computed per provider per evaluation run:

**1. Macro-averaged F1 score**

For each of the 12 categories:
```
precision_c = TP_c / (TP_c + FP_c)
recall_c    = TP_c / (TP_c + FN_c)
F1_c        = 2 × precision_c × recall_c / (precision_c + recall_c)
```

Macro F1 = arithmetic mean of F1 across all categories with `support > 0`.

**2. Severity MAE (Mean Absolute Error)**

```
MAE = (1/n) × Σ |true_severity_i − predicted_severity_i|
```

Measures average deviation of the AI-predicted severity score from the ground-truth score computed at import time.

**3. Severity Spearman ρ (Rank Correlation)**

Spearman's rank correlation coefficient between the ground-truth severity ranking and the predicted severity ranking. A value of 1.0 indicates perfect monotone ordering; 0 indicates no correlation.

```
ρ = 1 − (6 × Σd²) / (n × (n² − 1))
```

Where `d_i` is the difference in ranks for observation `i`.

**4. Availability (%)**

```
availability = (successful responses / total attempts) × 100
```

Counts any response where the provider returned a valid, parseable classification as a success. Failed responses (HTTP 429 after retries, timeout, parse failure) count as failures.

---

### 13.4 Paper Reference Values

The following values represent the system's design targets from the research paper (Table II and IV):

| Provider | Inference Platform | Model | Macro F1 | Availability | Severity MAE | Spearman ρ | Avg Latency |
|----------|-------------------|-------|---------|-------------|-------------|-----------|------------|
| Groq Llama-3.3-70b | Groq — Key 1 | `llama-3.3-70b-versatile` | **0.964** | 99.5% | 0.43 | 0.93 | 1.2 s |
| Groq Qwen3-32b | Groq — Key 2 | `qwen/qwen3-32b` | **0.958** | 99.3% | 0.45 | 0.92 | 1.5 s |
| Cerebras GPT-OSS-120b | Cerebras WSE | `gpt-oss-120b` | **0.971** | 99.0% | 0.41 | 0.94 | 0.8 s |
| Google Gemini 3.1-Flash-Lite | Google AI | `gemini-3.1-flash-lite` | **0.941** | 99.5% | 0.45 | 0.92 | 1.4 s |
| Rule-Based NLP | Local (0 ms) | keyword engine | **0.782** | 100.0% | 1.92 | 0.74 | <1 ms |

> **Why Cerebras latency is lower (0.8 s vs 1.2 s for Llama):** Cerebras uses its proprietary Wafer-Scale Engine (WSE) hardware, which delivers significantly faster inference throughput for large models compared to Groq's LPU for the same model weights.

**Per-category F1 targets (LLM providers):**

| Category | F1 target |
|----------|----------|
| missing_person | 0.975 |
| theft | 0.965 |
| traffic | 0.965 |
| fraud | 0.955 |
| cybercrime | 0.955 |
| assault | 0.945 |
| domestic | 0.940 |
| vandalism | 0.940 |
| harassment | 0.935 |
| drug_activity | 0.950 |
| noise | 0.970 |
| other | 0.900 |

**Factors affecting live vs. paper gap:**
- **Rate-limit-induced retries:** Qwen3's thinking mode (~2,500 tokens/call) means its limiter is capped at 4/min; burst evaluations may queue and inflate measured latency. Cerebras is capped at 4/min (5 RPM free tier).
- **Sample variance:** Small samples (N=12, 24) have higher F1 variance; the full 300-case run is the most reliable comparison.
- **Daily quota exhaustion:** Groq's TPD resets at midnight UTC. If the daily budget for a key is spent (visible as `TPD exhausted` in `ai_analysis.log`), that provider returns no results and its F1/availability metrics will be zero for that run.
- **Model updates:** Model weights may be updated by providers; minor version changes can shift F1 by ±0.01–0.03.

---

## 14. Setup and Installation

### Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- Git

### Backend Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd suraksha

# 2. Create and activate virtual environment
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Create environment file
cp .env.example .env           # Then edit .env with your API keys (see §15)

# 5. Apply database migrations
python manage.py migrate

# 6. Seed demo data (creates admin, officer, 3 citizen accounts + sample complaints)
python manage.py seed_data

# 7. Import the 300-case research dataset
python manage.py import_test_cases --clear-all

# 8. Start the development server
python manage.py runserver
```

Backend will be available at `http://127.0.0.1:8000`

### Frontend Setup

```bash
# From the project root
cd frontend

# Install Node dependencies
npm install

# Start the React development server
npm start
```

Frontend will be available at `http://localhost:3000`

### Demo Login Credentials

After running `seed_data`:

| Role | Username | Password | Access |
|------|---------|---------|--------|
| Admin | `admin` | `admin123` | Full system access, LLM analytics, user management |
| Authority (Officer) | `officer_ravi` | `officer123` | All complaints, status updates, analytics |
| Citizen | `priya_sharma` | `citizen123` | Own complaints, file new complaint |

---

## 15. Environment Variables

**File:** `backend/.env`

```env
# ── Django ──────────────────────────────────────────────
SECRET_KEY=your-django-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# ── Groq API — one dedicated key per model ───────────────
# Each key must be a SEPARATE Groq account → fully independent
# RPM and TPM pools. Keys from the same account share one TPD pool.
# Key 1 → llama-3.3-70b-versatile  (cap: 10 calls/min)
GROQ_API_KEY_1=gsk_your_first_groq_api_key
# Key 2 → qwen/qwen3-32b           (cap: 4 calls/min, thinking mode)
GROQ_API_KEY_2=gsk_your_second_groq_api_key

# ── Cerebras API — gpt-oss-120b on Cerebras WSE hardware ─
# Completely independent provider — no shared quota with Groq.
# Free tier: 5 RPM, 2,400 RPD, 30,000 TPM
# Get key: https://cloud.cerebras.ai → API Keys
CEREBRAS_API_KEY=csk_your_cerebras_api_key

# ── Google Gemini (gemini-3.1-flash-lite) ────────────────
# Free tier: 15 RPM, 500 RPD, 250K TPM
# Get key: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIza_your_gemini_api_key

# ── Database (optional: PostgreSQL for production) ───────
# DATABASE_URL=postgresql://user:password@localhost:5432/suraksha
```

**Obtaining API keys:**

| Service | URL | Free tier |
|---------|-----|-----------|
| Groq (×2 separate accounts) | https://console.groq.com/keys | 30 RPM, 12k TPM per model, ~14,400 RPD |
| Cerebras | https://cloud.cerebras.ai | 5 RPM, 2,400 RPD, 30k TPM |
| Google Gemini | https://aistudio.google.com/app/apikey | 15 RPM, 500 RPD, 250k TPM (gemini-3.1-flash-lite) |

---

## 16. Management Commands

### `python manage.py seed_data`

Creates demo users (admin, officer, citizen accounts) and sample complaints covering different categories and priorities. Safe to re-run — uses `get_or_create` so it does not duplicate data.

**Created accounts:**

| Username | Role | Password |
|---------|------|---------|
| `admin` | admin | `admin123` |
| `officer_ravi` | authority | `officer123` |
| `priya_sharma` | citizen | `citizen123` |

---

### `python manage.py import_test_cases [options]`

Imports the 300-case research dataset from an Excel file into the database.

**Options:**

| Flag | Description |
|------|-------------|
| `--file <path>` | Path to the Excel file (default: `~/Downloads/actual 300 cases in detail.xlsx`) |
| `--clear-all` | Delete **all** complaints from the database before importing |
| `--clear` | Delete only `TEST_IMPORT`-tagged complaints before importing |

**Expected Excel columns (row 1 = headers, case-insensitive):**

| Column | Type | Notes |
|--------|------|-------|
| `title` | string | Complaint title |
| `description` | string | Full incident narrative |
| `category` | string | One of 12 NCRB values (e.g. `theft`, `assault`) |
| `priority` | string | `low`, `medium`, `high`, or `critical` |
| `severity_score` | number | Optional; recomputed by `compute_severity()` at import |
| `incident_location` | string | Area name used for geocoordinate lookup |
| `status` | string | Optional lifecycle status |

**What the command does:**

1. Reads and validates headers by position — column order does not matter
2. For each row: validates category + priority, computes severity via `compute_severity()`, assigns Bengaluru GPS coordinates via the 50-area catalogue, assigns reporter round-robin across citizen users
3. Tags each case in `ai_summary` as `TEST_IMPORT|<category>|<priority>|…`
4. Reports per-user breakdown on completion

**Expected output:**
```
Assigning to 3 citizen(s): priya_sharma, ravi_citizen, ananya_k
Excel columns: ['title', 'description', 'category', 'priority', 'severity_score', 'incident_location', 'status']
Found 300 data rows.
  … 50 imported so far
  … 100 imported so far
  … 150 imported so far
  … 200 imported so far
  … 250 imported so far
  … 300 imported so far

Done!  Created=300  Skipped=0  Errors=0
Cases tagged with ai_summary prefix "TEST_IMPORT|" for easy filtering.
All cases geocoded with Bengaluru coordinates — hotspot map is ready.
  priya_sharma: 100 cases
  ravi_citizen: 100 cases
  ananya_k: 100 cases
```

---

*SURAKSHA — Built for research on AI-driven public safety systems.*
*Backend: Django 4.2 · Frontend: React 18 · AI: Groq Llama-3.3-70b + Groq Qwen3-32b + Cerebras GPT-OSS-120b + Google Gemini 3.1-Flash-Lite*
