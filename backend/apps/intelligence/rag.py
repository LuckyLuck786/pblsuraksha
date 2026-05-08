"""
SURAKSHA - RAG (Retrieval-Augmented Generation) Validation Engine
=================================================================
Validates LLM complaint analysis by comparing it against similar historical
complaints stored in a ChromaDB vector store.

Flow:
  1. LLM produces initial analysis (category, priority)
  2. RAG retrieves k most similar past complaints from the vector store
  3. Validation checks if the LLM result agrees with the majority of retrieved cases
  4. If mismatch detected → build corrective prompt → re-prompt LLM with context
  5. Return final (possibly corrected) result with rag_validated / rag_corrected flags
"""

import logging
import os
from collections import Counter

logger = logging.getLogger('apps.intelligence.rag')

# ── Config ──────────────────────────────────────────────────────────────────
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAG_STORE_PATH = os.path.join(_BASE_DIR, 'rag_store')

PRIORITY_ORDER        = ['low', 'medium', 'high', 'critical']
MISMATCH_THRESHOLD    = 0.60   # fraction of retrieved cases that must agree to trigger correction
DISTANCE_THRESHOLD    = 0.70   # cosine distance threshold (< = "close enough to use")
MIN_CASES_NEEDED      = 3      # minimum close cases required before we trust the validation
RETRIEVE_K            = 6      # how many similar cases to fetch per query

_collection = None             # module-level singleton — initialised lazily


# ── ChromaDB initialisation ──────────────────────────────────────────────────

def _get_collection():
    """Lazily initialise and return the ChromaDB persistent collection."""
    global _collection
    if _collection is not None:
        return _collection
    try:
        import chromadb
        os.makedirs(RAG_STORE_PATH, exist_ok=True)
        client = chromadb.PersistentClient(path=RAG_STORE_PATH)
        _collection = client.get_or_create_collection(
            name='suraksha_complaints',
            metadata={'hnsw:space': 'cosine'},
        )
        logger.info(
            f'RAG: ChromaDB collection ready — {_collection.count()} documents indexed '
            f'(store: {RAG_STORE_PATH})'
        )
    except ImportError:
        logger.warning(
            'RAG: chromadb package not installed. '
            'Run: pip install chromadb  (RAG validation disabled)'
        )
        _collection = None
    except Exception as exc:
        logger.error(f'RAG: ChromaDB initialisation failed: {exc}', exc_info=True)
        _collection = None
    return _collection


# ── Indexing ─────────────────────────────────────────────────────────────────

def index_complaint(complaint) -> bool:
    """
    Add or update a single Complaint instance in the vector store.
    Call this after a complaint is created or after its verified category/priority changes.
    Returns True on success.
    """
    col = _get_collection()
    if col is None:
        return False
    try:
        text = f"{complaint.title}. {complaint.description or ''}".strip()
        metadata = {
            'category'    : complaint.category     or 'other',
            'priority'    : complaint.priority      or 'medium',
            'severity'    : str(round(complaint.severity_score or 0.0, 2)),
            'status'      : complaint.status        or 'pending',
            'complaint_id': complaint.complaint_id  or str(complaint.id),
        }
        col.upsert(documents=[text], metadatas=[metadata], ids=[str(complaint.id)])
        logger.debug(
            f'RAG: Indexed {complaint.complaint_id} '
            f'(cat={metadata["category"]}, pri={metadata["priority"]}, '
            f'total_indexed={col.count()})'
        )
        return True
    except Exception as exc:
        logger.error(
            f'RAG: index_complaint failed for id={complaint.id}: {exc}', exc_info=True
        )
        return False


def bulk_index_complaints(complaints) -> int:
    """
    Batch-index a queryset or list of Complaint objects.
    Returns the number successfully indexed.
    """
    col = _get_collection()
    if col is None:
        return 0

    texts, metadatas, ids = [], [], []
    for c in complaints:
        texts.append(f"{c.title}. {c.description or ''}".strip())
        metadatas.append({
            'category'    : c.category     or 'other',
            'priority'    : c.priority     or 'medium',
            'severity'    : str(round(c.severity_score or 0.0, 2)),
            'status'      : c.status       or 'pending',
            'complaint_id': c.complaint_id or str(c.id),
        })
        ids.append(str(c.id))

    if not ids:
        logger.info('RAG: bulk_index called with empty complaint list — nothing to do.')
        return 0

    try:
        col.upsert(documents=texts, metadatas=metadatas, ids=ids)
        logger.info(
            f'RAG: Bulk-indexed {len(ids)} complaints. '
            f'Collection now has {col.count()} total documents.'
        )
        return len(ids)
    except Exception as exc:
        logger.error(f'RAG: bulk_index_complaints failed: {exc}', exc_info=True)
        return 0


# ── Retrieval ─────────────────────────────────────────────────────────────────

def retrieve_similar(title: str, description: str, k: int = RETRIEVE_K) -> list:
    """
    Retrieve k most semantically similar past complaints from the vector store.

    Returns list of dicts:
        { category, priority, severity, status, complaint_id, snippet, distance }
    """
    col = _get_collection()
    if col is None or col.count() == 0:
        logger.debug('RAG: retrieve_similar skipped — collection empty or unavailable.')
        return []
    try:
        query = f"{title}. {description or ''}".strip()
        n = min(k, col.count())
        results = col.query(query_texts=[query], n_results=n)

        similar = []
        for i, meta in enumerate(results['metadatas'][0]):
            dist = results['distances'][0][i] if results.get('distances') else 0.0
            similar.append({
                'category'    : meta.get('category', ''),
                'priority'    : meta.get('priority', ''),
                'severity'    : float(meta.get('severity', 0)),
                'status'      : meta.get('status', ''),
                'complaint_id': meta.get('complaint_id', ''),
                'snippet'     : (results['documents'][0][i] or '')[:120],
                'distance'    : round(dist, 4),
                'similarity'  : round((1 - dist) * 100, 1),  # human-readable %
            })

        logger.debug(
            f'RAG: Retrieved {len(similar)} similar cases for "{title[:50]}" '
            f'(distances: {[s["distance"] for s in similar]})'
        )
        return similar
    except Exception as exc:
        logger.error(f'RAG: retrieve_similar failed: {exc}', exc_info=True)
        return []


# ── Validation ────────────────────────────────────────────────────────────────

def validate_result(initial_result: dict, similar_cases: list) -> tuple:
    """
    Check if the LLM's initial result is consistent with retrieved similar cases.

    Returns:
        (is_valid: bool, correction_hints: dict)

    correction_hints keys (when mismatch found):
        suggested_category, category_confidence
        suggested_priority, priority_confidence, direction ('underestimated'|'overestimated')
    """
    if not similar_cases:
        return True, {}

    # Filter to cases that are close enough to be meaningful
    close = [c for c in similar_cases if c.get('distance', 1.0) < DISTANCE_THRESHOLD]

    if len(close) < MIN_CASES_NEEDED:
        logger.debug(
            f'RAG: Validation skipped — only {len(close)} close cases '
            f'(need {MIN_CASES_NEEDED}, distance<{DISTANCE_THRESHOLD}).'
        )
        return True, {}

    categories = [c['category'] for c in close if c['category']]
    priorities = [c['priority'] for c in close if c['priority']]

    if not categories or not priorities:
        return True, {}

    top_cat, top_cat_n  = Counter(categories).most_common(1)[0]
    top_pri, top_pri_n  = Counter(priorities).most_common(1)[0]
    top_cat_pct = top_cat_n / len(categories)
    top_pri_pct = top_pri_n / len(priorities)

    init_cat = initial_result.get('category', 'other')
    init_pri = initial_result.get('priority', 'medium')

    correction = {}
    cat_mismatch = top_cat_pct >= MISMATCH_THRESHOLD and top_cat != init_cat
    pri_mismatch = top_pri_pct >= MISMATCH_THRESHOLD and top_pri != init_pri

    if cat_mismatch:
        correction['suggested_category']    = top_cat
        correction['category_confidence']   = round(top_cat_pct * 100)
        logger.warning(
            f'RAG MISMATCH — Category: LLM said "{init_cat}", '
            f'but {correction["category_confidence"]}% of {len(close)} similar cases '
            f'are "{top_cat}". Flagging for correction.'
        )

    if pri_mismatch:
        correction['suggested_priority']  = top_pri
        correction['priority_confidence'] = round(top_pri_pct * 100)
        init_idx = PRIORITY_ORDER.index(init_pri) if init_pri in PRIORITY_ORDER else 1
        sugg_idx = PRIORITY_ORDER.index(top_pri)  if top_pri in PRIORITY_ORDER else 1
        correction['direction'] = 'underestimated' if sugg_idx > init_idx else 'overestimated'
        logger.warning(
            f'RAG MISMATCH — Priority {correction["direction"]}: '
            f'LLM said "{init_pri}", {correction["priority_confidence"]}% of similar cases '
            f'suggest "{top_pri}". Flagging for correction.'
        )

    is_valid = not cat_mismatch and not pri_mismatch
    if is_valid:
        logger.info(
            f'RAG VALIDATED — LLM result ({init_cat}/{init_pri}) '
            f'agrees with {len(close)} similar cases. No correction needed.'
        )
    return is_valid, correction


# ── Correction prompt builder ─────────────────────────────────────────────────

def build_correction_prompt(
    title: str,
    description: str,
    initial_result: dict,
    similar_cases: list,
    correction_hints: dict,
) -> str:
    """Build an enriched re-prompt that includes retrieved case context."""
    cases_text = ''
    for i, c in enumerate(similar_cases[:5], 1):
        cases_text += (
            f'\n  [{i}] id={c["complaint_id"]} | '
            f'category={c["category"]} | priority={c["priority"]} | '
            f'similarity={c["similarity"]}% — "{c["snippet"]}..."'
        )

    hint_lines = []
    if 'suggested_category' in correction_hints:
        hint_lines.append(
            f'  • Category: may be "{correction_hints["suggested_category"]}" '
            f'({correction_hints["category_confidence"]}% of similar cases agree)'
        )
    if 'suggested_priority' in correction_hints:
        hint_lines.append(
            f'  • Priority appears {correction_hints.get("direction", "wrong")} — '
            f'similar cases suggest "{correction_hints["suggested_priority"]}" '
            f'({correction_hints["priority_confidence"]}% agreement)'
        )
    hints_text = '\n'.join(hint_lines) or '  (none)'

    return f"""You are an AI assistant for SURAKSHA, India's public safety platform.

You previously analyzed this complaint:
Title: {title}
Description: {description}

Your initial assessment was: category="{initial_result.get('category')}", priority="{initial_result.get('priority')}"

The RAG retrieval system found {len(similar_cases)} historically similar verified complaints:{cases_text}

Potential issues detected with your initial assessment:
{hints_text}

Please RECONSIDER your analysis using the historical data above as context.
If the historical cases clearly align with a different category or priority, update accordingly.
If you still believe your original assessment is correct despite the historical context, keep it and explain why.

Respond ONLY with this exact JSON (no markdown, no extra text):
{{
  "category": "<theft|assault|harassment|traffic|fraud|cybercrime|domestic|missing_person|drug_activity|vandalism|noise|other>",
  "priority": "<low|medium|high|critical>",
  "summary": "<one concise sentence describing the incident and recommended action>",
  "rag_reasoning": "<one sentence: why you changed or kept your assessment after reviewing similar cases>"
}}"""


# ── Diagnostics ───────────────────────────────────────────────────────────────

def collection_stats() -> dict:
    """Return stats about the RAG index — used by the /api/intelligence/rag-stats/ endpoint."""
    col = _get_collection()
    if col is None:
        return {
            'available'             : False,
            'total_indexed'         : 0,
            'store_path'            : RAG_STORE_PATH,
            'error'                 : 'chromadb unavailable (not installed or init failed)',
        }
    return {
        'available'             : True,
        'total_indexed'         : col.count(),
        'store_path'            : RAG_STORE_PATH,
        'mismatch_threshold'    : MISMATCH_THRESHOLD,
        'distance_threshold'    : DISTANCE_THRESHOLD,
        'min_cases_needed'      : MIN_CASES_NEEDED,
        'retrieve_k'            : RETRIEVE_K,
    }
