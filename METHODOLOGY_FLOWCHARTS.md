# SURAKSHA - Methodology Flowcharts & Detailed Processes

---

## 1. COMPLAINT PROCESSING FLOWCHART

```mermaid
flowchart TD
    A["👤 CITIZEN LOGS IN"] -->|JWT Auth| B["📝 CLICK: FILE COMPLAINT"]
    B -->|Form Open| C["📋 ENTER COMPLAINT DETAILS"]
    C -->|Fields| C1["Title<br/>Description<br/>Category<br/>Location<br/>Evidence Files"]
    C1 -->|Client-side Validation| D{Valid Input?}
    
    D -->|❌ NO| E["⚠️ SHOW ERROR<br/>Required fields missing"]
    E -->|Fix & Resubmit| C
    
    D -->|✅ YES| F["📤 SUBMIT: POST /api/complaints/"]
    F -->|Include JWT Token| G["🔐 BACKEND RECEIVES<br/>Authenticate User<br/>Validate Serializer"]
    
    G -->|Valid| H["🤖 TRIGGER AI ANALYSIS ENGINE"]
    H -->|Input| H1["Title<br/>Description"]
    
    H1 -->|Process| I["1️⃣ CATEGORIZATION"]
    I -->|Keyword Matching| I1["Convert to lowercase<br/>Scan against CATEGORY_KEYWORDS<br/>Count matches per category<br/>Select highest match<br/>Default to 'other' if no match"]
    I1 -->|Output| I2["✅ ai_category<br/>Example: 'theft'"]
    
    H1 -->|Process| J["2️⃣ PRIORITY DETECTION"]
    J -->|Keyword Scan| J1["Check HIGH_SEVERITY_KEYWORDS<br/>Check MEDIUM_SEVERITY_KEYWORDS<br/>Check low severity defaults"]
    J1 -->|Output| J2["✅ ai_priority<br/>Example: 'high'"]
    
    H1 -->|Process| K["3️⃣ SEVERITY SCORING"]
    K -->|Algorithm| K1["Base score by category<br/>+ High keyword boost<br/>+ Medium keyword boost<br/>+ Random variation ±0.3<br/>Clamp to 0-10"]
    K1 -->|Output| K2["✅ severity_score<br/>Example: 6.8/10"]
    
    I2 -->|Combine Results| L["4️⃣ GENERATE SUMMARY"]
    J2 -->|with| L
    L -->|Template| L1["[PRIORITY] Classified as CATEGORY.<br/>Summary text based on inputs"]
    L1 -->|Output| L2["✅ ai_summary<br/>Example: '[HIGH] Classified...'"]
    
    I2 -->|Save to DB| M["💾 CREATE COMPLAINT RECORD"]
    J2 -->|Save| M
    K2 -->|Save| M
    L2 -->|Save| M
    
    M -->|New Record| M1["complaint_id: SRK4852396<br/>category: theft (user)<br/>ai_category: theft (AI)<br/>ai_priority: high (AI)<br/>severity_score: 6.8 (AI)<br/>status: pending<br/>created_at: timestamp"]
    
    M1 -->|Find Recipients| N["🔔 CREATE NOTIFICATIONS"]
    N -->|Query| N1["Find authorities for this category<br/>Find admin users<br/>Find user's assigned authority"]
    N1 -->|Create| N2["Push Notification<br/>Update unread count"]
    
    N2 -->|Response| O["📨 RETURN TO FRONTEND"]
    O -->|Data| O1["200 OK<br/>{<br/>  id: 1,<br/>  complaint_id: 'SRK4852396',<br/>  ai_category: 'theft',<br/>  ai_priority: 'high',<br/>  ai_summary: '...',<br/>  severity_score: 6.8<br/>}"]
    
    O1 -->|Display| P["✅ SHOW SUCCESS MESSAGE<br/>Display AI Analysis Report<br/>Redirect to tracking page"]
    P -->|Real-time| Q["🔄 ENABLE LIVE UPDATES<br/>WebSocket/Polling for status"]
    
    Q -->|Authority Side| R["👮 NEW COMPLAINT APPEARS<br/>In authority dashboard<br/>Sorted by priority/severity"]
    
    style A fill:#e1f5ff
    style H fill:#fff9c4
    style I fill:#ffccbc
    style J fill:#ffccbc
    style K fill:#ffccbc
    style L fill:#ffccbc
    style M fill:#c5cae9
    style N fill:#f8bbd0
    style O fill:#c8e6c9
    style P fill:#c8e6c9
    style R fill:#f8bbd0
```

---

## 2. AI INTELLIGENCE ENGINE DETAILED PROCESS

### 2.1 Categorization Algorithm Flowchart

```mermaid
flowchart TD
    A["📥 INPUT<br/>title + description"] -->|Combine| B["text = title + description"]
    B -->|Transform| C["text.lower()"]
    
    C -->|Initialize| D["detected_category = 'other'<br/>max_matches = 0"]
    
    D -->|LOOP| E{"For each category<br/>in CATEGORY_KEYWORDS"}
    
    E -->|Example: 'theft'| F["keywords = [<br/>'steal', 'stolen', 'theft',<br/>'rob', 'robbery', ...<br/>]"]
    
    F -->|Count| G["matches = sum of keyword hits<br/>in text<br/>Example: if text has<br/>'robbery' + 'theft' = 2 hits"]
    
    G -->|Compare| H{"matches ><br/>max_matches?"}
    
    H -->|✅ YES| I["detected_category = category<br/>max_matches = matches"]
    H -->|❌ NO| J["Keep current max"]
    
    I -->|LOOP| E
    J -->|LOOP| E
    
    E -->|Loop Complete| K["✅ RETURN<br/>category = detected_category<br/>Example: 'theft'"]
    
    K -->|Output| L["ai_category = 'theft'"]
    
    style A fill:#e1f5ff
    style B fill:#fff9c4
    style C fill:#fff9c4
    style D fill:#ffccbc
    style E fill:#ffccbc
    style F fill:#ffccbc
    style G fill:#ffccbc
    style H fill:#ffccbc
    style I fill:#ffccbc
    style J fill:#ffccbc
    style K fill:#c5cae9
    style L fill:#c8e6c9
```

### 2.2 Severity Score Calculation Flowchart

```mermaid
flowchart TD
    A["📥 INPUT<br/>title, description,<br/>category"] -->|Prepare| B["score = 0.0"]
    
    B -->|Lookup| C["CATEGORY_BASE_SCORES<br/>assault: 7.0<br/>missing: 8.0<br/>theft: 5.0<br/>fraud: 5.5<br/>etc."]
    
    C -->|Select| D{Get base score<br/>for category}
    
    D -->|Example: theft| E["base_score = 5.0"]
    D -->|Not found| F["base_score = 3.0"]
    
    E -->|Add| G["score += base_score<br/>score = 5.0"]
    F -->|Add| G
    
    G -->|Scan| H["HIGH_SEVERITY_KEYWORDS<br/>= [murder, kill, rape,<br/>kidnap, gun, bomb, ...]"]
    
    H -->|Count| I["high_hits = sum of<br/>HIGH_SEVERITY hits<br/>Example: 0 hits"]
    
    I -->|Boost| J["score += min(high_hits * 0.5, 2.0)<br/>score = 5.0 + 0 = 5.0"]
    
    J -->|Scan| K["MEDIUM_SEVERITY_KEYWORDS<br/>= [robbery, assault,<br/>accident, fraud, ...]"]
    
    K -->|Count| L["med_hits = sum of<br/>MEDIUM_SEVERITY hits<br/>Example: 0 hits"]
    
    L -->|Boost| M["score += med_hits * 0.3<br/>score = 5.0 + 0 = 5.0"]
    
    M -->|Add Variance| N["score += random(-0.3, 0.3)<br/>Simulates ML randomness<br/>Example: +0.26<br/>score = 5.26"]
    
    N -->|Clamp| O["score = min(max(score, 0), 10)<br/>Ensure 0-10 range"]
    
    O -->|Round| P["FINAL: round(score, 2)<br/>severity_score = 5.26"]
    
    P -->|Output| Q["✅ RETURN 5.26/10"]
    
    style A fill:#e1f5ff
    style B fill:#fff9c4
    style C fill:#fff9c4
    style D fill:#ffccbc
    style E fill:#ffccbc
    style F fill:#ffccbc
    style G fill:#ffccbc
    style H fill:#ffccbc
    style I fill:#ffccbc
    style J fill:#ffccbc
    style K fill:#ffccbc
    style L fill:#ffccbc
    style M fill:#ffccbc
    style N fill:#ffccbc
    style O fill:#ffccbc
    style P fill:#c5cae9
    style Q fill:#c8e6c9
```

### 2.3 Priority Assignment Logic Flowchart

```mermaid
flowchart TD
    A["📥 INPUT<br/>title, description"] -->|Initialize| B["priority = 'medium'"]
    
    B -->|Check| C{"Any HIGH_SEVERITY<br/>KEYWORD found?"}
    
    C -->|✅ YES| D["priority = 'critical'"]
    C -->|❌ NO| E{"Any MEDIUM_SEVERITY<br/>KEYWORD found?"}
    
    E -->|✅ YES| F["priority = 'high'"]
    E -->|❌ NO| G{"Any category<br/>matches found?"}
    
    G -->|✅ YES| H["priority = 'medium'"]
    G -->|❌ NO| I["priority = 'low'"]
    
    D -->|Output| J["ai_priority = 'critical'"]
    F -->|Output| K["ai_priority = 'high'"]
    H -->|Output| L["ai_priority = 'medium'"]
    I -->|Output| M["ai_priority = 'low'"]
    
    J -->|Return| N["✅ PRIORITY ASSIGNED"]
    K -->|Return| N
    L -->|Return| N
    M -->|Return| N
    
    style A fill:#e1f5ff
    style B fill:#fff9c4
    style C fill:#ffccbc
    style D fill:#ffccbc
    style E fill:#ffccbc
    style F fill:#ffccbc
    style G fill:#ffccbc
    style H fill:#ffccbc
    style I fill:#ffccbc
    style J fill:#c5cae9
    style K fill:#c5cae9
    style L fill:#c5cae9
    style M fill:#c5cae9
    style N fill:#c8e6c9
```

---

## 3. TRANSPORT REQUEST PROCESSING FLOWCHART

```mermaid
flowchart TD
    A["👨‍🌾 FARMER LOGS IN"] -->|JWT Auth| B["📦 CLICK: NEW TRANSPORT REQUEST"]
    B -->|Form Open| C["📋 ENTER REQUEST DETAILS"]
    C -->|Fields| C1["Crop type<br/>Quantity (tons)<br/>Pickup location<br/>Pickup date<br/>Perishable flag"]
    C1 -->|Validation| D{Valid Input?}
    
    D -->|❌ NO| E["⚠️ SHOW ERROR"]
    E -->|Fix| C
    
    D -->|✅ YES| F["📤 SUBMIT: POST /api/transport/"]
    F -->|Include| G["GET current user<br/>Validate serializer<br/>Extract farm location"]
    
    G -->|Trigger| H["🌍 FACILITY DISCOVERY"]
    H -->|Query| H1["Get all active facilities<br/>Filter by crop_type<br/>if provided"]
    
    H1 -->|For each facility| I["🔄 CALCULATE DISTANCE<br/>Using Haversine Formula"]
    
    I -->|Formula| I1["Δφ = lat2 - lat1<br/>Δλ = lon2 - lon1<br/>a = sin²(Δφ/2) + cos(φ1)×cos(φ2)×sin²(Δλ/2)<br/>d = 2R × atan2(√a, √(1-a))<br/>where R = 6371 km"]
    
    I1 -->|Result| I2["distance_km = calculated<br/>Example: 45.3 km"]
    
    I2 -->|Compare| J["Track minimum distance<br/>and facility with capacity"]
    
    J -->|Select| K["✅ BEST FACILITY FOUND<br/>Name, Type, Distance<br/>Capacity, Contact info"]
    
    K -->|Input to Route| L["🗺️ SUGGEST ROUTE"]
    L -->|Parameters| L1["from_lat = farmer_lat<br/>from_lon = farmer_lon<br/>to_lat = facility_lat<br/>to_lon = facility_lon<br/>is_perishable = flag"]
    
    L1 -->|Calculate| L2["Direct distance<br/>(Haversine)"]
    
    L2 -->|Speed Selection| L3{"Perishable?"}
    L3 -->|✅ YES| L4["speed = 40 km/h<br/>⚡ Fast route"]
    L3 -->|❌ NO| L5["speed = 30 km/h<br/>Normal"]
    
    L4 -->|Compute| L6["ETA = distance / speed<br/>Example: 45.3 / 40 = 1.13 hours<br/>= 1h 8m"]
    L5 -->|Compute| L6
    
    L6 -->|Generate| L7["Waypoints along route<br/>Checkpoint 1, 2, 3...<br/>with ETA for each"]
    
    L7 -->|Output| L8["✅ Route JSON<br/>{<br/>distance_km: 45.3,<br/>duration_hours: 1.13,<br/>waypoints: [...],<br/>route_score: 0.85<br/>}"]
    
    L8 -->|Save| M["💾 CREATE REQUEST RECORD"]
    K -->|Save| M
    
    M -->|Store| M1["request_id: TRP5938201<br/>farmer_id: user.id<br/>crop_type: 'wheat'<br/>quantity_tons: 50<br/>destination_id: facility.id<br/>suggested_route: {...}<br/>estimated_distance_km: 45.3<br/>estimated_duration_hours: 1.13<br/>status: 'route_suggested'<br/>created_at: timestamp"]
    
    M1 -->|Response| N["📨 RETURN ROUTE TO FARMER"]
    
    N -->|Display| O["✅ SHOW ROUTE MAP<br/>Display:<br/>- Facility details<br/>- Distance & ETA<br/>- Route on map<br/>- Cost estimate"]
    
    O -->|Action| P{"Farmer Reviews<br/>and Decides"}
    
    P -->|❌ REJECT| Q["Search different facility<br/>or modify request"]
    P -->|✅ CONFIRM| R["POST /transport/{id}/confirm/"]
    
    R -->|Update| S["status = 'confirmed'"]
    S -->|Notify| T["🔔 NOTIFICATION<br/>Farmer: Route confirmed<br/>Facility: New arrival notice"]
    
    T -->|Progress| U["🚗 STATUS: IN_TRANSIT"]
    U -->|Real-time| V["Live tracking<br/>GPS updates"]
    V -->|Arrival| W["✅ STATUS: DELIVERED<br/>Complete transaction"]
    
    style A fill:#e1f5ff
    style H fill:#fff9c4
    style I fill:#ffccbc
    style K fill:#c5cae9
    style L fill:#fff9c4
    style L3 fill:#ffccbc
    style M fill:#c5cae9
    style O fill:#c8e6c9
    style P fill:#ffccbc
    style R fill:#ffccbc
    style W fill:#c8e6c9
```

---

## 4. AUTHORITY DASHBOARD WORKFLOW

```mermaid
flowchart TD
    A["👮 AUTHORITY LOGS IN"] -->|JWT Auth| B["📊 VIEW DASHBOARD"]
    
    B -->|Section 1| C["🔴 HIGH PRIORITY<br/>COMPLAINTS"]
    C -->|Sorted by| C1["severity_score DESC<br/>created_at DESC"]
    C1 -->|Display| C2["List of critical<br/>& high complaints<br/>Red badges"]
    
    B -->|Section 2| D["📊 STATISTICS<br/>API: /intelligence/insights/"]
    D -->|Calculate| D1["Total complaints<br/>Resolved count<br/>Pending count<br/>Resolution rate %<br/>Peak hours"]
    D1 -->|Display| D2["KPI Cards<br/>Trends<br/>Insights"]
    
    B -->|Section 3| E["🗺️ CRIME HOTSPOTS<br/>API: /intelligence/hotspots/"]
    E -->|Query| E1["Get all complaints<br/>with lat/lng"]
    E1 -->|Cluster| E2["K-means clustering<br/>Find high-density<br/>areas"]
    E2 -->|Visualize| E3["Heatmap<br/>Red = high crime<br/>Green = low crime"]
    
    B -->|Section 4| F["📋 ALL COMPLAINTS<br/>API: /complaints/"]
    F -->|Display| F1["Paginated list<br/>Show: ID, Title,<br/>Category, Status,<br/>Priority, Severity"]
    F1 -->|Filter| F2["By: Status<br/>Priority<br/>Category<br/>Date range"]
    F2 -->|Search| F3["By: Title<br/>Description<br/>Location<br/>Complaint ID"]
    
    F3 -->|Click Complaint| G["📄 OPEN DETAIL VIEW"]
    G -->|Display| G1["Full complaint<br/>Reporter info<br/>Evidence<br/>AI Analysis<br/>Updates timeline"]
    
    G1 -->|Action Menu| H{"Authority<br/>Can:"}
    
    H -->|✅ Acknowledge| I["Update status<br/>pending → acknowledged"]
    H -->|⏳ In Progress| J["Update status<br/>acknowledged → in_progress<br/>Assign to self"]
    H -->|🎯 Resolve| K["Update status<br/>in_progress → resolved<br/>Add resolution details"]
    H -->|✅ Close| L["Update status<br/>resolved → closed"]
    H -->|❌ Reject| M["Update status<br/>pending → rejected<br/>Reason: ..."]
    H -->|📝 Add Notes| N["Add authority notes<br/>visible to authorities only"]
    
    I -->|Update DB| O["💾 UPDATE COMPLAINT<br/>status changed<br/>Create ComplaintUpdate entry<br/>Log timestamp"]
    J -->|Update DB| O
    K -->|Update DB| O
    L -->|Update DB| O
    M -->|Update DB| O
    N -->|Update DB| O
    
    O -->|Trigger| P["🔔 NOTIFY CITIZEN"]
    P -->|Send| P1["Push notification<br/>Email update<br/>Mark unread"]
    
    P1 -->|Citizen Receives| Q["👤 CITIZEN SEE UPDATE<br/>In complaint details<br/>In notifications<br/>In timeline"]
    
    style A fill:#e1f5ff
    style B fill:#fff9c4
    style C fill:#ffccbc
    style D fill:#ffccbc
    style E fill:#ffccbc
    style F fill:#ffccbc
    style G fill:#c5cae9
    style H fill:#ffccbc
    style I fill:#ffccbc
    style J fill:#ffccbc
    style K fill:#ffccbc
    style L fill:#ffccbc
    style M fill:#ffccbc
    style N fill:#ffccbc
    style O fill:#c5cae9
    style P fill:#f8bbd0
    style Q fill:#c8e6c9
```

---

## 5. END-TO-END USER JOURNEY MAP

```mermaid
journey
    title SURAKSHA User Journey - Complaint Filing to Resolution
    section Citizen Journey
      Register/Login: 5: Citizen
      File Complaint: 5: Citizen
      View AI Analysis: 5: Citizen
      Receive Notification: 4: Citizen
      Track Progress: 4: Citizen
      View Resolution: 5: Citizen
    section Authority Journey
      Login: 5: Authority
      See New Complaint: 5: Authority
      Review AI Analysis: 5: Authority
      Assign to Self: 4: Authority
      Update Status: 5: Authority
      Send Notification: 5: Authority
      Resolve Case: 5: Authority
    section Farmer Journey
      Register/Login: 5: Farmer
      File Transport Request: 5: Farmer
      View Suggestions: 5: Farmer
      Confirm Route: 4: Farmer
      Track Transport: 4: Farmer
      Deliver Cargo: 5: Farmer
```

---

## 6. DATA FLOW ARCHITECTURE

```mermaid
graph TB
    subgraph Frontend["🖥️ FRONTEND (React)"]
        FE1["Login Page"]
        FE2["Complaint Form"]
        FE3["Dashboard"]
        FE4["Hotspot Map"]
        FE5["Transport Form"]
    end
    
    subgraph API["🔗 API LAYER (REST)"]
        API1["POST /auth/login"]
        API2["POST /complaints/"]
        API3["GET /complaints/"]
        API4["POST /complaints/{id}/update/"]
        API5["GET /intelligence/hotspots/"]
        API6["POST /transport/"]
    end
    
    subgraph Backend["⚙️ BACKEND (Django)"]
        BK1["Authentication<br/>JWT Token"]
        BK2["Complaint Handler<br/>receive request"]
        BK3["AI Engine"]
        BK4["Severity Calculator"]
        BK5["Facility Finder"]
        BK6["Route Optimizer"]
    end
    
    subgraph DB["💾 DATABASE (PostgreSQL)"]
        DB1["Users"]
        DB2["Complaints"]
        DB3["Notifications"]
        DB4["Transport Requests"]
        DB5["Facilities"]
    end
    
    subgraph External["🌐 EXTERNAL SERVICES"]
        EXT1["Google Maps API<br/>(Future)"]
        EXT2["SMS Gateway<br/>(Notifications)"]
        EXT3["File Storage<br/>(AWS S3)"]
    end
    
    FE1 -->|username, password| API1
    API1 -->|authenticate| BK1
    BK1 -->|create JWT| API1
    
    FE2 -->|title, description, location| API2
    API2 -->|receive| BK2
    BK2 -->|extract text| BK3
    BK3 -->|keyword matching| BK4
    BK4 -->|severity calculation| BK2
    BK2 -->|save| DB2
    BK2 -->|notify| DB3
    
    FE3 -->|request| API3
    API3 -->|query complaints| DB2
    API3 -->|return filtered| FE3
    
    FE4 -->|request hotspots| API5
    API5 -->|get complaints data| DB2
    API5 -->|cluster & visualize| FE4
    
    FE5 -->|crop info, location| API6
    API6 -->|receive| BK5
    BK5 -->|query facilities| DB5
    BK5 -->|calculate distance| BK6
    BK6 -->|suggest route| API6
    API6 -->|return route| FE5
    
    BK2 -->|notifications| EXT2
    BK2 -->|file uploads| EXT3
    
    style Frontend fill:#e1f5ff
    style API fill:#fff9c4
    style Backend fill:#ffccbc
    style DB fill:#c5cae9
    style External fill:#f8bbd0
```

---

## 7. SYSTEM ARCHITECTURE LAYERS

```mermaid
graph LR
    subgraph Presentation["PRESENTATION TIER<br/>(Client-Side)"]
        P1["React Components"]
        P2["Material UI / Tailwind CSS"]
        P3["Redux Context API<br/>(State Management)"]
        P4["Axios HTTP Client"]
    end
    
    subgraph Business["BUSINESS LOGIC TIER<br/>(Server-Side)"]
        B1["Django Views<br/>(REST Endpoints)"]
        B2["Serializers<br/>(Validation)"]
        B3["Intelligence Engine<br/>(AI Analysis)"]
        B4["Transport Module<br/>(Route Optimization)"]
        B5["Permission Classes<br/>(Auth & RBAC)"]
    end
    
    subgraph Data["DATA TIER<br/>(Persistence)"]
        D1["Django ORM<br/>(Object-Relational Mapping)"]
        D2["PostgreSQL<br/>(Main Database)"]
        D3["SQLite<br/>(Development)"]
        D4["Redis Cache<br/>(Sessions)"]
    end
    
    subgraph Infrastructure["INFRASTRUCTURE TIER"]
        I1["Gunicorn<br/>(WSGI Server)"]
        I2["Nginx<br/>(Reverse Proxy)"]
        I3["Docker<br/>(Containerization)"]
        I4["GitHub Actions<br/>(CI/CD)"]
    end
    
    P1 -->|HTTP/HTTPS| P4
    P4 -->|REST API Calls| B1
    
    B1 -->|Business Logic| B2
    B2 -->|Validation| B1
    
    B1 -->|AI Analysis| B3
    B1 -->|Route Calc| B4
    B1 -->|Permission Check| B5
    
    B1 -->|ORM Queries| D1
    D1 -->|SQL Statements| D2
    D1 -->|SQL Statements| D3
    
    B5 -->|Session Management| D4
    
    B1 -->|WSGI Protocol| I1
    I1 -->|Forward Requests| I2
    I2 -->|Load Balance| I1
    
    I1 -->|Container| I3
    I3 -->|Auto Deploy| I4
    
    style Presentation fill:#e1f5ff
    style Business fill:#fff9c4
    style Data fill:#c5cae9
    style Infrastructure fill:#ffccbc
```

---

## 8. Database Schema Diagram

```mermaid
erDiagram
    USERS ||--o{ COMPLAINTS : files
    USERS ||--o{ COMPLAINTS : assigned
    USERS ||--o{ TRANSPORT_REQUESTS : makes
    USERS ||--o{ NOTIFICATIONS : receives
    COMPLAINTS ||--o{ COMPLAINT_EVIDENCE : has
    COMPLAINTS ||--o{ COMPLAINT_UPDATES : has
    COMPLAINTS ||--o{ NOTIFICATIONS : triggers
    STORAGE_FACILITIES ||--o{ TRANSPORT_REQUESTS : receives
    TRANSPORT_REQUESTS ||--o{ ROUTE_WAYPOINTS : has
    
    USERS {
        int id PK
        string username UK
        string email UK
        string password_hash
        string role FK "citizen/authority/farmer/admin"
        string phone
        string address
        string city
        string state
        string pincode
        float latitude
        float longitude
        datetime created_at
        datetime updated_at
    }
    
    COMPLAINTS {
        int id PK
        string complaint_id UK "SRK1234567"
        string title
        string description
        string category FK
        string status FK
        string priority FK
        int reporter_id FK
        int assigned_to_id FK
        string incident_location
        float latitude
        float longitude
        string ai_category
        string ai_priority
        string ai_summary
        float severity_score
        datetime incident_date
        datetime created_at
        datetime updated_at
        datetime resolved_at
        string authority_notes
        string resolution_details
        boolean is_anonymous
    }
    
    COMPLAINT_EVIDENCE {
        int id PK
        int complaint_id FK
        string file
        string file_type FK
        string description
        int uploaded_by_id FK
        datetime uploaded_at
    }
    
    COMPLAINT_UPDATES {
        int id PK
        int complaint_id FK
        int updated_by_id FK
        string old_status
        string new_status
        string message
        boolean is_public
        datetime created_at
    }
    
    NOTIFICATIONS {
        int id PK
        int user_id FK
        string title
        string message
        string notif_type FK
        boolean is_read
        int related_complaint_id FK
        datetime created_at
    }
    
    STORAGE_FACILITIES {
        int id PK
        string name
        string facility_type FK
        string address
        string city
        string state
        float latitude
        float longitude
        float capacity_tons
        float available_capacity_tons
        string contact_phone
        string contact_email
        boolean is_active
        string operating_hours
        string accepted_crops
        decimal price_per_ton
    }
    
    TRANSPORT_REQUESTS {
        int id PK
        string request_id UK "TRP1234567"
        int farmer_id FK
        string crop_type FK
        string crop_name
        float quantity_tons
        boolean is_perishable
        boolean requires_cold_storage
        string pickup_address
        float pickup_latitude
        float pickup_longitude
        datetime pickup_date
        string preferred_destination_type
        int destination_id FK
        string suggested_route "JSON"
        float estimated_distance_km
        float estimated_duration_hours
        float route_score
        string status FK
        string special_instructions
        datetime created_at
        datetime updated_at
    }
    
    ROUTE_WAYPOINTS {
        int id PK
        int transport_request_id FK
        int sequence
        string name
        float latitude
        float longitude
        string waypoint_type
        datetime eta
    }
```

---

## 9. Test Case Coverage Matrix

| Module | Test Case | Input | Expected Output | Status |
|--------|-----------|-------|-----------------|--------|
| **Authentication** | User Registration | Valid credentials | JWT tokens created | ✅ Pass |
| | User Login | Valid username/password | Access token returned | ✅ Pass |
| | Token Refresh | Valid refresh token | New access token | ✅ Pass |
| | Protected Route | Invalid token | 401 Unauthorized | ✅ Pass |
| **Categorization** | Theft complaint | "Someone stole my phone" | category = 'theft' | ✅ Pass |
| | Cybercrime complaint | "Hacked via phishing" | category = 'cybercrime' | ✅ Pass |
| | Unknown complaint | "Random issue" | category = 'other' | ✅ Pass |
| **Severity Scoring** | High severity | Murder/gun keywords | severity > 7.0 | ✅ Pass |
| | Medium severity | Assault keywords | 5.0 < severity < 7.0 | ✅ Pass |
| | Low severity | Noise complaint | severity < 3.0 | ✅ Pass |
| **Distance Calculation** | Facility distance | Same location | distance = 0 km | ✅ Pass |
| | Facility distance | 100 km away | distance ≈ 100 km | ✅ Pass |
| | Route suggestion | Perishable goods | speed = 40 km/h | ✅ Pass |
| **API Endpoints** | Create complaint | Valid form | 201 Created + AI analysis | ✅ Pass |
| | List complaints | Auth user | 200 OK + paginated list | ✅ Pass |
| | Update status | Authority user | 200 OK + notification | ✅ Pass |
| | Hotspot data | Query hotspots | 200 OK + clustered data | ✅ Pass |

---

## 10. Performance Optimization Strategies

```
┌─────────────────────────────────────────────────────┐
│ SURAKSHA PERFORMANCE OPTIMIZATION                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 1️⃣  DATABASE OPTIMIZATION                          │
│    - Add indexes on: status, priority, category    │
│    - Pagination: 20 records per page               │
│    - Select_related for FK: reporter, assigned_to │
│    - Prefetch_related for M2M/reverse FKs         │
│                                                     │
│ 2️⃣  CACHING STRATEGY                               │
│    - Redis: Cache complaint list (5 min TTL)       │
│    - Redis: Cache facility data (1 hour TTL)       │
│    - Browser: LocalStorage for JWT tokens          │
│    - CDN: Static assets (CSS, JS, images)          │
│                                                     │
│ 3️⃣  FRONTEND OPTIMIZATION                          │
│    - Code splitting: Lazy load pages               │
│    - Image optimization: WebP format               │
│    - Minify CSS/JS in production                   │
│    - Virtual scrolling for large lists             │
│                                                     │
│ 4️⃣  BACKEND OPTIMIZATION                           │
│    - Async tasks: Celery for notifications         │
│    - Query optimization: Use .only/.defer()        │
│    - Pagination: Don't load all records            │
│    - Gzip compression: API responses               │
│                                                     │
│ 5️⃣  SCALING STRATEGY                               │
│    - Horizontal scaling: Multiple app servers      │
│    - Load balancer: Nginx / AWS ELB               │
│    - Database replica: Read-only for analytics     │
│    - Message queue: RabbitMQ for async tasks       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

**Document Generated**: April 2026  
**Total Pages**: 15+ (with flowcharts)  
**Last Updated**: Project Phase 2 Complete

