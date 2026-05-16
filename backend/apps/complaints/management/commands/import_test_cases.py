"""
Management command: import_test_cases
Imports 300 test cases from an Excel file into the Complaints DB.

Usage:
  python manage.py import_test_cases
  python manage.py import_test_cases --file /path/to/cases.xlsx
  python manage.py import_test_cases --clear   # remove previously imported test cases first
"""

import os
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
import openpyxl


# ── Category mapping ───────────────────────────────────────────────────────────

# Excel categories → SURAKSHA category + default priority
SIMPLE_MAP = {
    'Traffic'       : ('traffic',   'medium'),
    'Noise'         : ('noise',     'low'),
    'Environment'   : ('vandalism', 'low'),
    'Sanitation'    : ('vandalism', 'low'),
    'Encroachment'  : ('vandalism', 'medium'),
    'Roads'         : ('other',     'low'),
    'Water'         : ('other',     'low'),
    'Electricity'   : ('other',     'low'),
    'Utility'       : ('other',     'low'),
    'Civic'         : ('other',     'low'),
    'Education'     : ('other',     'low'),
    'Health'        : ('other',     'medium'),
    'Fire'          : ('other',     'high'),
    'Infrastructure': ('other',     'low'),
    'NaturalDisaster': ('other',    'high'),
}

KEYWORD_RULES = [
    (['missing', 'kidnap', 'abduct'],                           'missing_person', 'critical'),
    (['harass', 'stalk', 'moles', 'sexual', 'rape', 'eve-teas'], 'harassment',    'high'),
    (['theft', 'steal', 'rob', 'burgl', 'snatch'],               'theft',         'high'),
    (['drug', 'narcotic', 'pusher'],                             'drug_activity',  'high'),
    (['domestic', 'dowry', 'spouse', 'husband beat', 'wife beat'], 'domestic',    'high'),
    (['fraud', 'scam', 'cheat', 'embezzl'],                      'fraud',         'high'),
    (['cyber', 'online fraud', 'phish', 'hack'],                 'cybercrime',    'high'),
    (['vandaliz', 'damage', 'destroy', 'break'],                 'vandalism',     'medium'),
    (['traffic', 'accident', 'hit-and-run', 'rash driv'],        'traffic',       'medium'),
]


def map_category(excel_cat: str, title: str, description: str):
    """Return (suraksha_category, priority) from Excel category + text keywords."""
    text = (title + ' ' + description).lower()

    # Simple 1:1 mappings first (non-crime categories)
    if excel_cat in SIMPLE_MAP:
        return SIMPLE_MAP[excel_cat]

    # Crime / Critical — run keyword rules
    for keywords, cat, pri in KEYWORD_RULES:
        if any(kw in text for kw in keywords):
            return cat, pri

    # Crime default → assault/high, Critical default → assault/critical
    if excel_cat == 'Crime':
        return 'assault', 'high'
    if excel_cat == 'Critical':
        return 'assault', 'critical'

    return 'other', 'low'


class Command(BaseCommand):
    help = 'Import 300 test cases from the Excel sheet into the Complaint database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            default=os.path.expanduser('~/Downloads/cases - test 300.xlsx'),
            help='Path to the Excel file (default: ~/Downloads/cases - test 300.xlsx)',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Remove all previously-imported test cases (ai_summary starts with TEST_IMPORT|) before re-importing.',
        )

    def handle(self, *args, **options):
        from apps.complaints.models import Complaint
        from apps.intelligence.engine import compute_severity

        User = get_user_model()
        file_path = options['file']

        if not os.path.exists(file_path):
            raise CommandError(f'File not found: {file_path}')

        # ── Clear old imports if requested ────────────────────────────────────
        if options['clear']:
            deleted, _ = Complaint.objects.filter(
                ai_summary__startswith='TEST_IMPORT|'
            ).delete()
            self.stdout.write(self.style.WARNING(f'Cleared {deleted} previously imported test cases.'))

        # ── Find or create a system reporter user ─────────────────────────────
        reporter = (
            User.objects.filter(is_superuser=True).first()
            or User.objects.filter(role='admin').first()
            or User.objects.first()
        )
        if not reporter:
            raise CommandError('No users found in the database. Please create at least one user first.')
        self.stdout.write(f'Using reporter: {reporter.username}')

        # ── Load Excel ─────────────────────────────────────────────────────────
        wb = openpyxl.load_workbook(file_path)
        ws = wb.active

        rows = list(ws.iter_rows(min_row=2, values_only=True))
        self.stdout.write(f'Found {len(rows)} data rows in Excel.')

        created = skipped = errors = 0

        for idx, row in enumerate(rows, start=1):
            try:
                # Expected columns: Case ID, Category, Incident Title,
                #                   Detailed Description, Incident Location, Full Address
                if len(row) < 4:
                    self.stdout.write(self.style.WARNING(f'  Row {idx}: too few columns — skipped'))
                    skipped += 1
                    continue

                case_id    = str(row[0] or '').strip()
                excel_cat  = str(row[1] or '').strip()
                title      = str(row[2] or '').strip()
                description = str(row[3] or '').strip()
                location   = str(row[4] or '').strip() if len(row) > 4 else ''
                address    = str(row[5] or '').strip() if len(row) > 5 else ''

                if not title or not description:
                    self.stdout.write(self.style.WARNING(f'  Row {idx} ({case_id}): empty title/description — skipped'))
                    skipped += 1
                    continue

                category, priority = map_category(excel_cat, title, description)
                severity = compute_severity(title, description, category, priority)

                ai_summary = f'TEST_IMPORT|{excel_cat}|Imported from test dataset. Category: {category}, Priority: {priority}.'

                Complaint.objects.create(
                    title           = title[:300],
                    description     = description,
                    category        = category,
                    priority        = priority,
                    severity_score  = severity,
                    incident_location = location or 'Bangalore, Karnataka',
                    incident_address  = address,
                    reporter        = reporter,
                    status          = 'pending',
                    is_anonymous    = False,
                    ai_category     = category,
                    ai_priority     = priority,
                    ai_summary      = ai_summary,
                )
                created += 1

                if created % 50 == 0:
                    self.stdout.write(f'  … {created} imported so far')

            except Exception as exc:
                self.stdout.write(self.style.ERROR(f'  Row {idx}: ERROR — {exc}'))
                errors += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nDone! Created={created}, Skipped={skipped}, Errors={errors}'
        ))
        self.stdout.write(
            f'Test cases are tagged with ai_summary prefix "TEST_IMPORT|" for easy filtering.'
        )
