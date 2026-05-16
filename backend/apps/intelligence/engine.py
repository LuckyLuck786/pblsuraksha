"""
SURAKSHA - Intelligence Engine
==============================
AI-powered complaint analysis using Groq (Llama-3.3-70b-versatile) and Google Gemini.

Fallback chain:
  1. Groq API key 1  (llama-3.3-70b-versatile)
  2. Groq API key 2  (llama-3.3-70b-versatile)
  3. Google Gemini   (gemini-2.0-flash)
  4. Rule-based keyword analysis
"""

import re
import json
import math
import time
import logging
import threading
import concurrent.futures
from datetime import datetime
from django.conf import settings

logger = logging.getLogger('apps.intelligence.engine')


# ── Groq Rate Limiter ──────────────────────────────────────────────────────
# Groq free tier: 30 RPM shared across ALL keys in the same org.
# This token-bucket limiter caps outgoing Groq calls to 28/min (2 safety margin)
# so parallel evaluations don't burn through the RPM quota all at once.

class _GroqRateLimiter:
    """Thread-safe sliding-window rate limiter — max 28 Groq calls per 60 s."""
    _max  = 28
    _win  = 60.0
    _lock = threading.Lock()
    _log: list[float] = []

    @classmethod
    def wait(cls) -> None:
        """
        Block the calling thread until there is room in the 60-s window.
        The lock is released before sleeping so other threads are not stalled.
        """
        while True:
            sleep_for = 0.0
            with cls._lock:
                now       = time.monotonic()
                cls._log  = [t for t in cls._log if now - t < cls._win]
                if len(cls._log) < cls._max:
                    cls._log.append(time.monotonic())
                    return          # slot acquired — caller may proceed
                # Window full — compute wait time, then release the lock
                sleep_for = cls._log[0] + cls._win - now

            # Sleep outside the lock so other threads can keep checking
            if sleep_for > 0:
                logger.debug(
                    f'Groq RPM cap: window full ({cls._max}/min) — '
                    f'sleeping {sleep_for:.1f}s'
                )
                time.sleep(sleep_for)

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
    'murder', 'kill', 'killed', 'dead', 'death', 'blood', 'gun', 'weapon', 'bomb',
    'rape', 'sexual assault', 'molestation', 'kidnap', 'abduct', 'terrorist', 'explosion',
    'stabbed', 'stab', 'shot', 'shooting', 'unconscious', 'fire', 'burning',
    'hostage', 'armed', 'acid attack', 'suicide',
]
_MEDIUM_SEVERITY_KW = [
    'robbery', 'assault', 'attack', 'accident', 'injury', 'hurt', 'fraud',
    'missing', 'threaten', 'threat', 'harassment', 'snatch', 'steal', 'stolen',
    'fight', 'chase', 'damage', 'broke', 'broken', 'hit', 'knocked',
    'eve tease', 'stalking', 'loot', 'looted',
]

_CATEGORY_SEVERITY_BASE = {
    'missing_person': 8.5,
    'assault'       : 7.5,
    'harassment'    : 6.0,
    'drug_activity' : 6.0,
    'domestic'      : 6.0,
    'fraud'         : 5.5,
    'theft'         : 5.5,
    'cybercrime'    : 5.0,
    'traffic'       : 5.0,
    'vandalism'     : 4.0,
    'other'         : 3.5,
    'noise'         : 2.5,
}

# Representative midpoint score for each priority level (0-10 scale).
# Final severity = 50% content-based score + 50% priority score — this way
# the category always differentiates incidents within the same priority tier.
_PRIORITY_SCORE = {'low': 2.0, 'medium': 4.5, 'high': 7.0, 'critical': 9.5}
# Hard minimum only for critical — a bomb/murder can never score below 8.0
_PRIORITY_MIN   = {'critical': 8.0}


# ── AI Prompt Builder ──────────────────────────────────────────────────────

def _build_prompt(title: str, description: str) -> str:
    return f"""You are SURAKSHA's AI crime classification engine for India's public safety platform (NCRB taxonomy).

TASK: Classify the complaint below into EXACTLY ONE of 12 categories and assign a priority level.

─── CATEGORY DEFINITIONS ────────────────────────────────────────────────────
theft          – stealing, snatching, chain snatching, pickpocketing, shoplifting, burglary, vehicle theft, house break-in, robbery (even with force if primary intent is to take property)
assault        – physical attack/beating/punching/kicking/stabbing/shooting causing bodily harm; physical fights; mob violence; acid attack (NOT purely sexual — use harassment for that)
harassment     – sexual harassment, eve-teasing, molestation, stalking, verbal/mental abuse, threatening calls/messages, blackmail, workplace harassment, online abuse (non-financial)
traffic        – road accident, vehicle collision, drunk driving, rash/negligent driving, hit-and-run, road rage, traffic signal violations, vehicle breakdown causing hazard
fraud          – financial cheating, investment scam, job scam, property fraud, insurance fraud, impersonation for financial gain, fake documents, UPI/bank transfer fraud, offline payment fraud
cybercrime     – hacking, phishing, OTP/SIM swap fraud, social media account takeover, ransomware, data breach, online threats/impersonation WITHOUT financial motive, dark-web activity
domestic       – domestic violence, dowry harassment/demand, marital dispute with violence or threat, child abuse within family, elder abuse at home, cruelty by spouse/in-laws
missing_person – person reported missing (adult or child), suspected kidnapping or abduction, person not contactable and whereabouts unknown
drug_activity  – drug dealing/peddling, narcotics possession/consumption, ganja/marijuana/cocaine/heroin/MDMA, illegal alcohol/liquor, drug trafficking
vandalism      – deliberate property damage, graffiti, arson (small-scale), destruction of public/private assets, breaking windows/vehicles
noise          – noise disturbance, loud music/DJ/loudspeaker, late-night party, construction noise, industrial noise complaint
other          – genuinely does not fit any category above
─────────────────────────────────────────────────────────────────────────────

─── DISAMBIGUATION RULES (read carefully) ───────────────────────────────────
• Chain snatching / purse snatching → theft (not assault, even if attacker pushed victim)
• Physical fight or beating → assault (even between family members, unless it's a recurring domestic violence pattern)
• Ongoing domestic abuse by spouse/family → domestic (not assault)
• Sexual misconduct, eve-teasing, molestation → harassment (not assault)
• Online financial fraud / UPI scam → fraud (NOT cybercrime)
• Account hacking leading to financial theft → cybercrime (not fraud)
• Missing + credible kidnapping → missing_person (not assault)
• Drug use/possession (personal) → drug_activity (not other)
• Vandalism + assault in same incident → choose the more serious one (assault)
• If genuinely ambiguous → pick the primary act described
─────────────────────────────────────────────────────────────────────────────

─── PRIORITY RULES ──────────────────────────────────────────────────────────
critical  – murder/attempt to murder, rape, kidnapping/abduction, bomb/terror threat, child in imminent danger, armed robbery with weapon
high      – serious assault with injury, robbery (unarmed but confrontational), missing person (especially child), domestic violence with injury, drug peddling/trafficking, serious accident with casualties
medium    – theft, harassment, fraud, cybercrime, drug possession/use, hit-and-run without severe injury, vandalism
low       – noise complaints, minor property damage, general disturbances without threat to life
─────────────────────────────────────────────────────────────────────────────

Complaint Title: {title}
Complaint Description: {description}

Respond with ONLY valid JSON — no markdown fences, no explanation:
{{"category": "<category>", "priority": "<priority>", "summary": "<one sentence: what happened and recommended action>"}}"""


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
            _GroqRateLimiter.wait()      # honour 28-call/min RPM cap
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


def _analyze_with_groq_key(title: str, description: str, key_index: int = 0) -> dict | None:
    """Try exactly ONE Groq key by index (0=Key1, 1=Key2). No fallback."""
    try:
        from groq import Groq
    except ImportError:
        return None

    keys = [k for k in [
        getattr(settings, 'GROQ_API_KEY_1', ''),
        getattr(settings, 'GROQ_API_KEY_2', ''),
    ] if k]

    if key_index >= len(keys):
        logger.warning(f'Groq key {key_index + 1} not configured.')
        return None

    key_label = key_index + 1
    prompt = _build_prompt(title, description)

    try:
        _GroqRateLimiter.wait()          # honour 28-call/min RPM cap
        client   = Groq(api_key=keys[key_index])
        response = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[{'role': 'user', 'content': prompt}],
            temperature=0.1,
            max_tokens=400,
        )
        result = _parse_ai_json(response.choices[0].message.content)
        if result:
            result['ai_provider']    = f'groq-key-{key_label}'
            result['provider_label'] = f'Groq Llama-3.3-70b (Key {key_label})'
            logger.info(f'Groq key {key_label} (single): cat={result["category"]}, pri={result["priority"]}')
            return result
        logger.warning(f'Groq key {key_label}: could not parse JSON response.')
    except Exception as exc:
        logger.warning(f'Groq key {key_label} failed: {type(exc).__name__}: {exc}')

    return None


def analyze_all_llms(title: str, description: str) -> list:
    """
    Call all LLM providers and rule-based engine IN PARALLEL.
    Returns a list of 4 result dicts (one per provider), always in the
    order: [groq-key-1, groq-key-2, gemini, rule-based].

    Each dict always contains:
        provider_key    – stable identifier for matching
        provider_label  – human-readable name
        success         – bool
        latency_ms      – float
        category        – str | None
        priority        – str | None
        summary         – str | None
        severity_score  – float | None
        error           – str (only when success=False)
    """
    def _timed(fn, provider_key, display_label):
        t0 = time.perf_counter()
        raw = None
        err = None
        try:
            raw = fn()
        except Exception as exc:
            err = str(exc)
            logger.warning(f'{provider_key} parallel call error: {exc}')

        latency_ms = round((time.perf_counter() - t0) * 1000, 1)

        if raw:
            raw['provider_key']   = provider_key
            raw['provider_label'] = display_label
            raw['latency_ms']     = latency_ms
            raw['success']        = True
            raw['severity_score'] = compute_severity(
                title, description,
                raw.get('category', 'other'),
                raw.get('priority', 'medium'),
            )
            return raw

        return {
            'provider_key'  : provider_key,
            'provider_label': display_label,
            'ai_provider'   : provider_key,
            'success'       : False,
            'latency_ms'    : latency_ms,
            'error'         : err or 'Provider unavailable or returned invalid response',
            'category'      : None,
            'priority'      : None,
            'summary'       : None,
            'severity_score': None,
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        f1 = ex.submit(_timed, lambda: _analyze_with_groq_key(title, description, 0),
                       'groq-key-1', 'Groq Llama-3.3-70b (Key 1)')
        f2 = ex.submit(_timed, lambda: _analyze_with_groq_key(title, description, 1),
                       'groq-key-2', 'Groq Llama-3.3-70b (Key 2)')
        f3 = ex.submit(_timed, lambda: _analyze_with_gemini(title, description),
                       'gemini',     'Google Gemini 2.0-Flash')
        f4 = ex.submit(_timed, lambda: _rule_based_analyze(title, description),
                       'rule-based', 'Rule-Based NLP')
        results = [f1.result(), f2.result(), f3.result(), f4.result()]

    successes = sum(1 for r in results if r['success'])
    logger.info(f'analyze_all_llms: {successes}/4 providers succeeded for "{title[:50]}"')
    return results


# ── Public API ─────────────────────────────────────────────────────────────

def categorize_complaint(title: str, description: str) -> dict:
    """
    AI-powered complaint categorization.

    Fallback chain:
      1. Groq llama-3.3-70b (key 1)
      2. Groq llama-3.3-70b (key 2)
      3. Google Gemini
      4. Rule-based keyword analysis

    Returns dict with keys: category, priority, summary, ai_provider
    """
    logger.info(f'Starting complaint analysis: title="{title[:60]}"')

    result = _analyze_with_groq(title, description)
    if not result:
        result = _analyze_with_gemini(title, description)
    if not result:
        logger.warning('All AI providers unavailable — using rule-based fallback.')
        result = _rule_based_analyze(title, description)

    logger.info(
        f'Analysis complete: cat={result["category"]}, '
        f'pri={result["priority"]}, provider={result.get("ai_provider", "unknown")}'
    )
    return result


def compute_severity(title: str, description: str, category: str, priority: str = 'medium') -> float:
    """
    Compute a 0–10 severity score.

    Formula: final = 50% content_score + 50% priority_score
    - content_score = category_base + keyword_boost (capped at 10)
    - priority_score = fixed midpoint per priority tier
    - Exception: critical complaints have a hard floor of 8.0

    This blended approach means two incidents with the same AI priority can
    still receive different scores based on their specific category and the
    keywords found in the text (e.g. assault > theft within 'high' priority).
    """
    text = (title + ' ' + description).lower()

    # ── Content-based score ────────────────────────────────────────────────
    base       = _CATEGORY_SEVERITY_BASE.get(category, 3.5)
    high_hits  = sum(1 for kw in _HIGH_SEVERITY_KW  if kw in text)
    med_hits   = sum(1 for kw in _MEDIUM_SEVERITY_KW if kw in text)
    kw_boost   = min(high_hits * 1.0 + med_hits * 0.3, 2.5)
    content    = min(base + kw_boost, 10.0)

    # ── Priority-based score ───────────────────────────────────────────────
    pri_score  = _PRIORITY_SCORE.get(priority, 4.5)

    # ── Weighted blend ─────────────────────────────────────────────────────
    blended    = (content * 0.5) + (pri_score * 0.5)

    # ── Hard minimum for critical only ─────────────────────────────────────
    minimum    = _PRIORITY_MIN.get(priority, 0.0)
    final      = round(min(max(blended, minimum), 10.0), 2)

    logger.debug(
        f'Severity: {final} '
        f'(cat={category}, base={base}, kw_boost={kw_boost:.1f} '
        f'[high×{high_hits} med×{med_hits}], '
        f'content={content:.1f}, pri={priority}/{pri_score}, blended={blended:.2f})'
    )
    return final


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
