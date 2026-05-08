"""
SURAKSHA - Intelligence Engine
AI-powered complaint analysis using Groq (Llama-3.3-70b-versatile) and Google Gemini.
Fallback chain: Groq Key 1 → Groq Key 2 → Gemini → rule-based
"""

import re
import json
import math
import logging
import random
from datetime import datetime
from django.conf import settings

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────

VALID_CATEGORIES = [
    'theft', 'assault', 'harassment', 'traffic', 'fraud',
    'cybercrime', 'domestic', 'missing_person', 'drug_activity',
    'vandalism', 'noise', 'other',
]
VALID_PRIORITIES = ['low', 'medium', 'high', 'critical']

# Rule-based fallback keyword maps
_CATEGORY_KEYWORDS = {
    'theft': ['steal', 'stolen', 'theft', 'rob', 'robbed', 'robbery', 'pickpocket', 'burglary', 'chain snatching'],
    'assault': ['attack', 'hit', 'beat', 'assault', 'punch', 'violence', 'fight', 'injury', 'stab', 'knife'],
    'harassment': ['harass', 'molest', 'eve tease', 'stalking', 'stalk', 'threaten', 'threat', 'abuse', 'bully'],
    'traffic': ['accident', 'crash', 'collision', 'vehicle', 'car', 'bike', 'truck', 'drunk driving', 'rash driving', 'hit and run'],
    'fraud': ['fraud', 'scam', 'cheat', 'deceive', 'fake', 'forgery', 'impersonation', 'payment', 'transfer', 'upi'],
    'cybercrime': ['cyber', 'online', 'hacking', 'hack', 'phishing', 'ransomware', 'social media', 'deepfake', 'otp'],
    'domestic': ['domestic', 'family', 'wife', 'husband', 'spouse', 'dowry', 'home'],
    'missing_person': ['missing', 'lost', 'disappeared', 'not found', 'kidnap', 'abduct'],
    'drug_activity': ['drug', 'narcotics', 'ganja', 'cocaine', 'alcohol', 'liquor', 'dealer'],
    'vandalism': ['vandal', 'damage', 'destroy', 'graffiti', 'property damage'],
    'noise': ['noise', 'loud', 'music', 'party', 'disturbance', 'nuisance'],
}

_HIGH_SEVERITY_KW = [
    'murder', 'kill', 'dead', 'death', 'blood', 'gun', 'weapon', 'bomb',
    'rape', 'sexual assault', 'kidnap', 'abduct', 'terrorist', 'explosion',
    'stabbed', 'shot', 'unconscious', 'fire',
]
_MEDIUM_SEVERITY_KW = [
    'robbery', 'assault', 'attack', 'accident', 'injury', 'hurt', 'fraud',
    'missing', 'threaten', 'harassment',
]

_CATEGORY_SEVERITY_BASE = {
    'assault': 7.0, 'missing_person': 8.0, 'drug_activity': 6.0,
    'theft': 5.0, 'harassment': 6.5, 'fraud': 5.5,
    'cybercrime': 5.0, 'domestic': 6.0, 'traffic': 5.0,
    'vandalism': 3.5, 'noise': 2.0, 'other': 3.0,
}


# ── AI Prompt Builder ──────────────────────────────────────────────────────

def _build_prompt(title: str, description: str) -> str:
    return f"""You are an AI assistant for SURAKSHA, India's intelligent public safety platform.

Analyze the complaint and respond with ONLY a valid JSON object (no markdown, no explanation).

Complaint Title: {title}
Complaint Description: {description}

Return exactly this JSON structure:
{{
  "category": "<one of: theft, assault, harassment, traffic, fraud, cybercrime, domestic, missing_person, drug_activity, vandalism, noise, other>",
  "priority": "<one of: low, medium, high, critical>",
  "summary": "<one concise sentence describing the incident and recommended action>"
}}

Priority assignment rules:
- critical: murder, rape, kidnapping, bomb/terror threat, child in danger, armed robbery
- high: assault, robbery without weapon, missing person, serious accident, domestic violence
- medium: theft, harassment, fraud, cybercrime, drug activity, traffic violations
- low: noise complaints, minor vandalism, general nuisance

Respond ONLY with the JSON object. No other text."""


def _parse_ai_json(text: str) -> dict | None:
    """Extract and validate JSON from AI response. Returns None if invalid."""
    text = text.strip()
    # Strip markdown code fences if present
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Try to find a JSON block within the text
        match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group())
        except json.JSONDecodeError:
            return None

    # Validate and sanitize
    if data.get('category') not in VALID_CATEGORIES:
        data['category'] = 'other'
    if data.get('priority') not in VALID_PRIORITIES:
        data['priority'] = 'medium'
    if not isinstance(data.get('summary'), str) or not data['summary'].strip():
        data['summary'] = f"AI: [{data['priority'].upper()}] {data['category'].replace('_', ' ')} case detected."

    return data


# ── AI Providers ───────────────────────────────────────────────────────────

def _analyze_with_groq(title: str, description: str) -> dict | None:
    """
    Attempt analysis using Groq API (llama-3.3-70b-versatile).
    Tries GROQ_API_KEY_1 first, then GROQ_API_KEY_2 on failure.
    """
    try:
        from groq import Groq
    except ImportError:
        logger.warning("groq package not installed. Run: pip install groq")
        return None

    keys = [
        getattr(settings, 'GROQ_API_KEY_1', ''),
        getattr(settings, 'GROQ_API_KEY_2', ''),
    ]
    keys = [k for k in keys if k]
    if not keys:
        logger.warning("No GROQ_API_KEY configured in settings.")
        return None

    prompt = _build_prompt(title, description)
    for i, key in enumerate(keys, 1):
        try:
            client = Groq(api_key=key)
            response = client.chat.completions.create(
                model='llama-3.3-70b-versatile',
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.1,
                max_tokens=300,
            )
            result = _parse_ai_json(response.choices[0].message.content)
            if result:
                result['ai_provider'] = f'groq-llama3.3-70b (key {i})'
                logger.info(f"Groq key {i} succeeded for complaint analysis.")
                return result
        except Exception as e:
            logger.warning(f"Groq key {i} failed: {type(e).__name__}: {e}")

    return None


def _analyze_with_gemini(title: str, description: str) -> dict | None:
    """Attempt analysis using Google Gemini API (google-genai SDK)."""
    gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not gemini_key:
        logger.warning("No GEMINI_API_KEY configured in settings.")
        return None

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        logger.warning("google-genai package not installed. Run: pip install google-genai")
        return None

    try:
        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=_build_prompt(title, description),
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=300,
            ),
        )
        result = _parse_ai_json(response.text)
        if result:
            result['ai_provider'] = 'gemini-2.0-flash'
            logger.info("Gemini succeeded for complaint analysis.")
            return result
    except Exception as e:
        logger.warning(f"Gemini API failed: {type(e).__name__}: {e}")

    return None


def _rule_based_analyze(title: str, description: str) -> dict:
    """
    Rule-based fallback when all AI providers are unavailable.
    Uses keyword matching for category and priority detection.
    """
    text = (title + ' ' + description).lower()

    detected_category = 'other'
    max_matches = 0
    for category, keywords in _CATEGORY_KEYWORDS.items():
        matches = sum(1 for kw in keywords if kw in text)
        if matches > max_matches:
            max_matches = matches
            detected_category = category

    if any(kw in text for kw in _HIGH_SEVERITY_KW):
        priority = 'critical'
    elif any(kw in text for kw in _MEDIUM_SEVERITY_KW):
        priority = 'high'
    elif max_matches > 0:
        priority = 'medium'
    else:
        priority = 'low'

    return {
        'category': detected_category,
        'priority': priority,
        'summary': f"System Analysis: [{priority.upper()}] Classified as {detected_category.replace('_', ' ')}. Routed for review.",
        'ai_provider': 'rule-based-fallback',
    }


# ── Public API ─────────────────────────────────────────────────────────────

def categorize_complaint(title: str, description: str) -> dict:
    """
    AI-powered complaint categorization with automatic fallback.

    Fallback chain:
      1. Groq API key 1 (llama-3.3-70b-versatile)
      2. Groq API key 2 (llama-3.3-70b-versatile)
      3. Google Gemini 1.5 Flash
      4. Rule-based keyword analysis

    Returns dict with keys: category, priority, summary, ai_provider
    """
    result = _analyze_with_groq(title, description)
    if result:
        return result

    result = _analyze_with_gemini(title, description)
    if result:
        return result

    logger.warning("All AI providers unavailable — using rule-based fallback.")
    return _rule_based_analyze(title, description)


def compute_severity(title: str, description: str, category: str) -> float:
    """
    Compute a 0–10 severity score for priority sorting.
    Higher = more severe. Based on category and critical keyword density.
    """
    text = (title + ' ' + description).lower()
    score = _CATEGORY_SEVERITY_BASE.get(category, 3.0)

    high_hits = sum(1 for kw in _HIGH_SEVERITY_KW if kw in text)
    score += min(high_hits * 0.5, 2.0)

    return round(min(max(score, 0.0), 10.0), 2)


def suggest_route(
    from_lat: float, from_lon: float,
    to_lat: float, to_lon: float,
    is_perishable: bool = False,
) -> dict:
    """
    Route suggestion for farmer transport.
    Calculates distance/ETA and provides logistic tips.
    (Production: replace with Google Maps Directions API or OSRM.)
    """
    R = 6371
    phi1, phi2 = math.radians(from_lat), math.radians(to_lat)
    dphi = math.radians(to_lat - from_lat)
    dlambda = math.radians(to_lon - from_lon)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    dist = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    mid_lat = (from_lat + to_lat) / 2
    mid_lon = (from_lon + to_lon) / 2
    speed_kmh = 45 if is_perishable else 35
    duration_hours = dist / speed_kmh

    return {
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


def _get_route_tips(is_perishable: bool, dist_km: float) -> list:
    tips = []
    if is_perishable:
        tips.append("Perishable cargo: Use refrigerated vehicle if possible.")
        tips.append("Depart early morning (5-7 AM) to avoid heat.")
    if dist_km > 100:
        tips.append("Long route: Plan for 1-2 fuel stops.")
        tips.append("Keep GPS active and share location with family.")
    tips.append("Carry required documents: vehicle registration, produce invoice.")
    tips.append("Notify destination facility 1 hour before arrival.")
    return tips


def get_crime_hotspots(complaints) -> list:
    """
    Cluster complaint locations to identify crime hotspots.
    Groups incidents within ~1km grid squares.
    """
    location_counts: dict = {}

    for c in complaints:
        if c.latitude and c.longitude:
            key = (round(c.latitude, 2), round(c.longitude, 2))
            if key not in location_counts:
                location_counts[key] = {
                    'lat': c.latitude,
                    'lon': c.longitude,
                    'count': 0,
                    'categories': [],
                    'severity_total': 0.0,
                }
            location_counts[key]['count'] += 1
            location_counts[key]['categories'].append(c.category)
            location_counts[key]['severity_total'] += c.severity_score or 0.0

    hotspots = []
    for loc in location_counts.values():
        if loc['count'] >= 2:
            avg_severity = round(loc['severity_total'] / loc['count'], 1)
            hotspots.append({
                'lat': loc['lat'],
                'lon': loc['lon'],
                'incident_count': loc['count'],
                'severity_avg': avg_severity,
                'risk_level': 'high' if loc['count'] >= 5 else 'medium',
                'top_category': max(set(loc['categories']), key=loc['categories'].count),
            })

    return sorted(hotspots, key=lambda x: -x['incident_count'])
