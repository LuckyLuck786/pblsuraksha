"""
SURAKSHA - Complaint Signals
Auto-indexes new and updated complaints into the RAG vector store.
This ensures the RAG knowledge base grows as new cases come in and
resolution status is updated (verified categories improve future validation).
"""

import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Complaint

logger = logging.getLogger('apps.complaints.signals')


@receiver(post_save, sender=Complaint)
def index_complaint_in_rag(sender, instance, created, **kwargs):
    """
    After every Complaint save, upsert it into the ChromaDB RAG vector store.

    - On creation: index immediately (cold data).
    - On update: re-index so that verified category/priority corrections are
      reflected in future validations.

    This is intentionally fire-and-forget — any RAG error is logged but never
    raises an exception (we don't want DB saves to fail due to a vector store issue).
    """
    try:
        from apps.intelligence.rag import index_complaint
        success = index_complaint(instance)
        if success:
            action = 'created' if created else 'updated'
            logger.debug(
                f'RAG auto-index: complaint {instance.complaint_id} {action} '
                f'(cat={instance.category}, pri={instance.priority}, '
                f'status={instance.status})'
            )
        else:
            logger.warning(
                f'RAG auto-index: FAILED for complaint {instance.complaint_id} '
                f'(RAG may be unavailable)'
            )
    except Exception as exc:
        # Never crash the save — just log the error
        logger.error(
            f'RAG signal error for complaint id={instance.id}: '
            f'{type(exc).__name__}: {exc}',
            exc_info=True
        )
