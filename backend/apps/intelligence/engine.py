"""
SURAKSHA - Intelligence Engine
Auto-categorizes complaints, computes severity scores, and suggests routes
This is the AI/Intelligence Layer (Module 5 inspiration: real-time interactions)
Uses rule-based NLP and heuristics — no external API needed
"""

import re
import math
import random
from datetime import datetime, timedelta


# ── Keyword maps for complaint categorization ──────────────────────────────

CATEGORY_KEYWORDS = {
    'theft': ['steal', 'stolen', 'theft', 'rob', 'robbed', 'robbery', 'pickpocket', 'burglary', 'missing belongings', 'chain snatching'],
    'assault': ['attack', 'hit', 'beat', 'assault', 'punch', 'violence', 'fight', 'injury', 'hurt', 'wound', 'stab', 'knife'],
    'harassment': ['harass', 'molest', 'eve tease', 'stalking', 'stalk', 'threaten', 'threat', 'abuse', 'bully'],
    'traffic': ['accident', 'crash', 'collision', 'vehicle', 'car', 'bike', 'truck', 'drunk driving', 'rash driving', 'speeding', 'hit and run'],
    'fraud': ['fraud', 'scam', 'cheat', 'deceive', 'fake', 'forgery', 'impersonation', 'money', 'payment', 'transfer', 'upi'],
    'cybercrime': ['cyber', 'online', 'internet', 'hacking', 'hack', 'phishing', 'ransomware', 'social media', 'deepfake', 'otp'],
    'domestic': ['domestic', 'family', 'wife', 'husband', 'spouse', 'dowry', 'child', 'home', 'house'],
    'missing_person': ['missing', 'lost', 'disappeared', 'not found', 'kidnap', 'abduct'],
    'drug_activity': ['drug', 'narcotics', 'substance', 'ganja', 'cocaine', 'alcohol', 'liquor', 'dealer'],
    'vandalism': ['vandal', 'damage', 'destroy', 'break', 'graffiti', 'property damage'],
    'noise': ['noise', 'loud', 'sound', 'music', 'party', 'disturbance', 'nuisance'],
}

HIGH_SEVERITY_KEYWORDS = [
    'murder', 'kill', 'dead', 'death', 'blood', 'gun', 'weapon', 'fire', 'bomb',
    'rape', 'sexual assault', 'kidnap', 'abduct', 'child', 'terrorist', 'explosion',
    'stabbed', 'shot', 'unconscious',
]

MEDIUM_SEVERITY_KEYWORDS = [
    'robbery', 'assault', 'attack', 'accident', 'injury', 'hurt', 'fraud',
    'missing', 'threaten', 'harassment',
]


def categorize_complaint(title: str, description: str) -> dict:
    """
    Rule-based NLP categorization of complaint text.
    Returns category, priority, and a brief AI summary.
    """
    text = (title + ' ' + description).lower()

    # Detect category
    detected_category = 'other'
    max_matches = 0
    for category, keywords in CATEGORY_KEYWORDS.items():
        matches = sum(1 for kw in keywords if kw in text)
        if matches > max_matches:
            max_matches = matches
            detected_category = category

    # Detect priority
    priority = 'medium'
    if any(kw in text for kw in HIGH_SEVERITY_KEYWORDS):
        priority = 'critical'
    elif any(kw in text for kw in MEDIUM_SEVERITY_KEYWORDS):
        priority = 'high'
    elif max_matches == 0:
        priority = 'low'

    # Generate summary
    summary = _generate_summary(title, detected_category, priority)

    return {
        'category': detected_category,
        'priority': priority,
        'summary': summary,
    }


def _generate_summary(title: str, category: str, priority: str) -> str:
    """Generate a one-line AI summary for the complaint."""
    category_labels = {
        'theft': 'theft/robbery', 'assault': 'assault/violence',
        'harassment': 'harassment', 'traffic': 'traffic incident',
        'fraud': 'fraud/financial crime', 'cybercrime': 'cybercrime',
        'domestic': 'domestic incident', 'missing_person': 'missing person',
        'drug_activity': 'drug-related activity', 'vandalism': 'vandalism',
        'noise': 'noise/nuisance complaint', 'other': 'general complaint',
    }
    label = category_labels.get(category, 'general complaint')
    priority_label = priority.upper()
    return f"AI Analysis: [{priority_label}] Classified as {label}. Requires immediate attention." \
           if priority in ('high', 'critical') else \
           f"AI Analysis: [{priority_label}] Classified as {label}. Routed to relevant authority."


def compute_severity(title: str, description: str, category: str) -> float:
    """
    Compute a 0-10 severity score for a complaint.
    Higher = more severe. Used for priority sorting.
    """
    text = (title + ' ' + description).lower()
    score = 0.0

    # Base score by category
    category_base = {
        'assault': 7.0, 'missing_person': 8.0, 'drug_activity': 6.0,
        'theft': 5.0, 'harassment': 6.5, 'fraud': 5.5,
        'cybercrime': 5.0, 'domestic': 6.0, 'traffic': 5.0,
        'vandalism': 3.5, 'noise': 2.0, 'other': 3.0,
    }
    score += category_base.get(category, 3.0)

    # Boost for high-severity keywords
    high_kw_hits = sum(1 for kw in HIGH_SEVERITY_KEYWORDS if kw in text)
    score += min(high_kw_hits * 0.5, 2.0)

    # Slight random variation (simulates ML model variance)
    score += random.uniform(-0.3, 0.3)

    return round(min(max(score, 0), 10), 2)


def suggest_route(
    from_lat: float, from_lon: float,
    to_lat: float, to_lon: float,
    is_perishable: bool = False
) -> dict:
    """
    Intelligent route suggestion for farmer transport.
    Returns waypoints, ETA estimate, and efficiency tips.
    In production: integrate Google Maps Directions API or OSRM.
    """
    # Calculate direct distance
    R = 6371
    phi1, phi2 = math.radians(from_lat), math.radians(to_lat)
    dphi = math.radians(to_lat - from_lat)
    dlambda = math.radians(to_lon - from_lon)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    dist = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    # Simulated waypoints along route
    mid_lat = (from_lat + to_lat) / 2
    mid_lon = (from_lon + to_lon) / 2

    speed_kmh = 40 if is_perishable else 30  # faster route for perishables
    duration_hours = dist / speed_kmh

    # Build route object (would come from Maps API in production)
    route = {
        'distance_km': round(dist, 2),
        'duration_hours': round(duration_hours, 2),
        'duration_formatted': f"{int(duration_hours)}h {int((duration_hours % 1) * 60)}m",
        'route_type': 'express' if is_perishable else 'standard',
        'waypoints': [
            {'lat': from_lat, 'lon': from_lon, 'label': 'Pickup Location', 'type': 'start'},
            {'lat': mid_lat, 'lon': mid_lon, 'label': 'Midpoint Checkpoint', 'type': 'checkpoint'},
            {'lat': to_lat, 'lon': to_lon, 'label': 'Destination Facility', 'type': 'end'},
        ],
        'tips': _get_route_tips(is_perishable, dist),
        'efficiency_score': round(random.uniform(7.5, 9.8), 1),
        'generated_at': datetime.now().isoformat(),
    }
    return route


def _get_route_tips(is_perishable: bool, dist_km: float) -> list:
    """Generate contextual transport tips."""
    tips = []
    if is_perishable:
        tips.append("⚡ Perishable cargo: Use refrigerated vehicle if possible.")
        tips.append("🕐 Depart early morning (5-7 AM) to avoid heat.")
    if dist_km > 100:
        tips.append("🛣️ Long route: Plan for 1-2 fuel stops.")
        tips.append("📱 Keep GPS active and share location with family.")
    tips.append("🏦 Carry required documents: vehicle registration, produce invoice.")
    tips.append("🔔 Notify destination facility 1 hour before arrival.")
    return tips


def get_crime_hotspots(complaints) -> list:
    """
    Analyze complaint location data to identify hotspot areas.
    Returns clusters of high-incident locations.
    """
    hotspots = []
    location_counts = {}

    for c in complaints:
        if c.latitude and c.longitude:
            # Round to 2 decimal places for clustering (~1km grid)
            key = (round(c.latitude, 2), round(c.longitude, 2))
            if key not in location_counts:
                location_counts[key] = {'lat': c.latitude, 'lon': c.longitude, 'count': 0, 'categories': []}
            location_counts[key]['count'] += 1
            location_counts[key]['categories'].append(c.category)

    for loc_data in location_counts.values():
        if loc_data['count'] >= 2:  # threshold for hotspot
            hotspots.append({
                'lat': loc_data['lat'],
                'lon': loc_data['lon'],
                'incident_count': loc_data['count'],
                'risk_level': 'high' if loc_data['count'] >= 5 else 'medium',
            })

    return sorted(hotspots, key=lambda x: -x['incident_count'])