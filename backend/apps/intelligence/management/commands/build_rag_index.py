"""
Management command: build_rag_index
====================================
Bulk-indexes all existing complaints into the ChromaDB RAG vector store.
Run this once after initial setup, or whenever you want to rebuild from scratch.

Usage:
    python manage.py build_rag_index
    python manage.py build_rag_index --reset   # wipe and rebuild
    python manage.py build_rag_index --status  # just show stats
"""

import logging
from django.core.management.base import BaseCommand
from apps.complaints.models import Complaint
from apps.intelligence.rag import bulk_index_complaints, collection_stats

logger = logging.getLogger('apps.intelligence.rag')


class Command(BaseCommand):
    help = 'Build / rebuild the RAG (ChromaDB) vector index from existing complaints'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete and recreate the collection before indexing',
        )
        parser.add_argument(
            '--status',
            action='store_true',
            help='Only print current RAG stats (no indexing)',
        )
        parser.add_argument(
            '--filter-status',
            default='',
            help='Only index complaints with this status (e.g. resolved)',
        )

    def handle(self, *args, **options):
        # ── Status-only mode ─────────────────────────────────────────────
        if options['status']:
            stats = collection_stats()
            self.stdout.write(self.style.SUCCESS('\n── RAG Index Status ──'))
            for k, v in stats.items():
                self.stdout.write(f'  {k:<28s}: {v}')
            self.stdout.write('')
            return

        # ── Reset mode ───────────────────────────────────────────────────
        if options['reset']:
            self.stdout.write(self.style.WARNING('Resetting RAG collection...'))
            try:
                import chromadb
                import os
                from apps.intelligence.rag import RAG_STORE_PATH, _get_collection
                import shutil
                if os.path.exists(RAG_STORE_PATH):
                    shutil.rmtree(RAG_STORE_PATH)
                    self.stdout.write(self.style.WARNING(f'  Deleted store at {RAG_STORE_PATH}'))
                # Force re-init
                import apps.intelligence.rag as rag_module
                rag_module._collection = None
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f'Reset failed: {exc}'))
                return

        # ── Fetch complaints ──────────────────────────────────────────────
        qs = Complaint.objects.all()
        if options['filter_status']:
            qs = qs.filter(status=options['filter_status'])
            self.stdout.write(f'Filtering to status="{options["filter_status"]}"')

        total_db = Complaint.objects.count()
        to_index = qs.count()
        self.stdout.write(
            self.style.SUCCESS(
                f'\n── Building RAG Index ──\n'
                f'  Total complaints in DB : {total_db}\n'
                f'  Complaints to index    : {to_index}\n'
            )
        )

        if to_index == 0:
            self.stdout.write(self.style.WARNING('Nothing to index. File some complaints first.'))
            return

        # ── Bulk index ────────────────────────────────────────────────────
        self.stdout.write('  Indexing... (this may take a moment on first run — model downloads ~80 MB)')
        indexed = bulk_index_complaints(qs)

        stats = collection_stats()
        self.stdout.write(self.style.SUCCESS(
            f'\n  ✓ Done! Indexed {indexed}/{to_index} complaints.\n'
            f'  Total in RAG store: {stats.get("total_indexed", "?")} documents\n'
            f'  Store path        : {stats.get("store_path", "?")}\n'
        ))
