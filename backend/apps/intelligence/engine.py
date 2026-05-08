"""
SURAKSHA - Intelligence Engine
==============================
AI-powered complaint analysis using Groq (Llama-3.3-70b-versatile) and Google Gemini.

Fallback chain:
  1. Groq API key 1  (llama-3.3-70b-versatile)
  2. Groq API key 2  (llama-3.3-70b-versatile)
  3. Google Gemini   (gemini-2.0-flash)
  4. Rule-based keyword analysis

RAG validation layer (after every LLM/rule-based call):
  5. Retrieve similar past complaints from ChromaDB
  6. Validate LLM result vs. retrieved majority
  7. If mismatch → re-prompt LLM with retrieved context (correction round)
  8. Return final result with rag_validated / rag_corrected flags
"""

import re
import json
import math
import logging
from datetime import datetime
from django.conf import settings

logger = logging.getLogger('apps.intelligence.engine')

# ── Constants ──────────────────────────────────────────────────────────────

VALID_CATEGORIES = [
    'theft', 'assault', 'harassment', 'traffic', 'fraud',
    'cybercrime', 'domestic', 'missing_person', 'drug_activity',
    'vandalism', 'noise', 'other',
]
VALID_PRIORITIES = ['low', 'medium', 'high', 'critical']

_CATEGORY_KEYWORDS = {
    'theft'         : ['steal', 'stolen', 'theft', 'rob', 'robbed', 'robbery', 'pickpocket', 'burglary', 'chain snatching'],
    'assault'       : ['attack', 'hit', 'beat', 'assault', 'punch', 'violence', 'fight', 'injury', 'stab', 'knife'],
    'harassment'    : ['harass', 'molest', 'eve tease', 'stalking', 'stalk', 'threaten', 'threat', 'abuse', 'bully'],
    'traffic'       : ['accident', 'crash', 'collision', 'vehicle', 'car', 'bike', 'truck', 'drunk driving', 'rash driving', 'hit and run'],
    'fraud'         : ['fraud', 'scam', 'cheat', 'deceive', 'fake', 'forgery', 'impersonation', 'payment', 'transfer', 'upi'],
    'cybercrime'    : ['cyber', 'online', 'hacking', 'hack', 'phishing', 'ransomware', 'social media', 'deepfake', 'otp'],
    'domestic'      : ['domestic', 'family', 'wife', 'husband', 'spouse', 'dowry', 'home'],
    'missing_person': ['missing', 'lost', 'disappeared', 'not found', 'kidnap', 'abduct'],
    'drug_activity' : ['drug', 'narcotics', 'ganja', 'cocaine', 'alcohol', 'liquor', 'dealer'],
    'vandalism'     : ['vandal', 'damage', 'destroy', 'graffiti', 'property damage'],
    'noise'         : ['noise', 'loud', 'music', 'party', 'disturbance', 'nuisance'],
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
    'assault'       : 7.0,
    'missing_person': 8.0,
    'drug_activity' : 6.0,
    'theft'         : 5.0,
    'harassment'    : 6.5,
    'fraud'         : 5.5,
    'cybercrime'    : 5.0,
    'domestic'      : 6.0,
    'traffic'       : 5.0,
    'vandalism'     : 3.5,
    'noise'         : 2.0,
    'other'         : 3.0,
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
    if not text:
        return None
    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
        if not match:
            logger.warning(f'AI JSON parse failed — no JSON block found in: {text[:200]}')
            return None
        try:
            data = json.loads(match.group())
        except json.JSONDecodeError:
            logger.warning(f'AI JSON parse failed (regex match also invalid): {text[:200]}')
            return None

    # Validate and sanitize
    if data.get('category') not in VALID_CATEGORIES:
        logger.debug(f'AI returned invalid category "{data.get("category")}" → defaulting to "other"')
        data['category'] = 'other'
    if data.get('priority') not in VALID_PRIORITIES:
        logger.debug(f'AI returned invalid priority "{data.get("priority")}" → defaulting to "medium"')
        data['priority'] = 'medium'
    if not isinstance(data.get('summary'), str) or not data['summary'].strip():
        data['summary'] = f"AI: [{data['priority'].upper()}] {data['category'].replace('_', ' ')} case detected."

    return data


# ── AI Providers ───────────────────────────────────────────────────────────

def _analyze_with_groq(title: str, description: str, custom_prompt: str | None = None) -> dict | None:
    """
    Attempt analysis using Groq API (llama-3.3-70b-versatile).
    Tries GROQ_API_KEY_1 first, then GROQ_API_KEY_2 on failure.
    Accepts an optional custom_prompt (used for RAG correction rounds).
    """
    try:
        from groq import Groq
    except ImportError:
        logger.error('groq package not installed. Run: pip install groq')
        return None

    keys = [k for k in [
        getattr(settings, 'GROQ_API_KEY_1', ''),
        getattr(settings, 'GROQ_API_KEY_2', ''),
    ] if k]

    if not keys:
        logger.warning('Groq: No GROQ_API_KEY configured in settings/env.')
        return None

    prompt = custom_prompt or _build_prompt(title, description)

    for i, key in enumerate(keys, 1):
        try:
            client = Groq(api_key=key)
            response = client.chat.completions.create(
                model='llama-3.3-70b-versatile',
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.1,
                max_tokens=400,
            )
            result = _parse_ai_json(response.choices[0].message.content)
            if result:
                result['ai_provider'] = f'groq-llama3.3-70b (key {i})'
                logger.info(f'Groq key {i} succeeded. Result: cat={result["category"]}, pri={result["priority"]}')
                return result
            logger.warning(f'Groq key {i}: received response but could not parse JSON.')
        except Exception as exc:
            logger.warning(f'Groq key {i} failed: {type(exc).__name__}: {exc}')

    return None


def _analyze_with_gemini(title: str, description: str, custom_prompt: str | None = None) -> dict | None:
    """Attempt analysis using Google Gemini API (google-genai SDK)."""
    gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not gemini_key:
        logger.warning('Gemini: No GEMINI_API_KEY configured in settings/env.')
        return None

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        logger.error('google-genai not installed. Run: pip install google-genai')
        return None

    prompt = custom_prompt or _build_prompt(title, description)

    try:
        client   = genai.Client(api_key=gemini_key)
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=400),
        )
        result = _parse_ai_json(response.text)
        if result:
            result['ai_provider'] = 'gemini-2.0-flash'
            logger.info(f'Gemini succeeded. Result: cat={result["category"]}, pri={result["priority"]}')
            return result
        logger.warning('Gemini: received response but could not parse JSON.')
    except Exception as exc:
        logger.warning(f'Gemini API failed: {type(exc).__name__}: {exc}')

    return None


def _rule_based_analyze(title: str, description: str) -> dict:
    """Rule-based fallback: keyword matching for category and priority."""
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

    logger.info(
        f'Rule-based fallback used. Result: cat={detected_category}, pri={priority} '
        f'(keyword matches={max_matches})'
    )
    return {
        'category'   : detected_category,
        'priority'   : priority,
        'summary'    : f"System Analysis: [{priority.upper()}] Classified as {detected_category.replace('_', ' ')}. Routed for review.",
        'ai_provider': 'rule-based-fallback',
    }


# ── RAG Validation Round ───────────────────────────────────────────────────

def _run_rag_validation(title: str, description: str, initial_result: dict) -> dict:
    """
    Validate initial_result against RAG-retrieved similar cases.
    If a mismatch is found, re-prompt the LLM with correction context.
    Returns the final (possibly corrected) result dict with RAG metadata attached.
    """
    from apps.intelligence import rag  # deferred import avoids circular issues

    # ── Step 1: retrieve similar past cases ───────────────────────────────
    similar_cases = rag.retrieve_similar(title, description)

    if not similar_cases:
        logger.info('RAG: No similar cases found — skipping validation (cold start).')
        initial_result.update({'rag_validated': False, 'rag_corrected': False,
                               'rag_similar_count': 0})
        return initial_result

    # ── Step 2: validate LLM result vs retrieved distribution ─────────────
    is_valid, correction_hints = rag.validate_result(initial_result, similar_cases)

    if is_valid:
        initial_result.update({
            'rag_validated'     : True,
            'rag_corrected'     : False,
            'rag_similar_count' : len(similar_cases),
            'rag_correction'    : {},
        })
        return initial_result

    # ── Step 3: mismatch detected — build corrective prompt ───────────────
    logger.warning(
        f'RAG: Mismatch detected for "{title[:50]}". '
        f'Hints: {correction_hints}. Starting correction round...'
    )
    correction_prompt = rag.build_correction_prompt(
        title, description, initial_result, similar_cases, correction_hints
    )

    # ── Step 4: re-prompt best available LLM with context ─────────────────
    corrected = _analyze_with_groq(title, description, custom_prompt=correction_prompt)
    if not corrected:
        corrected = _analyze_with_gemini(title, description, custom_prompt=correction_prompt)

    if corrected:
        # Log what changed
        old_cat = initial_result.get('category')
        old_pri = initial_result.get('priority')
        new_cat = corrected.get('category')
        new_pri = corrected.get('priority')
        changed = []
        if old_cat != new_cat: changed.append(f'category {old_cat}→{new_cat}')
        if old_pri != new_pri: changed.append(f'priority {old_pri}→{new_pri}')

        if changed:
            logger.info(f'RAG CORRECTION APPLIED: {", ".join(changed)} (provider={corrected.get("ai_provider")})')
        else:
            logger.info('RAG correction round completed — LLM kept original assessment after reviewing context.')

        corrected.update({
            'rag_validated'     : True,
            'rag_corrected'     : bool(changed),
            'rag_similar_count' : len(similar_cases),
            'rag_correction'    : correction_hints,
            'rag_reasoning'     : corrected.get('rag_reasoning', ''),
            'original_category' : old_cat,
            'original_priority' : old_pri,
        })
        return corrected
    else:
        # All LLMs failed during correction — keep original but mark as unvalidated
        logger.error(
            'RAG: Correction round failed — no LLM available to re-analyze. '
            'Keeping original result with rag_corrected=False.'
        )
        initial_result.update({
            'rag_validated'     : False,
            'rag_corrected'     : False,
            'rag_similar_count' : len(similar_cases),
            'rag_correction'    : correction_hints,
        })
        return initial_result


# ── Public API ─────────────────────────────────────────────────────────────

def categorize_complaint(title: str, description: str) -> dict:
    """
    AI-powered complaint categorization with RAG validation.

    Full pipeline:
      1. Groq llama-3.3-70b (key 1) → 2. Groq (key 2) → 3. Gemini → 4. Rule-based
      5. RAG validation against similar past cases
      6. If mismatch → re-prompt LLM with corrective context

    Returns dict with keys:
        category, priority, summary, ai_provider,
        rag_validated, rag_corrected, rag_similar_count,
        rag_correction (hints dict), rag_reasoning (str)
    """
    logger.info(f'Starting complaint analysis: title="{title[:60]}"')

    # ── Initial LLM analysis ──────────────────────────────────────────────
    result = _analyze_with_groq(title, description)
    if not result:
        result = _analyze_with_gemini(title, description)
    if not result:
        logger.warning('All AI providers unavailable — using rule-based fallback.')
        result = _rule_based_analyze(title, description)

    logger.info(
        f'Initial analysis complete: cat={result["category"]}, '
        f'pri={result["priority"]}, provider={result.get("ai_provider", "unknown")}'
    )

    # ── RAG validation + correction round ─────────────────────────────────
    try:
        result = _run_rag_validation(title, description, result)
    except Exception as exc:
        logger.error(f'RAG validation pipeline crashed (non-fatal): {exc}', exc_info=True)
        result.setdefault('rag_validated', False)
        result.setdefault('rag_corrected', False)
        result.setdefault('rag_similar_count', 0)

    logger.info(
        f'Final result: cat={result["category"]}, pri={result["priority"]}, '
        f'rag_validated={result.get("rag_validated")}, '
        f'rag_corrected={result.get("rag_corrected")}'
    )
    return result


def compute_severity(title: str, description: str, category: str) -> float:
    """
    Compute a 0–10 severity score for priority sorting.
    Higher = more severe. Based on category base + critical keyword density.
    """
    text = (title + ' ' + description).lower()
    score = _CATEGORY_SEVERITY_BASE.get(category, 3.0)

    high_hits = sum(1 for kw in _HIGH_SEVERITY_KW if kw in text)
    score += min(high_hits * 0.5, 2.0)

    final = round(min(max(score, 0.0), 10.0), 2)
    logger.debug(f'Severity computed: {final} (category={category}, high_keyword_hits={high_hits})')
    return final


def suggest_route(
    from_lat: float, from_lon: float,
    to_lat: float, to_lon: float,
    is_perishable: bool = False,
) -> dict:
    """Route suggestion for farmer transport using Haversine distance."""
    R = 6371
    phi1, phi2 = math.radians(from_lat), math.radians(to_lat)
    dphi    = math.radians(to_lat - from_lat)
    dlambda = math.radians(to_lon - from_lon)
    a    = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    dist = R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    mid_lat = (from_lat + to_lat) / 2
    mid_lon = (from_lon + to_lon) / 2
    speed   = 45 if is_perishable else 35
    dur_h   = dist / speed

    logger.debug(f'Route computed: {round(dist, 2)} km, ~{round(dur_h, 2)} h, perishable={is_perishable}')
    return {
        'distance_km'       : round(dist, 2),
        'duration_hours'    : round(dur_h, 2),
        'duration_formatted': f"{int(dur_h)}h {int((dur_h % 1) * 60)}m",
        'route_type'        : 'express' if is_perishable else 'standard',
        'waypoints'         : [
            {'lat': from_lat, 'lon': from_lon, 'label': 'Pickup Location',      'type': 'start'},
            {'lat': mid_lat,  'lon': mid_lon,  'label': 'Midpoint Checkpoint',  'type': 'checkpoint'},
            {'lat': to_lat,   'lon': to_lon,   'label': 'Destination Facility', 'type': 'end'},
        ],
        'tips'              : _get_route_tips(is_perishable, dist),
        'generated_at'      : datetime.now().isoformat(),
    }


def _get_route_tips(is_perishable: bool, dist_km: float) -> list:
    tips = []
    if is_perishable:
        tips.append('Perishable cargo: Use refrigerated vehicle if possible.')
        tips.append('Depart early morning (5-7 AM) to avoid heat.')
    if dist_km > 100:
        tips.append('Long route: Plan for 1-2 fuel stops.')
        tips.append('Keep GPS active and share location with family.')
    tips.append('Carry required documents: vehicle registration, produce invoice.')
    tips.append('Notify destination facility 1 hour before arrival.')
    return tips


def get_crime_hotspots(complaints) -> list:
    """Cluster complaint locations to identify crime hotspots (~1km grid squares)."""
    location_counts: dict = {}

    for c in complaints:
        if c.latitude and c.longitude:
            key = (round(c.latitude, 2), round(c.longitude, 2))
            if key not in location_counts:
                location_counts[key] = {
                    'lat'           : c.latitude,
                    'lon'           : c.longitude,
                    'count'         : 0,
                    'categories'    : [],
                    'severity_total': 0.0,
                }
            location_counts[key]['count'] += 1
            location_counts[key]['categories'].append(c.category)
            location_counts[key]['severity_total'] += c.severity_score or 0.0

    hotspots = []
    for loc in location_counts.values():
        if loc['count'] >= 2:
            avg_sev = round(loc['severity_total'] / loc['count'], 1)
            hotspots.append({
                'lat'           : loc['lat'],
                'lon'           : loc['lon'],
                'incident_count': loc['count'],
                'severity_avg'  : avg_sev,
                'risk_level'    : 'high' if loc['count'] >= 5 else 'medium',
                'top_category'  : max(set(loc['categories']), key=loc['categories'].count),
            })

    logger.debug(f'Hotspot computation: {len(hotspots)} hotspots from {len(location_counts)} locations.')
    return sorted(hotspots, key=lambda x: -x['incident_count'])
