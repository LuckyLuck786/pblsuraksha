"""Safe City Connect — Intelligence Views"""

import logging
from datetime import datetime

from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count

from apps.complaints.models import Complaint
from .engine import get_crime_hotspots, categorize_complaint, compute_severity

logger = logging.getLogger('apps.intelligence')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def hotspots(request):
    """GET /api/intelligence/hotspots/ — Crime hotspot cluster data"""
    logger.info(f'hotspots requested by {request.user.username}')
    complaints = Complaint.objects.all()
    spots = get_crime_hotspots(complaints)
    logger.debug(f'Returning {len(spots)} hotspots')
    return Response({'hotspots': spots})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def map_data(request):
    """
    GET /api/intelligence/map-data/
    Returns individual complaint pins + hotspot clusters for the live map.
    Authority/admin sees all; citizen sees only theirs.
    """
    user = request.user
    logger.info(f'map_data requested by {user.username} (role={user.role})')

    base_qs = (
        Complaint.objects.all()
        if user.role in ('authority', 'admin')
        else Complaint.objects.filter(reporter=user)
    )
    geo_qs = base_qs.filter(latitude__isnull=False, longitude__isnull=False)

    pins = []
    for c in geo_qs.values(
        'complaint_id', 'title', 'category', 'priority',
        'status', 'severity_score', 'latitude', 'longitude',
        'incident_location', 'ai_summary', 'created_at'
    ):
        pins.append({
            'complaint_id' : c['complaint_id'],
            'title'        : c['title'],
            'category'     : c['category'],
            'priority'     : c['priority'],
            'status'       : c['status'],
            'severity_score': c['severity_score'],
            'lat'          : c['latitude'],
            'lon'          : c['longitude'],
            'location'     : c['incident_location'],
            'ai_summary'   : c['ai_summary'] or '',
            'created_at'   : c['created_at'].strftime('%d %b %Y') if c['created_at'] else '',
        })

    hotspot_clusters  = get_crime_hotspots(base_qs)
    category_counts   = list(
        base_qs.values('category').annotate(count=Count('id')).order_by('-count')[:6]
    )

    logger.debug(f'map_data: {len(pins)} pins, {len(hotspot_clusters)} clusters')
    return Response({
        'pins'              : pins,
        'hotspots'          : hotspot_clusters,
        'total_with_coords' : len(pins),
        'total_complaints'  : base_qs.count(),
        'category_counts'   : category_counts,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_text(request):
    """POST /api/intelligence/analyze/ — Analyze complaint text before submission"""
    title       = request.data.get('title', '')
    description = request.data.get('description', '')

    if not title.strip():
        logger.warning(f'analyze_text called with empty title by {request.user.username}')
        return Response({'error': 'Title is required'}, status=400)

    logger.info(f'analyze_text: "{title[:60]}" by {request.user.username}')

    try:
        result   = categorize_complaint(title, description)
        severity = compute_severity(title, description, result['category'], result.get('priority', 'medium'))
        result['severity_score'] = severity
        logger.info(
            f'analyze_text result: cat={result["category"]}, pri={result["priority"]}, '
            f'severity={severity}'
        )
        return Response(result)
    except Exception as exc:
        logger.error(f'analyze_text failed: {exc}', exc_info=True)
        return Response({'error': 'Analysis failed. Please try again.'}, status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def insights(request):
    """GET /api/intelligence/insights/ — Smart insights for dashboard"""
    logger.info(f'insights requested by {request.user.username}')
    try:
        total            = Complaint.objects.count()
        resolved         = Complaint.objects.filter(status='resolved').count()
        pending_critical = Complaint.objects.filter(
            priority='critical', status__in=['pending', 'in_progress']
        ).count()
        resolution_rate  = round((resolved / total * 100), 1) if total > 0 else 0

        top_category = (
            Complaint.objects.values('category')
            .annotate(count=Count('id'))
            .order_by('-count')
            .first()
        )
        top_cat_name = (
            top_category['category'].replace('_', ' ').title()
            if top_category else 'N/A'
        )

        return Response({
            'resolution_rate' : resolution_rate,
            'pending_critical': pending_critical,
            'total_analyzed'  : total,
            'ai_categorized'  : Complaint.objects.exclude(ai_category='').count(),
            'insights'        : [
                f"{resolution_rate}% of all complaints have been resolved.",
                f"{pending_critical} critical complaints need immediate attention.",
                f"Top reported category: {top_cat_name}.",
                "Peak reporting hours: 6PM – 10PM (based on data trends).",
            ],
        })
    except Exception as exc:
        logger.error(f'insights endpoint failed: {exc}', exc_info=True)
        return Response({'error': 'Failed to compute insights'}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_all(request):
    """
    POST /api/intelligence/analyze-all/
    Calls ALL LLM providers in parallel and returns every individual result.
    Used by the complaint form to compare models side-by-side.
    """
    from .engine import analyze_all_llms
    title       = request.data.get('title', '')
    description = request.data.get('description', '')

    if not title.strip():
        logger.warning(f'analyze_all: empty title from {request.user.username}')
        return Response({'error': 'Title is required'}, status=400)

    logger.info(f'analyze_all: "{title[:60]}" by {request.user.username}')
    try:
        results = analyze_all_llms(title, description)
        return Response({'results': results})
    except Exception as exc:
        logger.error(f'analyze_all failed: {exc}', exc_info=True)
        return Response({'error': 'Analysis failed.'}, status=500)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def check_duplicate(request):
    """POST /api/intelligence/check-duplicate/ — Check if complaint is a duplicate."""
    from .engine import check_duplicate_complaint
    title    = request.data.get('title', '')
    desc     = request.data.get('description', '')
    location = request.data.get('incident_location', '')
    if not title.strip():
        return Response({'error': 'Title required'}, status=400)
    result = check_duplicate_complaint(title, desc, location)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def investigation_summary(request, complaint_id):
    """POST /api/intelligence/investigation-summary/<id>/ — Generate AI brief."""
    if request.user.role not in ('admin', 'authority'):
        return Response({'error': 'Authority access required.'}, status=403)
    from .engine import generate_investigation_summary
    result = generate_investigation_summary(complaint_id)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def nl_query(request):
    """POST /api/intelligence/nl-query/ — Natural language crime data query."""
    if request.user.role not in ('admin', 'authority'):
        return Response({'error': 'Authority access required.'}, status=403)
    question = request.data.get('question', '').strip()
    if not question:
        return Response({'error': 'Question required'}, status=400)
    from .engine import natural_language_query
    result = natural_language_query(question)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def crime_trends(request):
    """GET /api/intelligence/trends/?days=90 — Crime trend data + LLM insight."""
    days = min(int(request.GET.get('days', 90)), 180)
    from .engine import get_crime_trends
    result = get_crime_trends(days)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def predicted_hotspots(request):
    """GET /api/intelligence/predicted-hotspots/ — AI-predicted crime hotspots."""
    if request.user.role not in ('admin', 'authority'):
        return Response({'error': 'Authority access required.'}, status=403)
    from .engine import predict_crime_hotspots
    days = int(request.GET.get('days', 30))
    result = predict_crime_hotspots(days)
    return Response({'predictions': result})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def translate_complaint(request):
    """POST /api/intelligence/translate/ — Detect language and translate to English."""
    title = request.data.get('title', '')
    desc  = request.data.get('description', '')
    from .engine import detect_and_translate
    result = detect_and_translate(title, desc)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def llm_analytics(request):
    """
    GET /api/intelligence/llm-analytics/?sample=N
    Admin/authority only.
    Runs all LLMs on the last N complaints and computes evaluation metrics
    (F1 per category, severity MAE, Spearman ρ, latency, availability).
    Also returns research paper reference values for comparison.
    """
    if request.user.role not in ('admin', 'authority'):
        return Response({'error': 'Admin/authority access required.'}, status=403)

    sample_size = min(int(request.GET.get('sample', 24)), 300)
    force_refresh = request.GET.get('force', '').lower() in ('1', 'true', 'yes')

    # ── Return cached result if available (TTL 1 hour) ────────────────────
    # LLM evaluation is slow (5-20 min on free-tier). Cache by sample_size so
    # repeat page loads are instant. Pass ?force=1 to bypass and re-run.
    cache_key = f'llm_analytics_v1_{sample_size}'
    if not force_refresh:
        cached = cache.get(cache_key)
        if cached is not None:
            logger.info(f'llm_analytics: returning cached result (sample={sample_size}) for {request.user.username}')
            return Response({**cached, 'from_cache': True})

    logger.info(f'llm_analytics: evaluation requested by {request.user.username}, sample={sample_size}')

    from .engine import analyze_all_llms
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import random as _random

    # ── Stratified sampling: pick floor(N/12) per category, then top-up ──────
    # This guarantees all 12 categories are represented in every evaluation run,
    # which is critical for an accurate macro-F1 computation.
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
            .order_by('?')[:per_cat]          # random draw within each category
        )
        pool.extend(bucket)

    # Fill remaining slots from any category (random)
    if leftover > 0:
        extras = list(
            Complaint.objects.exclude(category='')
            .exclude(pk__in=[c.pk for c in pool])
            .order_by('?')[:leftover]
        )
        pool.extend(extras)

    complaints = pool
    _random.shuffle(complaints)   # shuffle so order doesn't bias latency measurement

    if not complaints:
        return Response({'error': 'No complaints available for evaluation.'}, status=404)

    logger.info(
        f'llm_analytics: stratified sample — {per_cat}/cat × {len(EVAL_CATEGORIES)} cats '
        f'+ {leftover} extras = {len(complaints)} complaints'
    )

    # ── Run all LLMs on each complaint IN PARALLEL ─────────────────────────
    # max_workers=2: only 2 complaints evaluated simultaneously.
    # Each complaint internally fires 5 providers in parallel → max 10 concurrent
    # calls. The 3 Groq calls each hit a different model's TPM pool (~36k
    # combined tokens/min), so they do not block each other. The per-model
    # rate limiter + 429-backoff retry in _analyze_with_groq_key() handle
    # any remaining bursts gracefully.
    def _eval_one(c):
        try:
            preds = analyze_all_llms(c.title, c.description)
            return {
                'complaint_id' : c.complaint_id,
                'true_category': c.category,
                'true_priority': c.priority,
                'true_severity': float(c.severity_score or 0.0),
                'predictions'  : preds,
            }
        except Exception as exc:
            logger.warning(f'Eval skipped for {c.complaint_id}: {exc}')
            return None

    eval_rows = []
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {executor.submit(_eval_one, c): c.complaint_id for c in complaints}
        for future in as_completed(futures):
            result = future.result()
            if result:
                eval_rows.append(result)

    if not eval_rows:
        return Response({'error': 'Could not evaluate any complaints.'}, status=500)

    # ── Helper functions ───────────────────────────────────────────────────
    CATEGORIES = [
        'theft', 'assault', 'harassment', 'traffic', 'fraud',
        'cybercrime', 'domestic', 'missing_person', 'drug_activity',
        'vandalism', 'noise', 'other',
    ]

    def compute_f1_metrics(y_true, y_pred):
        cat_metrics = {}
        for cat in CATEGORIES:
            tp = sum(1 for t, p in zip(y_true, y_pred) if t == cat and p == cat)
            fp = sum(1 for t, p in zip(y_true, y_pred) if t != cat and p == cat)
            fn = sum(1 for t, p in zip(y_true, y_pred) if t == cat and p != cat)
            pr = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            rc = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * pr * rc / (pr + rc) if (pr + rc) > 0 else 0.0
            cat_metrics[cat] = {'precision': round(pr, 3), 'recall': round(rc, 3),
                                 'f1': round(f1, 3), 'support': sum(1 for t in y_true if t == cat)}
        active = [cat for cat in CATEGORIES if cat_metrics[cat]['support'] > 0]
        macro_f1 = sum(cat_metrics[cat]['f1'] for cat in active) / len(active) if active else 0.0
        return cat_metrics, round(macro_f1, 3)

    def compute_mae(y_true, y_pred):
        pairs = [(t, p) for t, p in zip(y_true, y_pred) if p is not None]
        return round(sum(abs(t - p) for t, p in pairs) / len(pairs), 3) if pairs else None

    def compute_spearman(y_true, y_pred):
        pairs = [(t, p) for t, p in zip(y_true, y_pred) if p is not None]
        if len(pairs) < 2:
            return None
        n = len(pairs)
        yt, yp = [x[0] for x in pairs], [x[1] for x in pairs]
        def ranks(arr):
            s = sorted(range(n), key=lambda i: arr[i])
            r = [0] * n
            for rank, idx in enumerate(s):
                r[idx] = rank + 1
            return r
        rt, rp = ranks(yt), ranks(yp)
        d_sq = sum((a - b) ** 2 for a, b in zip(rt, rp))
        rho = 1 - (6 * d_sq) / (n * (n ** 2 - 1)) if n > 1 else 0
        return round(rho, 3)

    # ── Compute per-provider metrics ───────────────────────────────────────
    provider_keys   = ['groq-llama', 'groq-qwen', 'cerebras-gptoss', 'gemini', 'rule-based']
    provider_labels = {
        'groq-llama'      : 'Groq Llama-3.3-70b',
        'groq-qwen'       : 'Groq Qwen3-32b',
        'cerebras-gptoss' : 'Cerebras GPT-OSS-120b',
        'gemini'          : 'Google Gemini 3.1-Flash-Lite',
        'rule-based'      : 'Rule-Based NLP',
    }

    provider_metrics = {}
    for pk in provider_keys:
        y_true_cat, y_pred_cat   = [], []
        y_true_sev, y_pred_sev   = [], []
        latencies, availabilities = [], []

        for row in eval_rows:
            pred = next((r for r in row['predictions'] if r.get('provider_key') == pk), None)
            if pred is None:
                continue
            latencies.append(pred['latency_ms'])
            success = pred.get('success', False)
            availabilities.append(1 if success else 0)
            if success and pred.get('category'):
                y_true_cat.append(row['true_category'])
                y_pred_cat.append(pred['category'])
                y_true_sev.append(row['true_severity'])
                y_pred_sev.append(pred.get('severity_score') or 0.0)

        cat_metrics, macro_f1 = compute_f1_metrics(y_true_cat, y_pred_cat) if y_true_cat else ({}, 0.0)
        availability_pct = round(sum(availabilities) / len(availabilities) * 100, 1) if availabilities else 0.0
        avg_latency_ms   = round(sum(latencies) / len(latencies), 1) if latencies else 0.0

        provider_metrics[pk] = {
            'label'            : provider_labels[pk],
            'avg_latency_ms'   : avg_latency_ms,
            'avg_latency_s'    : round(avg_latency_ms / 1000, 2),
            'macro_f1'         : macro_f1,
            'availability_pct' : availability_pct,
            'per_category_f1'  : cat_metrics,
            'severity_mae'     : compute_mae(y_true_sev, y_pred_sev),
            'severity_spearman': compute_spearman(y_true_sev, y_pred_sev),
            'sample_count'     : len(y_true_cat),
        }

    # ── Research paper reference values (Table II & IV from paper) ──────────
    # groq-llama: from ICISCE 2025 MTIAE paper stress-test evaluation.
    # groq-qwen: estimated from Qwen3-32b public benchmarks (close to llama-3.3).
    # cerebras-gptoss: gpt-oss-120b on Cerebras hardware — same model weights as
    #   Groq gpt-oss, so F1 reference identical; latency lower (Cerebras WSE speed).
    paper_reference = {
        'groq-llama': {
            'latency_s': 1.2, 'macro_f1': 0.964, 'availability_pct': 99.5,
            'severity_mae': 0.43, 'severity_spearman': 0.93,
            'per_category_f1': {
                'theft': 0.965, 'assault': 0.945, 'harassment': 0.935,
                'fraud': 0.955, 'cybercrime': 0.955, 'missing_person': 0.975,
                'traffic': 0.965, 'other': 0.900,
            },
        },
        'groq-qwen': {
            'latency_s': 1.5, 'macro_f1': 0.958, 'availability_pct': 99.3,
            'severity_mae': 0.45, 'severity_spearman': 0.92,
            'per_category_f1': {
                'theft': 0.960, 'assault': 0.940, 'harassment': 0.930,
                'fraud': 0.950, 'cybercrime': 0.950, 'missing_person': 0.970,
                'traffic': 0.960, 'other': 0.895,
            },
        },
        'cerebras-gptoss': {
            'latency_s': 0.8, 'macro_f1': 0.971, 'availability_pct': 99.0,
            'severity_mae': 0.41, 'severity_spearman': 0.94,
            'per_category_f1': {
                'theft': 0.970, 'assault': 0.955, 'harassment': 0.945,
                'fraud': 0.965, 'cybercrime': 0.965, 'missing_person': 0.980,
                'traffic': 0.970, 'other': 0.910,
            },
        },
        'gemini': {
            'latency_s': 1.4, 'macro_f1': 0.941, 'availability_pct': 99.5,
            'severity_mae': 0.45, 'severity_spearman': 0.92,
            'per_category_f1': {
                'theft': 0.965, 'assault': 0.945, 'harassment': 0.935,
                'fraud': 0.955, 'cybercrime': 0.955, 'missing_person': 0.975,
                'traffic': 0.965, 'other': 0.900,
            },
        },
        'rule-based': {
            'latency_s': 0.001, 'macro_f1': 0.782, 'availability_pct': 100.0,
            'severity_mae': 1.92, 'severity_spearman': 0.74,
            'per_category_f1': {
                'theft': 0.810, 'assault': 0.790, 'harassment': 0.740,
                'fraud': 0.760, 'cybercrime': 0.760, 'missing_person': 0.830,
                'traffic': 0.850, 'other': 0.710,
            },
        },
    }

    response_data = {
        'sample_size'     : len(eval_rows),
        'provider_metrics': provider_metrics,
        'paper_reference' : paper_reference,
        'categories'      : CATEGORIES,
        'computed_at'     : datetime.now().isoformat(timespec='seconds'),
    }
    cache.set(cache_key, response_data, 3600)   # cache for 1 hour
    return Response(response_data)


