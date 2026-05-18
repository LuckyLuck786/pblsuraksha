"""
Management command: distribute_test_cases
==========================================
After running import_test_cases, the 300 imported complaints all sit under
the admin user. This command:

  1. Distributes reporters across all citizen users (round-robin)
  2. Adds realistic Bangalore geocoordinates so the hotspot map is populated
  3. Spreads statuses (pending / acknowledged / in_progress / resolved)
     proportionally to simulate real case lifecycle progress

Run after import_test_cases:
  python manage.py distribute_test_cases
  python manage.py distribute_test_cases --dry-run   # preview without saving
  python manage.py distribute_test_cases --no-status # skip status spreading
"""

import random
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

# ── Bangalore area catalogue ──────────────────────────────────────────────────
# (area_name_fragment, base_lat, base_lon)
# Fragments are matched against complaint.incident_location (case-insensitive).
# Random jitter ±0.008° (~900 m) is added per complaint for cluster spread.
_AREAS = [
    ('koramangala',    12.9352, 77.6245),
    ('indiranagar',    12.9784, 77.6408),
    ('whitefield',     12.9698, 77.7500),
    ('electronic city',12.8459, 77.6622),
    ('jayanagar',      12.9308, 77.5838),
    ('jp nagar',       12.9081, 77.5888),
    ('hsr layout',     12.9116, 77.6473),
    ('btm layout',     12.9166, 77.6101),
    ('marathahalli',   12.9588, 77.6973),
    ('hebbal',         13.0348, 77.5942),
    ('yelahanka',      13.0998, 77.5964),
    ('rajajinagar',    12.9980, 77.5489),
    ('malleshwaram',   13.0030, 77.5688),
    ('basavanagudi',   12.9427, 77.5740),
    ('banashankari',   12.9260, 77.5561),
    ('rt nagar',       13.0219, 77.5961),
    ('frazer town',    12.9830, 77.6202),
    ('shivajinagar',   12.9860, 77.5970),
    ('mg road',        12.9752, 77.6057),
    ('brigade road',   12.9716, 77.6066),
    ('jayanagar',      12.9308, 77.5838),
    ('majestic',       12.9762, 77.5713),
    ('ulsoor',         12.9811, 77.6206),
    ('domlur',         12.9607, 77.6382),
    ('bellandur',      12.9257, 77.6767),
    ('sarjapur',       12.9060, 77.6855),
    ('kundalahalli',   12.9730, 77.7121),
    ('brookefield',    12.9725, 77.7010),
    ('cv raman nagar', 12.9943, 77.6607),
    ('kr puram',       13.0009, 77.6933),
    ('banaswadi',      13.0103, 77.6536),
    ('sadashivanagar', 13.0063, 77.5750),
    ('yeshwanthpur',   13.0234, 77.5498),
    ('peenya',         13.0285, 77.5208),
    ('nagarbhavi',     12.9517, 77.5138),
    ('vijayanagar',    12.9744, 77.5358),
    ('rajiv gandhi',   13.1986, 77.7066),  # Airport area
    ('kengeri',        12.9074, 77.4853),
    ('rajarajeshwari', 12.9233, 77.5059),
    ('mysore road',    12.9618, 77.5245),
]

# Category → likely Bangalore sub-area (guides coordinate clustering).
# Heavy crimes cluster in busy commercial/nightlife areas;
# noise/vandalism clusters in residential areas.
_CATEGORY_AREA_BIAS = {
    'theft'         : ['mg road', 'koramangala', 'brigade road', 'marathahalli', 'whitefield'],
    'assault'       : ['koramangala', 'indiranagar', 'ulsoor', 'mg road', 'frazer town'],
    'harassment'    : ['mg road', 'majestic', 'indiranagar', 'koramangala', 'brigade road'],
    'traffic'       : ['whitefield', 'marathahalli', 'electronic city', 'kr puram', 'hebbal'],
    'fraud'         : ['whitefield', 'marathahalli', 'koramangala', 'indiranagar', 'hsr layout'],
    'cybercrime'    : ['whitefield', 'electronic city', 'koramangala', 'hsr layout', 'btm layout'],
    'domestic'      : ['jayanagar', 'basavanagudi', 'banashankari', 'jp nagar', 'rajajinagar'],
    'missing_person': ['majestic', 'kr puram', 'banaswadi', 'hebbal', 'yelahanka'],
    'drug_activity' : ['majestic', 'frazer town', 'shivajinagar', 'ulsoor', 'banaswadi'],
    'vandalism'     : ['jayanagar', 'btm layout', 'hsr layout', 'jp nagar', 'banashankari'],
    'noise'         : ['koramangala', 'indiranagar', 'jp nagar', 'btm layout', 'hsr layout'],
    'other'         : ['mg road', 'jayanagar', 'shivajinagar', 'malleshwaram', 'hebbal'],
}

# Status spread — out of every 10 TEST_IMPORT complaints:
#   4 remain pending, 2 acknowledged, 2 in_progress, 1 resolved, 1 closed
_STATUS_CYCLE = (
    ['pending'] * 4 +
    ['acknowledged'] * 2 +
    ['in_progress'] * 2 +
    ['resolved'] * 1 +
    ['closed'] * 1
)


def _pick_coords(complaint):
    """Return (lat, lon) for this complaint, biased by category and location text."""
    loc_lower = (complaint.incident_location or '').lower()

    # 1. Try to match the stored location string to a known area
    for frag, lat, lon in _AREAS:
        if frag in loc_lower:
            jitter_lat = random.uniform(-0.008, 0.008)
            jitter_lon = random.uniform(-0.008, 0.008)
            return round(lat + jitter_lat, 6), round(lon + jitter_lon, 6)

    # 2. Fall back to category bias
    bias_names = _CATEGORY_AREA_BIAS.get(complaint.category, ['mg road'])
    chosen_name = random.choice(bias_names)
    for frag, lat, lon in _AREAS:
        if frag == chosen_name:
            jitter_lat = random.uniform(-0.015, 0.015)
            jitter_lon = random.uniform(-0.015, 0.015)
            return round(lat + jitter_lat, 6), round(lon + jitter_lon, 6)

    # 3. Generic Bangalore centre fallback
    return round(12.9716 + random.uniform(-0.05, 0.05), 6), \
           round(77.5946 + random.uniform(-0.05, 0.05), 6)


class Command(BaseCommand):
    help = (
        'Distribute 300 TEST_IMPORT complaints across citizen users, '
        'add Bangalore geocoordinates, and spread statuses realistically.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Preview changes without saving anything to the database.',
        )
        parser.add_argument(
            '--no-status', action='store_true',
            help='Skip status spreading (leave all complaints as pending).',
        )
        parser.add_argument(
            '--citizens-only', action='store_true',
            help='Only assign reporter to citizen-role users (default: all non-admin users).',
        )

    def handle(self, *args, **options):
        from apps.complaints.models import Complaint

        User = get_user_model()
        dry_run   = options['dry_run']
        no_status = options['no_status']

        # ── 1. Fetch all TEST_IMPORT complaints ───────────────────────────────
        complaints = list(
            Complaint.objects.filter(
                ai_summary__startswith='TEST_IMPORT|'
            ).order_by('created_at')
        )

        if not complaints:
            self.stdout.write(self.style.ERROR(
                'No TEST_IMPORT complaints found. '
                'Run python manage.py import_test_cases first.'
            ))
            return

        self.stdout.write(f'Found {len(complaints)} TEST_IMPORT complaints.')

        # ── 2. Build citizen user pool ────────────────────────────────────────
        if options['citizens_only']:
            citizens = list(User.objects.filter(role='citizen'))
        else:
            citizens = list(User.objects.filter(role__in=['citizen']))

        # If no citizens at all, fall back to any non-superuser
        if not citizens:
            citizens = list(User.objects.filter(is_superuser=False, role='citizen'))
        if not citizens:
            citizens = list(User.objects.filter(is_superuser=False))
        if not citizens:
            self.stdout.write(self.style.WARNING(
                'No citizen users found — reporter will stay as admin. '
                'Run seed_data to create demo citizens.'
            ))
            citizens = list(User.objects.filter(is_superuser=True)[:1])

        self.stdout.write(
            f'Distributing across {len(citizens)} citizen user(s): '
            + ', '.join(u.username for u in citizens)
        )

        # ── 3. Distribute ─────────────────────────────────────────────────────
        random.seed(42)                          # reproducible assignment
        status_cycle = _STATUS_CYCLE * (len(complaints) // len(_STATUS_CYCLE) + 1)
        random.shuffle(status_cycle)

        updated_reporter = 0
        updated_coords   = 0
        updated_status   = 0

        for i, complaint in enumerate(complaints):
            changed = False

            # Round-robin reporter assignment
            new_reporter = citizens[i % len(citizens)]
            if complaint.reporter != new_reporter:
                if not dry_run:
                    complaint.reporter = new_reporter
                updated_reporter += 1
                changed = True

            # Geocoordinates
            if not complaint.latitude or not complaint.longitude:
                lat, lon = _pick_coords(complaint)
                if not dry_run:
                    complaint.latitude  = lat
                    complaint.longitude = lon
                updated_coords += 1
                changed = True

            # Status spread
            if not no_status and complaint.status == 'pending':
                new_status = status_cycle[i]
                if new_status != 'pending':
                    if not dry_run:
                        complaint.status = new_status
                    updated_status += 1
                    changed = True

            if changed and not dry_run:
                complaint.save(update_fields=[
                    'reporter', 'latitude', 'longitude', 'status'
                ])

        # ── 4. Summary ────────────────────────────────────────────────────────
        prefix = '[DRY RUN] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'\n{prefix}Done!\n'
            f'  Reporter reassigned : {updated_reporter} complaints\n'
            f'  Geocoordinates added: {updated_coords} complaints\n'
            f'  Status updated      : {updated_status} complaints\n'
        ))

        if dry_run:
            self.stdout.write(self.style.WARNING(
                'No changes were saved. Remove --dry-run to apply.'
            ))
        else:
            self.stdout.write(
                'All 300 cases are now visible in admin/officer views '
                'and the crime hotspot map is populated.'
            )
