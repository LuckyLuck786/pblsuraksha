"""
SURAKSHA - Intelligence Engine
==============================
AI-powered complaint analysis using two Groq models, Cerebras, and Google Gemini.

Provider architecture — each on a completely separate API account:
  Provider 1: GROQ_API_KEY_1  + Groq     + llama-3.3-70b-versatile  → groq-llama
  Provider 2: GROQ_API_KEY_2  + Groq     + qwen/qwen3-32b            → groq-qwen
  Provider 3: CEREBRAS_API_KEY+ Cerebras + gpt-oss-120b              → cerebras-gptoss
  Provider 4: GEMINI_API_KEY  + Google   + gemini-3.1-flash-lite     → gemini
  Provider 5: (local)           Rule-based NLP keyword engine         → rule-based

  WHY Cerebras for gpt-oss-120b instead of Groq Key 3:
    With Groq, all keys under the same account share organisation-level TPD.
    Using Cerebras for gpt-oss gives a fully independent daily quota pool
    (2,400 RPD / 30,000 TPM) that cannot be consumed by Groq llama or qwen.

Serial fallback chain (categorize_complaint):
  1. Groq Key 1  (llama-3.3-70b-versatile)
  2. Groq Key 2  (qwen/qwen3-32b)
  3. Cerebras    (gpt-oss-120b)
  4. Google Gemini (gemini-3.1-flash-lite)
  5. Rule-based keyword analysis

Parallel evaluation (analyze_all_llms):
  All 5 providers fire simultaneously via ThreadPoolExecutor(max_workers=5).
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
# Groq free tier: 30 RPM + 12,000 TPM per model per org.
# Using per-model windows lets 3 models run concurrently (~36,000 combined TPM)
# instead of sharing one 12,000 TPM pool — tripling effective throughput.

class _GroqRateLimiter:
    """Per-model sliding-window rate limiter with model-aware token budgets.

    WHY per-model instead of shared:
      Groq's free tier grants 12,000 TPM (tokens/min) independently per model.
      Two different models = two separate 12k pools ≈ 24,000 TPM combined.
      Tracking calls per model lets both Groq providers run concurrently
      without colliding on a single shared window.

    WHY different caps per model:
      llama-3.3-70b  : standard output, ~1,040 tokens/call → cap = 10
                        (10 × 1,040 = 10,400 TPM; safely below 12k limit)
      qwen/qwen3-32b : thinking mode ON → emits <think>…</think> first,
                        adding 500–1,500 tokens, total ≈ 2,500 tokens/call.
                        12,000 TPM ÷ 2,500 ≈ 4.8 safe calls/min → cap = 4.
                        Without this lower cap the engine gets 429 TPM errors
                        on every other qwen3 call in burst evaluations.
    """
    _win      = 60.0
    _lock     = threading.Lock()
    _logs: dict = {}      # model_name → [timestamp, ...]

    # Per-model RPM caps derived from Groq's 12,000 TPM free-tier limit.
    # Models using "thinking mode" burn far more tokens per call.
    _MODEL_MAX = {
        'qwen/qwen3-32b': 4,   # thinking mode: ~2,500 tokens/call → 4 × 2,500 = 10,000 TPM
        'qwen3-32b'     : 4,   # short-name variant (just in case)
    }
    _DEFAULT_MAX = 10          # standard models: ~1,040 tokens/call → 10 × 1,040 = 10,400 TPM

    @classmethod
    def _cap(cls, model: str) -> int:
        """Return the per-minute call cap for this model."""
        return cls._MODEL_MAX.get(model, cls._DEFAULT_MAX)

    @classmethod
    def wait(cls, model: str = 'default') -> None:
        """
        Block the calling thread until there is room in this model's 60-s window.
        The lock is released before sleeping so other threads are not stalled.
        """
        cap = cls._cap(model)
        while True:
            sleep_for = 0.0
            with cls._lock:
                now = time.monotonic()
                log = cls._logs.setdefault(model, [])
                # Prune expired timestamps in-place
                cls._logs[model] = [t for t in log if now - t < cls._win]
                log = cls._logs[model]
                if len(log) < cap:
                    log.append(time.monotonic())
                    return          # slot acquired — caller may proceed
                # Window full — compute wait time, then release the lock
                sleep_for = log[0] + cls._win - now

            # Sleep outside the lock so other threads can keep checking
            if sleep_for > 0:
                logger.debug(
                    f'Groq RPM cap [{model}]: window full ({cap}/min) — '
                    f'sleeping {sleep_for:.1f}s'
                )
                time.sleep(sleep_for)

# ── Groq Model Constants ───────────────────────────────────────────────────
# Two Groq models on independent accounts → independent 12,000 TPM pools each.

GROQ_MODEL_LLAMA  = 'llama-3.3-70b-versatile'   # Key 1 (GROQ_API_KEY_1)
GROQ_MODEL_QWEN   = 'qwen/qwen3-32b'             # Key 2 (GROQ_API_KEY_2)

# Cerebras model — gpt-oss-120b on Cerebras inference hardware.
# Completely separate provider account → no shared quota with Groq keys.
CEREBRAS_MODEL_GPTOSS = 'gpt-oss-120b'           # CEREBRAS_API_KEY

# Serial fallback order for categorize_complaint() — Groq only.
# Cerebras + Gemini are tried after both Groq combos fail.
_GROQ_FALLBACK_CHAIN = [
    (0, GROQ_MODEL_LLAMA),    # Key 1 → llama-3.3-70b
    (1, GROQ_MODEL_QWEN),     # Key 2 → qwen/qwen3-32b
]


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

─── IPC / IT ACT SECTIONS (India) ──────────────────────────────────
Suggest 1–3 most relevant IPC or IT Act sections for this complaint.
Examples: IPC 379 (theft), IPC 302 (murder), IPC 354 (harassment),
IT Act 66C (identity theft), IPC 304A (negligent driving), etc.
────────────────────────────────────────────────────────────────────

Respond with ONLY valid JSON — no markdown fences, no explanation:
{{"category": "<category>", "priority": "<priority>", "summary": "<one sentence: what happened and recommended action>", "ipc_sections": ["IPC 379", "IPC 356"]}}"""


def _extract_first_json_object(text: str) -> str | None:
    """
    Extract the first balanced JSON object from arbitrary text.

    Uses brace counting instead of a simple [^{}] regex so it correctly
    handles nested objects and JSON where the summary field contains
    special characters like curly braces or quotes.

    Example:
      text = 'Sure, here you go: {"category": "theft", "priority": "medium",
              "summary": "Victim reported chain-snatching {near MG Road}."}'
      → returns the full JSON string
    """
    start = text.find('{')
    if start == -1:
        return None
    depth = 0
    in_str  = False
    escape  = False
    for i, ch in enumerate(text[start:], start):
        if escape:
            escape = False
            continue
        if ch == '\\' and in_str:
            escape = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _parse_ai_json(text: str) -> dict | None:
    """
    Extract and validate JSON from an AI response string.

    Multi-stage extraction pipeline:
      1. Strip <think>…</think> blocks (Qwen3-32b thinking mode)
      2. Strip markdown code fences (```json … ```)
      3. Try json.loads on the cleaned text directly
      4. Fall back to balanced-brace extraction (_extract_first_json_object)
         — handles cases where the model adds preamble text, trailing sentences,
           or returns JSON embedded in a larger paragraph (common with Gemini)
      5. Return None only if all four stages fail

    Returns None if parsing fails; never raises.
    """
    if not text:
        return None
    text = text.strip()

    # ── Stage 1: strip <think>...</think> blocks ──────────────────────────────
    # Qwen3-32b emits these BEFORE the actual JSON when in "thinking" mode.
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()

    # ── Stage 2: strip markdown code fences ───────────────────────────────────
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$',          '', text)
    text = text.strip()

    # ── Stage 3: direct parse ─────────────────────────────────────────────────
    data = None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        pass

    # ── Stage 4: balanced-brace extraction ────────────────────────────────────
    # Catches: preamble text, trailing sentences, Gemini's "Here is the JSON:"
    # pattern, and summaries that contain curly-brace characters.
    if data is None:
        candidate = _extract_first_json_object(text)
        if candidate:
            try:
                data = json.loads(candidate)
            except json.JSONDecodeError:
                pass

    if data is None:
        logger.warning(f'AI JSON parse failed — no valid JSON object found in: {text[:300]}')
        return None

    # ── Validate and sanitize ─────────────────────────────────────────────────
    if data.get('category') not in VALID_CATEGORIES:
        logger.debug(f'AI returned invalid category "{data.get("category")}" → defaulting to "other"')
        data['category'] = 'other'
    if data.get('priority') not in VALID_PRIORITIES:
        logger.debug(f'AI returned invalid priority "{data.get("priority")}" → defaulting to "medium"')
        data['priority'] = 'medium'
    if not isinstance(data.get('summary'), str) or not data['summary'].strip():
        data['summary'] = (
            f"AI: [{data['priority'].upper()}] {data['category'].replace('_', ' ')} case detected."
        )

    # ipc_sections is optional — default to empty list if missing or wrong type
    if not isinstance(data.get('ipc_sections'), list):
        data['ipc_sections'] = []

    return data


# ── AI Providers ───────────────────────────────────────────────────────────

def _analyze_with_groq(title: str, description: str, custom_prompt: str | None = None) -> dict | None:
    """
    Serial fallback: try both Groq model+key combos in sequence.
    Used by categorize_complaint() when a single best result is needed.

    Combo order (matches _GROQ_FALLBACK_CHAIN):
      1. Key 1 + llama-3.3-70b-versatile
      2. Key 2 + qwen/qwen3-32b
    """
    for key_idx, model in _GROQ_FALLBACK_CHAIN:
        result = _analyze_with_groq_key(
            title, description,
            key_index=key_idx,
            model=model,
            custom_prompt=custom_prompt,
        )
        if result:
            logger.info(
                f'_analyze_with_groq: succeeded with key {key_idx + 1} / {model}. '
                f'cat={result["category"]}, pri={result["priority"]}'
            )
            return result
        logger.debug(f'_analyze_with_groq: key {key_idx + 1} / {model} returned None — trying next combo.')

    logger.warning('_analyze_with_groq: both Groq combos failed — falling through to Cerebras/Gemini.')
    return None


_GEMINI_MODEL = 'gemini-3.1-flash-lite'   # 15 RPM · 500 RPD · 250K TPM on free tier


# ── Cerebras Rate Limiter + Provider ──────────────────────────────────────────

class _CerebrasRateLimiter:
    """Sliding-window rate limiter for Cerebras — max 4 calls/60 s.

    Cerebras free-tier limit for gpt-oss-120b: 5 RPM.
    We cap at 4 (1 safety margin) to avoid edge-of-window burst failures.
    Token budget is generous (30,000 TPM) so token-level throttling is rare.
    """
    _max  = 4
    _win  = 60.0
    _lock = threading.Lock()
    _log: list = []

    @classmethod
    def wait(cls) -> None:
        while True:
            sleep_for = 0.0
            with cls._lock:
                now      = time.monotonic()
                cls._log = [t for t in cls._log if now - t < cls._win]
                if len(cls._log) < cls._max:
                    cls._log.append(time.monotonic())
                    return
                sleep_for = cls._log[0] + cls._win - now
            if sleep_for > 0:
                logger.debug(
                    f'Cerebras RPM cap: window full ({cls._max}/min) — '
                    f'sleeping {sleep_for:.1f}s'
                )
                time.sleep(sleep_for)


def _analyze_with_cerebras(title: str, description: str, custom_prompt: str | None = None) -> dict | None:
    """
    Attempt analysis using Cerebras gpt-oss-120b.

    Cerebras free-tier limits for gpt-oss-120b:
      5 RPM · 2,400 RPD · 30,000 TPM

    Completely independent from Groq — no shared daily quota.
    Install SDK: pip install cerebras-cloud-sdk

    Retry policy for 429:
      Daily quota exhausted → bail immediately
      RPM hit               → retry up to 3×, parsing suggested wait
    """
    cerebras_key = getattr(settings, 'CEREBRAS_API_KEY', '')
    if not cerebras_key:
        logger.warning('Cerebras: No CEREBRAS_API_KEY configured — skipping gpt-oss-120b.')
        return None

    try:
        from cerebras.cloud.sdk import Cerebras
    except ImportError:
        logger.error(
            'cerebras-cloud-sdk not installed. '
            'Run: pip install cerebras-cloud-sdk'
        )
        return None

    prompt = custom_prompt or _build_prompt(title, description)

    for attempt in range(3):
        try:
            _CerebrasRateLimiter.wait()
            client   = Cerebras(api_key=cerebras_key)
            response = client.chat.completions.create(
                model=CEREBRAS_MODEL_GPTOSS,
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.1,
                max_tokens=400,
            )
            result = _parse_ai_json(response.choices[0].message.content)
            if result:
                result['ai_provider'] = f'cerebras-{CEREBRAS_MODEL_GPTOSS}'
                logger.info(
                    f'Cerebras gpt-oss succeeded (attempt {attempt + 1}/3): '
                    f'cat={result["category"]}, pri={result["priority"]}'
                )
                return result
            logger.warning('Cerebras: received response but could not parse JSON.')
            return None

        except Exception as exc:
            exc_str = str(exc).lower()
            exc_raw = str(exc)

            is_quota = (
                '429' in exc_str or 'rate_limit' in exc_str or
                'rate limit' in exc_str or 'quota' in exc_str
            )
            if not is_quota:
                logger.warning(f'Cerebras API failed: {type(exc).__name__}: {exc}')
                return None

            # Daily quota exhausted — no point retrying
            is_daily = (
                'per_day' in exc_str or 'perday' in exc_str or
                'daily' in exc_str or 'per day' in exc_str
            )
            if is_daily:
                logger.warning(
                    f'Cerebras daily quota (RPD) exhausted for {CEREBRAS_MODEL_GPTOSS} — '
                    'skipping immediately (resets midnight UTC)'
                )
                return None

            if attempt >= 2:
                logger.warning(f'Cerebras failed after 3 attempts: {exc}')
                return None

            # Parse suggested retry delay
            delay_match = re.search(r'try again in ([\d.]+)s', exc_raw)
            suggested   = float(delay_match.group(1)) if delay_match else 0.0
            wait_secs   = max(suggested + 1.0, 12.0)   # at least 12s (60s / 5 RPM)
            logger.warning(
                f'Cerebras RPM 429 (attempt {attempt + 1}/3) — '
                f'backing off {wait_secs:.1f}s (suggested {suggested:.1f}s)'
            )
            time.sleep(wait_secs)
            continue

    return None


class _GeminiRateLimiter:
    """Sliding-window rate limiter for Gemini — max 12 calls/60 s.

    Gemini 3.1-flash-lite free-tier limit: 15 RPM.
    We cap at 12 (3 safety margin) to avoid hitting the edge during
    bursts from parallel complaint evaluations.
    """
    _max  = 12
    _win  = 60.0
    _lock = threading.Lock()
    _log: list = []

    @classmethod
    def wait(cls) -> None:
        while True:
            sleep_for = 0.0
            with cls._lock:
                now      = time.monotonic()
                cls._log = [t for t in cls._log if now - t < cls._win]
                if len(cls._log) < cls._max:
                    cls._log.append(time.monotonic())
                    return
                sleep_for = cls._log[0] + cls._win - now
            if sleep_for > 0:
                logger.debug(f'Gemini RPM cap: window full ({cls._max}/min) — sleeping {sleep_for:.1f}s')
                time.sleep(sleep_for)


def _analyze_with_gemini(title: str, description: str, custom_prompt: str | None = None) -> dict | None:
    """
    Attempt analysis using Google Gemini 3.1-Flash-Lite API.

    Free-tier limits (why we chose this model):
      gemini-3.1-flash-lite : 15 RPM · 500 RPD  ← used here
      gemini-2.5-flash      :  5 RPM ·  20 RPD  ← too restrictive (1 eval/day)

    Retry policy for 429 (RESOURCE_EXHAUSTED):
      Daily quota (RPD) exhausted → bail immediately, no retry
      Per-minute quota (RPM) hit  → retry up to 3× using suggested delay
      Other errors                → bail immediately
    """
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

    for attempt in range(3):                         # up to 3 attempts
        try:
            _GeminiRateLimiter.wait()                # honour 12-call/min cap
            client   = genai.Client(api_key=gemini_key)
            response = client.models.generate_content(
                model=_GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=400),
            )
            raw_text = response.text or ''
            result   = _parse_ai_json(raw_text)
            if result:
                result['ai_provider'] = _GEMINI_MODEL
                logger.info(
                    f'Gemini succeeded (attempt {attempt + 1}/3): '
                    f'cat={result["category"]}, pri={result["priority"]}'
                )
                return result
            # JSON unparseable — log a snippet and retry once (Gemini occasionally
            # returns plain prose on the first attempt but JSON on a retry).
            logger.warning(
                f'Gemini: could not parse JSON (attempt {attempt + 1}/3). '
                f'Response snippet: {raw_text[:200]!r}'
            )
            if attempt >= 2:
                return None
            time.sleep(2.0)   # brief pause before retry
            continue

        except Exception as exc:
            exc_str = str(exc).lower()
            exc_raw = str(exc)

            # Check if it's a quota / rate-limit error
            is_quota = (
                '429' in exc_str or
                'resource_exhausted' in exc_str or
                'quota' in exc_str or
                'rate' in exc_str
            )

            if not is_quota:
                logger.warning(f'Gemini API failed: {type(exc).__name__}: {exc}')
                return None

            # ── Daily quota (RPD) exhausted — no point retrying ──────────────
            # Gemini says "PerDay" or "per_day" in the quota metric name
            is_daily = (
                'per_day' in exc_str or
                'perday' in exc_str or
                'requests_per_day' in exc_str or
                'per day' in exc_str
            )
            if is_daily:
                logger.warning(
                    f'Gemini daily request quota (RPD) exhausted for {_GEMINI_MODEL} — '
                    'skipping immediately (resets midnight Pacific)'
                )
                return None

            # ── Per-minute quota (RPM) hit — worth retrying ───────────────────
            if attempt >= 2:
                logger.warning(f'Gemini failed after 3 attempts (RPM throttle): {exc}')
                return None

            # Parse Google's suggested retry delay from the error
            delay_match = re.search(r'retry[^0-9]*([0-9]+(?:\.[0-9]+)?)s', exc_raw)
            suggested   = float(delay_match.group(1)) if delay_match else 0.0
            wait_secs   = max(suggested + 1.0, 7.0)   # at least 7 s; Gemini RPM window = 60 s
            logger.warning(
                f'Gemini RPM 429 (attempt {attempt + 1}/3) — '
                f'backing off {wait_secs:.1f}s (suggested {suggested:.1f}s)'
            )
            time.sleep(wait_secs)
            continue

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


def _analyze_raw_gemini(prompt: str) -> dict | None:
    """Call Gemini with a custom prompt and return raw parsed JSON (no category/priority validation)."""
    gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not gemini_key:
        return None
    try:
        from google import genai
        from google.genai import types
        _GeminiRateLimiter.wait()
        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_content(
            model=_GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=400),
        )
        raw = response.text or ''
        # Strip think blocks and fences
        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)
        candidate = _extract_first_json_object(raw.strip())
        if candidate:
            return json.loads(candidate)
    except Exception as e:
        logger.warning(f'_analyze_raw_gemini failed: {e}')
    return None


def check_duplicate_complaint(title: str, description: str, incident_location: str, hours: int = 24) -> dict:
    """
    Check if a new complaint is likely a duplicate of an existing one.

    Fetches recent complaints from the same area (last `hours` hours),
    then asks an LLM to assess similarity. Returns:
      {
        "is_duplicate": bool,
        "similarity_score": float (0-1),
        "likely_match_id": str or None,
        "reason": str
      }
    """
    from django.utils import timezone
    from datetime import timedelta
    try:
        from apps.complaints.models import Complaint
        cutoff = timezone.now() - timedelta(hours=hours)
        # Get recent complaints from same general area (simple keyword match on location)
        location_words = [w.lower() for w in (incident_location or '').split() if len(w) > 3]
        recent = Complaint.objects.filter(created_at__gte=cutoff)

        # Filter by location overlap
        if location_words:
            from django.db.models import Q
            q = Q()
            for word in location_words[:3]:
                q |= Q(incident_location__icontains=word)
            recent = recent.filter(q)

        recent = list(recent.values('complaint_id', 'title', 'description', 'created_at')[:10])

        if not recent:
            return {"is_duplicate": False, "similarity_score": 0.0, "likely_match_id": None, "reason": "No recent complaints in this area."}

        # Build comparison prompt
        cases_text = "\n".join([
            f"[{c['complaint_id']}] {c['title']}: {c['description'][:150]}"
            for c in recent
        ])
        prompt = f"""You are a duplicate complaint detector for a public safety platform.

NEW COMPLAINT:
Title: {title}
Description: {description[:300]}
Location: {incident_location}

RECENT COMPLAINTS IN SAME AREA (last {hours}h):
{cases_text}

Assess if the new complaint is a duplicate of any listed complaint.
Respond with ONLY valid JSON:
{{"is_duplicate": true/false, "similarity_score": 0.0-1.0, "likely_match_id": "<SRK...> or null", "reason": "<one sentence>"}}"""

        result = _analyze_raw_gemini(prompt)
        if result:
            return {
                "is_duplicate": result.get('is_duplicate', False),
                "similarity_score": float(result.get('similarity_score', 0.0)),
                "likely_match_id": result.get('likely_match_id'),
                "reason": result.get('reason', 'Analysis complete.')
            }
    except Exception as e:
        logger.warning(f'Duplicate check failed: {e}')

    return {"is_duplicate": False, "similarity_score": 0.0, "likely_match_id": None, "reason": "Could not perform duplicate check."}


def generate_investigation_summary(complaint_id: str) -> dict:
    """
    Generate a structured investigation brief for an officer using an LLM.
    Returns: {summary, timeline, suspects, recommendations, ipc_sections, confidence}
    """
    try:
        from apps.complaints.models import Complaint, ComplaintUpdate
        complaint = Complaint.objects.get(complaint_id=complaint_id)
        updates = list(
            ComplaintUpdate.objects.filter(complaint=complaint)
            .values('message', 'new_status', 'created_at')
            .order_by('created_at')
        )
        updates_text = "\n".join([
            f"[{u['created_at'].strftime('%d %b %H:%M')}] → {u['new_status']}: {u['message'][:200]}"
            for u in updates
        ]) or "No updates recorded."

        prompt = f"""You are an AI crime investigation assistant for Safe City Connect public safety platform.

Generate a structured investigation brief for the officer handling this case.

COMPLAINT ID: {complaint.complaint_id}
TITLE: {complaint.title}
CATEGORY: {complaint.category} | PRIORITY: {complaint.priority} | SEVERITY: {complaint.severity_score}/10
LOCATION: {complaint.incident_location}
FILED: {complaint.created_at.strftime('%d %b %Y %H:%M')}
DESCRIPTION:
{complaint.description}

CASE TIMELINE:
{updates_text}

Respond with ONLY valid JSON:
{{
  "case_summary": "<2-3 sentence summary of the incident>",
  "key_facts": ["fact 1", "fact 2", "fact 3"],
  "recommended_actions": ["action 1", "action 2"],
  "ipc_sections": ["IPC XXX (reason)"],
  "urgency_note": "<one sentence on urgency>",
  "confidence": "high/medium/low"
}}"""

        result = _analyze_raw_gemini(prompt)
        if result:
            result['complaint_id'] = complaint_id
            logger.info(f'Investigation summary generated for {complaint_id}')
            return result
    except Exception as e:
        logger.warning(f'Investigation summary failed for {complaint_id}: {e}')

    return {"error": "Could not generate summary", "complaint_id": complaint_id}


def detect_and_translate(title: str, description: str) -> dict:
    """
    Detect language of complaint text and translate to English if needed.
    Returns: {original_title, original_description, title_en, description_en, detected_language, was_translated}
    Supports: Hindi, Kannada, Tamil, Telugu, Marathi (most common Indian languages)
    """
    combined = (title + ' ' + description)[:500]

    # Simple heuristic: if >85% ASCII, likely English
    ascii_ratio = sum(1 for c in combined if ord(c) < 128) / max(len(combined), 1)
    if ascii_ratio > 0.85:
        return {
            "original_title": title, "original_description": description,
            "title_en": title, "description_en": description,
            "detected_language": "english", "was_translated": False
        }

    prompt = f"""You are a multilingual assistant. Detect the language of this text and translate it to English.

TEXT:
Title: {title}
Description: {description[:400]}

Respond with ONLY valid JSON:
{{"detected_language": "<language name in english>", "title_en": "<english title>", "description_en": "<english description>"}}"""

    result = _analyze_raw_gemini(prompt)
    if result and result.get('title_en'):
        return {
            "original_title": title,
            "original_description": description,
            "title_en": result.get('title_en', title),
            "description_en": result.get('description_en', description),
            "detected_language": result.get('detected_language', 'unknown'),
            "was_translated": True
        }

    return {
        "original_title": title, "original_description": description,
        "title_en": title, "description_en": description,
        "detected_language": "unknown", "was_translated": False
    }


def predict_crime_hotspots(days_history: int = 30) -> list:
    """
    Analyze historical complaint patterns to predict next-week crime hotspots.
    Returns a list of predicted hotspot dicts with risk forecasts.
    """
    try:
        from apps.complaints.models import Complaint
        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Count

        cutoff = timezone.now() - timedelta(days=days_history)

        # Aggregate complaints by rounded location + category
        complaints = list(
            Complaint.objects
            .filter(created_at__gte=cutoff, latitude__isnull=False)
            .values('latitude', 'longitude', 'category', 'priority', 'created_at')
        )

        if not complaints:
            return []

        # Group by ~1km grid
        grid: dict = {}
        for c in complaints:
            key = (round(c['latitude'], 2), round(c['longitude'], 2))
            if key not in grid:
                grid[key] = {'lat': key[0], 'lon': key[1], 'count': 0, 'categories': [], 'priorities': []}
            grid[key]['count'] += 1
            grid[key]['categories'].append(c['category'])
            grid[key]['priorities'].append(c['priority'])

        # Top 5 most active zones
        top_zones = sorted(grid.values(), key=lambda x: -x['count'])[:5]

        zone_summary = "\n".join([
            f"Zone ({z['lat']},{z['lon']}): {z['count']} incidents, "
            f"top category: {max(set(z['categories']), key=z['categories'].count)}, "
            f"priority mix: {', '.join(set(z['priorities']))}"
            for z in top_zones
        ])

        prompt = f"""You are a predictive crime analysis AI for Safe City Connect platform in Bangalore, India.

Based on the last {days_history} days of crime data from these zones:

{zone_summary}

For each zone, predict next-week risk level and category. Respond ONLY with valid JSON array:
[
  {{"lat": 12.97, "lon": 77.59, "predicted_risk": "high/medium/low", "predicted_category": "theft", "forecast_note": "one sentence", "confidence": "high/medium/low"}},
  ...
]"""

        result = _analyze_raw_gemini(prompt)
        # result might be a list or a dict with a key
        predictions = []
        if isinstance(result, list):
            predictions = result
        elif isinstance(result, dict):
            predictions = result.get('predictions', result.get('zones', []))

        # Merge with actual zone data
        output = []
        for zone in top_zones:
            pred = next((p for p in predictions if abs(p.get('lat', 0) - zone['lat']) < 0.05 and abs(p.get('lon', 0) - zone['lon']) < 0.05), {})
            output.append({
                'lat': zone['lat'],
                'lon': zone['lon'],
                'historical_count': zone['count'],
                'top_category': max(set(zone['categories']), key=zone['categories'].count),
                'predicted_risk': pred.get('predicted_risk', 'medium'),
                'predicted_category': pred.get('predicted_category', zone['categories'][0] if zone['categories'] else 'other'),
                'forecast_note': pred.get('forecast_note', 'Elevated activity expected based on historical patterns.'),
                'confidence': pred.get('confidence', 'medium'),
                'is_prediction': True,
            })

        logger.info(f'Predictive hotspots: {len(output)} zones analyzed')
        return output

    except Exception as e:
        logger.warning(f'predict_crime_hotspots failed: {e}')
        return []


def natural_language_query(question: str) -> dict:
    """
    Convert a natural language question about crime data into an answer.
    Uses LLM to interpret the question, executes safe aggregation queries.
    Returns: {question, answer, data, query_type}
    """
    from apps.complaints.models import Complaint
    from django.db.models import Count, Avg
    from django.utils import timezone
    from datetime import timedelta

    # Parse the question to determine query type
    prompt = f"""You are a crime data query interpreter for Safe City Connect platform.

The database has complaints with these fields:
- category: theft|assault|harassment|traffic|fraud|cybercrime|domestic|missing_person|drug_activity|vandalism|noise|other
- priority: low|medium|high|critical
- status: pending|acknowledged|in_progress|resolved|closed|rejected
- incident_location: text (Bangalore area names)
- created_at: datetime
- severity_score: 0-10 float

User question: "{question}"

Determine the query type and parameters. Respond ONLY with valid JSON:
{{
  "query_type": "count|top_category|by_status|by_priority|by_location|trend|severity|recent",
  "filters": {{"category": null, "priority": null, "status": null, "days": 30, "location_keyword": null}},
  "answer_template": "There were {{count}} theft complaints in the last 30 days."
}}"""

    meta = _analyze_raw_gemini(prompt)
    if not meta:
        return {"question": question, "answer": "Could not interpret the question.", "data": {}, "query_type": "unknown"}

    filters = meta.get('filters', {})
    query_type = meta.get('query_type', 'count')

    try:
        qs = Complaint.objects.all()
        days = int(filters.get('days') or 30)
        qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=days))

        if filters.get('category'):
            qs = qs.filter(category=filters['category'])
        if filters.get('priority'):
            qs = qs.filter(priority=filters['priority'])
        if filters.get('status'):
            qs = qs.filter(status=filters['status'])
        if filters.get('location_keyword'):
            qs = qs.filter(incident_location__icontains=filters['location_keyword'])

        data = {}
        if query_type == 'top_category':
            results = list(qs.values('category').annotate(count=Count('id')).order_by('-count')[:5])
            data = {'top_categories': results}
            answer = "Top categories: " + ", ".join(f"{r['category']} ({r['count']})" for r in results[:3])
        elif query_type == 'by_status':
            results = list(qs.values('status').annotate(count=Count('id')).order_by('-count'))
            data = {'by_status': results}
            answer = ", ".join(f"{r['status']}: {r['count']}" for r in results)
        elif query_type == 'severity':
            avg = qs.aggregate(avg=Avg('severity_score'))['avg']
            data = {'avg_severity': round(avg or 0, 2)}
            answer = f"Average severity score: {data['avg_severity']}/10"
        else:
            count = qs.count()
            data = {'count': count}
            answer = meta.get('answer_template', f"Found {count} matching complaints.").replace('{count}', str(count))

        logger.info(f'NL query answered: "{question}" → {query_type}')
        return {"question": question, "answer": answer, "data": data, "query_type": query_type}

    except Exception as e:
        logger.warning(f'NL query execution failed: {e}')
        return {"question": question, "answer": "Could not execute query.", "data": {}, "query_type": "error"}


def get_crime_trends(days: int = 90) -> dict:
    """
    Analyze crime trends over the last N days and generate LLM insights.
    Returns daily counts per category + LLM narrative insight.
    """
    from apps.complaints.models import Complaint
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Count
    from django.db.models.functions import TruncDate

    try:
        cutoff = timezone.now() - timedelta(days=days)

        # Daily counts total
        daily = list(
            Complaint.objects
            .filter(created_at__gte=cutoff)
            .annotate(day=TruncDate('created_at'))
            .values('day', 'category')
            .annotate(count=Count('id'))
            .order_by('day')
        )

        # Category totals for period
        cat_totals = list(
            Complaint.objects
            .filter(created_at__gte=cutoff)
            .values('category')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        # Simple trend: compare first half vs second half of period
        mid = timezone.now() - timedelta(days=days // 2)
        first_half  = Complaint.objects.filter(created_at__gte=cutoff, created_at__lt=mid).count()
        second_half = Complaint.objects.filter(created_at__gte=mid).count()
        trend_pct   = round(((second_half - first_half) / max(first_half, 1)) * 100, 1)

        # Generate LLM insight
        cat_summary = ", ".join([f"{c['category']}: {c['count']}" for c in cat_totals[:6]])
        prompt = f"""You are a crime analyst for Safe City Connect, Bangalore.

Last {days} days crime data:
- Total complaints: {first_half + second_half}
- Trend: {"up" if trend_pct > 0 else "down"} {abs(trend_pct)}% (first vs second half of period)
- Category breakdown: {cat_summary}

Write a concise 2-sentence insight about the trend pattern and one actionable recommendation.
Respond ONLY with JSON: {{"insight": "...", "recommendation": "..."}}"""

        llm_result = _analyze_raw_gemini(prompt)

        return {
            "period_days": days,
            "daily_counts": [
                {"date": str(d['day']), "category": d['category'], "count": d['count']}
                for d in daily
            ],
            "category_totals": cat_totals,
            "trend_pct": trend_pct,
            "trend_direction": "up" if trend_pct > 0 else ("down" if trend_pct < 0 else "stable"),
            "llm_insight": llm_result.get('insight', '') if llm_result else '',
            "llm_recommendation": llm_result.get('recommendation', '') if llm_result else '',
        }
    except Exception as e:
        logger.warning(f'get_crime_trends failed: {e}')
        return {"period_days": days, "daily_counts": [], "category_totals": [], "error": str(e)}


def _analyze_with_groq_key(
    title: str,
    description: str,
    key_index: int = 0,
    model: str = GROQ_MODEL_LLAMA,
    custom_prompt: str | None = None,
) -> dict | None:
    """
    Try ONE Groq key+model combo. No inter-key fallback — that is the caller's job.

    Each (key_index, model) pair uses its own rate-limiter window, so three
    parallel calls to different models do not block each other.

    Retry policy for HTTP 429:
      TPD (tokens-per-day exhausted) → bail immediately, no retry
      TPM (tokens-per-minute)        → retry up to 3× using Groq's suggested delay
      Other errors                   → bail immediately
    """
    try:
        from groq import Groq
    except ImportError:
        return None

    keys = [k for k in [
        getattr(settings, 'GROQ_API_KEY_1', ''),   # index 0 → llama
        getattr(settings, 'GROQ_API_KEY_2', ''),   # index 1 → qwen
        getattr(settings, 'GROQ_API_KEY_3', ''),   # index 2 → gpt-oss
    ] if k]

    if key_index >= len(keys):
        logger.warning(f'Groq key {key_index + 1} not configured — skipping {model}.')
        return None

    key_label   = key_index + 1
    model_short = model.split('/')[-1]               # e.g. "qwen3-32b" from "qwen/qwen3-32b"
    prompt      = custom_prompt or _build_prompt(title, description)

    # Qwen3 "thinking" mode emits a <think>…</think> block before the JSON.
    # That block can be 500-1500 tokens by itself → need extra headroom so the
    # JSON answer isn't cut off.  Other models only need ~150 tokens for the JSON.
    max_tok = 2500 if 'qwen' in model.lower() else 400

    for attempt in range(3):                         # up to 3 attempts per combo
        try:
            _GroqRateLimiter.wait(model)             # per-model 10-call/min TPM cap
            client   = Groq(api_key=keys[key_index])
            response = client.chat.completions.create(
                model=model,
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.1,
                max_tokens=max_tok,
            )
            result = _parse_ai_json(response.choices[0].message.content)
            if result:
                result['ai_provider']    = f'groq-key{key_label}-{model_short}'
                result['provider_label'] = f'Groq {model_short} (Key {key_label})'
                logger.info(
                    f'Groq key {key_label}/{model_short} succeeded (attempt {attempt + 1}/3): '
                    f'cat={result["category"]}, pri={result["priority"]}'
                )
                return result
            # JSON could not be parsed — not a transient error, don't retry
            logger.warning(f'Groq key {key_label}/{model_short}: could not parse JSON response.')
            return None

        except Exception as exc:
            exc_str = str(exc).lower()
            exc_raw = str(exc)                       # keep original case for regex
            is_429  = '429' in exc_str or 'rate_limit' in exc_str or 'rate limit' in exc_str

            if not is_429:
                logger.warning(f'Groq key {key_label}/{model_short} failed: {type(exc).__name__}: {exc}')
                return None

            # ── Distinguish TPD (daily) vs TPM (per-minute) ──────────────────
            # TPD errors say "tokens per day (TPD)" — daily budget resets at
            # midnight UTC only; sleeping a few seconds is pointless.
            is_daily = 'per day' in exc_str or 'tokens per day' in exc_str or '(tpd)' in exc_str
            if is_daily:
                logger.warning(
                    f'Groq key {key_label}/{model_short} daily token quota (TPD) exhausted — '
                    f'skipping immediately (resets midnight UTC). '
                    f'To fix: create a new Groq account at console.groq.com and replace '
                    f'GROQ_API_KEY_{key_label} in backend/.env'
                )
                return None                          # no retry; daily limit won't clear in seconds

            # ── TPM (per-minute) rate limit — worth retrying ─────────────────
            if attempt >= 2:
                logger.warning(f'Groq key {key_label}/{model_short} failed after 3 attempts: {exc}')
                return None

            # Parse Groq's suggested retry delay: "Please try again in 4.695s"
            delay_match = re.search(r'try again in ([\d.]+)s', exc_raw)
            suggested   = float(delay_match.group(1)) if delay_match else 0.0
            wait_secs   = max(suggested + 1.0, 5.0)   # at least 5 s; usually 5–6 s
            logger.warning(
                f'Groq key {key_label}/{model_short} TPM 429 (attempt {attempt + 1}/3) — '
                f'backing off {wait_secs:.1f}s (Groq suggested {suggested:.1f}s)'
            )
            time.sleep(wait_secs)
            continue                                 # retry the same combo

    return None


def analyze_all_llms(title: str, description: str) -> list:
    """
    Call all 5 providers in parallel and return their results.

    Provider roster (5 total):
      groq-llama   — Key 1 + llama-3.3-70b-versatile  (12k TPM pool A)
      groq-qwen    — Key 2 + qwen/qwen3-32b            (12k TPM pool B)
      groq-gptoss  — Key 1 + openai/gpt-oss-120b       (12k TPM pool C)
      gemini       — Google Gemini 2.0-Flash
      rule-based   — Rule-Based NLP (always succeeds, < 1 ms)

    Because each Groq model has its own TPM pool, all three Groq calls
    run concurrently without triggering each other's rate limits.

    Each result dict always contains:
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

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        f1 = ex.submit(_timed,
                       lambda: _analyze_with_groq_key(title, description, 0, GROQ_MODEL_LLAMA),
                       'groq-llama',      'Groq Llama-3.3-70b')
        f2 = ex.submit(_timed,
                       lambda: _analyze_with_groq_key(title, description, 1, GROQ_MODEL_QWEN),
                       'groq-qwen',       'Groq Qwen3-32b')
        f3 = ex.submit(_timed,
                       lambda: _analyze_with_cerebras(title, description),
                       'cerebras-gptoss', 'Cerebras GPT-OSS-120b')
        f4 = ex.submit(_timed,
                       lambda: _analyze_with_gemini(title, description),
                       'gemini',          'Google Gemini 3.1-Flash-Lite')
        f5 = ex.submit(_timed,
                       lambda: _rule_based_analyze(title, description),
                       'rule-based',      'Rule-Based NLP')
        results = [f1.result(), f2.result(), f3.result(), f4.result(), f5.result()]

    successes = sum(1 for r in results if r['success'])
    logger.info(f'analyze_all_llms: {successes}/5 providers succeeded for "{title[:50]}"')
    return results


# ── Public API ─────────────────────────────────────────────────────────────

def categorize_complaint(title: str, description: str) -> dict:
    """
    AI-powered complaint categorization (single best result).

    Serial fallback chain:
      1. Groq Key 1  + llama-3.3-70b-versatile
      2. Groq Key 2  + qwen/qwen3-32b
      3. Cerebras    + gpt-oss-120b
      4. Google Gemini (gemini-3.1-flash-lite)
      5. Rule-based keyword analysis (always succeeds)

    Returns dict with keys: category, priority, summary, ai_provider
    """
    logger.info(f'Starting complaint analysis: title="{title[:60]}"')

    result = _analyze_with_groq(title, description)
    if not result:
        result = _analyze_with_cerebras(title, description)
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
